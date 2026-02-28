import { buildCreatorAgentContext } from "./agentContext";
import type { CreatorRepresentativePost, OnboardingResult } from "./types";

export const CREATOR_GENERATION_CONTRACT_VERSION = "generation_contract_v1";

export type CreatorGenerationStageMode =
  | "full_generation"
  | "conservative_generation"
  | "analysis_only";

export type CreatorGenerationTargetLane = "original" | "reply" | "quote";

export interface CreatorPlannerContract {
  mode: CreatorGenerationStageMode;
  objective: string;
  primaryAngle: string;
  targetLane: CreatorGenerationTargetLane;
  suggestedContentTypes: string[];
  suggestedHookPatterns: string[];
  strategyDeltaSummary: string;
  blockedReasons: string[];
}

export interface CreatorWriterContract {
  mode: CreatorGenerationStageMode;
  voiceGuidelines: string[];
  mustInclude: string[];
  mustAvoid: string[];
  positiveAnchorIds: string[];
  negativeAnchorIds: string[];
}

export interface CreatorCriticContract {
  mode: CreatorGenerationStageMode;
  checklist: string[];
  failClosed: boolean;
}

export interface CreatorGenerationContract {
  generatedAt: string;
  contractVersion: string;
  contextVersion: string;
  runId: string;
  account: string;
  source: OnboardingResult["source"];
  mode: CreatorGenerationStageMode;
  planner: CreatorPlannerContract;
  writer: CreatorWriterContract;
  critic: CreatorCriticContract;
}

function pickTargetLane(
  loop: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"]["distribution"]["primaryLoop"],
): CreatorGenerationTargetLane {
  if (loop === "reply_driven") {
    return "reply";
  }

  if (loop === "quote_commentary") {
    return "quote";
  }

  return "original";
}

function summarizeAdjustments(
  adjustments: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"]["strategy"]["delta"]["adjustments"],
): string {
  if (adjustments.length === 0) {
    return "No major structural adjustments are currently required.";
  }

  return adjustments
    .slice(0, 3)
    .map(
      (adjustment) =>
        `${adjustment.direction} ${adjustment.area.replace(/_/g, " ")} (${adjustment.priority})`,
    )
    .join("; ");
}

function selectAnchorIds(posts: CreatorRepresentativePost[], limit: number): string[] {
  return posts.slice(0, limit).map((post) => post.id);
}

export function buildCreatorGenerationContract(params: {
  runId: string;
  onboarding: OnboardingResult;
}): CreatorGenerationContract {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const { creatorProfile } = context;
  const targetLane = pickTargetLane(creatorProfile.distribution.primaryLoop);
  const mode = context.readiness.recommendedMode;
  const blockedReasons =
    mode === "analysis_only" ? context.readiness.reasons.slice(0, 3) : [];
  const primaryAngle =
    creatorProfile.strategy.recommendedAngles[0] ??
    "Stay consistent around the strongest current lane.";

  const mustInclude = [
    `Primary niche: ${creatorProfile.niche.primaryNiche.replace(/_/g, " ")}`,
    `Distribution loop: ${creatorProfile.distribution.primaryLoop.replace(/_/g, " ")}`,
    `Primary goal: ${creatorProfile.strategy.primaryGoal}`,
    creatorProfile.playbook.ctaPolicy,
  ];

  if (creatorProfile.conversation.readiness === "high") {
    mustInclude.push("Design for replies and plan to stay active in the thread.");
  } else if (
    creatorProfile.strategy.primaryGoal === "followers" &&
    creatorProfile.conversation.readiness === "low"
  ) {
    mustInclude.push("Use one clear reply-generating prompt instead of a passive statement.");
  }

  const mustAvoid = [
    ...context.negativeAnchors
      .slice(0, 3)
      .map((post) => `Avoid copying pattern from ${post.id}: ${post.selectionReason}`),
  ];

  if (mode === "analysis_only") {
    mustAvoid.push("Do not generate a post draft while context readiness is below threshold.");
  }

  const checklist = [
    "Matches the current voice and playbook, not generic platform advice.",
    "Supports the stated goal and current strategy delta.",
    "Respects the selected transformation mode (preserve, optimize, or pivot).",
    "Does not reuse a negative anchor pattern.",
    targetLane === "reply"
      ? "Feels like a reply worth continuing, not a throwaway reactive line."
      : targetLane === "quote"
        ? "The idea should still make sense when rewritten as a standalone take."
        : "The post stands on its own without relying on extra context.",
  ];

  if (creatorProfile.conversation.readiness === "high") {
    checklist.push("The draft creates an opening for real replies, not just passive likes.");
  }

  return {
    generatedAt: new Date().toISOString(),
    contractVersion: CREATOR_GENERATION_CONTRACT_VERSION,
    contextVersion: context.contextVersion,
    runId: params.runId,
    account: params.onboarding.account,
    source: params.onboarding.source,
    mode,
    planner: {
      mode,
      objective:
        mode === "analysis_only"
          ? "Do not generate. Return analysis and next steps only."
          : `Plan one ${targetLane} draft that advances ${creatorProfile.strategy.primaryGoal}.`,
      primaryAngle,
      targetLane,
      suggestedContentTypes: creatorProfile.playbook.preferredContentTypes,
      suggestedHookPatterns: creatorProfile.playbook.preferredHookPatterns,
      strategyDeltaSummary: summarizeAdjustments(creatorProfile.strategy.delta.adjustments),
      blockedReasons,
    },
    writer: {
      mode,
      voiceGuidelines: [
        ...creatorProfile.playbook.toneGuidelines,
        ...creatorProfile.voice.styleNotes,
      ].slice(0, 6),
      mustInclude: mustInclude.slice(0, 5),
      mustAvoid: mustAvoid.slice(0, 5),
      positiveAnchorIds: selectAnchorIds(context.positiveAnchors, 5),
      negativeAnchorIds: selectAnchorIds(context.negativeAnchors, 3),
    },
    critic: {
      mode,
      checklist,
      failClosed: mode === "analysis_only",
    },
  };
}
