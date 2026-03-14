import {
  buildSemanticCorrectionAcknowledgment,
  buildSemanticRepairDirective,
  hasConcreteCorrectionDetail,
  inferCorrectionRepairQuestion,
  inferIdeationRationaleReply,
  inferPostReferenceReply,
  inferSourceTransparencyReply,
  looksLikeConfusionPing,
} from "../../orchestrator/correctionRepair.ts";
import { prependFeedbackMemoryNotice } from "../../orchestrator/feedbackMemoryNotice.ts";
import type {
  OrchestratorResponse,
} from "../../orchestrator/draftPipelineHelpers.ts";
import type {
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

interface ClarificationQuestionArgs {
  question: string;
  pendingPlan?: StrategyPlan | null;
}

type NonDraftTurnOutcome =
  | { kind: "continue" }
  | { kind: "response"; response: RawOrchestratorResponse };

function buildCoachResponse(args: {
  message: string;
  feedbackMemoryNotice?: string | null;
  memory: V2ConversationMemory;
}): RawOrchestratorResponse {
  return {
    mode: "coach",
    outputShape: "coach_question",
    response: prependFeedbackMemoryNotice(
      args.message,
      args.feedbackMemoryNotice ?? null,
    ),
    memory: args.memory,
  };
}

export async function handleNonDraftCorrectionTurn(
  args: {
    userMessage: string;
    memory: V2ConversationMemory;
    hadPendingPlan: boolean;
    feedbackMemoryNotice?: string | null;
    nextAssistantTurnCount: number;
    writeMemory: (patch: MemoryPatch) => Promise<void>;
    clearClarificationPatch: () => MemoryPatch;
    returnClarificationQuestion: (
      args: ClarificationQuestionArgs,
    ) => Promise<RawOrchestratorResponse>;
  },
): Promise<NonDraftTurnOutcome> {
  const correctionReply = buildSemanticCorrectionAcknowledgment({
    userMessage: args.userMessage,
    activeConstraints: args.memory.activeConstraints,
    hadPendingPlan: args.hadPendingPlan,
  });

  if (correctionReply) {
    const nextConstraints = hasConcreteCorrectionDetail(args.userMessage)
      ? Array.from(
          new Set([
            ...args.memory.activeConstraints,
            buildSemanticRepairDirective(
              args.userMessage,
              args.memory.topicSummary,
            ).constraint,
          ]),
        )
      : args.memory.activeConstraints;

    await args.writeMemory({
      activeConstraints: nextConstraints,
      conversationState:
        args.memory.conversationState === "ready_to_ideate"
          ? "ready_to_ideate"
          : "needs_more_context",
      pendingPlan: args.hadPendingPlan ? null : args.memory.pendingPlan,
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      latestRefinementInstruction: null,
      ...args.clearClarificationPatch(),
    });

    return {
      kind: "response",
      response: buildCoachResponse({
        message: correctionReply,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        memory: args.memory,
      }),
    };
  }

  const correctionRepairQuestion = inferCorrectionRepairQuestion(
    args.userMessage,
    args.memory.topicSummary,
  );

  if (!correctionRepairQuestion) {
    return { kind: "continue" };
  }

  return {
    kind: "response",
    response: await args.returnClarificationQuestion({
      question: correctionRepairQuestion,
      pendingPlan: args.hadPendingPlan ? null : args.memory.pendingPlan,
    }),
  };
}

export async function handleNonDraftCoachTurn(
  args: {
    userMessage: string;
    memory: V2ConversationMemory;
    recentHistory: string;
    factualContext: string[];
    feedbackMemoryNotice?: string | null;
    nextAssistantTurnCount: number;
    writeMemory: (patch: MemoryPatch) => Promise<void>;
    clearClarificationPatch: () => MemoryPatch;
  },
): Promise<NonDraftTurnOutcome> {
  const respond = async (message: string, conversationState: V2ConversationMemory["conversationState"]) => {
    await args.writeMemory({
      conversationState,
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      ...args.clearClarificationPatch(),
    });

    return {
      kind: "response" as const,
      response: buildCoachResponse({
        message,
        feedbackMemoryNotice: args.feedbackMemoryNotice,
        memory: args.memory,
      }),
    };
  };

  const sourceTransparencyReply = inferSourceTransparencyReply({
    userMessage: args.userMessage,
    activeDraft: null,
    referenceText: args.memory.lastIdeationAngles.join(" "),
    recentHistory: args.recentHistory,
    contextAnchors: args.factualContext,
  });

  if (sourceTransparencyReply) {
    return respond(sourceTransparencyReply, "needs_more_context");
  }

  const postReferenceReply = inferPostReferenceReply({
    userMessage: args.userMessage,
    recentHistory: args.recentHistory,
  });
  if (postReferenceReply) {
    return respond(postReferenceReply, "needs_more_context");
  }

  const ideationRationaleReply =
    args.memory.conversationState === "ready_to_ideate"
      ? inferIdeationRationaleReply({
          userMessage: args.userMessage,
          topicSummary: args.memory.topicSummary,
          recentHistory: args.recentHistory,
          lastIdeationAngles: args.memory.lastIdeationAngles,
        })
      : null;
  if (ideationRationaleReply) {
    return respond(ideationRationaleReply, "ready_to_ideate");
  }

  if (!looksLikeConfusionPing(args.userMessage)) {
    return { kind: "continue" };
  }

  const confusionReply =
    args.memory.conversationState === "ready_to_ideate"
      ? "my bad - that was unclear. i should keep this grounded in what you've actually said. want a clean new set in the same lane, or a different direction?"
      : "my bad - that was unclear. i can rephrase it plainly, or we can reset and keep going.";

  return respond(
    confusionReply,
    args.memory.conversationState === "ready_to_ideate"
      ? "ready_to_ideate"
      : "needs_more_context",
  );
}
