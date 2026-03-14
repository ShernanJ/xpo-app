import {
  shouldUseRevisionDraftPath,
} from "../../orchestrator/conversationManagerLogic.ts";
import { isConstraintDeclaration } from "../../orchestrator/chatResponder.ts";
import { normalizeDraftRevisionInstruction } from "../../orchestrator/draftRevision.ts";
import { executeReplanningCapability } from "../../orchestrator/replanningExecutor.ts";
import { prisma } from "../../../db";
import {
  executeRevisingCapability,
} from "./revisingCapability.ts";
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
} from "../../orchestrator/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../orchestrator/sourceMaterials.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  AgentRuntimeWorkflow,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import type { DraftingCapabilityRunResult } from "../drafting/draftingCapability.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

export async function handleDraftEditReviewTurn(args: {
  memory: V2ConversationMemory;
  getMemory: () => V2ConversationMemory;
  userMessage: string;
  mode: string;
  runtimeWorkflow: AgentRuntimeWorkflow;
  threadId?: string;
  activeDraft?: string;
  draftInstruction: string;
  effectiveActiveConstraints: string[];
  safeFrameworkConstraint?: string | null;
  effectiveContext: string;
  relevantTopicAnchors: string[];
  styleCard: VoiceStyleCard | null;
  maxCharacterLimit: number;
  threadPostMaxCharacterLimit?: number;
  goal: string;
  antiPatterns: string[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  turnThreadFramingStyle: ThreadFramingStyle | null;
  groundingPacket: GroundingPacket;
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  refreshRollingSummary: boolean;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
  baseVoiceTarget: VoiceTarget;
  creatorProfileHints?: CreatorProfileHints | null;
  selectedSourceMaterials: SourceMaterialAssetRecord[];
  shouldForceNoFabricationGuardrailForTurn: boolean;
  writeMemory: (patch: MemoryPatch) => Promise<void>;
  loadHistoricalTexts: () => Promise<string[]>;
  applyExecutionMeta: (args: {
    workers?: RuntimeWorkerExecution[];
    validations?: RuntimeValidationResult[];
  }) => void;
  applyRoutingTracePatch: (patch?: RoutingTracePatch) => void;
  setPlanFailure: (reason: string | null, failed: boolean) => void;
  buildGroundedProductClarificationQuestion: (sourceUserMessage: string) => string;
  buildGroundingPacketForContext: (
    activeConstraints: string[],
    sourceText: string,
  ) => GroundingPacket;
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
  buildNoveltyNotes: (args: {
    noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
    retrievalReasons?: string[];
  }) => string[];
  returnClarificationQuestion: (args: {
    question: string;
    clarificationState?: V2ConversationMemory["clarificationState"] | null;
    traceReason?: string | null;
  }) => Promise<RawOrchestratorResponse>;
  returnClarificationTree: (args: {
    branchKey: "plan_reject";
    seedTopic: string | null;
    pendingPlan?: StrategyPlan | null;
    replyOverride?: string;
  }) => Promise<RawOrchestratorResponse>;
  services: Pick<
    ConversationServices,
    "generatePlan" | "generateRevisionDraft" | "critiqueDrafts" | "checkDeterministicNovelty"
  >;
}): Promise<RawOrchestratorResponse> {
  let effectiveActiveDraft = args.activeDraft;

  if (
    !effectiveActiveDraft &&
    args.runtimeWorkflow === "revise_draft" &&
    args.threadId
  ) {
    try {
      const lastDraftMessage = await prisma.chatMessage.findFirst({
        where: {
          threadId: args.threadId,
          role: "assistant",
        },
        orderBy: { createdAt: "desc" },
        select: { data: true },
      });
      const messageData = lastDraftMessage?.data as Record<string, unknown> | undefined;
      if (messageData?.draft && typeof messageData.draft === "string") {
        effectiveActiveDraft = messageData.draft;
      }
    } catch {
      // Non-critical: if recovery fails, fall through to the clarification response.
    }
  }

  if (args.runtimeWorkflow === "revise_draft" && !effectiveActiveDraft) {
    return args.returnClarificationQuestion({
      question:
        "paste the draft you want me to improve, or open one from this thread and i'll revise it.",
      traceReason: "missing_active_draft_for_edit",
    });
  }

  const revisionActiveConstraints = Array.from(
    new Set([
      ...(isConstraintDeclaration(args.userMessage)
        ? [...args.effectiveActiveConstraints, args.userMessage.trim()]
        : args.effectiveActiveConstraints),
      ...(args.safeFrameworkConstraint ? [args.safeFrameworkConstraint] : []),
    ]),
  );

  if (
    shouldUseRevisionDraftPath({
      mode: args.mode,
      workflow: args.runtimeWorkflow,
      activeDraft: effectiveActiveDraft,
    }) &&
    effectiveActiveDraft
  ) {
    const revision = normalizeDraftRevisionInstruction(
      args.draftInstruction,
      effectiveActiveDraft,
    );
    const execution = await executeRevisingCapability({
      workflow: "revise_draft",
      capability: "revising",
      activeContextRefs: [
        "memory.latestRefinementInstruction",
        "memory.activeDraftRef",
        "memory.topicSummary",
        "memory.rollingSummary",
      ],
      context: {
        memory: args.memory,
        activeDraft: effectiveActiveDraft,
        revision,
        revisionActiveConstraints,
        effectiveContext: args.effectiveContext,
        relevantTopicAnchors: args.relevantTopicAnchors,
        styleCard: args.styleCard,
        maxCharacterLimit: args.maxCharacterLimit,
        goal: args.goal,
        antiPatterns: args.antiPatterns,
        turnDraftPreference: args.turnDraftPreference,
        turnFormatPreference: args.turnFormatPreference,
        threadPostMaxCharacterLimit: args.threadPostMaxCharacterLimit,
        turnThreadFramingStyle: args.turnThreadFramingStyle,
        userMessage: args.userMessage,
        groundingPacket: args.groundingPacket,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        nextAssistantTurnCount: args.nextAssistantTurnCount,
        refreshRollingSummary: args.refreshRollingSummary,
        latestRefinementInstruction: args.draftInstruction,
        groundingSources: args.groundingSources,
        groundingMode: args.groundingMode,
        groundingExplanation: args.groundingExplanation,
      },
      services: {
        generateRevisionDraft: args.services.generateRevisionDraft,
        critiqueDrafts: args.services.critiqueDrafts,
        buildClarificationResponse: () =>
          args.returnClarificationQuestion({
            question: args.buildGroundedProductClarificationQuestion(
              effectiveActiveDraft || args.memory.topicSummary || args.userMessage,
            ),
          }),
      },
    });

    args.applyExecutionMeta({
      workers: execution.workers,
      validations: execution.validations,
    });

    if (execution.output.kind === "response") {
      return execution.output.response;
    }

    await args.writeMemory(execution.output.memoryPatch);

    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  const historicalTexts = await args.loadHistoricalTexts();
  const execution = await executeReplanningCapability({
    workflow: "plan_then_draft",
    capability: "planning",
    activeContextRefs: [
      "memory.pendingPlan",
      "memory.latestRefinementInstruction",
      "memory.topicSummary",
      "memory.rollingSummary",
    ],
    context: {
      memory: args.memory,
      userMessage: args.userMessage,
      draftInstruction: args.draftInstruction,
      revisionActiveConstraints,
      effectiveContext: args.effectiveContext,
      activeDraft: args.activeDraft,
      historicalTexts,
      goal: args.goal,
      antiPatterns: args.antiPatterns,
      turnDraftPreference: args.turnDraftPreference,
      turnFormatPreference: args.turnFormatPreference,
      baseVoiceTarget: args.baseVoiceTarget,
      creatorProfileHints: args.creatorProfileHints,
      selectedSourceMaterials: args.selectedSourceMaterials,
      shouldForceNoFabricationGuardrailForTurn:
        args.shouldForceNoFabricationGuardrailForTurn,
      styleCard: args.styleCard,
      nextAssistantTurnCount: args.nextAssistantTurnCount,
      refreshRollingSummary: args.refreshRollingSummary,
      feedbackMemoryNotice: args.feedbackMemoryNotice,
      turnThreadFramingStyle: args.turnThreadFramingStyle,
      groundingPacket: args.groundingPacket,
      groundingSources: args.groundingSources,
      groundingMode: args.groundingMode,
      groundingExplanation: args.groundingExplanation,
    },
    services: {
      generatePlan: args.services.generatePlan,
      checkDeterministicNovelty: args.services.checkDeterministicNovelty,
      buildGroundingPacketForContext: args.buildGroundingPacketForContext,
      runDraft: ({ plan, activeConstraints, groundingPacket }) =>
        args.runGroundedDraft({
          plan,
          activeConstraints,
          activeDraft: args.activeDraft,
          sourceUserMessage: args.draftInstruction,
          draftPreference: plan.deliveryPreference || args.turnDraftPreference,
          formatPreference: plan.formatPreference || args.turnFormatPreference,
          threadFramingStyle: args.turnThreadFramingStyle,
          fallbackToWriterWhenCriticRejected: false,
          topicSummary: plan.objective,
          groundingPacket,
        }),
      handleNoveltyConflict: (planObjective) =>
        args.returnClarificationTree({
          branchKey: "plan_reject",
          seedTopic: planObjective,
          pendingPlan: null,
          replyOverride:
            "that version felt too close to something you've already posted. let's shift it.",
        }),
      buildNoveltyNotes: args.buildNoveltyNotes,
    },
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
