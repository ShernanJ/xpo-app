import { checkDraftClaimsAgainstGrounding } from "../agent-v2/grounding/claimChecker.ts";
import type { GroundingPacket } from "../agent-v2/grounding/groundingPacket.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type { ReplyDraftPreflightResult } from "./types.ts";
import type { ReplyConstraintPolicy } from "../reply-engine/policy.ts";
import type { ReplyVisualContextSummary } from "../reply-engine/types.ts";
import {
  resolveReplyConstraintPolicy,
  violatesReplyConstraintPolicy,
} from "../reply-engine/policy.ts";

const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "with",
]);

const UNSUPPORTED_CLAIM_PATTERNS = [
  /\b(i|i'm|ive|i've|my|me|we|our|us)\b/i,
  /\bclients?\b/i,
  /\brevenue\b/i,
  /\barr\b/i,
  /\bcustomers?\b/i,
  /\busers?\b/i,
  /\bteam\b/i,
  /\bfounders?\b/i,
  /\bcase study\b/i,
  /\bresults?\b/i,
  /\bgrew\b/i,
  /\bscaled\b/i,
  /\bmade\b.*\b(million|k)\b/i,
  /\b\d[\d,.%]*\b/,
];

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function collectKeywords(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function collectStyleBlacklist(styleCard: VoiceStyleCard | null): string[] {
  if (!styleCard) {
    return [];
  }

  return [
    ...(styleCard.userPreferences?.blacklist || []),
    ...(styleCard.antiExamples || []).map((entry) => entry.badSnippet),
  ]
    .map((entry) => normalizeComparable(entry))
    .filter(Boolean);
}

export function violatesReplyHardGates(args: {
  value: string;
  strategy: GrowthStrategySnapshot;
  styleCard?: VoiceStyleCard | null;
}): boolean {
  const normalized = normalizeComparable(args.value);
  if (!normalized) {
    return true;
  }

  for (const pattern of UNSUPPORTED_CLAIM_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  if (/\b(we both|like we said|as always|back when)\b/.test(normalized)) {
    return true;
  }

  for (const forbidden of collectStyleBlacklist(args.styleCard || null)) {
    if (forbidden.length > 0 && normalized.includes(forbidden)) {
      return true;
    }
  }

  return args.strategy.offBrandThemes.some((theme) => {
    const themeKey = normalizeComparable(theme);
    return themeKey.length > 0 && normalized.includes(themeKey);
  });
}

export function looksLowValueReply(value: string, policy?: ReplyConstraintPolicy | null): boolean {
  const normalized = normalizeComparable(value);
  if (!normalized) {
    return true;
  }

  if (
    /^(great|good|nice|true|agreed|exactly|totally|interesting|fair|well said|strong point)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (policy?.preferShortRiff) {
    return wordCount < 4;
  }

  if (wordCount < 9) {
    return true;
  }

  return !/\b(because|otherwise|difference|layer|hinge|system|proof|usable|reuse|practice|clarity|workflow)\b/.test(
    normalized,
  );
}

function lacksReplyAnchor(args: {
  value: string;
  sourceText: string;
  strategyPillar: string;
  knownFor?: string | null;
  policy?: ReplyConstraintPolicy | null;
  visualContext?: ReplyVisualContextSummary | null;
}): boolean {
  const replyTokens = new Set(collectKeywords(args.value));
  const anchorTokens = new Set(
    [
      ...collectKeywords(args.sourceText),
      ...(args.policy?.allowStrategyLens !== false ? collectKeywords(args.strategyPillar) : []),
      ...(args.policy?.allowStrategyLens !== false ? collectKeywords(args.knownFor || "") : []),
      ...(args.policy?.allowImageAnchoring
        ? collectKeywords(
            [
              args.visualContext?.imageReplyAnchor || "",
              args.visualContext?.readableText || "",
              ...(args.visualContext?.keyDetails || []),
            ].join(" "),
          )
        : []),
    ].slice(0, 18),
  );

  if (anchorTokens.size === 0) {
    return false;
  }

  for (const token of anchorTokens) {
    if (replyTokens.has(token)) {
      return false;
    }
  }

  return true;
}

export function sanitizeReplyText(args: {
  candidate: string;
  fallbackText: string;
  sourceText: string;
  strategyPillar: string;
  strategy: GrowthStrategySnapshot;
  groundingPacket: GroundingPacket;
  styleCard?: VoiceStyleCard | null;
  preflightResult?: ReplyDraftPreflightResult | null;
  policy?: ReplyConstraintPolicy | null;
  visualContext?: ReplyVisualContextSummary | null;
}): string {
  const policy =
    args.policy ||
    resolveReplyConstraintPolicy({
      sourceText: args.sourceText,
      strategy: args.strategy,
      preflightResult: args.preflightResult || null,
      visualContext: args.visualContext || null,
    });
  const candidateChecked = checkDraftClaimsAgainstGrounding({
    draft: normalizeWhitespace(args.candidate),
    groundingPacket: args.groundingPacket,
  });
  const candidateText = normalizeWhitespace(candidateChecked.draft || args.candidate);

  const fallbackChecked = checkDraftClaimsAgainstGrounding({
    draft: normalizeWhitespace(args.fallbackText),
    groundingPacket: args.groundingPacket,
  });
  const fallbackText = normalizeWhitespace(fallbackChecked.draft || args.fallbackText);

  const candidateIsSafe =
    !violatesReplyHardGates({
      value: candidateText,
      strategy: args.strategy,
      styleCard: args.styleCard || null,
    }) &&
    !looksLowValueReply(candidateText, policy) &&
    !violatesReplyConstraintPolicy({
      draft: candidateText,
      sourceText: args.sourceText,
      policy,
      visualContext: args.visualContext || null,
    }) &&
    !lacksReplyAnchor({
      value: candidateText,
      sourceText: args.sourceText,
      strategyPillar: args.strategyPillar,
      knownFor: args.strategy.knownFor,
      policy,
      visualContext: args.visualContext || null,
    });

  if (candidateIsSafe) {
    return candidateText;
  }

  return fallbackText;
}
