import {
  buildSemanticRepairDirective,
  buildSemanticRepairState,
  inferCorrectionRepairQuestion,
  looksLikeSemanticCorrection,
} from "../../responses/semanticRepair.ts";
import { inferSourceTransparencyReply } from "../../responses/sourceTransparency.ts";
import {
  buildDraftMeaningResponse,
  isDraftMeaningQuestion,
} from "../../grounding/draftGrounding.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import type { OrchestratorResponse } from "../../runtime/types.ts";
import type { V2ConversationMemory } from "../../contracts/chat.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type MemoryPatch = Partial<V2ConversationMemory>;

interface ClarificationQuestionArgs {
  question: string;
  clarificationState?: V2ConversationMemory["clarificationState"] | null;
  traceReason?: string | null;
}

export type ActiveDraftTurnOutcome =
  | { kind: "continue" }
  | { kind: "response"; response: RawOrchestratorResponse }
  | { kind: "edit_transition"; draftInstruction: string };

interface ActiveDraftTurnBaseArgs {
  userMessage: string;
  activeDraft: string;
  memory: V2ConversationMemory;
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  writeMemory: (patch: MemoryPatch) => Promise<void>;
  clearClarificationPatch: () => MemoryPatch;
}

export async function resumeActiveDraftSemanticRepair(args: ActiveDraftTurnBaseArgs): Promise<ActiveDraftTurnOutcome> {
  if (args.memory.clarificationState?.branchKey !== "semantic_repair") {
    return { kind: "continue" };
  }

  const repairDirective = buildSemanticRepairDirective(
    args.userMessage,
    args.memory.topicSummary,
  );
  const nextConstraints = Array.from(
    new Set([...args.memory.activeConstraints, repairDirective.constraint]),
  );

  await args.writeMemory({
    activeConstraints: nextConstraints,
    clarificationState: null,
    conversationState: "editing",
    latestRefinementInstruction: repairDirective.rewriteRequest,
    ...args.clearClarificationPatch(),
  });

  return {
    kind: "edit_transition",
    draftInstruction: repairDirective.rewriteRequest,
  };
}

export async function handleActiveDraftCoachTurn(
  args: ActiveDraftTurnBaseArgs & {
    recentHistory: string;
    factualContext: string[];
    returnClarificationQuestion: (
      args: ClarificationQuestionArgs,
    ) => Promise<RawOrchestratorResponse>;
  },
): Promise<ActiveDraftTurnOutcome> {
  if (isDraftMeaningQuestion(args.userMessage)) {
    await args.writeMemory({
      conversationState:
        args.memory.conversationState === "draft_ready"
          ? "draft_ready"
          : "needs_more_context",
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      ...args.clearClarificationPatch(),
    });

    return {
      kind: "response",
      response: {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          buildDraftMeaningResponse(args.activeDraft),
          args.feedbackMemoryNotice ?? null,
        ),
        memory: args.memory,
      },
    };
  }

  const sourceTransparencyReply = inferSourceTransparencyReply({
    userMessage: args.userMessage,
    activeDraft: args.activeDraft,
    referenceText: args.memory.lastIdeationAngles.join(" "),
    recentHistory: args.recentHistory,
    contextAnchors: args.factualContext,
  });

  if (sourceTransparencyReply) {
    await args.writeMemory({
      conversationState:
        args.memory.conversationState === "draft_ready"
          ? "draft_ready"
          : "needs_more_context",
      clarificationState: null,
      assistantTurnCount: args.nextAssistantTurnCount,
      ...args.clearClarificationPatch(),
    });

    return {
      kind: "response",
      response: {
        mode: "coach",
        outputShape: "coach_question",
        response: prependFeedbackMemoryNotice(
          sourceTransparencyReply,
          args.feedbackMemoryNotice ?? null,
        ),
        memory: args.memory,
      },
    };
  }

  const correctionRepairQuestion = inferCorrectionRepairQuestion(
    args.userMessage,
    args.memory.topicSummary,
  );

  if (correctionRepairQuestion) {
    return {
      kind: "response",
      response: await args.returnClarificationQuestion({
        question: correctionRepairQuestion,
        clarificationState: buildSemanticRepairState(args.memory.topicSummary),
      }),
    };
  }

  if (!looksLikeSemanticCorrection(args.userMessage)) {
    return { kind: "continue" };
  }

  const repairDirective = buildSemanticRepairDirective(
    args.userMessage,
    args.memory.topicSummary,
  );
  const nextConstraints = Array.from(
    new Set([...args.memory.activeConstraints, repairDirective.constraint]),
  );

  await args.writeMemory({
    activeConstraints: nextConstraints,
    clarificationState: null,
    conversationState: "editing",
    assistantTurnCount: args.nextAssistantTurnCount,
    latestRefinementInstruction: repairDirective.rewriteRequest,
    ...args.clearClarificationPatch(),
  });

  return {
    kind: "edit_transition",
    draftInstruction: repairDirective.rewriteRequest,
  };
}
