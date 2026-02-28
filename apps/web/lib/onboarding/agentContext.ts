import { buildCreatorProfile } from "./creatorProfile";
import {
  CREATOR_EVALUATION_RUBRIC_VERSION,
  CREATOR_PROFILE_MODEL_VERSION,
  evaluateCreatorProfile,
  type CreatorEvaluationCheck,
} from "./evaluation";
import { buildPerformanceModel } from "./performanceModel";
import type {
  CreatorProfile,
  CreatorRepresentativePost,
  OnboardingResult,
} from "./types";

export const CREATOR_AGENT_CONTEXT_VERSION = "agent_context_v1";

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

export interface CreatorAgentContext {
  generatedAt: string;
  contextVersion: string;
  creatorProfileVersion: string;
  evaluationRubricVersion: string;
  runId: string;
  account: string;
  source: OnboardingResult["source"];
  creatorProfile: CreatorProfile;
  performanceModel: ReturnType<typeof buildPerformanceModel>;
  strategyDelta: CreatorProfile["strategy"]["delta"];
  confidence: CreatorAgentContextConfidenceSummary;
  positiveAnchors: CreatorRepresentativePost[];
  negativeAnchors: CreatorRepresentativePost[];
  retrieval: CreatorProfile["examples"];
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

  return {
    generatedAt: new Date().toISOString(),
    contextVersion: CREATOR_AGENT_CONTEXT_VERSION,
    creatorProfileVersion: CREATOR_PROFILE_MODEL_VERSION,
    evaluationRubricVersion: CREATOR_EVALUATION_RUBRIC_VERSION,
    runId: params.runId,
    account: params.onboarding.account,
    source: params.onboarding.source,
    creatorProfile,
    performanceModel,
    strategyDelta: creatorProfile.strategy.delta,
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
    positiveAnchors: dedupeRepresentativePosts(
      [
        creatorProfile.examples.bestPerforming,
        creatorProfile.examples.voiceAnchors,
        creatorProfile.examples.strategyAnchors,
        creatorProfile.examples.goalAnchors,
      ],
      8,
    ),
    negativeAnchors: dedupeRepresentativePosts(
      [
        creatorProfile.examples.goalConflictExamples,
        creatorProfile.examples.cautionExamples,
      ],
      6,
    ),
    retrieval: creatorProfile.examples,
  };
}
