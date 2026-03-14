import {
  isBareDraftRequest,
  isMultiDraftRequest,
  shouldRouteCareerClarification,
} from "../../orchestrator/conversationManagerLogic.ts";
import {
  inferBroadTopicDraftRequest,
  isOpenEndedWildcardDraftRequest,
} from "../../orchestrator/draftFastStart.ts";
import {
  buildAmbiguousReferenceQuestion,
  buildNaturalDraftClarificationQuestion,
  inferMissingSpecificQuestion,
  isLazyDraftRequest,
  inferLooseClarificationSeed,
  inferAbstractTopicSeed,
  looksGenericTopicSummary,
  looksLikeOpaqueEntityTopic,
} from "../../orchestrator/draftPipelineHelpers.ts";
import type {
  OrchestratorResponse,
} from "../../orchestrator/draftPipelineHelpers.ts";
import type {
  DraftFormatPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { DraftContextSlots } from "../../orchestrator/draftContextSlots.ts";
import type { RoutingPolicyResult } from "../../orchestrator/routingPolicy.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type ClarificationQuestionArgs = {
  question: string;
  topicSummary?: string | null;
  pendingPlan?: StrategyPlan | null;
};

type ClarificationTreeArgs = {
  branchKey:
    | "career_context_missing"
    | "entity_context_missing"
    | "topic_known_but_direction_missing"
    | "lazy_request"
    | "vague_draft_request"
    | "abstract_topic_focus_pick";
  seedTopic: string | null;
  isVerifiedAccount?: boolean;
  topicSummary?: string | null;
};

export async function handlePlanClarificationTurn(args: {
  userMessage: string;
  recentHistory: string;
  memory: V2ConversationMemory;
  routing: RoutingPolicyResult;
  explicitIntent: string | null | undefined;
  mode: string;
  turnDraftContextSlots: DraftContextSlots;
  missingAutobiographicalGroundingForTurn: boolean;
  isVerifiedAccount: boolean;
  turnFormatPreference: DraftFormatPreference;
  hasReusableGroundingForTurn: boolean;
  returnClarificationQuestion: (
    args: ClarificationQuestionArgs,
  ) => Promise<RawOrchestratorResponse>;
  returnClarificationTree: (
    args: ClarificationTreeArgs,
  ) => Promise<RawOrchestratorResponse>;
  handleIdeateMode: (args?: {
    promptMessage?: string;
    topicSummaryOverride?: string | null;
    responseUserMessage?: string;
  }) => Promise<RawOrchestratorResponse>;
  buildLooseDraftIdeationPrompt: (args: {
    formatPreference: DraftFormatPreference;
    seedTopic?: string | null;
  }) => string;
}): Promise<RawOrchestratorResponse | null> {
  const broadTopicDraftRequest = inferBroadTopicDraftRequest(args.userMessage);

  if (
    args.turnDraftContextSlots.ambiguousReferenceNeedsClarification &&
    args.turnDraftContextSlots.ambiguousReference
  ) {
    return args.returnClarificationQuestion({
      question: buildAmbiguousReferenceQuestion(
        args.turnDraftContextSlots.ambiguousReference,
      ),
    });
  }

  if (
    shouldRouteCareerClarification({
      explicitIntent: args.explicitIntent,
      mode: args.mode,
      domainHint: args.turnDraftContextSlots.domainHint,
      behaviorKnown: args.turnDraftContextSlots.behaviorKnown,
      stakesKnown: args.turnDraftContextSlots.stakesKnown,
    }) &&
    args.missingAutobiographicalGroundingForTurn
  ) {
    return args.returnClarificationTree({
      branchKey: "career_context_missing",
      seedTopic: broadTopicDraftRequest || args.memory.topicSummary,
      isVerifiedAccount: args.isVerifiedAccount,
    });
  }

  if (
    args.turnDraftContextSlots.isProductLike &&
    (!args.turnDraftContextSlots.behaviorKnown || !args.turnDraftContextSlots.stakesKnown) &&
    args.missingAutobiographicalGroundingForTurn
  ) {
    const clarificationQuestion = inferMissingSpecificQuestion(args.userMessage);
    const shouldUseEntityClarificationTree =
      Boolean(
        broadTopicDraftRequest &&
          (
            args.turnDraftContextSlots.entityNeedsDefinition ||
            /\b(?:extension|plugin|tool|app|product)\b/i.test(args.userMessage) ||
            looksLikeOpaqueEntityTopic({
              topic: broadTopicDraftRequest,
              userMessage: args.userMessage,
              activeConstraints: args.memory.activeConstraints,
            })
          ),
      );

    if (clarificationQuestion && shouldUseEntityClarificationTree) {
      return args.returnClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: broadTopicDraftRequest,
      });
    }

    if (clarificationQuestion) {
      return args.returnClarificationQuestion({
        question: clarificationQuestion,
        topicSummary: broadTopicDraftRequest || args.memory.topicSummary,
      });
    }
  }

  if (
    args.turnDraftContextSlots.entityNeedsDefinition &&
    args.turnDraftContextSlots.namedEntity
  ) {
    const prefersBroaderProductSeed =
      /\b(?:extension|plugin|tool|app|product)\b/i.test(args.userMessage) &&
      inferBroadTopicDraftRequest(args.userMessage);
    return args.returnClarificationTree({
      branchKey: "entity_context_missing",
      seedTopic: prefersBroaderProductSeed || args.turnDraftContextSlots.namedEntity,
    });
  }

  const clarificationQuestion = inferMissingSpecificQuestion(args.userMessage);
  if (clarificationQuestion && args.missingAutobiographicalGroundingForTurn) {
    return args.returnClarificationQuestion({
      question: clarificationQuestion,
    });
  }

  if (isOpenEndedWildcardDraftRequest(args.userMessage)) {
    return args.handleIdeateMode({
      promptMessage: args.buildLooseDraftIdeationPrompt({
        formatPreference: args.turnFormatPreference,
      }),
      topicSummaryOverride: null,
    });
  }

  if (isMultiDraftRequest(args.userMessage) && !args.hasReusableGroundingForTurn) {
    return args.returnClarificationQuestion({
      question: buildNaturalDraftClarificationQuestion({
        multiple: true,
        topicSummary: broadTopicDraftRequest || args.memory.topicSummary,
      }),
      topicSummary: broadTopicDraftRequest || args.memory.topicSummary,
    });
  }

  const broadTopic = inferBroadTopicDraftRequest(args.userMessage);
  if (broadTopic) {
    if (
      looksLikeOpaqueEntityTopic({
        topic: broadTopic,
        userMessage: args.userMessage,
        activeConstraints: args.memory.activeConstraints,
      })
    ) {
      return args.returnClarificationTree({
        branchKey: "entity_context_missing",
        seedTopic: broadTopic,
      });
    }

    return args.returnClarificationTree({
      branchKey: "topic_known_but_direction_missing",
      seedTopic: broadTopic,
      isVerifiedAccount: args.isVerifiedAccount,
      topicSummary: broadTopic,
    });
  }

  if (isBareDraftRequest(args.userMessage)) {
    const currentTopicSummary = looksGenericTopicSummary(args.memory.topicSummary)
      ? null
      : args.memory.topicSummary;
    return args.handleIdeateMode({
      promptMessage: args.buildLooseDraftIdeationPrompt({
        formatPreference: args.turnFormatPreference,
        seedTopic: currentTopicSummary,
      }),
      topicSummaryOverride: currentTopicSummary,
    });
  }

  if (
    !args.memory.topicSummary &&
    args.memory.concreteAnswerCount < 2 &&
    args.routing.classifiedIntent === "plan"
  ) {
    return args.returnClarificationTree({
      branchKey: isLazyDraftRequest(args.userMessage)
        ? "lazy_request"
        : "vague_draft_request",
      seedTopic: inferLooseClarificationSeed(
        args.userMessage,
        args.memory.topicSummary,
      ),
    });
  }

  const abstractTopicSeed = inferAbstractTopicSeed(
    args.userMessage,
    args.recentHistory,
    args.memory,
  );
  if (abstractTopicSeed) {
    return args.returnClarificationTree({
      branchKey: "abstract_topic_focus_pick",
      seedTopic: abstractTopicSeed,
      topicSummary: abstractTopicSeed,
    });
  }

  return null;
}
