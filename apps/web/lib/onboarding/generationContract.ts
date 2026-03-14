import { buildCreatorAgentContext } from "./strategy/agentContext";
import type {
  ContentAdjustments,
  ContentInsights,
} from "./analysis/contentInsights";
import type {
  ReplyInsights,
  StrategyAdjustments,
} from "../extension/replyOpportunities";
import type {
  CreatorRepresentativePost,
  OnboardingResult,
  ToneCasing,
  TonePreference,
  ToneRisk,
} from "./types";

export const CREATOR_GENERATION_CONTRACT_VERSION = "generation_contract_v6";

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
  outputShapeRationale: string;
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
  preferredOpeners: string[];
  preferredClosers: string[];
  signaturePhrases: string[];
  punctuationGuidelines: string[];
  emojiPolicy: string;
  forbiddenPhrases: string[];
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

export interface CreatorPositioningContract {
  knownFor: string;
  targetAudience: string;
  contentPillars: string[];
  profileConversionCues: string[];
  offBrandThemes: string[];
  ambiguities: string[];
  confidence: {
    positioning: number;
    overall: number;
    readiness: ReturnType<typeof buildCreatorAgentContext>["readiness"]["status"];
  };
}

export interface CreatorLearningPrioritiesContract {
  reinforce: string[];
  experiments: string[];
  cautionSignals: string[];
  unknowns: string[];
}

export interface CreatorGuardrailsContract {
  failClosed: boolean;
  hardRequirements: string[];
  prohibitedPatterns: string[];
  truthBoundary: ReturnType<
    typeof buildCreatorAgentContext
  >["growthStrategySnapshot"]["truthBoundary"];
}

export interface CreatorGenerationContract {
  generatedAt: string;
  contractVersion: string;
  contextVersion: string;
  runId: string;
  account: string;
  source: OnboardingResult["source"];
  mode: CreatorGenerationStageMode;
  positioning: CreatorPositioningContract;
  learningPriorities: CreatorLearningPrioritiesContract;
  guardrails: CreatorGuardrailsContract;
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

function prefersLongFormVoice(
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"],
): boolean {
  return (
    creatorProfile.voice.averageLengthBand === "long" ||
    creatorProfile.performance.recommendedLengthBand === "long" ||
    (creatorProfile.voice.averageLengthBand === "medium" &&
      creatorProfile.voice.multiLinePostRate >= 25) ||
    creatorProfile.voice.multiLinePostRate >= 45
  );
}

function prefersThreadSeed(
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"],
): boolean {
  if (creatorProfile.playbook.cadence.threadBias === "high") {
    return true;
  }

  if (
    creatorProfile.playbook.cadence.threadBias === "medium" &&
    creatorProfile.voice.multiLinePostRate >= 55 &&
    (creatorProfile.strategy.primaryGoal === "authority" ||
      creatorProfile.distribution.primaryLoop === "authority_building")
  ) {
    return true;
  }

  return false;
}

function shouldBiasShortForm(
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"],
): boolean {
  return (
    !creatorProfile.identity.isVerified &&
    creatorProfile.identity.followerBand === "0-1k" &&
    creatorProfile.strategy.primaryGoal === "followers" &&
    creatorProfile.voice.averageLengthBand === "short" &&
    creatorProfile.voice.multiLinePostRate < 20 &&
    creatorProfile.playbook.cadence.threadBias === "low"
  );
}

function selectOutputShape(params: {
  creatorProfile: ReturnType<typeof buildCreatorAgentContext>["creatorProfile"];
  targetLane: CreatorGenerationTargetLane;
}): {
  shape: CreatorGenerationOutputShape;
  rationale: string;
} {
  const { creatorProfile, targetLane } = params;

  if (targetLane === "reply") {
    return {
      shape: "reply_candidate",
      rationale:
        "The primary loop is reply-led, so the contract should generate a reply candidate instead of a top-level post.",
    };
  }

  if (targetLane === "quote") {
    return {
      shape: "quote_candidate",
      rationale:
        "The primary loop is quote commentary, so the contract should generate a quote candidate rather than a standalone post.",
    };
  }

  if (prefersThreadSeed(creatorProfile)) {
    return {
      shape: "thread_seed",
      rationale:
        "The creator shows strong thread bias and enough multiline/authority signal that a thread seed is a better fit than a compressed post.",
    };
  }

  if (prefersLongFormVoice(creatorProfile)) {
    return {
      shape: "long_form_post",
      rationale:
        "The creator has enough authority, multiline behavior, or long-form history that the contract should plan a developed long-form post.",
    };
  }

  if (shouldBiasShortForm(creatorProfile)) {
    return {
      shape: "short_form_post",
      rationale:
        "The creator is still early-stage and currently strongest in short, lightweight posts, so a short-form draft is the safest default.",
    };
  }

  if (
    creatorProfile.voice.averageLengthBand === "medium" ||
    creatorProfile.performance.recommendedLengthBand === "medium"
  ) {
    return {
      shape: "long_form_post",
      rationale:
        "The creator trends beyond one-liners, so a more developed standalone post is a better fit than a compressed short-form draft.",
    };
  }

  return {
    shape: "short_form_post",
    rationale:
      "The creator currently reads as a shorter-form account, so the contract should default to a compact standalone post.",
  };
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
  const isLongFormCreator =
    params.creatorProfile.voice.averageLengthBand === "long" ||
    params.creatorProfile.playbook.cadence.threadBias === "high" ||
    params.creatorProfile.voice.multiLinePostRate >= 30;
  const observedLowercase = isLongFormCreator
    ? params.creatorProfile.voice.primaryCasing === "lowercase" &&
      params.creatorProfile.voice.lowercaseSharePercent >= 95 &&
      params.creatorProfile.voice.multiLinePostRate < 10
    : params.creatorProfile.voice.primaryCasing === "lowercase" &&
      params.creatorProfile.voice.lowercaseSharePercent >= 72 &&
      params.creatorProfile.voice.multiLinePostRate < 35;
  const requestedCasing = params.tonePreference?.casing ?? "normal";
  const requestedRisk = params.tonePreference?.risk ?? "safe";
  const casing: ToneCasing =
    requestedCasing === "lowercase"
      ? "lowercase"
      : isLongFormCreator
        ? "normal"
        : observedLowercase
          ? "lowercase"
          : "normal";
  const summary =
    casing === requestedCasing
      ? `Honor the ${requestedCasing} casing preference while preserving the observed voice.`
      : `The stored casing preference is ${requestedCasing}, but the observed voice is strongly lowercase. Keep the tone casual without flattening the creator's natural structure.`;

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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildCreatorGenerationContract(params: {
  runId: string;
  onboarding: OnboardingResult;
  tonePreference?: TonePreference | null;
  agentContext?: ReturnType<typeof buildCreatorAgentContext>;
  replyInsights?: ReplyInsights | null;
  strategyAdjustments?: StrategyAdjustments | null;
  contentInsights?: ContentInsights | null;
  contentAdjustments?: ContentAdjustments | null;
}): CreatorGenerationContract {
  const context =
    params.agentContext ??
    buildCreatorAgentContext({
      runId: params.runId,
      onboarding: params.onboarding,
    });
  const { creatorProfile } = context;
  const targetLane = pickTargetLane(creatorProfile.distribution.primaryLoop);
  const outputShapeDecision = selectOutputShape({
    creatorProfile,
    targetLane,
  });
  const outputShape = outputShapeDecision.shape;
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
  const activeExperiments = unique([
    ...(params.strategyAdjustments?.experiments || []),
    ...(params.contentAdjustments?.experiments || []),
  ]).slice(0, 3);
  const pillarAnchor =
    context.growthStrategySnapshot.contentPillars[0] ||
    activeExperiments[0] ||
    formatReadableLabel(effectiveNiche);
  const positioningIsTentative =
    context.growthStrategySnapshot.confidence.positioning < 65 ||
    context.growthStrategySnapshot.ambiguities.length > 0;
  const guardrailRequirements = unique([
    `Anchor every draft to one current pillar or active experiment. Default anchor: ${pillarAnchor}`,
    targetLane === "reply"
      ? "Replies must add one concrete layer beyond agreement."
      : "Drafts must make the account easier to categorize on first read.",
    positioningIsTentative
      ? "Keep positioning narrow and tentative instead of acting like the niche is fully locked."
      : "",
    "Respect the truth boundary and avoid invented lived experience, fake receipts, or fake authority.",
  ]).slice(0, 4);
  const prohibitedPatterns = unique([
    "broad motivational filler with no niche tie",
    "generic engagement bait with no positioning value",
    targetLane === "reply" ? "generic praise-only replies" : "",
    ...context.growthStrategySnapshot.offBrandThemes,
    ...(params.strategyAdjustments?.deprioritize || []),
    ...(params.contentAdjustments?.deprioritize || []),
  ]).slice(0, 6);

  const mustInclude = [
    shouldPlanTowardTargetNiche
      ? `Target niche to build toward: ${formatReadableLabel(effectiveNiche)}`
      : `Primary niche: ${formatReadableLabel(effectiveNiche)}`,
    `Distribution loop: ${formatReadableLabel(creatorProfile.distribution.primaryLoop)}`,
    `Primary goal: ${creatorProfile.strategy.primaryGoal}`,
    `Target casing: ${targetTone.casing}`,
    `Risk appetite: ${targetTone.risk}`,
    `Anchor to pillar or experiment: ${pillarAnchor}`,
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

  if (positioningIsTentative) {
    mustInclude.push("Keep the positioning narrow and explicitly tentative where needed.");
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

  mustAvoid.push(...prohibitedPatterns);

  const checklist = [
    "Matches the current voice and playbook, not generic platform advice.",
    "Supports the stated goal and current strategy delta.",
    "Respects the selected transformation mode (preserve, optimize, or pivot).",
    "Maps clearly to one current pillar or active experiment.",
    "Rejects broad motivational filler, generic bait, or shallow praise-only commentary.",
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

  if (positioningIsTentative) {
    checklist.push("If the niche is not fully locked, the draft uses the narrowest useful interpretation.");
  }

  return {
    generatedAt: new Date().toISOString(),
    contractVersion: CREATOR_GENERATION_CONTRACT_VERSION,
    contextVersion: context.contextVersion,
    runId: params.runId,
    account: params.onboarding.account,
    source: params.onboarding.source,
    mode,
    positioning: {
      knownFor: context.growthStrategySnapshot.knownFor,
      targetAudience: context.growthStrategySnapshot.targetAudience,
      contentPillars: context.growthStrategySnapshot.contentPillars.slice(0, 5),
      profileConversionCues: context.growthStrategySnapshot.profileConversionCues.slice(0, 4),
      offBrandThemes: context.growthStrategySnapshot.offBrandThemes.slice(0, 4),
      ambiguities: context.growthStrategySnapshot.ambiguities.slice(0, 4),
      confidence: {
        positioning: context.growthStrategySnapshot.confidence.positioning,
        overall: context.growthStrategySnapshot.confidence.overall,
        readiness: context.readiness.status,
      },
    },
    learningPriorities: {
      reinforce: unique([
        ...(params.strategyAdjustments?.reinforce || []),
        ...(params.contentAdjustments?.reinforce || []),
      ]).slice(0, 4),
      experiments: activeExperiments,
      cautionSignals: unique([
        ...(params.replyInsights?.cautionSignals || []),
        ...(params.contentInsights?.cautionSignals || []),
      ]).slice(0, 4),
      unknowns: unique([
        ...(params.replyInsights?.unknowns || []),
        ...(params.contentInsights?.unknowns || []),
      ]).slice(0, 4),
    },
    guardrails: {
      failClosed: true,
      hardRequirements: guardrailRequirements,
      prohibitedPatterns,
      truthBoundary: context.growthStrategySnapshot.truthBoundary,
    },
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
      outputShapeRationale: outputShapeDecision.rationale,
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
      preferredOpeners: creatorProfile.styleCard.preferredOpeners.slice(0, 3),
      preferredClosers: creatorProfile.styleCard.preferredClosers.slice(0, 3),
      signaturePhrases: creatorProfile.styleCard.signaturePhrases.slice(0, 4),
      punctuationGuidelines: creatorProfile.styleCard.punctuationGuidelines.slice(0, 3),
      emojiPolicy: creatorProfile.styleCard.emojiPolicy,
      forbiddenPhrases: creatorProfile.styleCard.forbiddenPhrases.slice(0, 4),
      mustInclude: unique(mustInclude).slice(0, 10),
      mustAvoid: unique(mustAvoid).slice(0, 10),
      positiveAnchorIds: selectAnchorIds(context.positiveAnchors, 5),
      negativeAnchorIds: selectAnchorIds(context.negativeAnchors, 3),
    },
    critic: {
      mode,
      checklist,
      failClosed: true,
    },
  };
}
