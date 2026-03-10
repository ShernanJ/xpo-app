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

  return buildHints({
    creatorProfile: context.creatorProfile,
    preferredOutputShape: contract.planner.outputShape,
  });
}

export function buildCreatorProfileHintsFromCreatorProfile(args: {
  creatorProfile: CreatorProfile;
  preferredOutputShape: CreatorProfileHints["preferredOutputShape"];
}): CreatorProfileHints {
  return buildHints(args);
}
