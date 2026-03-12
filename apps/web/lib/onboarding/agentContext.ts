import { buildCreatorProfile } from "./creatorProfile";
import {
  CREATOR_EVALUATION_RUBRIC_VERSION,
  CREATOR_PROFILE_MODEL_VERSION,
  evaluateCreatorProfile,
  type CreatorEvaluationCheck,
} from "./evaluation";
import {
  buildGrowthStrategySnapshot,
  type GrowthStrategySnapshot,
} from "./growthStrategy";
import { buildPerformanceModel } from "./performanceModel";
import type {
  ReplyInsights,
  StrategyAdjustments,
} from "../extension/replyOpportunities";
import type {
  ContentAdjustments,
  ContentInsights,
} from "./contentInsights";
import type { OperatingQueueItem } from "./operatingQueue";
import type { ProfileConversionAudit } from "./profileConversionAudit";
import type {
  CreatorProfile,
  CreatorRepresentativePost,
  OnboardingResult,
} from "./types";

export const CREATOR_AGENT_CONTEXT_VERSION = "agent_context_v3";

export type CreatorAgentContextReadinessStatus =
  | "ready"
  | "caution"
  | "not_ready";

export type CreatorAgentContextRecommendedMode =
  | "full_generation"
  | "conservative_generation"
  | "analysis_only";

export interface CreatorAgentContextAnchorSummary {
  positiveAnchorCount: number;
  positiveLaneCount: number;
  populatedPositiveRetrievalSets: number;
  negativeAnchorCount: number;
  negativeLaneCount: number;
  goalConflictCount: number;
  distinctGoalConflictCount: number;
  anchorQualityScore: number | null;
  anchorQualityStatus: CreatorEvaluationCheck["status"] | null;
}

export interface CreatorAgentContextConfidenceSummary {
  sampleBand: OnboardingResult["analysisConfidence"]["band"];
  sampleSize: number;
  recommendedDepthReached: boolean;
  needsBackfill: boolean;
  evaluationOverallScore: number;
  strongestChecks: CreatorEvaluationCheck[];
  weakestChecks: CreatorEvaluationCheck[];
  blockers: string[];
  nextImprovements: string[];
  archetypeConfidence: number;
  replySignalConfidence: number;
  quoteSignalConfidence: number;
}

export interface CreatorAgentContextReadinessSummary {
  score: number;
  status: CreatorAgentContextReadinessStatus;
  recommendedMode: CreatorAgentContextRecommendedMode;
  reasons: string[];
}

export interface CreatorAgentContext {
  generatedAt: string;
  contextVersion: string;
  creatorProfileVersion: string;
  evaluationRubricVersion: string;
  runId: string;
  account: string;
  avatarUrl?: string | null;
  source: OnboardingResult["source"];
  creatorProfile: CreatorProfile;
  performanceModel: ReturnType<typeof buildPerformanceModel>;
  strategyDelta: CreatorProfile["strategy"]["delta"];
  growthStrategySnapshot: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights;
  strategyAdjustments?: StrategyAdjustments;
  profileConversionAudit?: ProfileConversionAudit;
  contentInsights?: ContentInsights;
  contentAdjustments?: ContentAdjustments;
  operatingQueue?: OperatingQueueItem[];
  confidence: CreatorAgentContextConfidenceSummary;
  readiness: CreatorAgentContextReadinessSummary;
  anchorSummary: CreatorAgentContextAnchorSummary;
  positiveAnchors: CreatorRepresentativePost[];
  negativeAnchors: CreatorRepresentativePost[];
  retrieval: CreatorProfile["examples"];
  unknowns: string[];
}

function dedupeRepresentativePosts(
  groups: CreatorRepresentativePost[][],
  limit: number,
): CreatorRepresentativePost[] {
  const byId = new Map<string, CreatorRepresentativePost>();

  for (const group of groups) {
    for (const post of group) {
      if (!byId.has(post.id)) {
        byId.set(post.id, post);
      }

      if (byId.size >= limit) {
        return Array.from(byId.values());
      }
    }
  }

  return Array.from(byId.values());
}

function buildAnchorSummary(
  profile: CreatorProfile,
  evaluationChecks: CreatorEvaluationCheck[],
  positiveAnchors: CreatorRepresentativePost[],
  negativeAnchors: CreatorRepresentativePost[],
): CreatorAgentContextAnchorSummary {
  const positiveGroups = [
    profile.examples.bestPerforming,
    profile.examples.voiceAnchors,
    profile.examples.strategyAnchors,
    profile.examples.goalAnchors,
  ];
  const populatedPositiveRetrievalSets = positiveGroups.filter(
    (group) => group.length > 0,
  ).length;
  const positiveLaneCount = new Set(positiveAnchors.map((post) => post.lane)).size;
  const negativeLaneCount = new Set(negativeAnchors.map((post) => post.lane)).size;
  const cautionIds = new Set(profile.examples.cautionExamples.map((post) => post.id));
  const distinctGoalConflictCount = profile.examples.goalConflictExamples.filter(
    (post) => !cautionIds.has(post.id),
  ).length;
  const anchorQualityCheck =
    evaluationChecks.find((check) => check.key === "anchor_quality") ?? null;

  return {
    positiveAnchorCount: positiveAnchors.length,
    positiveLaneCount,
    populatedPositiveRetrievalSets,
    negativeAnchorCount: negativeAnchors.length,
    negativeLaneCount,
    goalConflictCount: profile.examples.goalConflictExamples.length,
    distinctGoalConflictCount,
    anchorQualityScore: anchorQualityCheck?.score ?? null,
    anchorQualityStatus: anchorQualityCheck?.status ?? null,
  };
}

function buildReadinessSummary(params: {
  onboarding: OnboardingResult;
  evaluationChecks: CreatorEvaluationCheck[];
  evaluationOverallScore: number;
  blockers: string[];
}): CreatorAgentContextReadinessSummary {
  const sampleQuality =
    params.evaluationChecks.find((check) => check.key === "sample_quality")?.score ??
    params.onboarding.analysisConfidence.score;
  const anchorQuality =
    params.evaluationChecks.find((check) => check.key === "anchor_quality")?.score ?? 35;
  const strategySpecificity =
    params.evaluationChecks.find((check) => check.key === "strategy_specificity")
      ?.score ?? 50;

  const score = Number(
    (
      sampleQuality * 0.35 +
      params.evaluationOverallScore * 0.35 +
      anchorQuality * 0.2 +
      strategySpecificity * 0.1
    ).toFixed(2),
  );

  const reasons: string[] = [];

  if (!params.onboarding.analysisConfidence.minimumViableReached) {
    reasons.push("Sample depth is below minimum viable for reliable generation.");
  }

  if (params.onboarding.analysisConfidence.backgroundBackfillRecommended) {
    reasons.push("A deeper backfill is still recommended before trusting the full context.");
  }

  if (anchorQuality < 55) {
    reasons.push("Anchor coverage is still shallow, so retrieval context is weak.");
  }

  if (strategySpecificity < 55) {
    reasons.push("Strategy guidance is still generic, so planning should stay conservative.");
  }

  if (params.blockers.length > 0) {
    reasons.push(params.blockers[0]);
  }

  if (reasons.length === 0) {
    reasons.push("Context is strong enough for normal generation behavior.");
  }

  if (!params.onboarding.analysisConfidence.minimumViableReached || score < 55) {
    return {
      score,
      status: "not_ready",
      recommendedMode: "analysis_only",
      reasons: reasons.slice(0, 3),
    };
  }

  if (
    !params.onboarding.analysisConfidence.recommendedDepthReached ||
    anchorQuality < 75 ||
    strategySpecificity < 70 ||
    score < 75
  ) {
    return {
      score,
      status: "caution",
      recommendedMode: "conservative_generation",
      reasons: reasons.slice(0, 3),
    };
  }

  return {
    score,
    status: "ready",
    recommendedMode: "full_generation",
    reasons: reasons.slice(0, 3),
  };
}

export function buildCreatorAgentContext(params: {
  runId: string;
  onboarding: OnboardingResult;
}): CreatorAgentContext {
  const performanceModel = buildPerformanceModel({
    sourceRunId: params.runId,
    onboarding: params.onboarding,
  });

  const creatorProfile = buildCreatorProfile({
    sourceRunId: params.runId,
    onboarding: params.onboarding,
    performanceModel,
  });

  const evaluation = evaluateCreatorProfile({
    runId: params.runId,
    onboarding: params.onboarding,
    creatorProfile,
  });

  const strongestChecks = [...evaluation.checks]
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
  const weakestChecks = [...evaluation.checks]
    .sort((left, right) => left.score - right.score)
    .slice(0, 2);
  const positiveAnchors = dedupeRepresentativePosts(
    [
      creatorProfile.examples.bestPerforming,
      creatorProfile.examples.voiceAnchors,
      creatorProfile.examples.strategyAnchors,
      creatorProfile.examples.goalAnchors,
    ],
    8,
  );
  const negativeAnchors = dedupeRepresentativePosts(
    [
      creatorProfile.examples.goalConflictExamples,
      creatorProfile.examples.cautionExamples,
    ],
    6,
  );
  const readiness = buildReadinessSummary({
    onboarding: params.onboarding,
    evaluationChecks: evaluation.checks,
    evaluationOverallScore: evaluation.overallScore,
    blockers: evaluation.blockers,
  });
  const growthStrategySnapshot = buildGrowthStrategySnapshot({
    creatorProfile,
    performanceModel,
    evaluationChecks: evaluation.checks,
    evaluationOverallScore: evaluation.overallScore,
    readiness: readiness.status,
    sampleSize: params.onboarding.analysisConfidence.sampleSize,
  });

  return {
    generatedAt: new Date().toISOString(),
    contextVersion: CREATOR_AGENT_CONTEXT_VERSION,
    creatorProfileVersion: CREATOR_PROFILE_MODEL_VERSION,
    evaluationRubricVersion: CREATOR_EVALUATION_RUBRIC_VERSION,
    runId: params.runId,
    account: params.onboarding.account,
    avatarUrl: params.onboarding.profile.avatarUrl,
    source: params.onboarding.source,
    creatorProfile,
    performanceModel,
    strategyDelta: creatorProfile.strategy.delta,
    growthStrategySnapshot,
    confidence: {
      sampleBand: params.onboarding.analysisConfidence.band,
      sampleSize: params.onboarding.analysisConfidence.sampleSize,
      recommendedDepthReached:
        params.onboarding.analysisConfidence.recommendedDepthReached,
      needsBackfill: params.onboarding.analysisConfidence.backgroundBackfillRecommended,
      evaluationOverallScore: evaluation.overallScore,
      strongestChecks,
      weakestChecks,
      blockers: evaluation.blockers,
      nextImprovements: evaluation.nextImprovements,
      archetypeConfidence: creatorProfile.archetypeConfidence,
      replySignalConfidence: creatorProfile.reply.signalConfidence,
      quoteSignalConfidence: creatorProfile.quote.signalConfidence,
    },
    readiness,
    anchorSummary: buildAnchorSummary(
      creatorProfile,
      evaluation.checks,
      positiveAnchors,
      negativeAnchors,
    ),
    positiveAnchors,
    negativeAnchors,
    retrieval: creatorProfile.examples,
    unknowns: Array.from(
      new Set([
        ...growthStrategySnapshot.ambiguities,
        ...growthStrategySnapshot.truthBoundary.unknowns,
        ...evaluation.blockers,
      ]),
    ).slice(0, 8),
  };
}
