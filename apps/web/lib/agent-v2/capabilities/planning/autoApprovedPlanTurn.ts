import { executeDraftBundleCapability } from "../../orchestrator/draftBundleExecutor.ts";
import {
  executeDraftingCapability,
  type DraftingCapabilityRunResult,
} from "../drafting/draftingCapability.ts";
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
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import type {
  GroundingPacket,
  GroundingPacketSourceMaterial,
} from "../../orchestrator/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../orchestrator/sourceMaterials.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { PlanningCapabilityMemoryPatch } from "./planningCapability.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;
type MemoryPatch = Partial<V2ConversationMemory>;

export async function handleAutoApprovedPlanTurn(args: {
  memory: V2ConversationMemory;
  getMemory: () => V2ConversationMemory;
  guardedPlan: StrategyPlan;
  planActiveConstraints: string[];
  planGroundingPacket: GroundingPacket;
  planResponseSeed: RawResponseSeed;
  planMemoryPatch: PlanningCapabilityMemoryPatch;
  shouldAutoDraft: boolean;
  isMultiDraftTurn: boolean;
  selectedSourceMaterials: SourceMaterialAssetRecord[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  nextAssistantTurnCount: number;
  feedbackMemoryNotice?: string | null;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
  activeDraft?: string;
  userMessage: string;
  planInputMessage?: string | null;
  styleCard: VoiceStyleCard | null;
  turnThreadFramingStyle: ThreadFramingStyle | null;
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
}): Promise<RawOrchestratorResponse | null> {
  if (!args.shouldAutoDraft) {
    return null;
  }

  if (args.isMultiDraftTurn) {
    const historicalTexts = await args.loadHistoricalTexts();
    const execution = await executeDraftBundleCapability({
      workflow: "plan_then_draft",
      capability: "drafting",
      activeContextRefs: [
        "memory.pendingPlan",
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        userMessage: args.planInputMessage || args.userMessage,
        memory: args.memory,
        plan: args.guardedPlan,
        activeConstraints: args.planActiveConstraints,
        sourceMaterials: args.selectedSourceMaterials,
        draftPreference: args.turnDraftPreference,
        topicSummary: args.guardedPlan.objective,
        groundingPacket: args.planGroundingPacket,
        historicalTexts,
        turnFormatPreference: args.turnFormatPreference,
        nextAssistantTurnCount: args.nextAssistantTurnCount,
        refreshRollingSummary: true,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        groundingSources: args.groundingSources,
        groundingMode: args.groundingMode,
        groundingExplanation: args.groundingExplanation,
      },
      services: {
        runSingleDraft: ({
          plan,
          activeConstraints,
          sourceUserMessage,
          draftPreference,
          topicSummary,
          groundingPacket,
        }) =>
          args.runGroundedDraft({
            plan,
            activeConstraints,
            sourceUserMessage,
            draftPreference,
            formatPreference: "shortform",
            threadFramingStyle: null,
            fallbackToWriterWhenCriticRejected: false,
            topicSummary,
            groundingPacket,
          }),
        checkDeterministicNovelty: args.checkDeterministicNovelty,
        buildNoveltyNotes: args.buildNoveltyNotes,
      },
    });

    args.applyExecutionMeta(execution);

    if (execution.output.kind === "response" && execution.output.response.mode === "error") {
      args.applyRoutingTracePatch(execution.output.routingTracePatch);
      await args.writeMemory(args.planMemoryPatch);
      return {
        ...args.planResponseSeed,
        memory: args.getMemory(),
      };
    }

    if (execution.output.kind === "response") {
      args.applyRoutingTracePatch(execution.output.routingTracePatch);
      return execution.output.response;
    }

    await args.writeMemory(execution.output.memoryPatch);

    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  const draftResult = await args.runGroundedDraft({
    plan: args.guardedPlan,
    activeConstraints: args.planActiveConstraints,
    activeDraft: args.activeDraft,
    sourceUserMessage: args.planInputMessage || undefined,
    draftPreference: args.turnDraftPreference,
    formatPreference: args.turnFormatPreference,
    threadFramingStyle: args.turnThreadFramingStyle,
    fallbackToWriterWhenCriticRejected: true,
    topicSummary: args.guardedPlan.objective,
    groundingPacket: args.planGroundingPacket,
  });
  args.applyExecutionMeta({
    workers: draftResult.workers,
    validations: draftResult.validations,
  });
  args.applyRoutingTracePatch(draftResult.routingTracePatch);

  if (draftResult.kind === "response" && draftResult.response.mode === "error") {
    await args.writeMemory(args.planMemoryPatch);
    return {
      ...args.planResponseSeed,
      memory: args.getMemory(),
    };
  }

  if (draftResult.kind === "response") {
    return draftResult.response;
  }

  const historicalTexts = await args.loadHistoricalTexts();
  const execution = await executeDraftingCapability({
    workflow: "plan_then_draft",
    capability: "drafting",
    activeContextRefs: [
      "memory.pendingPlan",
      "memory.topicSummary",
      "memory.rollingSummary",
    ],
    context: {
      memory: args.memory,
      plan: args.guardedPlan,
      activeConstraints: args.planActiveConstraints,
      historicalTexts,
      userMessage: args.userMessage,
      draftPreference: args.turnDraftPreference,
      turnFormatPreference: args.turnFormatPreference,
      styleCard: args.styleCard,
      feedbackMemoryNotice: args.feedbackMemoryNotice,
      nextAssistantTurnCount: args.nextAssistantTurnCount,
      latestDraftStatus: "Rough draft generated",
      refreshRollingSummary: true,
      groundingSources: args.groundingSources,
      groundingMode: args.groundingMode,
      groundingExplanation: args.groundingExplanation,
    },
    services: {
      checkDeterministicNovelty: args.checkDeterministicNovelty,
      runDraft: async () => draftResult,
      buildNoveltyNotes: args.buildNoveltyNotes,
    },
  });

  args.applyExecutionMeta(execution);
  if (execution.output.kind === "response") {
    return execution.output.response;
  }

  await args.writeMemory({
    ...execution.output.memoryPatch,
    activeConstraints: args.planActiveConstraints,
  });

  return {
    ...execution.output.responseSeed,
    data: {
      ...execution.output.responseSeed.data,
      plan: args.guardedPlan,
    },
    memory: args.getMemory(),
  };
}
