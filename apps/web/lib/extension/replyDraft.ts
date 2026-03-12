import {
  checkDraftClaimsAgainstGrounding,
} from "../agent-v2/orchestrator/claimChecker.ts";
import type { GroundingPacket } from "../agent-v2/orchestrator/groundingPacket.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";
import type {
  ExtensionReplyDraftRequest,
  ExtensionReplyDraftResponse,
  ExtensionReplyOption,
  ExtensionReplyTone,
} from "./types";

const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "why",
  "with",
]);

export interface ExtensionReplyDraftBuildResult {
  response: ExtensionReplyDraftResponse;
  strategyPillar: string;
  angleLabel: string;
  groundingPacket: GroundingPacket;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function collectKeywords(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function pickStrategyPillar(args: {
  tweetText: string;
  strategy: GrowthStrategySnapshot;
}) {
  const tweetTokens = new Set(collectKeywords(args.tweetText));
  let best = args.strategy.contentPillars[0] || args.strategy.knownFor;
  let bestScore = -1;

  for (const pillar of args.strategy.contentPillars) {
    const tokens = collectKeywords(pillar);
    const score = tokens.reduce((sum, token) => sum + (tweetTokens.has(token) ? 2 : 0), 0);
    if (score > bestScore) {
      best = pillar;
      bestScore = score;
    }
  }

  return best || args.strategy.knownFor;
}

function pickFocusPhrase(tweetText: string): string | null {
  const keywords = collectKeywords(tweetText);
  if (keywords.length === 0) {
    return null;
  }

  return keywords.slice(0, 2).join(" ");
}

function buildAngleLabel(args: {
  tweetText: string;
  goal: string;
}): string {
  const normalized = normalizeComparable(`${args.tweetText} ${args.goal}`);
  if (args.tweetText.includes("?")) {
    return "answer_the_question";
  }
  if (/\b(mistake|wrong|myth|overrated|underrated|tradeoff|only works|unless)\b/.test(normalized)) {
    return "tradeoff";
  }
  if (/\b(system|workflow|process|ship|build|execute|operator|loop)\b/.test(normalized)) {
    return "implementation";
  }
  if (/\b(follow|profile|growth|convert)\b/.test(normalized)) {
    return "profile_click";
  }
  return "specific_layer";
}

function buildPillarLens(pillar: string): string {
  const normalized = pillar.toLowerCase();
  if (/\b(position|niche|brand|coherence)\b/.test(normalized)) {
    return "the positioning clarity";
  }
  if (/\b(reply|conversation|question)\b/.test(normalized)) {
    return "the follow-through in the reply itself";
  }
  if (/\b(system|workflow|process|loop|operating)\b/.test(normalized)) {
    return "the system behind it";
  }
  if (/\b(proof|example|result|case|lesson)\b/.test(normalized)) {
    return "the proof layer";
  }
  return pillar;
}

function buildSafeReply(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  pillar: string;
  angleLabel: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const lead =
    args.request.tone === "dry"
      ? "the useful extension is"
      : args.request.tone === "warm"
        ? "the part worth underscoring might be"
        : args.request.tone === "builder"
          ? "the missing layer is"
          : "the real hinge is";
  const closer =
    args.request.tweetText.includes("?")
      ? "what example makes that clearest in practice?"
      : "that's usually what makes the point stick instead of just sounding right.";

  if (args.focusPhrase) {
    return `${lead} ${lens}. that's where ${args.focusPhrase} turns into something people can actually reuse. ${closer}`;
  }

  return `${lead} ${lens}. ${closer}`;
}

function buildBoldReply(args: {
  request: ExtensionReplyDraftRequest;
  pillar: string;
  focusPhrase: string | null;
}) {
  const lens = buildPillarLens(args.pillar);
  const focus = args.focusPhrase || "the headline";
  const lead =
    args.request.tone === "warm" ? "slightly hotter take:" : "hotter take:";

  return `${lead} ${focus} is not the hard part. ${lens} is. otherwise this stays interesting but not usable.`;
}

function looksLowValueReply(value: string): boolean {
  const normalized = normalizeComparable(value);
  if (!normalized) {
    return true;
  }

  if (/^(great|good|nice|true|agreed|exactly|totally|well said)\b/.test(normalized)) {
    return true;
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (wordCount < 9) {
    return true;
  }

  return !/\b(because|otherwise|difference|layer|hinge|system|proof|usable|reuse|practice)\b/.test(
    normalized,
  );
}

function violatesReplyHardGates(value: string, strategy: GrowthStrategySnapshot): boolean {
  const normalized = normalizeComparable(value);
  if (!normalized) {
    return true;
  }

  if (/\b(i|i'm|ive|i've|my|we|our|us)\b/.test(normalized)) {
    return true;
  }

  if (/\b(we both|like we said|as always|back when)\b/.test(normalized)) {
    return true;
  }

  if (/\b\d[\d,.%]*\b/.test(normalized)) {
    return true;
  }

  return strategy.offBrandThemes.some((theme) => {
    const themeKey = normalizeComparable(theme);
    return themeKey.length > 0 && normalized.includes(themeKey);
  });
}

export function buildReplyGroundingPacket(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  angleLabel: string;
}): GroundingPacket {
  return {
    durableFacts: [
      `Known for: ${args.strategy.knownFor}`,
      `Target audience: ${args.strategy.targetAudience}`,
      `Primary content pillar: ${args.strategyPillar}`,
      ...args.strategy.truthBoundary.verifiedFacts,
    ],
    turnGrounding: [
      args.request.tweetText,
      `Reply angle: ${args.angleLabel}`,
      ...args.strategy.truthBoundary.inferredThemes.slice(0, 4),
    ],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: args.strategy.truthBoundary.unknowns,
    sourceMaterials: [],
  };
}

function sanitizeReplyOption(args: {
  option: ExtensionReplyOption;
  fallbackText: string;
  strategy: GrowthStrategySnapshot;
  groundingPacket: GroundingPacket;
}) {
  const initialText = normalizeWhitespace(args.option.text);
  const candidate = violatesReplyHardGates(initialText, args.strategy)
    ? args.fallbackText
    : initialText;
  const checked = checkDraftClaimsAgainstGrounding({
    draft: candidate,
    groundingPacket: args.groundingPacket,
  });
  const safeText =
    checked.draft && !looksLowValueReply(checked.draft) && !violatesReplyHardGates(checked.draft, args.strategy)
      ? checked.draft
      : args.fallbackText;

  return {
    ...args.option,
    text: normalizeWhitespace(safeText),
  };
}

export function buildExtensionReplyDraft(args: {
  request: ExtensionReplyDraftRequest;
  strategy: GrowthStrategySnapshot;
}): ExtensionReplyDraftBuildResult {
  const strategyPillar = pickStrategyPillar({
    tweetText: args.request.tweetText,
    strategy: args.strategy,
  });
  const angleLabel = buildAngleLabel({
    tweetText: args.request.tweetText,
    goal: args.request.goal,
  });
  const focusPhrase = pickFocusPhrase(args.request.tweetText);
  const groundingPacket = buildReplyGroundingPacket({
    request: args.request,
    strategy: args.strategy,
    strategyPillar,
    angleLabel,
  });
  const safeFallback = `the missing layer is ${buildPillarLens(strategyPillar)}. that's usually what makes the point usable instead of just agreeable.`;
  const boldFallback = `hotter take: without ${buildPillarLens(strategyPillar)}, this stays interesting but not actionable.`;
  const options = [
    sanitizeReplyOption({
      option: {
        id: "safe-1",
        label: "safe",
        text: buildSafeReply({
          request: args.request,
          strategy: args.strategy,
          pillar: strategyPillar,
          angleLabel,
          focusPhrase,
        }),
      },
      fallbackText: safeFallback,
      strategy: args.strategy,
      groundingPacket,
    }),
    sanitizeReplyOption({
      option: {
        id: "bold-1",
        label: "bold",
        text: buildBoldReply({
          request: args.request,
          pillar: strategyPillar,
          focusPhrase,
        }),
      },
      fallbackText: boldFallback,
      strategy: args.strategy,
      groundingPacket,
    }),
  ];
  const notes = [
    `Anchored to: ${strategyPillar}`,
    `Angle: ${angleLabel.replace(/_/g, " ")}`,
    ...args.strategy.ambiguities.slice(0, 1).map((entry) => `Tentative positioning: ${entry}`),
  ];

  return {
    response: {
      options,
      notes,
    },
    strategyPillar,
    angleLabel,
    groundingPacket,
  };
}
