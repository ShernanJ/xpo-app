import { buildCreatorAgentContext } from "../../onboarding/agentContext.ts";
import { buildCreatorGenerationContract } from "../../onboarding/generationContract.ts";
import type { CreatorProfile, OnboardingResult } from "../../onboarding/types.ts";
import type { CreatorProfileHints } from "./groundingPacket.ts";

function normalizeSnippet(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractSnippet(value: string): string | null {
  const normalized = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 20 && !/^[-*•>]/.test(line));

  if (!normalized) {
    return null;
  }

  return normalizeSnippet(normalized).slice(0, 180);
}

function buildHints(args: {
  creatorProfile: CreatorProfile;
  preferredOutputShape: CreatorProfileHints["preferredOutputShape"];
}): CreatorProfileHints {
  const topExampleSnippets = [
    ...args.creatorProfile.examples.voiceAnchors,
    ...args.creatorProfile.examples.bestPerforming,
    ...args.creatorProfile.examples.strategyAnchors,
  ]
    .map((entry) => extractSnippet(entry.text))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 3);

  return {
    preferredOutputShape: args.preferredOutputShape,
    threadBias: args.creatorProfile.playbook.cadence.threadBias,
    preferredHookPatterns: args.creatorProfile.playbook.preferredHookPatterns,
    toneGuidelines: args.creatorProfile.playbook.toneGuidelines.slice(0, 4),
    ctaPolicy: args.creatorProfile.playbook.ctaPolicy,
    topExampleSnippets,
    knownFor: null,
    targetAudience: null,
    contentPillars: [],
    replyGoals: [],
    profileConversionCues: [],
    offBrandThemes: [],
    ambiguities: [],
    learningSignals: [],
  };
}

export function buildCreatorProfileHintsFromOnboarding(args: {
  runId: string;
  onboarding: OnboardingResult;
}): CreatorProfileHints {
  const context = buildCreatorAgentContext({
    runId: args.runId,
    onboarding: args.onboarding,
  });
  const contract = buildCreatorGenerationContract({
    runId: args.runId,
    onboarding: args.onboarding,
  });

  return applyGrowthStrategyToCreatorProfileHints({
    hints: buildHints({
      creatorProfile: context.creatorProfile,
      preferredOutputShape: contract.planner.outputShape,
    }),
    growthStrategySnapshot: context.growthStrategySnapshot,
  });
}

export function buildCreatorProfileHintsFromCreatorProfile(args: {
  creatorProfile: CreatorProfile;
  preferredOutputShape: CreatorProfileHints["preferredOutputShape"];
}): CreatorProfileHints {
  return buildHints(args);
}

export function applyGrowthStrategyToCreatorProfileHints(args: {
  hints: CreatorProfileHints;
  growthStrategySnapshot: {
    knownFor: string;
    targetAudience: string;
    contentPillars: string[];
    replyGoals: string[];
    profileConversionCues: string[];
    offBrandThemes: string[];
    ambiguities: string[];
  };
  learningSignals?: string[] | null;
}): CreatorProfileHints {
  return {
    ...args.hints,
    knownFor: args.growthStrategySnapshot.knownFor,
    targetAudience: args.growthStrategySnapshot.targetAudience,
    contentPillars: args.growthStrategySnapshot.contentPillars.slice(0, 5),
    replyGoals: args.growthStrategySnapshot.replyGoals.slice(0, 4),
    profileConversionCues: args.growthStrategySnapshot.profileConversionCues.slice(0, 4),
    offBrandThemes: args.growthStrategySnapshot.offBrandThemes.slice(0, 4),
    ambiguities: args.growthStrategySnapshot.ambiguities.slice(0, 4),
    learningSignals:
      args.learningSignals?.filter(Boolean).slice(0, 4) || args.hints.learningSignals || [],
  };
}
