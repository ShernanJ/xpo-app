import type { StrategyPlan } from "../contracts/chat.ts";
import type { CreatorProfileHints } from "../grounding/groundingPacket.ts";
import type { DraftRequestPolicy } from "../grounding/requestPolicy.ts";

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
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectKeywords(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .filter(Boolean)
        .flatMap((value) => normalizeComparable(String(value)).split(" "))
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
    ),
  );
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(1, left.length);
}

function phraseOverlapScore(candidate: string, content: string): number {
  const normalizedCandidate = normalizeComparable(candidate);
  const normalizedContent = normalizeComparable(content);
  if (!normalizedCandidate || !normalizedContent) {
    return 0;
  }

  if (
    normalizedContent.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedContent)
  ) {
    return 1;
  }

  return overlapScore(
    collectKeywords([normalizedCandidate]),
    collectKeywords([normalizedContent]),
  );
}

function buildAlternativeAngle(
  creatorProfileHints: CreatorProfileHints | null | undefined,
): string | null {
  const pillar = creatorProfileHints?.contentPillars?.[0]?.trim();
  if (pillar) {
    return pillar;
  }

  const knownFor = creatorProfileHints?.knownFor?.trim();
  if (knownFor) {
    return knownFor;
  }

  return null;
}

export function appendCoachNote(args: {
  response: string;
  userMessage: string;
  plan?: StrategyPlan | null;
  creatorProfileHints?: CreatorProfileHints | null;
  requestPolicy: DraftRequestPolicy;
}): string {
  const response = args.response.trim();
  if (!response || args.requestPolicy.coachAlignmentMode === "skip") {
    return response;
  }

  const creatorProfileHints = args.creatorProfileHints;
  if (!creatorProfileHints) {
    return response;
  }

  const contentSeed = [
    args.userMessage,
    args.plan?.objective || "",
    args.plan?.angle || "",
  ]
    .filter(Boolean)
    .join(" ");
  const contentKeywords = collectKeywords([contentSeed]);
  const profileKeywords = collectKeywords([
    creatorProfileHints.knownFor,
    creatorProfileHints.targetAudience,
    ...(creatorProfileHints.contentPillars || []),
  ]);

  if (contentKeywords.length === 0 || profileKeywords.length === 0) {
    return response;
  }

  const overlap = overlapScore(contentKeywords, profileKeywords);
  const offBrandThemes = creatorProfileHints.offBrandThemes || [];
  const offBrandHits = offBrandThemes.filter(
    (theme) => phraseOverlapScore(theme, contentSeed) >= 0.6,
  );

  const shouldWarn =
    args.requestPolicy.coachAlignmentMode === "high_threshold"
      ? offBrandHits.length >= 2 || (offBrandHits.length >= 1 && overlap < 0.08)
      : offBrandHits.length >= 1 || overlap < 0.08;

  if (!shouldWarn) {
    return response;
  }

  const alternativeAngle = buildAlternativeAngle(creatorProfileHints);
  const anchorDescription =
    creatorProfileHints.knownFor?.trim() ||
    creatorProfileHints.contentPillars?.[0]?.trim() ||
    creatorProfileHints.targetAudience?.trim() ||
    "your usual lane";
  const pivotLine = alternativeAngle
    ? `If you want, I can pivot this into a ${alternativeAngle} angle instead.`
    : "If you want, I can pivot this into a more niche-aligned angle instead.";

  return `${response}\n\nCoach's Note: Your audience usually knows you for ${anchorDescription}. This version may read more off-lane, so I'd expect softer core-audience engagement. ${pivotLine}`;
}
