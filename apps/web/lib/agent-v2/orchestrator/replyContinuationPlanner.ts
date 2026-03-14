import type {
  ActiveReplyContext,
} from "../contracts/chat.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../../onboarding/growthStrategy.ts";
import { buildChatReplyDraft, buildChatReplyOptions } from "../../extension/chatReplyAdapter.ts";
import type { ExtensionReplyIntentMetadata } from "../../extension/types.ts";
import type {
  ChatReplyArtifacts,
  ChatReplyParseEnvelope,
  EmbeddedReplyParseResult,
  ReplyContinuationResult,
} from "./replyTurnLogic.ts";
import {
  parseEmbeddedReplyRequest,
  resolveReplyContinuation,
  shouldClearReplyWorkflow,
} from "./replyTurnLogic.ts";
import type { ChatTurnSource } from "../contracts/turnContract.ts";

export type ReplyContinuationInsights = Parameters<
  typeof buildChatReplyOptions
>[0]["replyInsights"];

export type ReplySurfaceMode =
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

export type ReplyAgentContext = {
  growthStrategySnapshot: GrowthStrategySnapshot;
  creatorProfile?: {
    identity?: {
      followerBand?: string | null;
    };
  };
};

export interface StructuredReplyContextInput {
  sourceText?: string | null;
  sourceUrl?: string | null;
  authorHandle?: string | null;
}

export interface ResolvedReplyTurnState {
  replyStrategy: GrowthStrategySnapshot;
  replyParseResult: EmbeddedReplyParseResult;
  replyContinuation: ReplyContinuationResult | null;
  shouldResetReplyWorkflow: boolean;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
}

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

function buildFallbackGrowthStrategySnapshot(activeHandle: string | null): GrowthStrategySnapshot {
  return {
    knownFor: activeHandle ? `${activeHandle}'s niche` : "a clearer niche",
    targetAudience: "the right people in your niche on X",
    contentPillars: ["clear positioning", "useful nuance", "proof-first writing"],
    replyGoals: ["Add one useful layer instead of generic agreement."],
    profileConversionCues: [
      "Replies should reinforce the niche the account wants to be known for.",
    ],
    offBrandThemes: ["generic agreement with no point of view"],
    ambiguities: [
      "Profile context is thin, so keep reply guidance conservative and grounded to the pasted post.",
    ],
    confidence: {
      overall: 40,
      positioning: 35,
      replySignal: 30,
      readiness: "caution",
    },
    truthBoundary: {
      verifiedFacts: activeHandle ? [`Active handle: @${activeHandle}`] : [],
      inferredThemes: ["useful nuance"],
      unknowns: [
        "Profile context is thin, so reply recommendations should avoid overclaiming voice patterns.",
      ],
    },
  };
}

function resolveChatReplyStage(
  creatorAgentContext: ReplyAgentContext | null,
): ActiveReplyContext["stage"] {
  const followerBand = creatorAgentContext?.creatorProfile?.identity?.followerBand;
  if (followerBand === "1k-10k") {
    return "1k_to_10k";
  }
  if (followerBand === "10k+") {
    return "10k_to_50k";
  }
  return "0_to_1k";
}

function resolveChatReplyTone(rawValue: unknown): ActiveReplyContext["tone"] {
  if (rawValue === "bold") {
    return "bold";
  }

  return "builder";
}

function resolveChatReplyGoal(rawValue: unknown): string {
  return rawValue === "followers" || rawValue === "leads" || rawValue === "authority"
    ? rawValue
    : "followers";
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

function createReplyContext(args: {
  sourceContext: ReplyEmbeddedRequestContext;
  awaitingConfirmation: boolean;
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
    awaitingConfirmation: args.awaitingConfirmation,
    stage: args.defaultReplyStage,
    tone: args.defaultReplyTone,
    goal: args.defaultReplyGoal,
    opportunityId: `chat-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    latestReplyOptions: [],
    latestReplyDraftOptions: [],
    selectedReplyOptionId: null,
  };
}

function buildReplyParseEnvelope(
  parseResult: EmbeddedReplyParseResult,
): ChatReplyParseEnvelope | null {
  if (!parseResult.context) {
    if (parseResult.classification === "reply_request_missing_post") {
      return {
        detected: true,
        confidence: "low",
        needsConfirmation: false,
        parseReason: "reply_request_missing_post",
      };
    }
    return null;
  }

  return {
    detected: parseResult.classification !== "plain_chat",
    confidence: parseResult.context.confidence,
    needsConfirmation:
      parseResult.classification === "reply_request_with_embedded_post" &&
      parseResult.context.confidence === "medium",
    parseReason: parseResult.context.parseReason,
  };
}

function buildReplyConfirmationPrompt(context: {
  authorHandle: string | null;
}): string {
  const opener = context.authorHandle
    ? `looks like you pasted a post from @${context.authorHandle}.`
    : "looks like you pasted a post.";
  return `${opener} should i treat that block as the post and give you 3 reply options?`;
}

function buildMissingReplyPostPrompt(): string {
  return "paste the post text or x url you want to reply to, and i'll turn it into 3 grounded reply options.";
}

function buildEmbeddedPostWithoutReplyPrompt(context: {
  authorHandle: string | null;
}): string {
  const opener = context.authorHandle
    ? `that looks like a post from @${context.authorHandle}.`
    : "that looks like a pasted post.";
  return `${opener} do you want me to help you reply to it, analyze it, or turn it into a quote reply?`;
}

function buildReplyConfirmationQuickReplies() {
  return [
    {
      kind: "clarification_choice" as const,
      value: "yes, treat that as the post",
      label: "Yes, that's the post",
    },
    {
      kind: "clarification_choice" as const,
      value: "no, that's not the post",
      label: "No, not that",
    },
  ];
}

function buildReplyOptionsQuickReplies(optionCount: number) {
  return Array.from({ length: Math.min(3, optionCount) }, (_, index) => ({
    kind: "planner_action" as const,
    value: `go with option ${index + 1}`,
    label: `Go with option ${index + 1}`,
  }));
}

function buildReplyDraftQuickReplies() {
  return [
    {
      kind: "planner_action" as const,
      value: "make it bolder",
      label: "Make it bolder",
    },
    {
      kind: "planner_action" as const,
      value: "make it less harsh",
      label: "Less harsh",
    },
    {
      kind: "planner_action" as const,
      value: "make it shorter",
      label: "Shorter",
    },
  ];
}

function buildReplyArtifactsFromOptions(args: {
  context: ActiveReplyContext;
  response: {
    options: ReturnType<typeof buildChatReplyOptions>["response"]["options"];
    warnings: string[];
    groundingNotes: string[];
  };
}): ChatReplyArtifacts {
  return {
    kind: "reply_options",
    sourceText: args.context.sourceText,
    sourceUrl: args.context.sourceUrl,
    authorHandle: args.context.authorHandle,
    options: args.response.options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      intent: option.intent,
    })),
    groundingNotes: args.response.groundingNotes,
    warnings: args.response.warnings,
    selectedOptionId: args.context.selectedReplyOptionId,
  };
}

function buildReplyArtifactsFromDraft(args: {
  context: ActiveReplyContext;
  response: ReturnType<typeof buildChatReplyDraft>["response"];
}): ChatReplyArtifacts {
  return {
    kind: "reply_draft",
    sourceText: args.context.sourceText,
    sourceUrl: args.context.sourceUrl,
    authorHandle: args.context.authorHandle,
    options: args.response.options.map((option) => ({
      id: option.id,
      label: option.label,
      text: option.text,
      intent: option.intent,
    })),
    notes: args.response.notes || [],
    selectedOptionId: args.context.selectedReplyOptionId,
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
      createReplyContext({
        sourceContext: args.highConfidenceReplyContext!,
        awaitingConfirmation: false,
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

export function resolveReplyTurnState(args: {
  activeHandle: string | null;
  creatorAgentContext: ReplyAgentContext | null;
  effectiveMessage: string;
  structuredReplyContext: StructuredReplyContextInput | null;
  turnSource: ChatTurnSource;
  shouldBypassReplyHandling: boolean;
  activeReplyContext: ActiveReplyContext | null;
  structuredReplyContinuation: ReplyContinuationResult | null;
  toneRisk: unknown;
  goal: unknown;
}): ResolvedReplyTurnState {
  const replyStrategy = args.creatorAgentContext
    ? args.creatorAgentContext.growthStrategySnapshot
    : buildFallbackGrowthStrategySnapshot(args.activeHandle);
  const replyParseResult = args.shouldBypassReplyHandling
    ? { classification: "plain_chat" as const, context: null }
    : parseEmbeddedReplyRequest({
        message: args.effectiveMessage,
        replyContext: args.structuredReplyContext,
      });
  const replyContinuation =
    args.structuredReplyContinuation ||
    (args.shouldBypassReplyHandling
      ? null
      : resolveReplyContinuation({
          userMessage: args.effectiveMessage,
          activeReplyContext: args.activeReplyContext,
        }));

  return {
    replyStrategy,
    replyParseResult,
    replyContinuation,
    shouldResetReplyWorkflow: shouldClearReplyWorkflow({
      activeReplyContext: args.activeReplyContext,
      turnSource: args.turnSource,
      replyParseResult,
      replyContinuation,
    }),
    defaultReplyStage: resolveChatReplyStage(args.creatorAgentContext),
    defaultReplyTone: resolveChatReplyTone(args.toneRisk),
    defaultReplyGoal: resolveChatReplyGoal(args.goal),
  };
}

export function planReplyTurn(args: {
  activeReplyContext: ActiveReplyContext | null;
  replyContinuation: ReplyContinuationAction | null;
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
    return {
      reply: buildReplyConfirmationPrompt(args.replyParseResult.context),
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: buildReplyConfirmationQuickReplies(),
      activeReplyContext: createReplyContext({
        sourceContext: args.replyParseResult.context,
        awaitingConfirmation: true,
        defaultReplyStage: args.defaultReplyStage,
        defaultReplyTone: args.defaultReplyTone,
        defaultReplyGoal: args.defaultReplyGoal,
      }),
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
    return {
      reply: buildEmbeddedPostWithoutReplyPrompt(args.replyParseResult.context),
      outputShape: "coach_question",
      surfaceMode: "ask_one_question",
      quickReplies: [],
      activeReplyContext: createReplyContext({
        sourceContext: {
          ...args.replyParseResult.context,
          quotedUserAsk: null,
        },
        awaitingConfirmation: true,
        defaultReplyStage: args.defaultReplyStage,
        defaultReplyTone: args.defaultReplyTone,
        defaultReplyGoal: args.defaultReplyGoal,
      }),
      replyParse: buildReplyParseEnvelope(args.replyParseResult),
    };
  }

  return null;
}
