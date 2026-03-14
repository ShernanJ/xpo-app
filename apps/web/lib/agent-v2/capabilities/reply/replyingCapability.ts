import {
  buildRollingSummary,
} from "../../memory/summaryManager.ts";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type { OrchestratorResponse } from "../../runtime/types.ts";
import type {
  DraftFormatPreference,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import { prependFeedbackMemoryNotice } from "../../orchestrator/feedbackMemoryNotice.ts";
import { runConversationValidationWorkers } from "../../workers/validation/conversationValidationWorkers.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface ReplyingCapabilityContext {
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

export interface ReplyingCapabilityMemoryPatch {
  conversationState: "plan_pending_approval" | "needs_more_context";
  concreteAnswerCount: number;
  rollingSummary: string | null;
  assistantTurnCount: number;
  unresolvedQuestion: string | null;
  clarificationQuestionsAsked: number;
}

export interface ReplyingCapabilityOutput {
  responseSeed: RawResponseSeed;
  memoryPatch: ReplyingCapabilityMemoryPatch;
}

export async function executeReplyingCapability(
  args: CapabilityExecutionRequest<ReplyingCapabilityContext> & {
    services: Pick<ConversationServices, "generateReplyGuidance">;
  },
): Promise<CapabilityExecutionResult<ReplyingCapabilityOutput>> {
  const { context, services } = args;
  const buildFallbackResponse = () =>
    "that reply guidance came back malformed twice. want me to retry from the post angle or the actual wording?";

  const runReplyAttempt = async (attempt: {
    retryConstraints?: string[];
    validationGroupId: string;
  }) => {
    const replyGuidance = await services.generateReplyGuidance(
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
        retryConstraints: attempt.retryConstraints,
      },
    );

    const fallbackResponse =
      replyGuidance?.response ||
      "paste the post or tell me the angle you want to take, and i'll help you find the strongest reply lane.";
    const validation = runConversationValidationWorkers({
      capability: "replying",
      groupId: attempt.validationGroupId,
      response: fallbackResponse,
      sourceUserMessage: context.userMessage,
    });

    return {
      replyGuidance,
      validation,
      finalResponse: validation.correctedResponse,
    };
  };

  const accumulatedWorkers: RuntimeWorkerExecution[] = [];
  const accumulatedValidations: RuntimeValidationResult[] = [];

  const firstAttempt = await runReplyAttempt({
    validationGroupId: "reply_delivery_validation_initial",
  });

  accumulatedWorkers.push(
    {
      worker: "reply_guidance",
      capability: args.capability,
      phase: "execution",
      mode: "sequential",
      status: "completed",
      groupId: null,
      details: {
        hadReply: Boolean(firstAttempt.replyGuidance?.response),
        hadFollowUp: Boolean(firstAttempt.replyGuidance?.probingQuestion),
      },
    },
    ...firstAttempt.validation.workerExecutions,
  );
  accumulatedValidations.push(...firstAttempt.validation.validations);

  const finalAttempt = firstAttempt.validation.hasFailures &&
      firstAttempt.validation.retryConstraints.length > 0
    ? await runReplyAttempt({
        retryConstraints: firstAttempt.validation.retryConstraints,
        validationGroupId: "reply_delivery_validation_retry",
      })
    : firstAttempt;

  if (finalAttempt !== firstAttempt) {
    accumulatedWorkers.push(
      {
        worker: "reply_guidance",
        capability: args.capability,
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          hadReply: Boolean(finalAttempt.replyGuidance?.response),
          hadFollowUp: Boolean(finalAttempt.replyGuidance?.probingQuestion),
          retry: true,
        },
      },
      ...finalAttempt.validation.workerExecutions,
    );
    accumulatedValidations.push(...finalAttempt.validation.validations);
  }

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
        unresolvedQuestion: finalAttempt.replyGuidance?.probingQuestion || null,
      })
    : context.memory.rollingSummary;

  const chosenAttempt = finalAttempt.validation.hasFailures ? null : finalAttempt;
  const finalResponse = chosenAttempt
    ? chosenAttempt.finalResponse
    : buildFallbackResponse();
  const finalProbingQuestion = chosenAttempt?.replyGuidance?.probingQuestion || null;

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
        unresolvedQuestion: finalProbingQuestion,
        clarificationQuestionsAsked: finalProbingQuestion
          ? context.memory.clarificationQuestionsAsked + 1
          : context.memory.clarificationQuestionsAsked,
      },
    },
    workers: accumulatedWorkers,
    validations: accumulatedValidations,
  };
}
