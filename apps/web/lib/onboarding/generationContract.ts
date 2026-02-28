import { buildCreatorAgentContext } from "./agentContext";
import type {
  CreatorRepresentativePost,
  OnboardingResult,
  ToneCasing,
  TonePreference,
  ToneRisk,
} from "./types";

export const CREATOR_GENERATION_CONTRACT_VERSION = "generation_contract_v3";

export type CreatorGenerationStageMode =
  | "full_generation"
  | "conservative_generation"
  | "analysis_only";

export type CreatorGenerationTargetLane = "original" | "reply" | "quote";

export type CreatorGenerationOutputShape =
  | "short_form_post"
  | "long_form_post"
  | "thread_seed"
  | "reply_candidate"
  | "quote_candidate";

export type CreatorAuthorityBudget = "low" | "medium" | "high";

export interface CreatorPlannerContract {
  mode: CreatorGenerationStageMode;
  objective: string;
  primaryAngle: string;
  targetLane: CreatorGenerationTargetLane;
  outputShape: CreatorGenerationOutputShape;
  authorityBudget: CreatorAuthorityBudget;
  suggestedContentTypes: string[];
  suggestedHookPatterns: string[];
  strategyDeltaSummary: string;
  blockedReasons: string[];
}

export interface CreatorWriterContract {
  mode: CreatorGenerationStageMode;
  targetCasing: ToneCasing;
  targetRisk: ToneRisk;
  toneBlendSummary: string;
  proofRequirement: string;
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

function pickOutputShape(
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"],
  targetLane: CreatorGenerationTargetLane,
): CreatorGenerationOutputShape {
  if (targetLane === "reply") {
    return "reply_candidate";
  }

  if (targetLane === "quote") {
    return "quote_candidate";
  }

  if (creatorProfile.playbook.cadence.threadBias === "high") {
    return "thread_seed";
  }

  if (
    creatorProfile.identity.isVerified ||
    creatorProfile.voice.averageLengthBand === "long"
  ) {
    return "long_form_post";
  }

  return "short_form_post";
}

function deriveAuthorityBudget(
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"],
): CreatorAuthorityBudget {
  if (
    creatorProfile.identity.isVerified ||
    creatorProfile.identity.followerBand === "10k+"
  ) {
    return "high";
  }

  if (creatorProfile.identity.followerBand === "1k-10k") {
    return "medium";
  }

  return "low";
}

function resolveTargetTone(params: {
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"];
  tonePreference?: TonePreference | null;
}): {
  casing: ToneCasing;
  risk: ToneRisk;
  summary: string;
} {
  const observedLowercase =
    params.creatorProfile.voice.primaryCasing === "lowercase" ||
    params.creatorProfile.voice.lowercaseSharePercent >= 72;
  const requestedCasing = params.tonePreference?.casing ?? "normal";
  const requestedRisk = params.tonePreference?.risk ?? "safe";
  const casing: ToneCasing =
    requestedCasing === "lowercase" || observedLowercase ? "lowercase" : "normal";
  const summary =
    casing === requestedCasing
      ? `Honor the ${requestedCasing} casing preference while preserving the observed voice.`
      : `The stored casing preference is ${requestedCasing}, but the observed voice is clearly more lowercase, so generation should stay casual and lowercase-first.`;

  return {
    casing,
    risk: requestedRisk,
    summary,
  };
}

function buildProofRequirement(params: {
  authorityBudget: CreatorAuthorityBudget;
  outputShape: CreatorGenerationOutputShape;
}): string {
  if (params.authorityBudget === "high") {
    return "Specific proof helps, but a sharper thesis can carry more of the post.";
  }

  if (params.authorityBudget === "medium") {
    return "Prefer at least one concrete detail, receipt, metric, or real example so the post does not feel abstract.";
  }

  if (
    params.outputShape === "reply_candidate" ||
    params.outputShape === "quote_candidate"
  ) {
    return "Even short replies and quote takes should include one concrete observation, example, or specific detail instead of empty commentary.";
  }

  return "Low-authority accounts should include at least one real receipt: a metric, screenshot, build detail, hard constraint, concrete lesson, or specific example.";
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

function formatReadableLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function buildCreatorGenerationContract(params: {
  runId: string;
  onboarding: OnboardingResult;
  tonePreference?: TonePreference | null;
}): CreatorGenerationContract {
  const context = buildCreatorAgentContext({
    runId: params.runId,
    onboarding: params.onboarding,
  });
  const { creatorProfile } = context;
  const targetLane = pickTargetLane(creatorProfile.distribution.primaryLoop);
  const outputShape = pickOutputShape(creatorProfile, targetLane);
  const authorityBudget = deriveAuthorityBudget(creatorProfile);
  const targetTone = resolveTargetTone({
    creatorProfile,
    tonePreference: params.tonePreference,
  });
  const proofRequirement = buildProofRequirement({
    authorityBudget,
    outputShape,
  });
  const mode = context.readiness.recommendedMode;
  const blockedReasons =
    mode === "analysis_only" ? context.readiness.reasons.slice(0, 3) : [];
  const primaryAngle =
    creatorProfile.strategy.recommendedAngles[0] ??
    "Stay consistent around the strongest current lane.";
  const observedNiche = creatorProfile.niche.primaryNiche;
  const targetNiche = creatorProfile.niche.targetNiche;
  const shouldPlanTowardTargetNiche =
    observedNiche === "generalist" &&
    targetNiche !== null &&
    targetNiche !== "generalist";
  const effectiveNiche =
    (shouldPlanTowardTargetNiche ? targetNiche : observedNiche) ?? observedNiche;

  const mustInclude = [
    shouldPlanTowardTargetNiche
      ? `Target niche to build toward: ${formatReadableLabel(effectiveNiche)}`
      : `Primary niche: ${formatReadableLabel(effectiveNiche)}`,
    `Distribution loop: ${formatReadableLabel(creatorProfile.distribution.primaryLoop)}`,
    `Primary goal: ${creatorProfile.strategy.primaryGoal}`,
    `Target casing: ${targetTone.casing}`,
    `Risk appetite: ${targetTone.risk}`,
    creatorProfile.playbook.ctaPolicy,
    proofRequirement,
  ];

  if (shouldPlanTowardTargetNiche) {
    mustInclude.push(creatorProfile.niche.transitionSummary);
  }

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

  if (shouldPlanTowardTargetNiche) {
    mustAvoid.push(
      "Do not write in a broad generic way that hides the target niche you are trying to build toward.",
    );
  }

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

  if (shouldPlanTowardTargetNiche) {
    checklist.push(
      `The draft should make ${formatReadableLabel(
        effectiveNiche,
      )} more legible than the current broad feed does today.`,
    );
  }

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
          : shouldPlanTowardTargetNiche
            ? `Plan one ${targetLane} draft that advances ${creatorProfile.strategy.primaryGoal} while building toward ${formatReadableLabel(
                effectiveNiche,
              )}.`
            : `Plan one ${targetLane} draft that advances ${creatorProfile.strategy.primaryGoal}.`,
      primaryAngle,
      targetLane,
      outputShape,
      authorityBudget,
      suggestedContentTypes: creatorProfile.playbook.preferredContentTypes,
      suggestedHookPatterns: creatorProfile.playbook.preferredHookPatterns,
      strategyDeltaSummary: summarizeAdjustments(creatorProfile.strategy.delta.adjustments),
      blockedReasons,
    },
    writer: {
      mode,
      targetCasing: targetTone.casing,
      targetRisk: targetTone.risk,
      toneBlendSummary: targetTone.summary,
      proofRequirement,
      voiceGuidelines: [
        ...creatorProfile.playbook.toneGuidelines,
        ...creatorProfile.voice.styleNotes,
      ].slice(0, 6),
      mustInclude: mustInclude.slice(0, 7),
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
