import type { CreatorProfileHints } from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { ReplyContextCard } from "../agent-v2/core/replyContextExtractor.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import {
  buildExtensionReplyDraft,
  buildReplyDraftGenerationContext,
  prepareExtensionReplyDraftPromptPacket,
  type ExtensionReplyDraftBuildResult,
} from "./replyDraft.ts";
import { buildExtensionReplyOptions } from "./replyOptions.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
import {
  buildReplySourceContextFromFlatInput,
  generateReplyDraftText,
  resolveReplyConstraintPolicy,
  type ReplySourceContext,
} from "../reply-engine/index.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type {
  ExtensionOpportunity,
  ExtensionOpportunityCandidate,
  ExtensionReplyDraftRequest,
  ExtensionReplyIntentMetadata,
  ExtensionReplyTone,
} from "./types.ts";

interface ChatReplySource {
  opportunityId: string;
  sourceText: string;
  sourceUrl: string | null;
  authorHandle: string | null;
  postType?: ExtensionOpportunityCandidate["postType"];
  sourceContext?: ReplySourceContext | null;
}

function normalizeHandle(value: string | null | undefined): string {
  return value?.trim().replace(/^@+/, "").toLowerCase() || "creator";
}

function shouldUseLiveGroqReplyDrafts() {
  return Boolean(process.env.GROQ_API_KEY?.trim()) && !process.argv.includes("--test");
}

interface ChatReplyDraftDeps {
  buildReplySourceContextFromFlatInput: typeof buildReplySourceContextFromFlatInput;
  buildReplyDraftGenerationContext: typeof buildReplyDraftGenerationContext;
  buildExtensionReplyDraft: typeof buildExtensionReplyDraft;
  prepareExtensionReplyDraftPromptPacket: typeof prepareExtensionReplyDraftPromptPacket;
  generateReplyDraftText: typeof generateReplyDraftText;
  resolveReplyConstraintPolicy: typeof resolveReplyConstraintPolicy;
  shouldUseLiveGroqReplyDrafts: typeof shouldUseLiveGroqReplyDrafts;
}

const DEFAULT_CHAT_REPLY_DRAFT_DEPS: ChatReplyDraftDeps = {
  buildReplySourceContextFromFlatInput,
  buildReplyDraftGenerationContext,
  buildExtensionReplyDraft,
  prepareExtensionReplyDraftPromptPacket,
  generateReplyDraftText,
  resolveReplyConstraintPolicy,
  shouldUseLiveGroqReplyDrafts,
};

function buildSyntheticCandidate(source: ChatReplySource): ExtensionOpportunityCandidate {
  const sourceContext = buildReplySourceContextFromFlatInput({
    sourceText: source.sourceText,
    sourceUrl: source.sourceUrl,
    authorHandle: source.authorHandle,
    postType: source.postType,
    sourceContext: source.sourceContext || null,
  });

  return {
    postId: sourceContext.primaryPost.id || `${source.opportunityId}-post`,
    author: {
      id: null,
      handle: normalizeHandle(sourceContext.primaryPost.authorHandle),
      name: null,
      verified: false,
      followerCount: 0,
    },
    text: sourceContext.primaryPost.text,
    url:
      sourceContext.primaryPost.url ||
      `https://x.com/${normalizeHandle(sourceContext.primaryPost.authorHandle)}/status/${source.opportunityId}`,
    createdAtIso: null,
    engagement: {
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      quoteCount: 0,
      viewCount: 0,
    },
    postType: sourceContext.primaryPost.postType,
    conversation: {
      conversationId: null,
      inReplyToPostId: sourceContext.conversation?.inReplyToPostId || null,
      inReplyToHandle: sourceContext.conversation?.inReplyToHandle || null,
    },
    media: {
      hasMedia: Boolean(sourceContext.media?.images.length),
      hasImage: Boolean(sourceContext.media?.images.length),
      hasVideo: Boolean(sourceContext.media?.hasVideo),
      hasGif: Boolean(sourceContext.media?.hasGif),
      hasLink: Boolean(sourceContext.media?.hasLink || source.sourceUrl),
      hasPoll: false,
    },
    surface: "unknown",
    captureSource: "dom",
    capturedAtIso: new Date().toISOString(),
  };
}

function pickSuggestedAngle(args: {
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
}): ExtensionOpportunity["suggestedAngle"] {
  return (
    args.selectedIntent?.label ||
    (args.replyInsights?.topIntentLabels?.[0]?.label as ExtensionOpportunity["suggestedAngle"] | undefined) ||
    "nuance"
  );
}

function buildSyntheticOpportunity(args: {
  source: ChatReplySource;
  replyInsights?: ReplyInsights | null;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
}): ExtensionOpportunity {
  return {
    opportunityId: args.source.opportunityId,
    postId: `${args.source.opportunityId}-post`,
    score: 86,
    verdict: "reply",
    why: [
      "You explicitly asked for a reply to this post.",
      "The pasted post is grounded enough to draft from directly.",
    ],
    riskFlags: [],
    suggestedAngle: pickSuggestedAngle(args),
    expectedValue: {
      visibility: "medium",
      profileClicks: "medium",
      followConversion: "medium",
    },
    scoringBreakdown: {
      niche_match: 74,
      audience_fit: 72,
      freshness: 60,
      conversation_quality: 78,
      profile_click_potential: 68,
      follow_conversion_potential: 66,
      visibility_potential: 61,
      spam_risk: 8,
      off_niche_risk: 14,
      genericity_risk: 10,
      negative_signal_risk: 8,
    },
  };
}

function shortenReplyText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 140) {
    return trimmed;
  }

  const firstSentence = trimmed.match(/^.*?[.?!](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length >= 60) {
    return firstSentence;
  }

  const cutoff = trimmed.lastIndexOf(" ", 136);
  return `${trimmed.slice(0, cutoff > 0 ? cutoff : 136).trimEnd()}...`;
}

function buildChatReplyDraftRequest(args: {
  source: ChatReplySource;
  sourceContext: ReplySourceContext;
  stage: ExtensionReplyDraftRequest["stage"];
  tone: ExtensionReplyTone;
  goal: string;
}): ExtensionReplyDraftRequest {
  const { source, sourceContext } = args;

  return {
    tweetId: sourceContext.primaryPost.id || `${source.opportunityId}-post`,
    tweetText: sourceContext.primaryPost.text,
    authorHandle: normalizeHandle(sourceContext.primaryPost.authorHandle),
    tweetUrl:
      sourceContext.primaryPost.url ||
      `https://x.com/${normalizeHandle(sourceContext.primaryPost.authorHandle)}/status/${source.opportunityId}`,
    stage: args.stage,
    tone: args.tone,
    goal: args.goal,
    ...(sourceContext.primaryPost.postType ? { postType: sourceContext.primaryPost.postType } : {}),
    ...(sourceContext.quotedPost
      ? {
          quotedPost: {
            ...(sourceContext.quotedPost.id ? { tweetId: sourceContext.quotedPost.id } : {}),
            tweetText: sourceContext.quotedPost.text,
            ...(sourceContext.quotedPost.authorHandle
              ? { authorHandle: sourceContext.quotedPost.authorHandle }
              : {}),
            ...(sourceContext.quotedPost.url ? { tweetUrl: sourceContext.quotedPost.url } : {}),
          },
        }
      : {}),
    ...(sourceContext.media ? { media: sourceContext.media } : {}),
    ...(sourceContext.conversation ? { conversation: sourceContext.conversation } : {}),
  };
}

function lengthAdjustDraftOptions(args: {
  response: ReturnType<typeof buildExtensionReplyDraft>["response"];
  length: "same" | "shorter" | "longer";
}) {
  if (args.length !== "shorter") {
    return args.response;
  }

  return {
    ...args.response,
    options: args.response.options.map((option) => ({
      ...option,
      text: shortenReplyText(option.text),
    })),
    notes: [
      ...(args.response.notes || []),
      "Trimmed the reply to keep it tighter without changing the grounded angle.",
    ].slice(0, 6),
  };
}

export function buildChatReplyOptions(args: {
  source: ChatReplySource;
  strategy: GrowthStrategySnapshot;
  strategyPillar: string;
  styleCard: VoiceStyleCard | null;
  replyInsights?: ReplyInsights | null;
  replyContext?: ReplyContextCard | null;
  stage: string;
  tone: ExtensionReplyTone;
  goal: string;
}) {
  const candidate = buildSyntheticCandidate(args.source);
  const opportunity = buildSyntheticOpportunity({
    source: args.source,
    replyInsights: args.replyInsights,
  });

  return {
    candidate,
    opportunity,
    response: buildExtensionReplyOptions({
      post: candidate,
      opportunity,
      strategy: args.strategy,
      strategyPillar: args.strategyPillar,
      styleCard: args.styleCard,
      stage: args.stage,
      tone: args.tone,
      goal: args.goal,
      replyInsights: args.replyInsights,
      replyContext: args.replyContext || null,
    }),
  };
}

export async function buildChatReplyDraftWithDeps(
  args: {
  source: ChatReplySource;
  userId?: string | null;
  xHandle?: string | null;
  strategy: GrowthStrategySnapshot;
  styleCard: VoiceStyleCard | null;
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  profileReplyContext?: ProfileReplyContext | null;
  replyInsights?: ReplyInsights | null;
  stage: ExtensionReplyDraftRequest["stage"];
  tone: ExtensionReplyTone;
  goal: string;
  replyContext?: ReplyContextCard | null;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
  length?: "same" | "shorter" | "longer";
},
  deps: ChatReplyDraftDeps = DEFAULT_CHAT_REPLY_DRAFT_DEPS,
): Promise<ExtensionReplyDraftBuildResult> {
  const sourceContext = deps.buildReplySourceContextFromFlatInput({
    sourceText: args.source.sourceText,
    sourceUrl: args.source.sourceUrl,
    authorHandle: args.source.authorHandle,
    postType: args.source.postType,
    sourceContext: args.source.sourceContext || null,
  });
  const request = buildChatReplyDraftRequest({
    source: args.source,
    sourceContext,
    stage: args.stage,
    tone: args.tone,
    goal: args.goal,
  });
  const generation = deps.buildReplyDraftGenerationContext({
    request,
    strategy: args.strategy,
    replyInsights: args.replyInsights,
    replyContext: args.replyContext || null,
    selectedIntent: args.selectedIntent || undefined,
    sourceContext,
  });

  const fallback = deps.buildExtensionReplyDraft({
    request,
    strategy: args.strategy,
    replyInsights: args.replyInsights,
    replyContext: args.replyContext || null,
    selectedIntent: args.selectedIntent || undefined,
  });

  if (!deps.shouldUseLiveGroqReplyDrafts()) {
    return {
      ...fallback,
      response: lengthAdjustDraftOptions({
        response: fallback.response,
        length: args.length || "same",
      }),
    };
  }

  const creatorProfileHints = args.creatorProfileHints || null;

  try {
    const promptPacket = await deps.prepareExtensionReplyDraftPromptPacket({
      request,
      strategy: args.strategy,
      replyInsights: args.replyInsights,
      styleCard: args.styleCard,
      generation,
      creatorProfileHints,
      creatorAgentContext: args.creatorAgentContext || null,
      profileReplyContext: args.profileReplyContext || null,
      userId: args.userId || null,
      xHandle: args.xHandle || null,
      replyContext: args.replyContext || null,
      sourceContext,
    });
    const generated = await deps.generateReplyDraftText({
      promptPacket,
    });
    const optionLabel: "safe" | "bold" = args.tone === "bold" ? "bold" : "safe";
    const effectiveIntent =
      generation.intent || fallback.response.options[0]?.intent || args.selectedIntent || undefined;
    const livePolicy = deps.resolveReplyConstraintPolicy({
      sourceContext,
      strategy: args.strategy,
      preflightResult: promptPacket.preflightResult || null,
      visualContext: promptPacket.visualContext || null,
    });

    const response = {
      options: [
        {
          id: "draft-1",
          label: optionLabel,
          text: generated.draft,
          intent: effectiveIntent,
        },
      ],
      notes: [
        ...(fallback.response.notes || []),
        generated.visualContext && livePolicy.allowImageAnchoring
          ? "Used image context to sharpen the reply."
          : null,
        `Voice target: ${generated.voiceTarget.summary}`,
        ...promptPacket.voiceEvidence.summaryLines.slice(0, 2),
      ].filter((entry): entry is string => Boolean(entry)).slice(0, 6),
    };

    return {
      ...fallback,
      response: lengthAdjustDraftOptions({
        response,
        length: args.length || "same",
      }),
    };
  } catch (error) {
    console.warn("Falling back to heuristic chat reply draft:", error);
    return {
      ...fallback,
      response: lengthAdjustDraftOptions({
        response: fallback.response,
        length: args.length || "same",
      }),
    };
  }
}

export async function buildChatReplyDraft(args: {
  source: ChatReplySource;
  userId?: string | null;
  xHandle?: string | null;
  strategy: GrowthStrategySnapshot;
  styleCard: VoiceStyleCard | null;
  creatorAgentContext?: CreatorAgentContext | null;
  creatorProfileHints?: CreatorProfileHints | null;
  profileReplyContext?: ProfileReplyContext | null;
  replyInsights?: ReplyInsights | null;
  stage: ExtensionReplyDraftRequest["stage"];
  tone: ExtensionReplyTone;
  goal: string;
  replyContext?: ReplyContextCard | null;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
  length?: "same" | "shorter" | "longer";
}): Promise<ExtensionReplyDraftBuildResult> {
  return buildChatReplyDraftWithDeps(args);
}
