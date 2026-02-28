import { buildCreatorProfile } from "./creatorProfile";
import type {
  AnalysisConfidenceBand,
  CreatorProfile,
  OnboardingResult,
} from "./types";

export const CREATOR_EVALUATION_RUBRIC_VERSION = "creator_eval_v2";
export const CREATOR_PROFILE_MODEL_VERSION = "deterministic_v1";

export type CreatorEvaluationStatus = "strong" | "usable" | "weak";

export interface CreatorEvaluationCheck {
  key:
    | "sample_quality"
    | "topic_quality"
    | "archetype_confidence"
    | "strategy_specificity"
    | "interaction_signal_quality"
    | "anchor_quality";
  label: string;
  score: number;
  status: CreatorEvaluationStatus;
  summary: string;
}

export interface CreatorEvaluationSnapshot {
  sampleSize: number;
  replyCount: number;
  quoteCount: number;
  growthStage: OnboardingResult["growthStage"];
  archetype: CreatorProfile["archetype"];
  secondaryArchetype: CreatorProfile["secondaryArchetype"];
  topTopic: string | null;
}

export interface CreatorEvaluationResult {
  generatedAt: string;
  rubricVersion: string;
  creatorProfileVersion: string;
  runId: string;
  account: string;
  source: OnboardingResult["source"];
  overallScore: number;
  checks: CreatorEvaluationCheck[];
  blockers: string[];
  nextImprovements: string[];
  snapshot: CreatorEvaluationSnapshot;
}

function toStatus(score: number): CreatorEvaluationStatus {
  if (score >= 80) {
    return "strong";
  }

  if (score >= 55) {
    return "usable";
  }

  return "weak";
}

function createCheck(
  key: CreatorEvaluationCheck["key"],
  label: string,
  score: number,
  summary: string,
): CreatorEvaluationCheck {
  const bounded = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  return {
    key,
    label,
    score: bounded,
    status: toStatus(bounded),
    summary,
  };
}

function bandLabel(band: AnalysisConfidenceBand): string {
  if (band === "very_low") {
    return "very low";
  }

  return band.replace(/_/g, " ");
}

function evaluateSampleQuality(onboarding: OnboardingResult): CreatorEvaluationCheck {
  const confidence = onboarding.analysisConfidence;
  return createCheck(
    "sample_quality",
    "Sample Quality",
    confidence.score,
    `Sample depth is ${bandLabel(confidence.band)} at ${confidence.sampleSize} original posts. ${confidence.message}`,
  );
}

function evaluateTopicQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const topTopic = profile.topics.dominantTopics[0];

  if (!topTopic) {
    return createCheck(
      "topic_quality",
      "Topic Quality",
      30,
      "No strong topic signal was extracted yet, so topic-driven recommendations are still weak.",
    );
  }

  const scoreBase =
    30 +
    Math.min(25, profile.topics.dominantTopics.length * 7) +
    Math.min(20, topTopic.count * 5) +
    (topTopic.specificity === "broad" ? 0 : 10) +
    (topTopic.stability === "steady" ? 8 : topTopic.stability === "emerging" ? 10 : 2);

  return createCheck(
    "topic_quality",
    "Topic Quality",
    scoreBase,
    `${topTopic.label} is the current top topic (${topTopic.percentage}% of posts, ${topTopic.stability}). Topic specificity is ${topTopic.specificity}.`,
  );
}

function evaluateArchetypeConfidence(profile: CreatorProfile): CreatorEvaluationCheck {
  const secondary = profile.secondaryArchetype
    ? ` Secondary archetype is ${profile.secondaryArchetype}.`
    : "";

  return createCheck(
    "archetype_confidence",
    "Archetype Confidence",
    profile.archetypeConfidence,
    `Primary archetype is ${profile.archetype} at ${profile.archetypeConfidence}% confidence.${secondary}`,
  );
}

function evaluateStrategySpecificity(profile: CreatorProfile): CreatorEvaluationCheck {
  const strengths = profile.strategy.currentStrengths.length;
  const weaknesses = profile.strategy.currentWeaknesses.length;
  const angles = profile.strategy.recommendedAngles.length;
  const nextMoves = profile.strategy.nextMoves.length;
  const hasFallbackOnly =
    angles === 1 &&
    profile.strategy.recommendedAngles[0] ===
      "Increase consistency around one repeatable content pillar.";
  const scoreBase =
    25 +
    Math.min(20, strengths * 5) +
    Math.min(20, weaknesses * 5) +
    Math.min(20, angles * 5) +
    Math.min(15, nextMoves * 3) -
    (hasFallbackOnly ? 20 : 0);

  return createCheck(
    "strategy_specificity",
    "Strategy Specificity",
    scoreBase,
    `Strategy currently has ${strengths} strengths, ${weaknesses} weaknesses, ${angles} recommended angles, and ${nextMoves} next moves.`,
  );
}

function evaluateInteractionSignalQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const laneConfidences = [
    profile.reply.signalConfidence,
    profile.quote.signalConfidence,
  ].filter((value) => value > 0);
  const score =
    laneConfidences.length > 0
      ? laneConfidences.reduce((sum, value) => sum + value, 0) /
        laneConfidences.length
      : 35;

  const replyState = profile.reply.isReliable
    ? `Reply lane is reliable at ${profile.reply.signalConfidence}%.`
    : profile.reply.replyCount > 0
      ? `Reply lane is low-sample at ${profile.reply.signalConfidence}%.`
      : "No reply lane signal yet.";
  const quoteState = profile.quote.isReliable
    ? `Quote lane is reliable at ${profile.quote.signalConfidence}%.`
    : profile.quote.quoteCount > 0
      ? `Quote lane is low-sample at ${profile.quote.signalConfidence}%.`
      : "No quote lane signal yet.";

  return createCheck(
    "interaction_signal_quality",
    "Interaction Signal Quality",
    score,
    `${replyState} ${quoteState}`,
  );
}

function evaluateAnchorQuality(profile: CreatorProfile): CreatorEvaluationCheck {
  const positiveGroups = [
    profile.examples.bestPerforming,
    profile.examples.voiceAnchors,
    profile.examples.strategyAnchors,
    profile.examples.goalAnchors,
  ];
  const positiveAnchors = positiveGroups.flat();
  const presentPositiveGroups = positiveGroups.filter((group) => group.length > 0).length;
  const positiveUniqueIds = new Set(positiveAnchors.map((post) => post.id));
  const positiveLanes = new Set(positiveAnchors.map((post) => post.lane));

  const goalConflictExamples = profile.examples.goalConflictExamples;
  const cautionExamples = profile.examples.cautionExamples;
  const negativeAnchors = [...goalConflictExamples, ...cautionExamples];
  const negativeUniqueIds = new Set(negativeAnchors.map((post) => post.id));
  const negativeLanes = new Set(negativeAnchors.map((post) => post.lane));
  const cautionIds = new Set(cautionExamples.map((post) => post.id));
  const distinctGoalConflictCount = goalConflictExamples.filter(
    (post) => !cautionIds.has(post.id),
  ).length;

  const score =
    18 +
    Math.min(24, positiveUniqueIds.size * 4) +
    Math.min(16, presentPositiveGroups * 4) +
    Math.min(12, positiveLanes.size * 4) +
    Math.min(12, negativeUniqueIds.size * 3) +
    Math.min(10, distinctGoalConflictCount * 5) +
    Math.min(8, negativeLanes.size * 4) -
    (presentPositiveGroups <= 1 ? 18 : 0) -
    (goalConflictExamples.length === 0 ? 12 : 0);

  const conflictNote =
    goalConflictExamples.length === 0
      ? "No goal-conflict examples were selected yet."
      : distinctGoalConflictCount === 0
        ? "Goal-conflict retrieval currently overlaps with generic caution examples."
        : `${distinctGoalConflictCount} goal-conflict examples are distinct from generic caution examples.`;

  return createCheck(
    "anchor_quality",
    "Anchor Quality",
    score,
    `Positive anchors cover ${presentPositiveGroups} retrieval sets, ${positiveUniqueIds.size} unique posts, and ${positiveLanes.size} lanes. ${conflictNote}`,
  );
}

function buildBlockers(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
  checks: CreatorEvaluationCheck[],
): string[] {
  const blockers: string[] = [];
  const weakChecks = checks.filter((check) => check.status === "weak");

  if (!onboarding.analysisConfidence.minimumViableReached) {
    blockers.push("Sample is below minimum viable depth.");
  }

  if (profile.topics.dominantTopics.length === 0) {
    blockers.push("Topic layer is too weak to drive strong strategy.");
  }

  if (profile.archetypeConfidence < 55) {
    blockers.push("Archetype signal is still mixed.");
  }

  if (checks.some((check) => check.key === "anchor_quality" && check.status === "weak")) {
    blockers.push("Retrieval anchors are still too shallow for reliable planning context.");
  }

  if (
    profile.identity.followerBand === "0-1k" &&
    !profile.reply.isReliable &&
    !profile.quote.isReliable
  ) {
    blockers.push(
      "Interaction lanes are still low-confidence for early-stage growth tactics.",
    );
  }

  if (weakChecks.length >= 3) {
    blockers.push(
      "Multiple weak checks are still present, so downstream drafting should stay conservative.",
    );
  }

  return blockers;
}

function buildNextImprovements(
  onboarding: OnboardingResult,
  profile: CreatorProfile,
  checks: CreatorEvaluationCheck[],
): string[] {
  const improvements: string[] = [];
  const weakKeys = new Set(
    checks.filter((check) => check.status === "weak").map((check) => check.key),
  );

  if (
    !onboarding.analysisConfidence.recommendedDepthReached ||
    weakKeys.has("sample_quality")
  ) {
    improvements.push("Backfill deeper post history before trusting strategy too heavily.");
  }

  if (weakKeys.has("topic_quality")) {
    improvements.push(
      "Improve topic/entity resolution or gather more data until stronger repeated topics appear.",
    );
  }

  if (weakKeys.has("archetype_confidence")) {
    improvements.push(
      "Keep archetype guidance blended until the creator signal becomes less mixed.",
    );
  }

  if (weakKeys.has("interaction_signal_quality")) {
    improvements.push(
      "Keep reply and quote lanes advisory-only until their samples become more reliable.",
    );
  }

  if (weakKeys.has("strategy_specificity")) {
    improvements.push(
      "Strengthen the strategy delta so recommendations become more specific than generic pattern advice.",
    );
  }

  if (weakKeys.has("anchor_quality")) {
    improvements.push(
      "Improve positive and negative retrieval coverage so the agent context has stronger concrete examples to follow and avoid.",
    );
  }

  if (improvements.length === 0) {
    improvements.push(
      "The current deterministic layer is in a usable place. The next gains should come from deeper data and retrieval, not broad rewrites.",
    );
  }

  return improvements.slice(0, 5);
}

export function evaluateCreatorProfile(params: {
  runId: string;
  onboarding: OnboardingResult;
  creatorProfile?: CreatorProfile;
}): CreatorEvaluationResult {
  const profile =
    params.creatorProfile ??
    buildCreatorProfile({
      sourceRunId: params.runId,
      onboarding: params.onboarding,
    });

  const checks = [
    evaluateSampleQuality(params.onboarding),
    evaluateTopicQuality(profile),
    evaluateArchetypeConfidence(profile),
    evaluateStrategySpecificity(profile),
    evaluateInteractionSignalQuality(profile),
    evaluateAnchorQuality(profile),
  ];

  const overallScore = Number(
    (
      checks.reduce((sum, check) => sum + check.score, 0) / Math.max(1, checks.length)
    ).toFixed(2),
  );

  return {
    generatedAt: new Date().toISOString(),
    rubricVersion: CREATOR_EVALUATION_RUBRIC_VERSION,
    creatorProfileVersion: CREATOR_PROFILE_MODEL_VERSION,
    runId: params.runId,
    account: params.onboarding.account,
    source: params.onboarding.source,
    overallScore,
    checks,
    blockers: buildBlockers(params.onboarding, profile, checks),
    nextImprovements: buildNextImprovements(params.onboarding, profile, checks),
    snapshot: {
      sampleSize: params.onboarding.recentPostSampleCount,
      replyCount: params.onboarding.replyPostSampleCount,
      quoteCount: params.onboarding.quotePostSampleCount,
      growthStage: params.onboarding.growthStage,
      archetype: profile.archetype,
      secondaryArchetype: profile.secondaryArchetype,
      topTopic: profile.topics.dominantTopics[0]?.label ?? null,
    },
  };
}
