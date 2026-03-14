import { buildChatReplyDraft, buildChatReplyOptions } from "../../../../../lib/extension/chatReplyAdapter.ts";
import type { ExtensionReplyIntentMetadata } from "../../../../../lib/extension/types.ts";
import type { VoiceStyleCard } from "../../../../../lib/agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../../../../../lib/onboarding/growthStrategy.ts";
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

type ReplyInsights = Parameters<typeof buildChatReplyOptions>[0]["replyInsights"];

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

function toExtensionReplyIntentMetadata(
  value:
    | {
        label: string;
        strategyPillar: string;
        anchor: string;
        rationale: string;
      }
    | null
    | undefined,
): ExtensionReplyIntentMetadata | null {
  if (!value) {
    return null;
  }

  if (
    value.label !== "nuance" &&
    value.label !== "sharpen" &&
    value.label !== "disagree" &&
    value.label !== "example" &&
    value.label !== "translate" &&
    value.label !== "known_for"
  ) {
    return null;
  }

  return {
    label: value.label,
    strategyPillar: value.strategyPillar,
    anchor: value.anchor,
    rationale: value.rationale,
  };
}

export function planReplyTurn(args: {
  activeReplyContext: ActiveReplyContext | null;
  replyContinuation: ReplyContinuationResult | null;
  replyParseResult: EmbeddedReplyParseResult;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
  replyStrategy: GrowthStrategySnapshot;
  replyInsights: ReplyInsights;
  styleCard: VoiceStyleCard | null;
}): PlannedReplyTurn | null {
  const { activeReplyContext } = args;
  const selectedReplyIntent = toExtensionReplyIntentMetadata(
    activeReplyContext?.latestReplyOptions.find(
      (option) => option.id === activeReplyContext.selectedReplyOptionId,
    )?.intent || activeReplyContext?.latestReplyOptions[0]?.intent,
  );

  if (args.replyContinuation?.type === "decline" && activeReplyContext) {
    return {
      reply: "ok. paste the exact post text or x url you want help with when you're ready.",
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: [],
      activeReplyContext: null,
      selectedReplyOptionId: null,
      replyParse: {
        detected: true,
        confidence: activeReplyContext.confidence,
        needsConfirmation: false,
        parseReason: "reply_confirmation_declined",
      },
    };
  }

  if (
    (args.replyContinuation?.type === "confirm" && activeReplyContext) ||
    (args.replyParseResult.classification === "reply_request_with_embedded_post" &&
      args.replyParseResult.context?.confidence === "high")
  ) {
    const sourceContext =
      activeReplyContext ||
      createEmptyActiveReplyContext({
        sourceText: args.replyParseResult.context?.sourceText || "",
        sourceUrl: args.replyParseResult.context?.sourceUrl || null,
        authorHandle: args.replyParseResult.context?.authorHandle || null,
        quotedUserAsk: args.replyParseResult.context?.quotedUserAsk || null,
        confidence: args.replyParseResult.context?.confidence || "high",
        parseReason:
          args.replyParseResult.context?.parseReason || "reply_request_with_embedded_post",
        awaitingConfirmation: false,
        stage: args.defaultReplyStage,
        tone: args.defaultReplyTone,
        goal: args.defaultReplyGoal,
      });
    const strategyPillar =
      selectedReplyIntent?.strategyPillar ||
      args.replyStrategy.contentPillars[0] ||
      args.replyStrategy.knownFor;
    const generated = buildChatReplyOptions({
      source: {
        opportunityId: sourceContext.opportunityId,
        sourceText: sourceContext.sourceText,
        sourceUrl: sourceContext.sourceUrl,
        authorHandle: sourceContext.authorHandle,
      },
      strategy: args.replyStrategy,
      strategyPillar,
      styleCard: args.styleCard,
      replyInsights: args.replyInsights,
      stage: sourceContext.stage,
      tone: sourceContext.tone,
      goal: sourceContext.goal,
    });
    const nextReplyContext: ActiveReplyContext = {
      ...sourceContext,
      awaitingConfirmation: false,
      latestReplyOptions: generated.response.options,
      latestReplyDraftOptions: [],
      selectedReplyOptionId: null,
    };
    return {
      reply: "pulled 3 grounded reply directions from that post.",
      outputShape: "reply_candidate",
      surfaceMode: "offer_options",
      quickReplies: buildReplyOptionsQuickReplies(generated.response.options.length),
      activeReplyContext: nextReplyContext,
      selectedReplyOptionId: null,
      replyArtifacts: buildReplyArtifactsFromOptions({
        context: nextReplyContext,
        response: generated.response,
      }),
      replyParse: buildReplyParseEnvelope(args.replyParseResult) || {
        detected: true,
        confidence: sourceContext.confidence,
        needsConfirmation: false,
        parseReason: sourceContext.parseReason,
      },
      eventType: "chat_reply_options_generated",
    };
  }

  if (args.replyContinuation?.type === "select_option" && activeReplyContext) {
    const selectedOption = activeReplyContext.latestReplyOptions[args.replyContinuation.optionIndex];
    if (selectedOption) {
      const generated = buildChatReplyDraft({
        source: {
          opportunityId: activeReplyContext.opportunityId,
          sourceText: activeReplyContext.sourceText,
          sourceUrl: activeReplyContext.sourceUrl,
          authorHandle: activeReplyContext.authorHandle,
        },
        strategy: args.replyStrategy,
        replyInsights: args.replyInsights,
        stage: activeReplyContext.stage,
        tone: activeReplyContext.tone,
        goal: activeReplyContext.goal,
        selectedIntent: toExtensionReplyIntentMetadata(selectedOption.intent) || undefined,
      });
      const nextReplyContext: ActiveReplyContext = {
        ...activeReplyContext,
        latestReplyDraftOptions: generated.response.options,
        selectedReplyOptionId: selectedOption.id,
      };
      return {
        reply: `ran with option ${args.replyContinuation.optionIndex + 1} and turned it into a reply draft.`,
        outputShape: "reply_candidate",
        surfaceMode: "generate_full_output",
        quickReplies: buildReplyDraftQuickReplies(),
        activeReplyContext: nextReplyContext,
        selectedReplyOptionId: selectedOption.id,
        replyArtifacts: buildReplyArtifactsFromDraft({
          context: nextReplyContext,
          response: generated.response,
        }),
        replyParse: {
          detected: true,
          confidence: activeReplyContext.confidence,
          needsConfirmation: false,
          parseReason: "reply_option_selected",
        },
        eventType: "chat_reply_draft_generated",
      };
    }
  }

  if (args.replyContinuation?.type === "revise_draft" && activeReplyContext) {
    const generated = buildChatReplyDraft({
      source: {
        opportunityId: activeReplyContext.opportunityId,
        sourceText: activeReplyContext.sourceText,
        sourceUrl: activeReplyContext.sourceUrl,
        authorHandle: activeReplyContext.authorHandle,
      },
      strategy: args.replyStrategy,
      replyInsights: args.replyInsights,
      stage: activeReplyContext.stage,
      tone: args.replyContinuation.tone,
      goal: activeReplyContext.goal,
      selectedIntent: selectedReplyIntent || undefined,
      length: args.replyContinuation.length,
    });
    const nextReplyContext: ActiveReplyContext = {
      ...activeReplyContext,
      tone: args.replyContinuation.tone,
      latestReplyDraftOptions: generated.response.options,
    };
    return {
      reply:
        args.replyContinuation.length === "shorter"
          ? "tightened the reply while keeping the same grounded angle."
          : args.replyContinuation.tone === "bold"
            ? "pushed the reply bolder without inventing anything."
            : args.replyContinuation.tone === "warm"
              ? "softened the reply without losing the point."
              : "updated the reply and kept it grounded to the same post.",
      outputShape: "reply_candidate",
      surfaceMode: "generate_full_output",
      quickReplies: buildReplyDraftQuickReplies(),
      activeReplyContext: nextReplyContext,
      selectedReplyOptionId: activeReplyContext.selectedReplyOptionId,
      replyArtifacts: buildReplyArtifactsFromDraft({
        context: nextReplyContext,
        response: generated.response,
      }),
      replyParse: {
        detected: true,
        confidence: activeReplyContext.confidence,
        needsConfirmation: false,
        parseReason: "reply_draft_revised",
      },
      eventType: "chat_reply_draft_revised",
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
