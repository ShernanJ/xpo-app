import {
  appendNoFabricationConstraint,
  hasNoFabricationPlanGuardrail,
} from "../../grounding/draftGrounding.ts";
import {
  executePlanningCapability,
} from "../planning/planningCapability.ts";
import {
  executeDraftingCapability,
  type DraftingCapabilityRunResult,
} from "../drafting/draftingCapability.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type { OrchestratorResponse, RoutingTracePatch } from "../../runtime/types.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  CapabilityPatchedResponseOutput,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
  GroundingPacketSourceMaterial,
} from "../../grounding/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import { mergeRuntimeExecutionMeta } from "../../runtime/workerPlane.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface ReplanningCapabilityContext {
  memory: V2ConversationMemory;
  userMessage: string;
  draftInstruction: string;
  revisionActiveConstraints: string[];
  effectiveContext: string;
  activeDraft?: string;
  historicalTexts: string[];
  goal: string;
  antiPatterns: string[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  baseVoiceTarget: VoiceTarget;
  creatorProfileHints?: CreatorProfileHints | null;
  selectedSourceMaterials: SourceMaterialAssetRecord[];
  shouldForceNoFabricationGuardrailForTurn: boolean;
  styleCard: VoiceStyleCard | null;
  nextAssistantTurnCount: number;
  refreshRollingSummary: boolean;
  feedbackMemoryNotice?: string | null;
  turnThreadFramingStyle: ThreadFramingStyle | null;
  groundingPacket: GroundingPacket;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
}

export interface ReplanningCapabilityMemoryPatch {
  topicSummary: string;
  activeConstraints: string[];
  conversationState: "draft_ready";
  pendingPlan: null;
  clarificationState: null;
  rollingSummary: string | null;
  assistantTurnCount: number;
  formatPreference: DraftFormatPreference;
  latestRefinementInstruction: null;
  unresolvedQuestion: null;
}

export interface ReplanningCapabilityDraftReadyOutput {
  kind: "draft_ready";
  responseSeed: RawResponseSeed;
  memoryPatch: ReplanningCapabilityMemoryPatch;
}

export interface ReplanningCapabilityPlanFailureOutput {
  kind: "plan_failure";
  failureReason: string | null;
  responseSeed: RawResponseSeed;
}

export type ReplanningCapabilityOutput =
  | ReplanningCapabilityDraftReadyOutput
  | ReplanningCapabilityPlanFailureOutput
  | CapabilityPatchedResponseOutput<RawOrchestratorResponse, RoutingTracePatch>;

export async function executeReplanningCapability(
  args: CapabilityExecutionRequest<ReplanningCapabilityContext> & {
    services: Pick<ConversationServices, "generatePlan" | "checkDeterministicNovelty"> & {
      buildGroundingPacketForContext: (
        activeConstraints: string[],
        sourceText: string,
      ) => GroundingPacket;
      runDraft: (args: {
        plan: StrategyPlan;
        activeConstraints: string[];
        groundingPacket: GroundingPacket;
      }) => Promise<DraftingCapabilityRunResult>;
      buildNoveltyNotes: (args: {
        noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
        retrievalReasons?: string[];
      }) => string[];
      handleNoveltyConflict: (planObjective: string) => Promise<RawOrchestratorResponse>;
    };
  },
): Promise<CapabilityExecutionResult<ReplanningCapabilityOutput>> {
  const { context, services } = args;
  const planningExecution = await executePlanningCapability({
    workflow: args.workflow,
    capability: "planning",
    activeContextRefs: args.activeContextRefs,
    context: {
      planInputMessage: context.draftInstruction,
      planActiveConstraints: context.revisionActiveConstraints,
      planGroundingPacket: context.groundingPacket,
      memory: context.memory,
      effectiveContext: context.effectiveContext,
      activeDraft: context.activeDraft,
      goal: context.goal,
      antiPatterns: context.antiPatterns,
      turnDraftPreference: context.turnDraftPreference,
      turnFormatPreference: context.turnFormatPreference,
      baseVoiceTarget: context.baseVoiceTarget,
      creatorProfileHints: context.creatorProfileHints,
      selectedSourceMaterials: context.selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn:
        context.shouldForceNoFabricationGuardrailForTurn,
      styleCard: context.styleCard,
      nextAssistantTurnCount: context.nextAssistantTurnCount,
      feedbackMemoryNotice: context.feedbackMemoryNotice,
    },
    services: {
      generatePlan: services.generatePlan,
    },
  });

  if (planningExecution.output.kind === "plan_failure") {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: planningExecution.output,
      workers: planningExecution.workers,
      validations: planningExecution.validations,
    };
  }

  const guardedPlan = planningExecution.output.plan;
  const draftActiveConstraints = hasNoFabricationPlanGuardrail(guardedPlan)
    ? appendNoFabricationConstraint(context.revisionActiveConstraints)
    : context.revisionActiveConstraints;
  const draftGroundingPacket = services.buildGroundingPacketForContext(
    draftActiveConstraints,
    context.draftInstruction,
  );
  const draftingExecution = await executeDraftingCapability({
    workflow: args.workflow,
    capability: "drafting",
    activeContextRefs: [
      "memory.pendingPlan",
      "memory.topicSummary",
      "memory.rollingSummary",
    ],
    context: {
      memory: context.memory,
      plan: guardedPlan,
      activeConstraints: draftActiveConstraints,
      historicalTexts: context.historicalTexts,
      userMessage: context.userMessage,
      draftPreference: guardedPlan.deliveryPreference || context.turnDraftPreference,
      turnFormatPreference: context.turnFormatPreference,
      styleCard: context.styleCard,
      feedbackMemoryNotice: context.feedbackMemoryNotice,
      nextAssistantTurnCount: context.nextAssistantTurnCount,
      latestDraftStatus: "Draft delivered",
      refreshRollingSummary: context.refreshRollingSummary,
      groundingSources: context.groundingSources,
      groundingMode: context.groundingMode,
      groundingExplanation: context.groundingExplanation,
    },
    services: {
      checkDeterministicNovelty: services.checkDeterministicNovelty,
      runDraft: () =>
        services.runDraft({
          plan: guardedPlan,
          activeConstraints: draftActiveConstraints,
          groundingPacket: draftGroundingPacket,
        }),
      handleNoveltyConflict: () =>
        services.handleNoveltyConflict(guardedPlan.objective),
      buildNoveltyNotes: services.buildNoveltyNotes,
    },
  });

  const { workerExecutions: workers, validations } = mergeRuntimeExecutionMeta(
    {
      workerExecutions: planningExecution.workers ?? [],
      validations: planningExecution.validations ?? [],
    },
    {
      workerExecutions: draftingExecution.workers ?? [],
      validations: draftingExecution.validations ?? [],
    },
  );

  if (draftingExecution.output.kind === "response") {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: draftingExecution.output,
      workers,
      validations,
    };
  }

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      kind: "draft_ready",
      responseSeed: draftingExecution.output.responseSeed,
      memoryPatch: {
        ...draftingExecution.output.memoryPatch,
        activeConstraints: draftActiveConstraints,
      },
    },
    workers,
    validations,
  };
}
