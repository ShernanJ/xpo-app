import {
  buildRollingSummary,
} from "../memory/summaryManager.ts";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../runtime/runtimeContracts.ts";
import type {
  ConversationServices,
  OrchestratorResponse,
} from "./draftPipelineHelpers.ts";
import type {
  DraftFormatPreference,
  V2ConversationMemory,
} from "../contracts/chat.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import { prependFeedbackMemoryNotice } from "./feedbackMemoryNotice.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface AnalysisCapabilityContext {
  userMessage: string;
  effectiveContext: string;
  topicSummary: string | null;
  styleCard: VoiceStyleCard | null;
  relevantTopicAnchors: string[];
  userContextString: string;
  goal: string;
  memory: V2ConversationMemory;
  antiPatterns: string[];
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  turnFormatPreference: DraftFormatPreference;
  refreshRollingSummary: boolean;
}

export interface AnalysisCapabilityMemoryPatch {
  conversationState: "plan_pending_approval" | "needs_more_context";
  concreteAnswerCount: number;
  rollingSummary: string | null;
  assistantTurnCount: number;
  unresolvedQuestion: string | null;
  clarificationQuestionsAsked: number;
}

export interface AnalysisCapabilityOutput {
  responseSeed: RawResponseSeed;
  memoryPatch: AnalysisCapabilityMemoryPatch;
}

export async function executeAnalysisCapability(
  args: CapabilityExecutionRequest<AnalysisCapabilityContext> & {
    services: Pick<ConversationServices, "generateCoachReply">;
  },
): Promise<CapabilityExecutionResult<AnalysisCapabilityOutput>> {
  const { context, services } = args;
  const coachReply = await services.generateCoachReply(
    context.userMessage,
    context.effectiveContext,
    context.topicSummary,
    context.styleCard,
    context.relevantTopicAnchors,
    context.userContextString,
    {
      goal: context.goal,
      conversationState: context.memory.conversationState,
      antiPatterns: context.antiPatterns,
    },
  );

  const nextConcreteAnswerCount =
    context.userMessage.length > 15
      ? context.memory.concreteAnswerCount + 1
      : context.memory.concreteAnswerCount;

  const rollingSummary = context.refreshRollingSummary
    ? buildRollingSummary({
        currentSummary: context.memory.rollingSummary,
        topicSummary: context.memory.topicSummary,
        approvedPlan: context.memory.pendingPlan,
        activeConstraints: context.memory.activeConstraints,
        latestDraftStatus: "Context gathering",
        formatPreference: context.memory.formatPreference || context.turnFormatPreference,
        unresolvedQuestion: coachReply?.probingQuestion || null,
      })
    : context.memory.rollingSummary;

  const finalResponse =
    coachReply?.response ||
    "i can help with ideas, drafts, revisions, or figuring out what to post.";

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      responseSeed: {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          finalResponse,
          context.feedbackMemoryNotice ?? null,
        ),
      },
      memoryPatch: {
        conversationState:
          context.memory.pendingPlan &&
          context.memory.conversationState === "plan_pending_approval"
            ? "plan_pending_approval"
            : "needs_more_context",
        concreteAnswerCount: nextConcreteAnswerCount,
        rollingSummary,
        assistantTurnCount: context.nextAssistantTurnCount,
        unresolvedQuestion: coachReply?.probingQuestion || null,
        clarificationQuestionsAsked: coachReply?.probingQuestion
          ? context.memory.clarificationQuestionsAsked + 1
          : context.memory.clarificationQuestionsAsked,
      },
    },
    workers: [
      {
        worker: "analysis_coach",
        capability: args.capability,
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          hadReply: Boolean(coachReply?.response),
          hadFollowUp: Boolean(coachReply?.probingQuestion),
        },
      },
    ],
  };
}
