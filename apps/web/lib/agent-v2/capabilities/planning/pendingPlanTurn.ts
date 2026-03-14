import {
  buildPlanPitch,
  withPlanPreferences,
  type ConversationServices,
  type OrchestratorResponse,
} from "../../orchestrator/draftPipelineHelpers.ts";
import { prependFeedbackMemoryNotice } from "../../orchestrator/feedbackMemoryNotice.ts";
import { interpretPlannerFeedback } from "../../orchestrator/plannerFeedback.ts";
import { buildPlannerQuickReplies } from "../../orchestrator/plannerQuickReplies.ts";
import {
  applyCreatorProfileHintsToPlan,
} from "../../orchestrator/creatorHintPolicy.ts";
import { applySourceMaterialBiasToPlan } from "../../orchestrator/sourceMaterialPlanPolicy.ts";
import {
  appendNoFabricationConstraint,
  hasNoFabricationPlanGuardrail,
  withNoFabricationPlanGuardrail,
} from "../../orchestrator/draftGrounding.ts";
import {
  hasAutobiographicalGrounding,
  type CreatorProfileHints,
  type GroundingPacket,
} from "../../orchestrator/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../orchestrator/sourceMaterials.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

export type PendingPlanTurnResult =
  | {
      kind: "approve";
      approvedPlan: StrategyPlan;
      draftActiveConstraints: string[];
      approvedPlanGroundingPacket: GroundingPacket;
      approvedDraftPreference: DraftPreference;
    }
  | {
      kind: "response";
      response: RawOrchestratorResponse;
    };

export async function handlePendingPlanTurn(
  args: {
    userMessage: string;
    memory: V2ConversationMemory;
    effectiveActiveConstraints: string[];
    safeFrameworkConstraint?: string | null;
    activeDraft?: string;
    effectiveContext: string;
    goal: string;
    antiPatterns: string[];
    turnDraftPreference: DraftPreference;
    turnFormatPreference: DraftFormatPreference;
    baseVoiceTarget: VoiceTarget;
    groundingPacket: GroundingPacket;
    creatorProfileHints?: CreatorProfileHints | null;
    selectedSourceMaterials: SourceMaterialAssetRecord[];
    styleCard: VoiceStyleCard | null;
    feedbackMemoryNotice?: string | null;
    nextAssistantTurnCount: number;
    writeMemory: (patch: MemoryPatch) => Promise<void>;
    clearClarificationPatch: () => MemoryPatch;
    buildGroundingPacketForContext: (
      activeConstraints: string[],
      sourceText: string,
    ) => GroundingPacket;
    buildPlanSourceMessage: (plan: StrategyPlan) => string;
    returnClarificationTree: (args: {
      branchKey: "plan_reject";
      seedTopic: string | null;
      pendingPlan?: StrategyPlan | null;
      replyOverride?: string;
    }) => Promise<RawOrchestratorResponse>;
    services: Pick<ConversationServices, "generatePlan">;
  },
): Promise<PendingPlanTurnResult> {
  const pendingPlan = args.memory.pendingPlan;
  if (!pendingPlan) {
    throw new Error("handlePendingPlanTurn requires a pending plan");
  }

  const pendingPlanHasNoFabrication = hasNoFabricationPlanGuardrail(pendingPlan);
  const baseDraftActiveConstraints = Array.from(
    new Set([
      ...args.effectiveActiveConstraints,
      ...(args.safeFrameworkConstraint ? [args.safeFrameworkConstraint] : []),
    ]),
  );
  const draftActiveConstraints = pendingPlanHasNoFabrication
    ? appendNoFabricationConstraint(baseDraftActiveConstraints)
    : baseDraftActiveConstraints;

  const decision = await interpretPlannerFeedback(args.userMessage, pendingPlan);

  if (decision === "approve") {
    return {
      kind: "approve",
      approvedPlan: pendingPlan,
      draftActiveConstraints,
      approvedPlanGroundingPacket: args.buildGroundingPacketForContext(
        draftActiveConstraints,
        args.buildPlanSourceMessage(pendingPlan),
      ),
      approvedDraftPreference: pendingPlan.deliveryPreference || args.turnDraftPreference,
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
      args.effectiveActiveConstraints,
      args.effectiveContext,
      args.activeDraft,
      {
        goal: args.goal,
        conversationState: args.memory.conversationState,
        antiPatterns: args.antiPatterns,
        draftPreference: args.turnDraftPreference,
        formatPreference: pendingPlan.formatPreference || args.turnFormatPreference,
        activePlan: pendingPlan,
        latestRefinementInstruction: args.memory.latestRefinementInstruction,
        lastIdeationAngles: args.memory.lastIdeationAngles,
        voiceTarget: args.baseVoiceTarget,
        groundingPacket: args.groundingPacket,
        creatorProfileHints: args.creatorProfileHints,
      },
    );

    if (!revisedPlan) {
      return {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to revise the plan.",
          memory: args.memory,
        },
      };
    }

    const revisedPlanWithPreference = applySourceMaterialBiasToPlan(
      applyCreatorProfileHintsToPlan(
        withPlanPreferences(
          revisedPlan,
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

    await args.writeMemory({
      topicSummary: guardedRevisedPlan.objective,
      conversationState: "plan_pending_approval",
      pendingPlan: guardedRevisedPlan,
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      formatPreference: guardedRevisedPlan.formatPreference || args.turnFormatPreference,
      latestRefinementInstruction: null,
      ...args.clearClarificationPatch(),
    });

    return {
      kind: "response",
      response: {
        mode: "plan",
        outputShape: "planning_outline",
        response: prependFeedbackMemoryNotice(
          buildPlanPitch(guardedRevisedPlan),
          args.feedbackMemoryNotice ?? null,
        ),
        data: {
          plan: guardedRevisedPlan,
          quickReplies: buildPlannerQuickReplies({
            plan: guardedRevisedPlan,
            styleCard: args.styleCard,
            context: "approval",
          }),
        },
        memory: args.memory,
      },
    };
  }

  if (decision === "reject") {
    return {
      kind: "response",
      response: await args.returnClarificationTree({
        branchKey: "plan_reject",
        seedTopic: pendingPlan.objective,
        pendingPlan: null,
      }),
    };
  }

  await args.writeMemory({
    conversationState: "plan_pending_approval",
    pendingPlan,
    assistantTurnCount: args.nextAssistantTurnCount,
    formatPreference: pendingPlan.formatPreference || args.turnFormatPreference,
    ...args.clearClarificationPatch(),
  });

  return {
    kind: "response",
    response: {
      mode: "plan",
      outputShape: "planning_outline",
      response: prependFeedbackMemoryNotice(
        "say the word and i'll draft it, or tell me what to tweak.",
        args.feedbackMemoryNotice ?? null,
      ),
      data: {
        plan: pendingPlan,
        quickReplies: buildPlannerQuickReplies({
          plan: pendingPlan,
          styleCard: args.styleCard,
          context: "approval",
        }),
      },
      memory: args.memory,
    },
  };
}
