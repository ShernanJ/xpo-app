import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import { analyzeSourceTweet } from "../../core/replyContextExtractor.ts";
import type { CreatorProfileHints } from "../../grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../../grounding/profileReplyContext.ts";
import type { GrowthStrategySnapshot } from "../../../onboarding/strategy/growthStrategy.ts";
import type { CreatorAgentContext } from "../../../onboarding/strategy/agentContext.ts";
import { buildChatReplyDraft } from "../../../extension/chatReplyAdapter.ts";
import {
  resolveReplyRequestSourceFromStatusUrl,
  isStandaloneXStatusUrl,
} from "./replyRequestUrlResolver.ts";
import type { ReplySourcePreview } from "../../../reply-engine/replySourcePreview.ts";
import type { DraftArtifactDetails } from "../../../onboarding/shared/draftArtifacts.ts";
import type { V2ConversationMemory } from "../../contracts/chat.ts";
import {
  planReplyContinuation,
  type ReplyContinuationInsights,
} from "./replyContinuationPlanner.ts";
import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../../contracts/turnContract.ts";
import {
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
} from "./replyTurnLogic.ts";

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
  draft?: string | null;
  drafts?: string[];
  draftArtifacts?: DraftArtifactDetails[];
  draftVersions?: Array<Record<string, unknown>>;
  activeDraftVersionId?: string | null;
  previousVersionSnapshot?: Record<string, unknown> | null;
  revisionChainId?: string | null;
  replySourcePreview?: ReplySourcePreview | null;
}

export function buildReplyMemorySnapshot(args: {
  storedMemory: V2ConversationMemory;
  activeReplyContext: ActiveReplyContext | null;
  activeReplyArtifactKind?: "reply_options" | "reply_draft" | null;
  selectedReplyOptionId?: string | null;
}): V2ConversationMemory {
  return {
    ...args.storedMemory,
    activeReplyContext: args.activeReplyContext,
    activeReplyArtifactRef: args.storedMemory.activeReplyArtifactRef,
    continuationState:
      args.activeReplyArtifactKind === "reply_draft" && args.activeReplyContext
        ? {
            capability: "replying",
            pendingAction: "reply_regenerate",
            formatPreference: "shortform",
            sourceUserMessage: args.activeReplyContext.sourceText,
            sourcePrompt: args.activeReplyContext.quotedUserAsk,
          }
        : null,
    activeProfileAnalysisRef: null,
    selectedReplyOptionId:
      args.selectedReplyOptionId === undefined
        ? args.storedMemory.selectedReplyOptionId
        : args.selectedReplyOptionId,
    preferredSurfaceMode: "structured",
  };
}

export type ReplyAgentContext = {
  growthStrategySnapshot: GrowthStrategySnapshot;
  creatorProfile?: CreatorAgentContext["creatorProfile"];
} & Partial<CreatorAgentContext>;

export interface StructuredReplyContextInput {
  sourceText?: string | null;
  sourceUrl?: string | null;
  authorHandle?: string | null;
  sourceContext?: import("../../../reply-engine/types.ts").ReplySourceContext | null;
  primaryPost?: {
    id?: string | null;
    url?: string | null;
    text?: string | null;
    authorHandle?: string | null;
    postType?: string | null;
  } | null;
  quotedPost?: {
    id?: string | null;
    url?: string | null;
    text?: string | null;
    authorHandle?: string | null;
  } | null;
  media?: import("../../../reply-engine/types.ts").ReplySourceContext["media"];
  conversation?: import("../../../reply-engine/types.ts").ReplySourceContext["conversation"];
}

export interface ResolvedReplyTurnState {
  replyStrategy: GrowthStrategySnapshot;
  replyParseResult: EmbeddedReplyParseResult;
  replyContinuation: ReplyContinuationResult | null;
  replyRequestMode: "direct_draft" | null;
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
  const directReplyRequestContext =
    args.artifactContext?.kind === "reply_request" && args.effectiveMessage.trim()
      ? {
          sourceText: args.effectiveMessage.trim(),
          sourceUrl: null,
          authorHandle: null,
          sourceContext: null,
          quotedUserAsk: null,
          confidence: "high" as const,
          parseReason: "structured_reply_request",
        }
      : null;
  const replyParseResult = directReplyRequestContext
    ? {
        classification: "reply_request_with_embedded_post" as const,
        context: directReplyRequestContext,
      }
    : args.shouldBypassReplyHandling
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
    replyRequestMode:
      args.artifactContext?.kind === "reply_request"
        ? args.artifactContext.responseMode
        : null,
    shouldResetReplyWorkflow: shouldClearReplyWorkflow({
      activeReplyContext: args.activeReplyContext,
      userMessage: args.effectiveMessage,
      turnSource: args.turnSource,
      replyParseResult,
      replyContinuation,
    }),
    defaultReplyStage: resolveChatReplyStage(args.creatorAgentContext),
    defaultReplyTone: resolveChatReplyTone(args.toneRisk),
    defaultReplyGoal: resolveChatReplyGoal(args.goal),
  };
}

async function planDirectReplyDraft(args: {
  replyParseResult: EmbeddedReplyParseResult;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
  replyStrategy: GrowthStrategySnapshot;
  replyInsights: ReplyContinuationInsights;
  styleCard: VoiceStyleCard | null;
  userId?: string | null;
  activeHandle?: string | null;
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  profileReplyContext?: ProfileReplyContext | null;
}): Promise<PlannedReplyTurn | null> {
  const replyContext = args.replyParseResult.context;
  if (!replyContext) {
    return null;
  }

  let resolvedSourceText = replyContext.sourceText;
  let resolvedSourceUrl = replyContext.sourceUrl;
  let resolvedAuthorHandle = replyContext.authorHandle;
  let resolvedSourceContext = replyContext.sourceContext || null;
  let resolvedParseReason = replyContext.parseReason;
  let resolvedReplySourcePreview = replyContext.replySourcePreview || null;

  if (isStandaloneXStatusUrl(replyContext.sourceText)) {
    const resolvedFromUrl = await resolveReplyRequestSourceFromStatusUrl(
      replyContext.sourceText,
    );

    if (!resolvedFromUrl) {
      return {
        reply:
          "i couldn't load that x post from the link. paste the tweet text instead and i'll draft the reply from that.",
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: [],
        activeReplyContext: null,
        selectedReplyOptionId: null,
        replyParse: {
          detected: true,
          confidence: "low",
          needsConfirmation: false,
          parseReason: "reply_request_url_resolution_failed",
        },
      };
    }

    resolvedSourceText = resolvedFromUrl.sourceText;
    resolvedSourceUrl = resolvedFromUrl.sourceUrl;
    resolvedAuthorHandle = resolvedFromUrl.authorHandle;
    resolvedSourceContext = resolvedFromUrl.sourceContext;
    resolvedParseReason = "structured_reply_request_url";
    resolvedReplySourcePreview = resolvedFromUrl.replySourcePreview;
  }

  const replyContextCard = await analyzeSourceTweet(resolvedSourceText);

  const activeReplyContext = createEmptyActiveReplyContext({
    sourceText: resolvedSourceText,
    sourceUrl: resolvedSourceUrl,
    authorHandle: resolvedAuthorHandle,
    sourceContext: resolvedSourceContext,
    replySourcePreview: resolvedReplySourcePreview,
    replyContext: replyContextCard,
    quotedUserAsk: replyContext.quotedUserAsk,
    confidence: replyContext.confidence,
    parseReason: resolvedParseReason,
    awaitingConfirmation: false,
    stage: args.defaultReplyStage,
    tone: args.defaultReplyTone,
    goal: args.defaultReplyGoal,
  });
  const generated = await buildChatReplyDraft({
    source: {
      opportunityId: activeReplyContext.opportunityId,
      sourceText: activeReplyContext.sourceText,
      sourceUrl: activeReplyContext.sourceUrl,
      authorHandle: activeReplyContext.authorHandle,
      postType: activeReplyContext.sourceContext?.primaryPost.postType,
      sourceContext: activeReplyContext.sourceContext || null,
    },
    userId: args.userId || null,
    xHandle: args.activeHandle || null,
    strategy: args.replyStrategy,
    styleCard: args.styleCard,
    creatorAgentContext: args.creatorAgentContext || null,
    creatorProfileHints: args.creatorProfileHints || null,
    profileReplyContext: args.profileReplyContext || null,
    replyInsights: args.replyInsights,
    stage: activeReplyContext.stage,
    tone: activeReplyContext.tone,
    goal: activeReplyContext.goal,
    replyContext: activeReplyContext.replyContext || null,
  });
  const primaryOption = generated.response.options[0] ?? null;
  const response = primaryOption
    ? {
        ...generated.response,
        options: [primaryOption],
      }
    : generated.response;
  const nextReplyContext: ActiveReplyContext = {
    ...activeReplyContext,
    latestReplyDraftOptions: response.options,
    selectedReplyOptionId: primaryOption?.id ?? null,
  };

  return {
    reply: "drafted one grounded reply from that post.",
    outputShape: "reply_candidate",
    surfaceMode: "generate_full_output",
    quickReplies: buildReplyDraftQuickReplies(),
    activeReplyContext: nextReplyContext,
    selectedReplyOptionId: nextReplyContext.selectedReplyOptionId,
    replyArtifacts: buildReplyArtifactsFromDraft({
      context: nextReplyContext,
      response,
    }),
    replyParse: {
      detected: true,
      confidence: nextReplyContext.confidence,
      needsConfirmation: false,
      parseReason: nextReplyContext.parseReason,
    },
    eventType: "chat_reply_draft_generated",
    draft: primaryOption?.text ?? null,
    drafts: primaryOption?.text ? [primaryOption.text] : [],
    replySourcePreview: nextReplyContext.replySourcePreview ?? null,
  };
}

export async function planReplyTurn(args: {
  activeReplyContext: ActiveReplyContext | null;
  replyContinuation: ReplyContinuationResult | null;
  replyParseResult: EmbeddedReplyParseResult;
  replyRequestMode?: "direct_draft" | null;
  userId?: string | null;
  activeHandle?: string | null;
  defaultReplyStage: ActiveReplyContext["stage"];
  defaultReplyTone: ActiveReplyContext["tone"];
  defaultReplyGoal: string;
  replyStrategy: GrowthStrategySnapshot;
  replyInsights: ReplyContinuationInsights;
  styleCard: VoiceStyleCard | null;
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  profileReplyContext?: ProfileReplyContext | null;
}): Promise<PlannedReplyTurn | null> {
  if (
    args.replyRequestMode === "direct_draft" &&
    args.replyParseResult.classification === "reply_request_with_embedded_post" &&
    args.replyParseResult.context
  ) {
    return await planDirectReplyDraft(args);
  }

  const continuationPlan = await planReplyContinuation({
    activeReplyContext: args.activeReplyContext,
    replyContinuation: args.replyContinuation,
    highConfidenceReplyContext:
      args.replyParseResult.classification === "reply_request_with_embedded_post" &&
      args.replyParseResult.context?.confidence === "high"
        ? args.replyParseResult.context
        : null,
    userId: args.userId || null,
    xHandle: args.activeHandle || null,
    defaultReplyStage: args.defaultReplyStage,
    defaultReplyTone: args.defaultReplyTone,
    defaultReplyGoal: args.defaultReplyGoal,
    replyStrategy: args.replyStrategy,
    replyInsights: args.replyInsights,
    styleCard: args.styleCard,
    creatorAgentContext: args.creatorAgentContext || null,
    creatorProfileHints: args.creatorProfileHints || null,
    profileReplyContext: args.profileReplyContext || null,
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
      replySourcePreview: continuationPlan.nextReplyContext.replySourcePreview ?? null,
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
      draft: continuationPlan.generatedResponse.options[0]?.text ?? null,
      drafts: continuationPlan.generatedResponse.options[0]?.text
        ? [continuationPlan.generatedResponse.options[0].text]
        : [],
      replySourcePreview: continuationPlan.nextReplyContext.replySourcePreview ?? null,
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
      sourceContext: args.replyParseResult.context.sourceContext || null,
      replySourcePreview: args.replyParseResult.context.replySourcePreview || null,
      replyContext: await analyzeSourceTweet(args.replyParseResult.context.sourceText),
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

  return null;
}
