import {
  buildPlanPitch,
} from "../../core/planPitch.ts";
import { withPlanPreferences } from "../../grounding/preferences.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type { OrchestratorResponse } from "../../runtime/types.ts";
import { buildPlanFailureResponse } from "../../orchestrator/conversationManagerLogic.ts";
import { withNoFabricationPlanGuardrail } from "../../grounding/draftGrounding.ts";
import {
  buildPlannerQuickReplies,
} from "../../orchestrator/plannerQuickReplies.ts";
import { prependFeedbackMemoryNotice } from "../../orchestrator/feedbackMemoryNotice.ts";
import {
  applyCreatorProfileHintsToPlan,
} from "../../grounding/creatorHintPolicy.ts";
import { applySourceMaterialBiasToPlan } from "../../grounding/sourceMaterialPlanPolicy.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../../grounding/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import { hasAutobiographicalGrounding } from "../../grounding/groundingPacket.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface PlanningCapabilityContext {
  planInputMessage: string;
  planActiveConstraints: string[];
  planGroundingPacket: GroundingPacket;
  memory: V2ConversationMemory;
  effectiveContext: string;
  activeDraft?: string;
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
  feedbackMemoryNotice?: string | null;
}

export interface PlanningCapabilityMemoryPatch {
  topicSummary: string;
  activeConstraints: string[];
  conversationState: "plan_pending_approval";
  pendingPlan: StrategyPlan;
  clarificationState: null;
  assistantTurnCount: number;
  formatPreference: DraftFormatPreference;
  unresolvedQuestion: null;
}

export interface PlanningCapabilityReadyOutput {
  kind: "plan_ready";
  responseSeed: RawResponseSeed;
  memoryPatch: PlanningCapabilityMemoryPatch;
  plan: StrategyPlan;
  planActiveConstraints: string[];
  planGroundingPacket: GroundingPacket;
}

export interface PlanningCapabilityFailureOutput {
  kind: "plan_failure";
  failureReason: string | null;
  responseSeed: RawResponseSeed;
}

export type PlanningCapabilityOutput =
  | PlanningCapabilityReadyOutput
  | PlanningCapabilityFailureOutput;

export async function executePlanningCapability(
  args: CapabilityExecutionRequest<PlanningCapabilityContext> & {
    services: Pick<ConversationServices, "generatePlan">;
  },
): Promise<CapabilityExecutionResult<PlanningCapabilityOutput>> {
  const { context, services } = args;
  let planFailureReason: string | null = null;
  const plan = await services.generatePlan(
    context.planInputMessage,
    context.memory.topicSummary,
    context.planActiveConstraints,
    context.effectiveContext,
    context.activeDraft,
    {
      goal: context.goal,
      conversationState: context.memory.conversationState,
      antiPatterns: context.antiPatterns,
      draftPreference: context.turnDraftPreference,
      formatPreference: context.turnFormatPreference,
      activePlan: context.memory.pendingPlan,
      latestRefinementInstruction: context.memory.latestRefinementInstruction,
      lastIdeationAngles: context.memory.lastIdeationAngles,
      voiceTarget: context.baseVoiceTarget,
      groundingPacket: context.planGroundingPacket,
      creatorProfileHints: context.creatorProfileHints,
      onFailureReason: (reason: string) => {
        planFailureReason = reason;
      },
    },
  );

  if (!plan) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "plan_failure",
        failureReason: planFailureReason,
        responseSeed: {
          mode: "error",
          outputShape: "coach_question",
          response: buildPlanFailureResponse(planFailureReason),
        },
      },
      workers: [
        {
          worker: "planner",
          capability: "planning",
          phase: "execution",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: planFailureReason || "the planner request failed",
          },
        },
      ],
    };
  }

  const planWithPreference = applySourceMaterialBiasToPlan(
    applyCreatorProfileHintsToPlan(
      withPlanPreferences(
        plan,
        context.turnDraftPreference,
        context.turnFormatPreference,
      ),
      context.creatorProfileHints,
    ),
    context.selectedSourceMaterials,
    {
      hasAutobiographicalGrounding: hasAutobiographicalGrounding(
        context.planGroundingPacket,
      ),
    },
  );
  const guardedPlan = context.shouldForceNoFabricationGuardrailForTurn
    ? withNoFabricationPlanGuardrail(planWithPreference)
    : planWithPreference;

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      kind: "plan_ready",
      plan: guardedPlan,
      planActiveConstraints: context.planActiveConstraints,
      planGroundingPacket: context.planGroundingPacket,
      responseSeed: {
        mode: "plan",
        outputShape: "planning_outline",
        response: prependFeedbackMemoryNotice(
          buildPlanPitch(guardedPlan),
          context.feedbackMemoryNotice ?? null,
        ),
        data: {
          plan: guardedPlan,
          quickReplies: buildPlannerQuickReplies({
            plan: guardedPlan,
            styleCard: context.styleCard,
            context: "approval",
          }),
        },
      },
      memoryPatch: {
        topicSummary: guardedPlan.objective,
        activeConstraints: context.planActiveConstraints,
        conversationState: "plan_pending_approval",
        pendingPlan: guardedPlan,
        clarificationState: null,
        assistantTurnCount: context.nextAssistantTurnCount,
        formatPreference: guardedPlan.formatPreference || context.turnFormatPreference,
        unresolvedQuestion: null,
      },
    },
    workers: [
      {
        worker: "planner",
        capability: "planning",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          objective: guardedPlan.objective,
          formatPreference: guardedPlan.formatPreference || context.turnFormatPreference,
          usedNoFabricationGuardrail: context.shouldForceNoFabricationGuardrailForTurn,
        },
      },
    ],
  };
}
