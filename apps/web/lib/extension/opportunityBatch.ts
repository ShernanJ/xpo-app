import { Prisma, type ReplyOpportunity } from "../generated/prisma/client.ts";
import { prisma } from "../db.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";
import type {
  ExtensionExpectedValueLevel,
  ExtensionOpportunity,
  ExtensionOpportunityBatchRequest,
  ExtensionOpportunityCandidate,
  ExtensionOpportunityExpectedValue,
  ExtensionOpportunityScoringBreakdown,
  ExtensionOpportunitySurface,
  ExtensionOpportunityVerdict,
  ExtensionSuggestedAngle,
} from "./types.ts";

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
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "there",
  "this",
  "to",
  "was",
  "what",
  "when",
  "with",
]);

const GENERIC_PATTERNS = [
  /\bso true\b/i,
  /\b100%\b/i,
  /\bwell said\b/i,
  /\bexactly\b/i,
  /\bagree\b/i,
  /\bconsistency\b/i,
  /\bjust ship\b/i,
  /\bkeep going\b/i,
  /\bnever give up\b/i,
];

const SPAM_PATTERNS = [
  /\bfollow\b/i,
  /\brt\b/i,
  /\bretweet\b/i,
  /\bsubscribe\b/i,
  /\bdm\b/i,
  /\blink in bio\b/i,
  /\bgiveaway\b/i,
  /\bwin\b/i,
  /\bjoin my\b/i,
];

const NEGATIVE_SIGNAL_PATTERNS = [
  /\bidiot\b/i,
  /\bstupid\b/i,
  /\bdumb\b/i,
  /\btrash\b/i,
  /\bclown\b/i,
  /\bpropaganda\b/i,
  /\bgrifters?\b/i,
  /\brage bait\b/i,
  /\bcancel\b/i,
  /\bfraud\b/i,
];

const ABSOLUTE_PATTERNS = /\b(always|never|everyone|no one|nobody|only|must)\b/i;
const QUESTION_PATTERNS = /\?|\b(how|why|what|when)\b/i;
const SHARPEN_PATTERNS = /\b(system|workflow|process|framework|loop|steps?|playbook)\b/i;

export interface StoredOpportunityNotes {
  contractVersion: "xpo_companion_v2026";
  verdict: ExtensionOpportunityVerdict;
  why: string[];
  riskFlags: string[];
  suggestedAngle: ExtensionSuggestedAngle;
  expectedValue: ExtensionOpportunityExpectedValue;
  scoringBreakdown: ExtensionOpportunityScoringBreakdown;
  pageUrl: string;
  surface: ExtensionOpportunitySurface;
  batchNotes: string[];
  analytics?: {
    surface?: ExtensionOpportunitySurface;
    source?: string | null;
    generatedReplyIds?: string[];
    generatedReplyLabels?: string[];
    copiedReplyId?: string | null;
    copiedReplyLabel?: string | null;
    copiedReplyText?: string | null;
    lastLoggedEvent?: string | null;
  };
}

export interface RankedExtensionOpportunity {
  opportunity: ExtensionOpportunity;
  candidate: ExtensionOpportunityCandidate;
  strategyPillar: string;
  heuristicTier: string;
  storedNotes: StoredOpportunityNotes;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function collectKeywords(value: string) {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value || "");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function overlapScore(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const matches = left.reduce((sum, token) => sum + (rightSet.has(token) ? 1 : 0), 0);
  return matches / Math.max(1, Math.min(left.length, right.length));
}

function parseDate(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function ageHours(createdAtIso: string | null, capturedAtIso: string) {
  const createdAt = parseDate(createdAtIso);
  const capturedAt = parseDate(capturedAtIso) || new Date();
  if (!createdAt) {
    return null;
  }

  return Math.max(0, (capturedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
}

function levelFromScore(score: number): ExtensionExpectedValueLevel {
  if (score >= 70) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }
  return "low";
}

function buildExpectedValue(args: {
  visibilityPotential: number;
  profileClickPotential: number;
  followConversionPotential: number;
}): ExtensionOpportunityExpectedValue {
  return {
    visibility: levelFromScore(args.visibilityPotential),
    profileClicks: levelFromScore(args.profileClickPotential),
    followConversion: levelFromScore(args.followConversionPotential),
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toJsonValue(entry))
      .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    const next: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = toJsonValue(entry);
      if (normalized !== undefined) {
        next[key] = normalized;
      }
    }
    return next;
  }

  return undefined;
}

function stringifyScoreTier(score: number) {
  if (score >= 75) {
    return "high";
  }
  if (score >= 50) {
    return "medium";
  }
  return "low";
}

function pickStrategyPillar(args: {
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
}) {
  const candidateTokens = collectKeywords(args.candidate.text);
  let best = args.strategy.contentPillars[0] || args.strategy.knownFor;
  let bestScore = -1;

  for (const pillar of args.strategy.contentPillars) {
    const pillarTokens = collectKeywords(pillar);
    const score =
      overlapScore(candidateTokens, pillarTokens) * 100 +
      (normalizeComparable(args.candidate.text).includes(normalizeComparable(pillar)) ? 30 : 0);
    if (score > bestScore) {
      best = pillar;
      bestScore = score;
    }
  }

  return best || args.strategy.knownFor;
}

function computeFreshnessScore(args: { createdAtIso: string | null; capturedAtIso: string }) {
  const hours = ageHours(args.createdAtIso, args.capturedAtIso);
  if (hours === null) {
    return 35;
  }
  if (hours <= 1) {
    return 96;
  }
  if (hours <= 6) {
    return 88;
  }
  if (hours <= 24) {
    return 74;
  }
  if (hours <= 72) {
    return 58;
  }
  if (hours <= 168) {
    return 40;
  }
  return 22;
}

function computeVisibilityPotential(candidate: ExtensionOpportunityCandidate, freshness: number) {
  const followerCount = candidate.author.followerCount;
  let score = freshness * 0.45;

  if (followerCount >= 2_000 && followerCount <= 100_000) {
    score += 28;
  } else if (followerCount > 100_000 && followerCount <= 500_000) {
    score += 18;
  } else if (followerCount > 0) {
    score += 12;
  }

  if (candidate.author.verified) {
    score += 8;
  }

  if (candidate.surface === "search" || candidate.surface === "home") {
    score += 8;
  }

  if (candidate.postType === "reply" || candidate.postType === "repost") {
    score -= 18;
  }

  if (candidate.engagement.replyCount > 80) {
    score -= 10;
  }

  return roundScore(score);
}

function computeSpamRisk(candidate: ExtensionOpportunityCandidate) {
  let score = 0;
  const text = candidate.text;

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      score += 18;
    }
  }

  if (candidate.media.hasLink) {
    score += 8;
  }
  if ((text.match(/#/g) || []).length >= 3) {
    score += 14;
  }
  if ((text.match(/!/g) || []).length >= 4) {
    score += 10;
  }
  if (text.toUpperCase() === text && text.length > 24) {
    score += 12;
  }

  return roundScore(score);
}

function computeGenericityRisk(candidate: ExtensionOpportunityCandidate) {
  const normalized = normalizeComparable(candidate.text);
  const tokens = collectKeywords(candidate.text);
  let score = tokens.length <= 6 ? 28 : 8;

  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(normalized)) {
      score += 18;
    }
  }

  if (!QUESTION_PATTERNS.test(candidate.text) && tokens.length <= 10) {
    score += 14;
  }

  return roundScore(score);
}

function computeNegativeSignalRisk(candidate: ExtensionOpportunityCandidate) {
  let score = 0;

  for (const pattern of NEGATIVE_SIGNAL_PATTERNS) {
    if (pattern.test(candidate.text)) {
      score += 20;
    }
  }

  if (candidate.postType === "reply" && ABSOLUTE_PATTERNS.test(candidate.text)) {
    score += 14;
  }

  return roundScore(score);
}

function computeNicheMatch(args: {
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
}) {
  const candidateTokens = collectKeywords(args.candidate.text);
  const referenceTokens = uniqueStrings([
    args.strategy.knownFor,
    args.strategy.targetAudience,
    ...args.strategy.contentPillars,
    ...args.strategy.truthBoundary.verifiedFacts,
  ]).flatMap((entry) => collectKeywords(entry));
  const exactPillarHits = args.strategy.contentPillars.filter((pillar) =>
    normalizeComparable(args.candidate.text).includes(normalizeComparable(pillar)),
  ).length;

  return roundScore(18 + overlapScore(candidateTokens, referenceTokens) * 70 + exactPillarHits * 12);
}

function computeAudienceFit(args: {
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
}) {
  const candidateTokens = collectKeywords(
    `${args.candidate.text} ${args.candidate.author.handle} ${args.candidate.author.name || ""}`,
  );
  const audienceTokens = collectKeywords(
    `${args.strategy.targetAudience} ${args.strategy.profileConversionCues.join(" ")}`,
  );
  let score = 20 + overlapScore(candidateTokens, audienceTokens) * 60;

  if (args.candidate.author.followerCount >= 1_000 && args.candidate.author.followerCount <= 75_000) {
    score += 16;
  } else if (args.candidate.author.followerCount > 75_000 && args.candidate.author.followerCount <= 500_000) {
    score += 6;
  }

  if (args.candidate.surface === "search") {
    score += 8;
  }

  return roundScore(score);
}

function computeConversationQuality(candidate: ExtensionOpportunityCandidate) {
  let score =
    candidate.postType === "original"
      ? 78
      : candidate.postType === "quote"
        ? 66
        : candidate.postType === "reply"
          ? 42
          : candidate.postType === "repost"
            ? 22
            : 38;

  if (QUESTION_PATTERNS.test(candidate.text)) {
    score += 8;
  }
  if (candidate.media.hasPoll) {
    score -= 10;
  }
  if (candidate.media.hasLink) {
    score -= 6;
  }
  if (candidate.engagement.replyCount > 100) {
    score -= 12;
  }

  return roundScore(score);
}

function computeProfileClickPotential(args: {
  candidate: ExtensionOpportunityCandidate;
  nicheMatch: number;
  audienceFit: number;
}) {
  let score = args.nicheMatch * 0.42 + args.audienceFit * 0.28;

  if (args.candidate.postType === "original" || args.candidate.postType === "quote") {
    score += 16;
  }
  if (args.candidate.author.followerCount >= 2_000 && args.candidate.author.followerCount <= 80_000) {
    score += 12;
  }
  if (args.candidate.media.hasLink) {
    score -= 6;
  }

  return roundScore(score);
}

function computeFollowConversionPotential(args: {
  candidate: ExtensionOpportunityCandidate;
  nicheMatch: number;
  audienceFit: number;
  offNicheRisk: number;
}) {
  let score = args.nicheMatch * 0.48 + args.audienceFit * 0.3 - args.offNicheRisk * 0.2 + 10;

  if (args.candidate.author.followerCount >= 1_000 && args.candidate.author.followerCount <= 50_000) {
    score += 10;
  }
  if (args.candidate.postType === "reply") {
    score -= 8;
  }

  return roundScore(score);
}

function computeOffNicheRisk(args: {
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
  nicheMatch: number;
}) {
  const candidateText = normalizeComparable(args.candidate.text);
  let score = Math.max(0, 78 - args.nicheMatch);

  for (const theme of args.strategy.offBrandThemes) {
    if (candidateText.includes(normalizeComparable(theme))) {
      score += 18;
    }
  }

  return roundScore(score);
}

function pickSuggestedAngle(args: {
  candidate: ExtensionOpportunityCandidate;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  nicheMatch: number;
}) {
  const normalized = normalizeComparable(args.candidate.text);
  const primaryKnownFor = normalizeComparable(args.strategy.knownFor.split(" through ")[0] || "");

  if (ABSOLUTE_PATTERNS.test(normalized)) {
    return "disagree" as const;
  }
  if (QUESTION_PATTERNS.test(args.candidate.text)) {
    return "example" as const;
  }
  if (normalizeComparable(args.strategyPillar) && normalized.includes(normalizeComparable(args.strategyPillar))) {
    return "known_for" as const;
  }
  if (args.nicheMatch >= 70 && primaryKnownFor && normalized.includes(primaryKnownFor)) {
    return "known_for" as const;
  }
  if (SHARPEN_PATTERNS.test(normalized)) {
    return "sharpen" as const;
  }
  if (collectKeywords(args.candidate.text).length >= 22) {
    return "translate" as const;
  }
  return "nuance" as const;
}

function buildWhy(args: {
  nicheMatch: number;
  audienceFit: number;
  freshness: number;
  conversationQuality: number;
  profileClickPotential: number;
  followConversionPotential: number;
  visibilityPotential: number;
  score: number;
  verdict: ExtensionOpportunityVerdict;
}) {
  const why: string[] = [];

  if (args.nicheMatch >= 65) {
    why.push("Strong niche overlap with your saved content pillars.");
  }
  if (args.audienceFit >= 60) {
    why.push("Audience fit is closer to the people most likely to click through and follow.");
  }
  if (args.freshness >= 70) {
    why.push("The post is still fresh enough for a timely reply to get seen.");
  }
  if (args.profileClickPotential >= 65) {
    why.push("A reply here gives you room to reinforce what your profile should be known for.");
  }
  if (args.followConversionPotential >= 65) {
    why.push("A good reply is more likely to convert into follows than generic engagement.");
  }
  if (args.visibilityPotential >= 65) {
    why.push("The visibility setup is still good enough to justify joining the conversation.");
  }
  if (args.conversationQuality >= 60) {
    why.push("The post format leaves room to add a concrete layer instead of agreement.");
  }

  if (why.length === 0) {
    why.push(
      args.verdict === "dont_reply"
        ? "The conversation is too weak or off-niche to justify spending a reply here."
        : "There is some upside here, but the fit is not strong enough for a full green light.",
    );
  }

  return why.slice(0, 3);
}

function buildRiskFlags(breakdown: ExtensionOpportunityScoringBreakdown) {
  const flags: string[] = [];

  if (breakdown.spam_risk >= 55) {
    flags.push("spam risk");
  }
  if (breakdown.off_niche_risk >= 55) {
    flags.push("off niche risk");
  }
  if (breakdown.genericity_risk >= 55) {
    flags.push("genericity risk");
  }
  if (breakdown.negative_signal_risk >= 55) {
    flags.push("negative signal risk");
  }

  return flags;
}

function determineVerdict(args: {
  score: number;
  breakdown: ExtensionOpportunityScoringBreakdown;
}) {
  const dominantRisk = Math.max(
    args.breakdown.spam_risk,
    args.breakdown.off_niche_risk,
    args.breakdown.genericity_risk,
    args.breakdown.negative_signal_risk,
  );

  if (
    args.score < 45 ||
    args.breakdown.spam_risk >= 70 ||
    args.breakdown.off_niche_risk >= 78 ||
    args.breakdown.negative_signal_risk >= 72
  ) {
    return "dont_reply" as const;
  }

  if (args.score >= 68 && dominantRisk < 65) {
    return "reply" as const;
  }

  return "watch" as const;
}

export function scoreOpportunityCandidate(args: {
  candidate: ExtensionOpportunityCandidate;
  requestSurface: ExtensionOpportunitySurface;
  pageUrl: string;
  strategy: GrowthStrategySnapshot;
  styleCard: VoiceStyleCard | null;
}): RankedExtensionOpportunity {
  const strategyPillar = pickStrategyPillar({
    candidate: args.candidate,
    strategy: args.strategy,
  });
  const nicheMatch = computeNicheMatch({
    candidate: args.candidate,
    strategy: args.strategy,
  });
  const audienceFit = computeAudienceFit({
    candidate: args.candidate,
    strategy: args.strategy,
  });
  const freshness = computeFreshnessScore({
    createdAtIso: args.candidate.createdAtIso,
    capturedAtIso: args.candidate.capturedAtIso,
  });
  const conversationQuality = computeConversationQuality(args.candidate);
  const visibilityPotential = computeVisibilityPotential(args.candidate, freshness);
  const genericityRisk = computeGenericityRisk(args.candidate);
  const spamRisk = computeSpamRisk(args.candidate);
  const negativeSignalRisk = computeNegativeSignalRisk(args.candidate);
  const offNicheRisk = computeOffNicheRisk({
    candidate: args.candidate,
    strategy: args.strategy,
    nicheMatch,
  });
  const profileClickPotential = computeProfileClickPotential({
    candidate: args.candidate,
    nicheMatch,
    audienceFit,
  });
  const followConversionPotential = computeFollowConversionPotential({
    candidate: args.candidate,
    nicheMatch,
    audienceFit,
    offNicheRisk,
  });

  const positiveWeighted =
    nicheMatch * 0.24 +
    audienceFit * 0.18 +
    freshness * 0.1 +
    conversationQuality * 0.12 +
    profileClickPotential * 0.16 +
    followConversionPotential * 0.12 +
    visibilityPotential * 0.08;
  const riskWeighted =
    spamRisk * 0.18 +
    offNicheRisk * 0.38 +
    genericityRisk * 0.24 +
    negativeSignalRisk * 0.2;
  const score = roundScore(positiveWeighted - riskWeighted * 0.58 + 8);
  const suggestedAngle = pickSuggestedAngle({
    candidate: args.candidate,
    strategy: args.strategy,
    strategyPillar,
    nicheMatch,
  });
  const breakdown: ExtensionOpportunityScoringBreakdown = {
    niche_match: nicheMatch,
    audience_fit: audienceFit,
    freshness,
    conversation_quality: conversationQuality,
    profile_click_potential: profileClickPotential,
    follow_conversion_potential: followConversionPotential,
    visibility_potential: visibilityPotential,
    spam_risk: spamRisk,
    off_niche_risk: offNicheRisk,
    genericity_risk: genericityRisk,
    negative_signal_risk: negativeSignalRisk,
  };
  const verdict = determineVerdict({ score, breakdown });
  const why = buildWhy({
    nicheMatch,
    audienceFit,
    freshness,
    conversationQuality,
    profileClickPotential,
    followConversionPotential,
    visibilityPotential,
    score,
    verdict,
  });
  const riskFlags = buildRiskFlags(breakdown);
  const expectedValue = buildExpectedValue({
    visibilityPotential,
    profileClickPotential,
    followConversionPotential,
  });
  const batchNotes = uniqueStrings([
    "Scored against your saved growth context for early-stage follower growth.",
    args.styleCard ? null : "No parsed voice profile was available, so scoring used onboarding context only.",
    args.strategy.ambiguities[0] || null,
  ]);
  const opportunity: ExtensionOpportunity = {
    opportunityId: "",
    postId: args.candidate.postId,
    score,
    verdict,
    why,
    riskFlags,
    suggestedAngle,
    expectedValue,
    scoringBreakdown: breakdown,
  };

  return {
    opportunity,
    candidate: args.candidate,
    strategyPillar,
    heuristicTier: stringifyScoreTier(score),
    storedNotes: {
      contractVersion: "xpo_companion_v2026",
      verdict,
      why,
      riskFlags,
      suggestedAngle,
      expectedValue,
      scoringBreakdown: breakdown,
      pageUrl: args.pageUrl,
      surface: args.requestSurface,
      batchNotes,
    },
  };
}

export function rankOpportunityBatch(args: {
  request: ExtensionOpportunityBatchRequest;
  strategy: GrowthStrategySnapshot;
  styleCard: VoiceStyleCard | null;
}) {
  const ranked = args.request.candidates.map((candidate) =>
    scoreOpportunityCandidate({
      candidate,
      requestSurface: args.request.surface,
      pageUrl: args.request.pageUrl,
      strategy: args.strategy,
      styleCard: args.styleCard,
    }),
  );
  const responseNotes = uniqueStrings([
    "Backend scoring is authoritative and tuned for 0 to 1,000 follower growth.",
    args.styleCard
      ? "Reply generation can use your saved voice profile when you select an opportunity."
      : "Reply generation will fall back to onboarding context because no parsed voice profile was found.",
    args.strategy.ambiguities[0] || null,
  ]);

  const topRanked = ranked
    .slice()
    .sort((left, right) => right.opportunity.score - left.opportunity.score)
    .filter((entry) => entry.opportunity.verdict !== "dont_reply" || entry.opportunity.score >= 35)
    .slice(0, 5);

  return {
    ranked,
    topRanked,
    notes: topRanked.length > 0 ? responseNotes : uniqueStrings([...responseNotes, "No strong reply opportunities cleared the current quality bar."]),
  };
}

export async function persistRankedOpportunity(args: {
  userId: string;
  xHandle: string;
  growthStage: string;
  goal: string;
  tone: string;
  ranked: RankedExtensionOpportunity;
}) {
  const record = await prisma.replyOpportunity.upsert({
    where: {
      userId_tweetId: {
        userId: args.userId,
        tweetId: args.ranked.candidate.postId,
      },
    },
    create: {
      userId: args.userId,
      xHandle: args.xHandle,
      tweetId: args.ranked.candidate.postId,
      authorHandle: normalizeWhitespace(args.ranked.candidate.author.handle).replace(/^@+/, "").toLowerCase(),
      tweetText: normalizeWhitespace(args.ranked.candidate.text),
      tweetUrl: normalizeWhitespace(args.ranked.candidate.url),
      tweetSnapshot:
        (toJsonValue({
          candidate: args.ranked.candidate,
          pageUrl: args.ranked.storedNotes.pageUrl,
          surface: args.ranked.storedNotes.surface,
        }) as Prisma.InputJsonValue | undefined) || {},
      heuristicScore: args.ranked.opportunity.score,
      heuristicTier: args.ranked.heuristicTier,
      stage: args.growthStage,
      tone: args.tone,
      goal: args.goal,
      strategyPillar: args.ranked.strategyPillar,
      generatedAngleLabel: args.ranked.opportunity.suggestedAngle,
      state: "ranked",
      openedAt: new Date(),
      notes:
        (toJsonValue(args.ranked.storedNotes) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull,
    },
    update: {
      xHandle: args.xHandle,
      authorHandle: normalizeWhitespace(args.ranked.candidate.author.handle).replace(/^@+/, "").toLowerCase(),
      tweetText: normalizeWhitespace(args.ranked.candidate.text),
      tweetUrl: normalizeWhitespace(args.ranked.candidate.url),
      tweetSnapshot:
        (toJsonValue({
          candidate: args.ranked.candidate,
          pageUrl: args.ranked.storedNotes.pageUrl,
          surface: args.ranked.storedNotes.surface,
        }) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull,
      heuristicScore: args.ranked.opportunity.score,
      heuristicTier: args.ranked.heuristicTier,
      stage: args.growthStage,
      tone: args.tone,
      goal: args.goal,
      strategyPillar: args.ranked.strategyPillar,
      generatedAngleLabel: args.ranked.opportunity.suggestedAngle,
      state: "ranked",
      notes:
        (toJsonValue(args.ranked.storedNotes) as Prisma.InputJsonValue | undefined) || Prisma.JsonNull,
      updatedAt: new Date(),
    },
  });

  return attachOpportunityId(args.ranked, record.id);
}

function attachOpportunityId(ranked: RankedExtensionOpportunity, opportunityId: string): RankedExtensionOpportunity {
  return {
    ...ranked,
    opportunity: {
      ...ranked.opportunity,
      opportunityId,
    },
  };
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? normalizeWhitespace(entry) : ""))
    .filter(Boolean);
}

function asExpectedValue(value: unknown): ExtensionOpportunityExpectedValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const visibility = record.visibility;
  const profileClicks = record.profileClicks;
  const followConversion = record.followConversion;
  const values = [visibility, profileClicks, followConversion];
  if (!values.every((entry) => entry === "low" || entry === "medium" || entry === "high")) {
    return null;
  }

  return {
    visibility: visibility as ExtensionExpectedValueLevel,
    profileClicks: profileClicks as ExtensionExpectedValueLevel,
    followConversion: followConversion as ExtensionExpectedValueLevel,
  };
}

function asBreakdown(value: unknown): ExtensionOpportunityScoringBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const keys: Array<keyof ExtensionOpportunityScoringBreakdown> = [
    "niche_match",
    "audience_fit",
    "freshness",
    "conversation_quality",
    "profile_click_potential",
    "follow_conversion_potential",
    "visibility_potential",
    "spam_risk",
    "off_niche_risk",
    "genericity_risk",
    "negative_signal_risk",
  ];
  const next = {} as ExtensionOpportunityScoringBreakdown;

  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    next[key] = roundScore(value);
  }

  return next;
}

export function readStoredOpportunityNotes(record: ReplyOpportunity): StoredOpportunityNotes | null {
  if (!record.notes || typeof record.notes !== "object" || Array.isArray(record.notes)) {
    return null;
  }

  const notes = record.notes as Record<string, unknown>;
  const verdict = notes.verdict;
  const suggestedAngle = notes.suggestedAngle;
  const expectedValue = asExpectedValue(notes.expectedValue);
  const scoringBreakdown = asBreakdown(notes.scoringBreakdown);
  if (
    verdict !== "reply" &&
    verdict !== "watch" &&
    verdict !== "dont_reply"
  ) {
    return null;
  }
  if (
    suggestedAngle !== "nuance" &&
    suggestedAngle !== "sharpen" &&
    suggestedAngle !== "disagree" &&
    suggestedAngle !== "example" &&
    suggestedAngle !== "translate" &&
    suggestedAngle !== "known_for"
  ) {
    return null;
  }
  if (!expectedValue || !scoringBreakdown) {
    return null;
  }

  return {
    contractVersion: "xpo_companion_v2026",
    verdict,
    why: asStringArray(notes.why),
    riskFlags: asStringArray(notes.riskFlags),
    suggestedAngle,
    expectedValue,
    scoringBreakdown,
    pageUrl: typeof notes.pageUrl === "string" ? notes.pageUrl : "",
    surface:
      notes.surface === "home" ||
      notes.surface === "search" ||
      notes.surface === "thread" ||
      notes.surface === "list" ||
      notes.surface === "profile" ||
      notes.surface === "unknown"
        ? notes.surface
        : "unknown",
    batchNotes: asStringArray(notes.batchNotes),
    analytics:
      notes.analytics && typeof notes.analytics === "object" && !Array.isArray(notes.analytics)
        ? {
            surface:
              (notes.analytics as Record<string, unknown>).surface === "home" ||
              (notes.analytics as Record<string, unknown>).surface === "search" ||
              (notes.analytics as Record<string, unknown>).surface === "thread" ||
              (notes.analytics as Record<string, unknown>).surface === "list" ||
              (notes.analytics as Record<string, unknown>).surface === "profile" ||
              (notes.analytics as Record<string, unknown>).surface === "unknown"
                ? ((notes.analytics as Record<string, unknown>).surface as ExtensionOpportunitySurface)
                : undefined,
            source:
              typeof (notes.analytics as Record<string, unknown>).source === "string"
                ? ((notes.analytics as Record<string, unknown>).source as string)
                : null,
            generatedReplyIds: asStringArray((notes.analytics as Record<string, unknown>).generatedReplyIds),
            generatedReplyLabels: asStringArray((notes.analytics as Record<string, unknown>).generatedReplyLabels),
            copiedReplyId:
              typeof (notes.analytics as Record<string, unknown>).copiedReplyId === "string"
                ? ((notes.analytics as Record<string, unknown>).copiedReplyId as string)
                : null,
            copiedReplyLabel:
              typeof (notes.analytics as Record<string, unknown>).copiedReplyLabel === "string"
                ? ((notes.analytics as Record<string, unknown>).copiedReplyLabel as string)
                : null,
            copiedReplyText:
              typeof (notes.analytics as Record<string, unknown>).copiedReplyText === "string"
                ? ((notes.analytics as Record<string, unknown>).copiedReplyText as string)
                : null,
            lastLoggedEvent:
              typeof (notes.analytics as Record<string, unknown>).lastLoggedEvent === "string"
                ? ((notes.analytics as Record<string, unknown>).lastLoggedEvent as string)
                : null,
          }
        : undefined,
  };
}

export function serializeStoredOpportunity(record: ReplyOpportunity): ExtensionOpportunity | null {
  const notes = readStoredOpportunityNotes(record);
  if (!notes) {
    return null;
  }

  return {
    opportunityId: record.id,
    postId: record.tweetId,
    score: roundScore(record.heuristicScore || 0),
    verdict: notes.verdict,
    why: notes.why.length > 0 ? notes.why : ["This opportunity is persisted, but the reason summary is incomplete."],
    riskFlags: notes.riskFlags,
    suggestedAngle: notes.suggestedAngle,
    expectedValue: notes.expectedValue,
    scoringBreakdown: notes.scoringBreakdown,
  };
}

export function mergeStoredOpportunityNotes(
  record: ReplyOpportunity,
  patch: Partial<StoredOpportunityNotes>,
) {
  const current = readStoredOpportunityNotes(record) || {
    contractVersion: "xpo_companion_v2026" as const,
    verdict: "watch" as const,
    why: ["Persisted opportunity metadata was incomplete."],
    riskFlags: [],
    suggestedAngle: "nuance" as const,
    expectedValue: {
      visibility: "low" as const,
      profileClicks: "low" as const,
      followConversion: "low" as const,
    },
    scoringBreakdown: {
      niche_match: 0,
      audience_fit: 0,
      freshness: 0,
      conversation_quality: 0,
      profile_click_potential: 0,
      follow_conversion_potential: 0,
      visibility_potential: 0,
      spam_risk: 0,
      off_niche_risk: 0,
      genericity_risk: 0,
      negative_signal_risk: 0,
    },
    pageUrl: "",
    surface: "unknown" as const,
    batchNotes: [],
  };

  return {
    ...current,
    ...patch,
    why: patch.why ? uniqueStrings(patch.why) : current.why,
    riskFlags: patch.riskFlags ? uniqueStrings(patch.riskFlags) : current.riskFlags,
    batchNotes: patch.batchNotes ? uniqueStrings(patch.batchNotes) : current.batchNotes,
    analytics: {
      ...(current.analytics || {}),
      ...(patch.analytics || {}),
      generatedReplyIds: patch.analytics?.generatedReplyIds
        ? uniqueStrings(patch.analytics.generatedReplyIds)
        : current.analytics?.generatedReplyIds || [],
      generatedReplyLabels: patch.analytics?.generatedReplyLabels
        ? uniqueStrings(patch.analytics.generatedReplyLabels)
        : current.analytics?.generatedReplyLabels || [],
    },
  } satisfies StoredOpportunityNotes;
}
