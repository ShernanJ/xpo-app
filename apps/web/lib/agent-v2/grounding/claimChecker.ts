import {
  collectGroundingFactualAuthority,
  type GroundingPacket,
} from "./groundingPacket.ts";

export interface ClaimCheckResult {
  draft: string;
  issues: string[];
  hasUnsupportedClaims: boolean;
  needsClarification: boolean;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "i",
  "im",
  "i'm",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "our",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "us",
  "user",
  "was",
  "we",
  "with",
]);

const FIRST_PERSON_ACTION_PATTERN =
  /\b(?:i|we)\s+(?:am|was|were|built|build|made|make|shipped|ship|launched|launch|use|used|tried|try|saw|see|learned|learn|realized|found|quit|joined|worked|hired|met|tested|switched|grow|grew|hit|closed|won|lost|started|start|went|talked|spent|wrote)\b/i;
const TEMPORAL_PATTERN =
  /\b(?:yesterday|today|tonight|last night|this morning|last week|last month|last year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])\b/i;
const CAUSAL_PATTERN =
  /\b(?:because|which is why|that['’]s why|so that|led to|resulted in|caused)\b/i;
const PRODUCT_BEHAVIOR_PATTERN =
  /\b(?:it|this|[a-z0-9][a-z0-9_-]{1,30})\s+(?:helps|lets|turns|rewrites|automates|handles|scans|finds|tracks|posts|schedules|pulls|writes|cuts|reduces|eliminates|prevents|improves|boosts|grows|converts|qualifies|prioritizes)\b/i;
const METRIC_CONTEXT_PATTERN =
  /\b(?:followers|revenue|arr|mrr|gmv|pipeline|users|customers|teams|teammates|installs|signups|conversions|launches|years|months|days|people|attendees|percent|churn|retention|open rate|click rate|ctr|nps|%)\b/i;
const OUTCOME_CLAIM_PATTERN =
  /\b(?:moved the needle|move the needle|follower spike|follower spikes|spike in followers|spikes in followers|growth spike|growth spikes|lifted|lift|boosted|went up|surged|jumped)\b/i;
const DATE_NUMBER_PATTERN = /\b(?:\d{4}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/;
const METRIC_SCALE_PATTERN =
  /\b(?:\d[\d,.]*\s*(?:k|m|b|million|billion|%)?|\d{1,3}(?:,\d{3})+)\b/i;
const NAMED_DETAIL_PATTERN =
  /\b(?:in|at|from|with|for|near|around|inside)\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,})\b/;
const TITLE_CASE_ENTITY_PATTERN =
  /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[A-Z]{2,})\b/;
const RESOURCE_ACCESS_CTA_PATTERN =
  /^(?:comment|reply)\s+["'][^"']+["']\s+(?:to\s+)?(?:get|grab|access|receive|unlock)\b/i;
const RESOURCE_SEND_CTA_PATTERN =
  /^(?:comment|reply)\s+["'][^"']+["']\s+and\s+i(?:'ll| will)\s+(?:send|share)\b/i;
const RESOURCE_ASSET_PATTERN =
  /\b(?:playbook|guide|checklist|template|pdf|resource|worksheet|framework)\b/i;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function collectTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s%]/g, " ")
    .split(/\s+/)
    .map((token) => {
      const normalized = token.trim();
      if (normalized.length > 4 && normalized.endsWith("s")) {
        return normalized.slice(0, -1);
      }

      return normalized;
    })
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function computeSupportScore(candidate: string, sources: string[]): number {
  const candidateTokens = Array.from(new Set(collectTokens(candidate)));
  if (candidateTokens.length === 0) {
    return 0;
  }

  return sources.reduce((best, source) => {
    const sourceTokens = new Set(collectTokens(source));
    if (sourceTokens.size === 0) {
      return best;
    }

    const matched = candidateTokens.filter((token) => sourceTokens.has(token)).length;
    return Math.max(best, matched / candidateTokens.length);
  }, 0);
}

function getGroundingSources(packet: GroundingPacket): string[] {
  return collectGroundingFactualAuthority(packet);
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s%]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAnyComparable(candidate: string, values: string[]): boolean {
  const normalizedCandidate = normalizeComparable(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  return values.some((value) => {
    const normalizedValue = normalizeComparable(value);
    return (
      normalizedValue.length > 0 &&
      (normalizedCandidate.includes(normalizedValue) ||
        normalizedValue.includes(normalizedCandidate))
    );
  });
}

function conflictsWithForbiddenClaim(candidate: string, forbiddenClaims: string[]): boolean {
  if (includesAnyComparable(candidate, forbiddenClaims)) {
    return true;
  }

  const candidateTokenSet = new Set(collectTokens(candidate));
  const candidateNumbers = candidate.match(/\b\d[\d,./%a-z]*\b/gi) || [];

  return forbiddenClaims.some((entry) => {
    const score = computeSupportScore(candidate, [entry]);
    if (score >= 0.3) {
      return true;
    }

    const entryTokenSet = new Set(collectTokens(entry));
    const overlap = Array.from(candidateTokenSet).filter((token) => entryTokenSet.has(token)).length;
    if (overlap >= 3 && score >= 0.4) {
      return true;
    }

    const forbiddenNumbers = entry.match(/\b\d[\d,./%a-z]*\b/gi) || [];
    if (candidateNumbers.length === 0 || forbiddenNumbers.length === 0) {
      return false;
    }

    return candidateNumbers.some((value) =>
      forbiddenNumbers.some((forbidden) => value.toLowerCase() === forbidden.toLowerCase()),
    );
  });
}

function extractNamedDetails(value: string): string[] {
  return Array.from(
    new Set([
      ...(value.match(TITLE_CASE_ENTITY_PATTERN) || []),
      ...(value.match(NAMED_DETAIL_PATTERN) || []),
    ]),
  );
}

function hasUnsupportedNamedDetail(line: string, sources: string[]): boolean {
  const namedDetails = extractNamedDetails(line);
  if (namedDetails.length === 0) {
    return false;
  }

  return namedDetails.some((detail) => computeSupportScore(detail, sources) < 0.8);
}

function findBestGroundedReplacement(line: string, packet: GroundingPacket): string | null {
  const ranked = getGroundingSources(packet)
    .map((entry) => ({
      entry,
      score: computeSupportScore(line, [entry]),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < 0.45) {
    return null;
  }

  return normalizeWhitespace(best.entry);
}

function cleanupDraft(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\s*---\s*\n/g, "\n---\n")
    .trim();
}

function looksLikeResourceAccessCta(line: string): boolean {
  return (
    RESOURCE_ASSET_PATTERN.test(line) &&
    (RESOURCE_ACCESS_CTA_PATTERN.test(line) || RESOURCE_SEND_CTA_PATTERN.test(line))
  );
}

function sanitizeAtomicLine(line: string, packet: GroundingPacket): {
  nextLine: string;
  issue: string | null;
} {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed || trimmed === "---") {
    return { nextLine: line.trim(), issue: null };
  }

  if (looksLikeResourceAccessCta(trimmed)) {
    return { nextLine: trimmed, issue: null };
  }

  const allSources = getGroundingSources(packet);
  const supportScore = computeSupportScore(trimmed, allSources);
  const hasNumbers = /\b\d[\d,./%]*\b/.test(trimmed);
  const hasUnsupportedNumber =
    hasNumbers &&
    !packet.allowedNumbers.some((token) => trimmed.includes(token)) &&
    (METRIC_CONTEXT_PATTERN.test(trimmed) || METRIC_SCALE_PATTERN.test(trimmed));
  const riskyAutobiography = FIRST_PERSON_ACTION_PATTERN.test(trimmed);
  const riskyTemporal = TEMPORAL_PATTERN.test(trimmed) || DATE_NUMBER_PATTERN.test(trimmed);
  const riskyCausal = CAUSAL_PATTERN.test(trimmed) && riskyAutobiography;
  const riskyProductBehavior = PRODUCT_BEHAVIOR_PATTERN.test(trimmed);
  const riskyOutcomeClaim = OUTCOME_CLAIM_PATTERN.test(trimmed);
  const riskyNamedDetail = hasUnsupportedNamedDetail(trimmed, allSources);
  const forbiddenClaim = conflictsWithForbiddenClaim(trimmed, packet.forbiddenClaims);
  const isUnsupported =
    forbiddenClaim ||
    (supportScore < 0.45 &&
      (riskyAutobiography ||
        riskyTemporal ||
        riskyCausal ||
        riskyProductBehavior ||
        riskyOutcomeClaim ||
        hasUnsupportedNumber ||
        riskyNamedDetail));

  if (!isUnsupported) {
    return { nextLine: trimmed, issue: null };
  }

  const replacement = findBestGroundedReplacement(trimmed, packet);
  if (replacement && replacement.toLowerCase() !== trimmed.toLowerCase()) {
    return {
      nextLine: replacement,
      issue: forbiddenClaim
        ? "Removed a claim that conflicts with grounded facts."
        : "Replaced an unsupported claim with grounded wording.",
    };
  }

  return {
    nextLine: "",
    issue: forbiddenClaim
      ? "Removed a claim that conflicts with grounded facts."
      : "Removed an unsupported autobiographical or factual claim.",
  };
}

function splitSentenceLikeSegments(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "---") {
    return [trimmed];
  }

  const segments = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [trimmed];
}

function sanitizeLine(line: string, packet: GroundingPacket): {
  nextLine: string;
  issues: string[];
} {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed || trimmed === "---") {
    return { nextLine: line.trim(), issues: [] };
  }

  const segments = splitSentenceLikeSegments(trimmed);
  if (segments.length === 1) {
    const result = sanitizeAtomicLine(segments[0] || trimmed, packet);
    return {
      nextLine: result.nextLine,
      issues: result.issue ? [result.issue] : [],
    };
  }

  const nextSegments: string[] = [];
  const issues: string[] = [];

  for (const segment of segments) {
    const result = sanitizeAtomicLine(segment, packet);
    if (result.nextLine) {
      nextSegments.push(result.nextLine);
    }
    if (result.issue) {
      issues.push(result.issue);
    }
  }

  return {
    nextLine: cleanupDraft(nextSegments.join(" ")),
    issues,
  };
}

export function checkDraftClaimsAgainstGrounding(args: {
  draft: string;
  groundingPacket: GroundingPacket;
}): ClaimCheckResult {
  const lines = args.draft.split("\n");
  const issues: string[] = [];
  let removedOrChanged = 0;

  const nextLines = lines
    .map((line) => {
      const result = sanitizeLine(line, args.groundingPacket);
      if (result.issues.length > 0) {
        removedOrChanged += result.issues.length;
        issues.push(...result.issues);
      }
      return result.nextLine;
    })
    .filter((line, index, all) => {
      if (line === "---") {
        return true;
      }

      if (line) {
        return true;
      }

      const previous = all[index - 1];
      const next = all[index + 1];
      return previous === "---" || next === "---";
    });

  const sanitizedDraft = cleanupDraft(nextLines.join("\n"));
  const sanitizedWordCount = sanitizedDraft
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
  const needsClarification =
    removedOrChanged > 0 &&
    sanitizedWordCount < 6 &&
    (sanitizedDraft.length < 48 ||
      sanitizedDraft.length < Math.max(32, Math.floor(args.draft.length * 0.45)));

  return {
    draft: sanitizedDraft,
    issues: Array.from(new Set(issues)),
    hasUnsupportedClaims: removedOrChanged > 0,
    needsClarification,
  };
}
