import type {
  ActiveReplyContext,
} from "../contracts/chat.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../../onboarding/growthStrategy.ts";
import { buildChatReplyDraft, buildChatReplyOptions } from "../../extension/chatReplyAdapter.ts";
import type { ExtensionReplyIntentMetadata } from "../../extension/types.ts";

export type ReplyContinuationInsights = Parameters<
  typeof buildChatReplyOptions
>[0]["replyInsights"];

export type ReplyContinuationAction =
  | { type: "confirm" }
  | { type: "decline" }
  | { type: "select_option"; optionIndex: number }
  | {
      type: "revise_draft";
      tone: "dry" | "bold" | "builder" | "warm";
      length: "same" | "shorter" | "longer";
    };

export interface ReplyEmbeddedRequestContext {
  sourceText: string;
  sourceUrl: string | null;
  authorHandle: string | null;
  quotedUserAsk: string | null;
  confidence: "low" | "medium" | "high";
  parseReason: string;
}

export type ReplyContinuationPlan =
  | {
      kind: "decline";
      reply: string;
      nextReplyContext: null;
      selectedReplyOptionId: null;
      parseReason: "reply_confirmation_declined";
      confidence: ActiveReplyContext["confidence"];
    }
  | {
      kind: "reply_options";
      reply: string;
      nextReplyContext: ActiveReplyContext;
      selectedReplyOptionId: null;
      parseReason: string;
      confidence: ActiveReplyContext["confidence"];
      generatedResponse: ReturnType<typeof buildChatReplyOptions>["response"];
      eventType: "chat_reply_options_generated";
    }
  | {
      kind: "reply_draft";
      reply: string;
      nextReplyContext: ActiveReplyContext;
      selectedReplyOptionId: string | null;
      parseReason: "reply_option_selected" | "reply_draft_revised";
      confidence: ActiveReplyContext["confidence"];
      generatedResponse: ReturnType<typeof buildChatReplyDraft>["response"];
      eventType: "chat_reply_draft_generated" | "chat_reply_draft_revised";
    };

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

function createRuntimeReplyContext(args: {
  sourceContext: ReplyEmbeddedRequestContext;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
}): ActiveReplyContext {
  return {
    sourceText: args.sourceContext.sourceText,
    sourceUrl: args.sourceContext.sourceUrl,
    authorHandle: args.sourceContext.authorHandle,
    quotedUserAsk: args.sourceContext.quotedUserAsk,
    confidence: args.sourceContext.confidence,
    parseReason: args.sourceContext.parseReason,
    awaitingConfirmation: false,
    stage: args.defaultReplyStage,
    tone: args.defaultReplyTone,
    goal: args.defaultReplyGoal,
    opportunityId: `chat-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    latestReplyOptions: [],
    latestReplyDraftOptions: [],
    selectedReplyOptionId: null,
  };
}

export function planReplyContinuation(args: {
  activeReplyContext: ActiveReplyContext | null;
  replyContinuation: ReplyContinuationAction | null;
  highConfidenceReplyContext?: ReplyEmbeddedRequestContext | null;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
  replyStrategy: GrowthStrategySnapshot;
  replyInsights: ReplyContinuationInsights;
  styleCard: VoiceStyleCard | null;
}): ReplyContinuationPlan | null {
  const { activeReplyContext } = args;
  const selectedReplyIntent = toExtensionReplyIntentMetadata(
    activeReplyContext?.latestReplyOptions.find(
      (option) => option.id === activeReplyContext.selectedReplyOptionId,
    )?.intent || activeReplyContext?.latestReplyOptions[0]?.intent,
  );

  if (args.replyContinuation?.type === "decline" && activeReplyContext) {
    return {
      kind: "decline",
      reply: "ok. paste the exact post text or x url you want help with when you're ready.",
      nextReplyContext: null,
      selectedReplyOptionId: null,
      parseReason: "reply_confirmation_declined",
      confidence: activeReplyContext.confidence,
    };
  }

  if (
    (args.replyContinuation?.type === "confirm" && activeReplyContext) ||
    args.highConfidenceReplyContext
  ) {
    const sourceContext =
      activeReplyContext ||
      createRuntimeReplyContext({
        sourceContext: args.highConfidenceReplyContext!,
        defaultReplyStage: args.defaultReplyStage,
        defaultReplyTone: args.defaultReplyTone,
        defaultReplyGoal: args.defaultReplyGoal,
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
      kind: "reply_options",
      reply: "pulled 3 grounded reply directions from that post.",
      nextReplyContext,
      selectedReplyOptionId: null,
      parseReason: sourceContext.parseReason,
      confidence: sourceContext.confidence,
      generatedResponse: generated.response,
      eventType: "chat_reply_options_generated",
    };
  }

  if (args.replyContinuation?.type === "select_option" && activeReplyContext) {
    const selectedOption = activeReplyContext.latestReplyOptions[args.replyContinuation.optionIndex];
    if (!selectedOption) {
      return null;
    }

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
      kind: "reply_draft",
      reply: `ran with option ${args.replyContinuation.optionIndex + 1} and turned it into a reply draft.`,
      nextReplyContext,
      selectedReplyOptionId: selectedOption.id,
      parseReason: "reply_option_selected",
      confidence: activeReplyContext.confidence,
      generatedResponse: generated.response,
      eventType: "chat_reply_draft_generated",
    };
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
      kind: "reply_draft",
      reply:
        args.replyContinuation.length === "shorter"
          ? "tightened the reply while keeping the same grounded angle."
          : args.replyContinuation.tone === "bold"
            ? "pushed the reply bolder without inventing anything."
            : args.replyContinuation.tone === "warm"
              ? "softened the reply without losing the point."
              : "updated the reply and kept it grounded to the same post.",
      nextReplyContext,
      selectedReplyOptionId: activeReplyContext.selectedReplyOptionId,
      parseReason: "reply_draft_revised",
      confidence: activeReplyContext.confidence,
      generatedResponse: generated.response,
      eventType: "chat_reply_draft_revised",
    };
  }

  return null;
}
