import type { VoiceStyleCard } from "../../../../../lib/agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../../../../../lib/onboarding/growthStrategy.ts";
import {
  planReplyContinuation,
  type ReplyContinuationInsights,
} from "../../../../../lib/agent-v2/orchestrator/replyContinuationPlanner.ts";
import {
  buildEmbeddedPostWithoutReplyPrompt,
  buildMissingReplyPostPrompt,
  buildReplyArtifactsFromDraft,
  buildReplyArtifactsFromOptions,
  buildReplyConfirmationPrompt,
  buildReplyConfirmationQuickReplies,
  buildReplyDraftQuickReplies,
  buildReplyOptionsQuickReplies,
  buildReplyParseEnvelope,
  createEmptyActiveReplyContext,
  type ActiveReplyContext,
  type ChatReplyArtifacts,
  type ChatReplyParseEnvelope,
  type EmbeddedReplyParseResult,
  type ReplyContinuationResult,
} from "./reply.logic.ts";

type ReplySurfaceMode =
  | "answer_directly"
  | "ask_one_question"
  | "offer_options"
  | "generate_full_output";

export interface PlannedReplyTurn {
  reply: string;
  outputShape: "coach_question" | "reply_candidate";
  surfaceMode: ReplySurfaceMode;
  quickReplies: unknown[];
  activeReplyContext: ActiveReplyContext | null;
  selectedReplyOptionId?: string | null;
  replyArtifacts?: ChatReplyArtifacts | null;
  replyParse?: ChatReplyParseEnvelope | null;
  eventType?: string;
}

export function planReplyTurn(args: {
  activeReplyContext: ActiveReplyContext | null;
  replyContinuation: ReplyContinuationResult | null;
  replyParseResult: EmbeddedReplyParseResult;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
  replyStrategy: GrowthStrategySnapshot;
  replyInsights: ReplyContinuationInsights;
  styleCard: VoiceStyleCard | null;
}): PlannedReplyTurn | null {
  const continuationPlan = planReplyContinuation({
    activeReplyContext: args.activeReplyContext,
    replyContinuation: args.replyContinuation,
    highConfidenceReplyContext:
      args.replyParseResult.classification === "reply_request_with_embedded_post" &&
      args.replyParseResult.context?.confidence === "high"
        ? args.replyParseResult.context
        : null,
    defaultReplyStage: args.defaultReplyStage,
    defaultReplyTone: args.defaultReplyTone,
    defaultReplyGoal: args.defaultReplyGoal,
    replyStrategy: args.replyStrategy,
    replyInsights: args.replyInsights,
    styleCard: args.styleCard,
  });

  if (continuationPlan?.kind === "decline") {
    return {
      reply: continuationPlan.reply,
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: [],
      activeReplyContext: continuationPlan.nextReplyContext,
      selectedReplyOptionId: continuationPlan.selectedReplyOptionId,
      replyParse: {
        detected: true,
        confidence: continuationPlan.confidence,
        needsConfirmation: false,
        parseReason: continuationPlan.parseReason,
      },
    };
  }

  if (continuationPlan?.kind === "reply_options") {
    return {
      reply: continuationPlan.reply,
      outputShape: "reply_candidate",
      surfaceMode: "offer_options",
      quickReplies: buildReplyOptionsQuickReplies(
        continuationPlan.generatedResponse.options.length,
      ),
      activeReplyContext: continuationPlan.nextReplyContext,
      selectedReplyOptionId: continuationPlan.selectedReplyOptionId,
      replyArtifacts: buildReplyArtifactsFromOptions({
        context: continuationPlan.nextReplyContext,
        response: continuationPlan.generatedResponse,
      }),
      replyParse: buildReplyParseEnvelope(args.replyParseResult) || {
        detected: true,
        confidence: continuationPlan.confidence,
        needsConfirmation: false,
        parseReason: continuationPlan.parseReason,
      },
      eventType: continuationPlan.eventType,
    };
  }

  if (continuationPlan?.kind === "reply_draft") {
    return {
      reply: continuationPlan.reply,
      outputShape: "reply_candidate",
      surfaceMode: "generate_full_output",
      quickReplies: buildReplyDraftQuickReplies(),
      activeReplyContext: continuationPlan.nextReplyContext,
      selectedReplyOptionId: continuationPlan.selectedReplyOptionId,
      replyArtifacts: buildReplyArtifactsFromDraft({
        context: continuationPlan.nextReplyContext,
        response: continuationPlan.generatedResponse,
      }),
      replyParse: {
        detected: true,
        confidence: continuationPlan.confidence,
        needsConfirmation: false,
        parseReason: continuationPlan.parseReason,
      },
      eventType: continuationPlan.eventType,
    };
  }

  if (
    args.replyParseResult.classification === "reply_request_with_embedded_post" &&
    args.replyParseResult.context?.confidence === "medium"
  ) {
    const nextReplyContext = createEmptyActiveReplyContext({
      sourceText: args.replyParseResult.context.sourceText,
      sourceUrl: args.replyParseResult.context.sourceUrl,
      authorHandle: args.replyParseResult.context.authorHandle,
      quotedUserAsk: args.replyParseResult.context.quotedUserAsk,
      confidence: args.replyParseResult.context.confidence,
      parseReason: args.replyParseResult.context.parseReason,
      awaitingConfirmation: true,
      stage: args.defaultReplyStage,
      tone: args.defaultReplyTone,
      goal: args.defaultReplyGoal,
    });
    return {
      reply: buildReplyConfirmationPrompt(args.replyParseResult.context),
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: buildReplyConfirmationQuickReplies(),
      activeReplyContext: nextReplyContext,
      replyParse: buildReplyParseEnvelope(args.replyParseResult),
    };
  }

  if (args.replyParseResult.classification === "reply_request_missing_post") {
    return {
      reply: buildMissingReplyPostPrompt(),
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: [],
      activeReplyContext: null,
      selectedReplyOptionId: null,
      replyParse: buildReplyParseEnvelope(args.replyParseResult),
    };
  }

  if (
    args.replyParseResult.classification === "embedded_post_without_reply_request" &&
    args.replyParseResult.context
  ) {
    const nextReplyContext = createEmptyActiveReplyContext({
      sourceText: args.replyParseResult.context.sourceText,
      sourceUrl: args.replyParseResult.context.sourceUrl,
      authorHandle: args.replyParseResult.context.authorHandle,
      quotedUserAsk: null,
      confidence: args.replyParseResult.context.confidence,
      parseReason: args.replyParseResult.context.parseReason,
      awaitingConfirmation: true,
      stage: args.defaultReplyStage,
      tone: args.defaultReplyTone,
      goal: args.defaultReplyGoal,
    });
    return {
      reply: buildEmbeddedPostWithoutReplyPrompt(args.replyParseResult.context),
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: [],
      activeReplyContext: nextReplyContext,
      replyParse: buildReplyParseEnvelope(args.replyParseResult),
    };
  }

  return null;
}
