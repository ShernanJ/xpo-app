import type { NextResponse } from "next/server.js";
import type { VoiceStyleCard } from "../../../../../lib/agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../../../../../lib/onboarding/growthStrategy.ts";
import type { V2ConversationMemory } from "../../../../../lib/agent-v2/contracts/chat.ts";
import {
  planReplyContinuation,
  type ReplyContinuationInsights,
} from "../../../../../lib/agent-v2/orchestrator/replyContinuationPlanner.ts";
import type {
  ChatArtifactContext,
  NormalizedChatTurnDiagnostics,
  ChatTurnSource,
} from "../../../../../lib/agent-v2/contracts/turnContract.ts";
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
  parseEmbeddedReplyRequest,
  resolveReplyContinuation,
  shouldClearReplyWorkflow,
  type ActiveReplyContext,
  type ChatReplyArtifacts,
  type ChatReplyParseEnvelope,
  type EmbeddedReplyParseResult,
  type ReplyContinuationResult,
} from "./reply.logic.ts";
import { persistAssistantTurn } from "./route.persistence.ts";
import {
  buildChatSuccessResponse,
  buildReplyAssistantMessageData,
  dispatchPlannedProductEvents,
  planReplyAssistantTurnProductEvents,
} from "./route.response.ts";

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

export function buildReplyMemorySnapshot(args: {
  storedMemory: V2ConversationMemory;
  activeReplyContext: ActiveReplyContext | null;
  selectedReplyOptionId?: string | null;
}): V2ConversationMemory {
  return {
    ...args.storedMemory,
    activeReplyContext: args.activeReplyContext,
    activeReplyArtifactRef: args.storedMemory.activeReplyArtifactRef,
    selectedReplyOptionId:
      args.selectedReplyOptionId === undefined
        ? args.storedMemory.selectedReplyOptionId
        : args.selectedReplyOptionId,
    preferredSurfaceMode: "structured",
  };
}

type ReplyAgentContext = {
  growthStrategySnapshot: GrowthStrategySnapshot;
  creatorProfile?: {
    identity?: {
      followerBand?: string | null;
    };
  };
};

interface StructuredReplyContextInput {
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

export function resolveReplyTurnState(args: {
  activeHandle: string | null;
  creatorAgentContext: ReplyAgentContext | null;
  effectiveMessage: string;
  structuredReplyContext: StructuredReplyContextInput | null;
  artifactContext: ChatArtifactContext | null;
  turnSource: ChatTurnSource;
  shouldBypassReplyHandling: boolean;
  activeReplyContext: ActiveReplyContext | null;
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
  const structuredReplyContinuation =
    args.artifactContext?.kind === "reply_option_select"
      ? {
          type: "select_option" as const,
          optionIndex: args.artifactContext.optionIndex,
        }
      : args.artifactContext?.kind === "reply_confirmation"
        ? args.artifactContext.decision === "confirm"
          ? ({ type: "confirm" as const })
          : ({ type: "decline" as const })
        : null;
  const replyContinuation =
    structuredReplyContinuation ||
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

export async function finalizeReplyTurn(args: {
  plannedTurn: PlannedReplyTurn;
  storedMemory: V2ConversationMemory;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
  defaultThreadTitle: string;
  storedThreadId: string | null;
  storedThreadTitle: string | null;
  requestedThreadId: string;
  userId: string;
  activeHandle: string | null;
  loadBilling: () => Promise<unknown>;
  recordProductEvent: (args: {
    userId: string;
    xHandle: string | null;
    threadId: string | null;
    messageId: string | null;
    eventType: string;
    properties: Record<string, unknown>;
  }) => Promise<unknown>;
}): Promise<NextResponse> {
  const nextMemory = buildReplyMemorySnapshot({
    storedMemory: args.storedMemory,
    activeReplyContext: args.plannedTurn.activeReplyContext,
    selectedReplyOptionId: args.plannedTurn.selectedReplyOptionId,
  });
  let mappedData = buildReplyAssistantMessageData({
    reply: args.plannedTurn.reply,
    outputShape: args.plannedTurn.outputShape,
    surfaceMode: args.plannedTurn.surfaceMode,
    quickReplies: args.plannedTurn.quickReplies,
    memory: nextMemory,
    routingDiagnostics: args.routingDiagnostics,
    clientTurnId: args.clientTurnId,
    threadTitle: args.storedThreadTitle || args.defaultThreadTitle,
    replyArtifacts: args.plannedTurn.replyArtifacts || null,
    replyParse: args.plannedTurn.replyParse || null,
  });

  let createdAssistantMessageId: string | undefined;
  if (args.storedThreadId) {
    const persistenceResult = await persistAssistantTurn({
      threadId: args.storedThreadId,
      assistantMessageData: mappedData,
      threadUpdate: { updatedAt: new Date() },
      buildMemoryUpdate: (assistantMessageId) => ({
        preferredSurfaceMode: "structured",
        activeReplyContext: args.plannedTurn.activeReplyContext,
        activeReplyArtifactRef: args.plannedTurn.replyArtifacts
          ? {
              messageId: assistantMessageId,
              kind: args.plannedTurn.replyArtifacts.kind,
            }
          : null,
        selectedReplyOptionId:
          args.plannedTurn.selectedReplyOptionId === undefined
            ? null
            : args.plannedTurn.selectedReplyOptionId,
      }),
    });
    createdAssistantMessageId = persistenceResult.assistantMessageId;
    mappedData = {
      ...mappedData,
      threadTitle: persistenceResult.updatedThreadTitle || args.defaultThreadTitle,
    };
  }

  dispatchPlannedProductEvents({
    events: planReplyAssistantTurnProductEvents({
      eventType: args.plannedTurn.eventType,
      outputShape: args.plannedTurn.outputShape,
      surfaceMode: args.plannedTurn.surfaceMode,
      replyArtifacts: args.plannedTurn.replyArtifacts || null,
      replyParse: args.plannedTurn.replyParse || null,
    }),
    userId: args.userId,
    xHandle: args.activeHandle,
    threadId: args.storedThreadId,
    messageId: createdAssistantMessageId ?? null,
    recordProductEvent: args.recordProductEvent,
  });

  return await buildChatSuccessResponse({
    mappedData,
    createdAssistantMessageId,
    newThreadId: !args.requestedThreadId && args.storedThreadId ? args.storedThreadId : undefined,
    loadBilling: args.loadBilling,
  });
}
