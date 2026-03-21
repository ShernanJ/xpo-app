import {
  buildPlanPitch,
} from "../../core/planPitch.ts";
import { appendCoachNote } from "../../responses/coachNote.ts";
import { withPlanPreferences } from "../../grounding/preferences.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../runtime/types.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import { interpretPlannerFeedback } from "./plannerFeedback.ts";
import { buildPlannerQuickReplies } from "../../responses/plannerQuickReplies.ts";
import {
  applyCreatorProfileHintsToPlan,
} from "../../grounding/creatorHintPolicy.ts";
import { applySourceMaterialBiasToPlan } from "../../grounding/sourceMaterialPlanPolicy.ts";
import {
  appendNoFabricationConstraint,
  hasNoFabricationPlanGuardrail,
  withNoFabricationPlanGuardrail,
} from "../../grounding/draftGrounding.ts";
import {
  hasAutobiographicalGrounding,
  type CreatorProfileHints,
  type GroundingPacket,
} from "../../grounding/groundingPacket.ts";
import type { DraftRequestPolicy } from "../../grounding/requestPolicy.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  SessionConstraint,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import {
  executeDraftingCapability,
  type DraftingCapabilityRunResult,
} from "../drafting/draftingCapability.ts";
import {
  buildSessionConstraints,
  sessionConstraintsToLegacyStrings,
} from "../../core/sessionConstraints.ts";
import {
  buildWebSearchQueryKey,
  normalizeWebSearchQueries,
} from "../../core/webSearch.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

export async function handlePendingPlanTurn(
  args: {
    userMessage: string;
    memory: V2ConversationMemory;
    getMemory: () => V2ConversationMemory;
    effectiveActiveConstraints: string[];
    sessionConstraints: SessionConstraint[];
    safeFrameworkConstraint?: string | null;
    activeDraft?: string;
    effectiveContext: string;
    goal: string;
    antiPatterns: string[];
    turnDraftPreference: DraftPreference;
    turnFormatPreference: DraftFormatPreference;
    baseVoiceTarget: VoiceTarget;
    groundingPacket: GroundingPacket;
    requestPolicy: DraftRequestPolicy;
    creatorProfileHints?: CreatorProfileHints | null;
    selectedSourceMaterials: SourceMaterialAssetRecord[];
    styleCard: VoiceStyleCard | null;
    feedbackMemoryNotice?: string | null;
    nextAssistantTurnCount: number;
    groundingSources: GroundingPacket["sourceMaterials"];
    groundingMode: DraftGroundingMode | null;
    groundingExplanation: string | null;
    turnThreadFramingStyle: ThreadFramingStyle | null;
    writeMemory: (patch: MemoryPatch) => Promise<void>;
    clearClarificationPatch: () => MemoryPatch;
    buildGroundingPacketForContext: (
      activeConstraints: string[],
      sourceText: string,
    ) => GroundingPacket;
    buildPlanSourceMessage: (plan: StrategyPlan) => string;
    loadHistoricalTexts: () => Promise<string[]>;
    applyExecutionMeta: (args: {
      workers?: RuntimeWorkerExecution[];
      validations?: RuntimeValidationResult[];
    }) => void;
    applyRoutingTracePatch: (patch?: RoutingTracePatch) => void;
    runGroundedDraft: (args: {
      plan: StrategyPlan;
      activeConstraints: string[];
      sessionConstraints?: SessionConstraint[];
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
    returnClarificationTree: (args: {
      branchKey: "plan_reject";
      seedTopic: string | null;
      pendingPlan?: StrategyPlan | null;
      replyOverride?: string;
    }) => Promise<RawOrchestratorResponse>;
    services: Pick<ConversationServices, "generatePlan">;
  },
): Promise<RawOrchestratorResponse> {
  const pendingPlan = args.memory.pendingPlan;
  if (!pendingPlan) {
    throw new Error("handlePendingPlanTurn requires a pending plan");
  }

  const pendingPlanHasNoFabrication = hasNoFabricationPlanGuardrail(pendingPlan);
  const pendingPlanSessionConstraints = buildSessionConstraints({
    activeConstraints: args.effectiveActiveConstraints,
    inferredConstraints: pendingPlan.extractedConstraints,
  });
  const baseDraftActiveConstraints = Array.from(
    new Set([
      ...sessionConstraintsToLegacyStrings(pendingPlanSessionConstraints),
      ...(args.safeFrameworkConstraint ? [args.safeFrameworkConstraint] : []),
    ]),
  );
  const draftActiveConstraints = pendingPlanHasNoFabrication
    ? appendNoFabricationConstraint(
        baseDraftActiveConstraints,
        pendingPlan.formatIntent,
      )
    : baseDraftActiveConstraints;

  const decision = await interpretPlannerFeedback(args.userMessage, pendingPlan);

  if (decision === "approve") {
    const approvedPlanGroundingPacket = args.buildGroundingPacketForContext(
      draftActiveConstraints,
      args.buildPlanSourceMessage(pendingPlan),
    );
    const approvedDraftPreference =
      pendingPlan.deliveryPreference || args.turnDraftPreference;
    const historicalTexts = await args.loadHistoricalTexts();
    let draftRoutingTracePatch: RoutingTracePatch | undefined;
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
        plan: pendingPlan,
        activeConstraints: draftActiveConstraints,
        sessionConstraints: pendingPlanSessionConstraints,
        historicalTexts,
        userMessage: args.userMessage,
        draftPreference: approvedDraftPreference,
        turnFormatPreference: args.turnFormatPreference,
        styleCard: args.styleCard,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        nextAssistantTurnCount: args.nextAssistantTurnCount,
        latestDraftStatus: "Draft delivered",
        refreshRollingSummary: true,
        groundingSources: args.groundingSources,
        groundingMode: args.groundingMode,
        groundingExplanation: args.groundingExplanation,
        creatorProfileHints: args.creatorProfileHints,
        requestPolicy: args.requestPolicy,
      },
      services: {
        checkDeterministicNovelty: args.checkDeterministicNovelty,
        runDraft: async () => {
          const result = await args.runGroundedDraft({
            plan: pendingPlan,
            activeConstraints: draftActiveConstraints,
            sessionConstraints: pendingPlanSessionConstraints,
            activeDraft: args.activeDraft,
            sourceUserMessage: args.buildPlanSourceMessage(pendingPlan),
            draftPreference: approvedDraftPreference,
            formatPreference:
              pendingPlan.formatPreference || args.turnFormatPreference,
            threadFramingStyle: args.turnThreadFramingStyle,
            fallbackToWriterWhenCriticRejected: false,
            topicSummary: pendingPlan.objective,
            pendingPlan,
            groundingPacket: approvedPlanGroundingPacket,
          });
          if (result.kind === "success") {
            draftRoutingTracePatch = result.routingTracePatch;
          }
          return result;
        },
        handleNoveltyConflict: () =>
          args.returnClarificationTree({
            branchKey: "plan_reject",
            seedTopic: pendingPlan.objective,
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

    if (execution.output.kind === "response") {
      args.applyRoutingTracePatch(execution.output.routingTracePatch);
      return execution.output.response;
    }

    args.applyRoutingTracePatch(draftRoutingTracePatch);

    await args.writeMemory(execution.output.memoryPatch);

    return {
      ...execution.output.responseSeed,
      memory: args.getMemory(),
    };
  }

  if (decision === "revise") {
    const revisionPrompt = [
      `Current plan objective: ${pendingPlan.objective}`,
      `Current plan angle: ${pendingPlan.angle}`,
      `Requested revision: ${args.userMessage}`,
    ].join("\n");

    const revisedPlan = await args.services.generatePlan(
      revisionPrompt,
      args.memory.topicSummary,
      sessionConstraintsToLegacyStrings(pendingPlanSessionConstraints),
      args.effectiveContext,
      args.activeDraft,
      {
        goal: args.goal,
        conversationState: args.memory.conversationState,
        antiPatterns: args.antiPatterns,
        draftPreference: args.turnDraftPreference,
        formatPreference: pendingPlan.formatPreference || args.turnFormatPreference,
        formatIntent: args.requestPolicy.formatIntent,
        activePlan: pendingPlan,
        latestRefinementInstruction: args.memory.latestRefinementInstruction,
        lastIdeationAngles: args.memory.lastIdeationAngles,
        voiceTarget: args.baseVoiceTarget,
        groundingPacket: args.groundingPacket,
        creatorProfileHints: args.creatorProfileHints,
        activeTaskSummary: args.memory.rollingSummary,
        sessionConstraints: pendingPlanSessionConstraints,
      },
    );

    if (!revisedPlan) {
      return {
        mode: "error",
        outputShape: "coach_question",
        response: "Failed to revise the plan.",
        memory: args.getMemory(),
      };
    }

    const revisedPlanWithPreference = applySourceMaterialBiasToPlan(
      applyCreatorProfileHintsToPlan(
        withPlanPreferences(
          {
            ...revisedPlan,
            formatIntent: args.requestPolicy.formatIntent,
          },
          args.turnDraftPreference,
          pendingPlan.formatPreference || args.turnFormatPreference,
        ),
        args.creatorProfileHints,
      ),
      args.selectedSourceMaterials,
      {
        hasAutobiographicalGrounding: hasAutobiographicalGrounding(args.groundingPacket),
      },
    );
    const guardedRevisedPlan = pendingPlanHasNoFabrication
      ? withNoFabricationPlanGuardrail(revisedPlanWithPreference)
      : revisedPlanWithPreference;
    const normalizedSearchQueries = normalizeWebSearchQueries(
      guardedRevisedPlan.searchQueries || [],
    );
    const liveContextCache =
      guardedRevisedPlan.requiresLiveContext && normalizedSearchQueries.length > 0
        ? args.memory.liveContextCache?.queryKey ===
          buildWebSearchQueryKey(normalizedSearchQueries)
          ? args.memory.liveContextCache
          : null
        : null;

    await args.writeMemory({
      topicSummary: guardedRevisedPlan.objective,
      conversationState: "plan_pending_approval",
      pendingPlan: guardedRevisedPlan,
      inferredSessionConstraints: guardedRevisedPlan.extractedConstraints,
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      formatPreference: guardedRevisedPlan.formatPreference || args.turnFormatPreference,
      latestRefinementInstruction: null,
      liveContextCache,
      ...args.clearClarificationPatch(),
    });

    return {
      mode: "plan",
      outputShape: "planning_outline",
      response: appendCoachNote({
        response: prependFeedbackMemoryNotice(
          buildPlanPitch(guardedRevisedPlan),
          args.feedbackMemoryNotice ?? null,
        ),
        userMessage: args.userMessage,
        plan: guardedRevisedPlan,
        creatorProfileHints: args.creatorProfileHints,
        requestPolicy: args.requestPolicy,
      }),
      data: {
        plan: guardedRevisedPlan,
        quickReplies: buildPlannerQuickReplies({
          plan: guardedRevisedPlan,
          styleCard: args.styleCard,
          context: "approval",
        }),
      },
      memory: args.getMemory(),
    };
  }

  if (decision === "reject") {
    return args.returnClarificationTree({
      branchKey: "plan_reject",
      seedTopic: pendingPlan.objective,
      pendingPlan: null,
    });
  }

  await args.writeMemory({
    conversationState: "plan_pending_approval",
    pendingPlan,
    assistantTurnCount: args.nextAssistantTurnCount,
    formatPreference: pendingPlan.formatPreference || args.turnFormatPreference,
    ...args.clearClarificationPatch(),
  });

  return {
    mode: "plan",
    outputShape: "planning_outline",
    response: appendCoachNote({
      response: prependFeedbackMemoryNotice(
        "say the word and i'll draft it, or tell me what to tweak.",
        args.feedbackMemoryNotice ?? null,
      ),
      userMessage: args.userMessage,
      plan: pendingPlan,
      creatorProfileHints: args.creatorProfileHints,
      requestPolicy: args.requestPolicy,
    }),
    data: {
      plan: pendingPlan,
      quickReplies: buildPlannerQuickReplies({
        plan: pendingPlan,
        styleCard: args.styleCard,
        context: "approval",
      }),
    },
    memory: args.getMemory(),
  };
}
