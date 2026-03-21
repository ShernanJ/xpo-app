import {
  executePlanningCapability,
} from "./planningCapability.ts";
import { handleAutoApprovedPlanTurn } from "./autoApprovedPlanTurn.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../runtime/types.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
  GroundingPacketSourceMaterial,
} from "../../grounding/groundingPacket.ts";
import type { DraftRequestPolicy } from "../../grounding/requestPolicy.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import type { DraftingCapabilityRunResult } from "../drafting/draftingCapability.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

export async function handlePlanModeTurn(args: {
  memory: V2ConversationMemory;
  getMemory: () => V2ConversationMemory;
  userMessage: string;
  effectiveActiveConstraints: string[];
  safeFrameworkConstraint?: string | null;
  groundedTopicDraftInput: {
    planMessage?: string | null;
    nextConstraints: string[];
  };
  effectiveContext: string;
  activeDraft?: string;
  goal: string;
  antiPatterns: string[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  baseVoiceTarget: VoiceTarget;
  creatorProfileHints?: CreatorProfileHints | null;
  requestPolicy: DraftRequestPolicy;
  selectedSourceMaterials: SourceMaterialAssetRecord[];
  shouldForceNoFabricationGuardrailForTurn: boolean;
  styleCard: VoiceStyleCard | null;
  nextAssistantTurnCount: number;
  feedbackMemoryNotice?: string | null;
  shouldAutoDraft: boolean;
  isMultiDraftTurn: boolean;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
  turnThreadFramingStyle: ThreadFramingStyle | null;
  buildClarificationAwarePlanInput: (args: {
    userMessage: string;
    activeConstraints: string[];
  }) => {
    planMessage: string;
    activeConstraints: string[];
  };
  buildGroundingPacketForContext: (
    activeConstraints: string[],
    sourceText: string,
  ) => GroundingPacket;
  setPlanInputSource: (
    source: "clarification_answer" | "grounded_topic" | "raw_user_message",
  ) => void;
  setPlanFailure: (reason: string | null, failed: boolean) => void;
  loadHistoricalTexts: () => Promise<string[]>;
  writeMemory: (patch: MemoryPatch) => Promise<void>;
  applyExecutionMeta: (args: {
    workers?: RuntimeWorkerExecution[];
    validations?: RuntimeValidationResult[];
  }) => void;
  applyRoutingTracePatch: (patch?: RoutingTracePatch) => void;
  runGroundedDraft: (args: {
    plan: StrategyPlan;
    activeConstraints: string[];
    activeDraft?: string;
    sourceUserMessage?: string;
    draftPreference: DraftPreference;
    formatPreference: DraftFormatPreference;
    threadFramingStyle: ThreadFramingStyle | null;
    fallbackToWriterWhenCriticRejected: boolean;
    topicSummary?: string | null;
    groundingPacket?: GroundingPacket;
    pendingPlan?: StrategyPlan | null;
  }) => Promise<DraftingCapabilityRunResult>;
  checkDeterministicNovelty: (
    draft: string,
    historicalTexts: string[],
  ) => { isNovel: boolean; reason: string | null; maxSimilarity: number };
  buildNoveltyNotes: (args: {
    noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
    retrievalReasons?: string[];
  }) => string[];
  services: Pick<ConversationServices, "generatePlan">;
}): Promise<RawOrchestratorResponse> {
  const clarificationAwarePlanInput = args.buildClarificationAwarePlanInput({
    userMessage: args.userMessage,
    activeConstraints: args.effectiveActiveConstraints,
  });
  const usesClarificationPlanInput =
    clarificationAwarePlanInput.planMessage !== args.userMessage ||
    clarificationAwarePlanInput.activeConstraints !== args.effectiveActiveConstraints;
  const usesGroundedTopicPlanInput =
    !usesClarificationPlanInput && Boolean(args.groundedTopicDraftInput.planMessage);
  const planInput = usesClarificationPlanInput
    ? clarificationAwarePlanInput
    : args.groundedTopicDraftInput.planMessage
      ? {
          planMessage: args.groundedTopicDraftInput.planMessage,
          activeConstraints: args.groundedTopicDraftInput.nextConstraints,
        }
      : clarificationAwarePlanInput;

  args.setPlanInputSource(
    usesClarificationPlanInput
      ? "clarification_answer"
      : usesGroundedTopicPlanInput
        ? "grounded_topic"
        : "raw_user_message",
  );

  const preparedPlanActiveConstraints = Array.from(
    new Set([
      ...planInput.activeConstraints,
      ...(args.safeFrameworkConstraint ? [args.safeFrameworkConstraint] : []),
    ]),
  );
  const preparedPlanGroundingPacket = args.buildGroundingPacketForContext(
    preparedPlanActiveConstraints,
    planInput.planMessage,
  );

  const execution = await executePlanningCapability({
    workflow: "plan_then_draft",
    capability: "planning",
    activeContextRefs: [
      "memory.pendingPlan",
      "memory.topicSummary",
      "memory.latestRefinementInstruction",
      "memory.lastIdeationAngles",
    ],
    context: {
      planInputMessage: planInput.planMessage,
      planActiveConstraints: preparedPlanActiveConstraints,
      planGroundingPacket: preparedPlanGroundingPacket,
      memory: args.memory,
      effectiveContext: args.effectiveContext,
      activeDraft: args.activeDraft,
      goal: args.goal,
      antiPatterns: args.antiPatterns,
      turnDraftPreference: args.turnDraftPreference,
      turnFormatPreference: args.turnFormatPreference,
      baseVoiceTarget: args.baseVoiceTarget,
      creatorProfileHints: args.creatorProfileHints,
      requestPolicy: args.requestPolicy,
      selectedSourceMaterials: args.selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn:
        args.shouldForceNoFabricationGuardrailForTurn,
      styleCard: args.styleCard,
      nextAssistantTurnCount: args.nextAssistantTurnCount,
      feedbackMemoryNotice: args.feedbackMemoryNotice,
    },
    services: args.services,
  });

  args.applyExecutionMeta({
    workers: execution.workers,
    validations: execution.validations,
  });

  if (execution.output.kind === "plan_failure") {
    args.setPlanFailure(execution.output.failureReason, true);
    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  args.setPlanFailure(null, false);

  const autoApprovedPlanTurn = await handleAutoApprovedPlanTurn({
    memory: args.memory,
    getMemory: args.getMemory,
    guardedPlan: execution.output.plan,
    planActiveConstraints: execution.output.planActiveConstraints,
    planGroundingPacket: execution.output.planGroundingPacket,
    planResponseSeed: execution.output.responseSeed,
    planMemoryPatch: execution.output.memoryPatch,
    shouldAutoDraft: args.shouldAutoDraft,
    isMultiDraftTurn: args.isMultiDraftTurn,
    selectedSourceMaterials: args.selectedSourceMaterials,
    turnDraftPreference: args.turnDraftPreference,
    turnFormatPreference: args.turnFormatPreference,
    nextAssistantTurnCount: args.nextAssistantTurnCount,
    feedbackMemoryNotice: args.feedbackMemoryNotice,
    creatorProfileHints: args.creatorProfileHints,
    requestPolicy: args.requestPolicy,
    groundingSources: args.groundingSources,
    groundingMode: args.groundingMode,
    groundingExplanation: args.groundingExplanation,
    activeDraft: args.activeDraft,
    userMessage: args.userMessage,
    planInputMessage: planInput.planMessage,
    styleCard: args.styleCard,
    turnThreadFramingStyle: args.turnThreadFramingStyle,
    loadHistoricalTexts: args.loadHistoricalTexts,
    writeMemory: args.writeMemory,
    applyExecutionMeta: args.applyExecutionMeta,
    applyRoutingTracePatch: args.applyRoutingTracePatch,
    runGroundedDraft: args.runGroundedDraft,
    checkDeterministicNovelty: args.checkDeterministicNovelty,
    buildNoveltyNotes: args.buildNoveltyNotes,
  });

  if (autoApprovedPlanTurn) {
    return autoApprovedPlanTurn;
  }

  await args.writeMemory(execution.output.memoryPatch);

  return {
    ...execution.output.responseSeed,
    memory: args.getMemory(),
  };
}
