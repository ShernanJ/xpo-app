import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import { buildExtensionReplyDraft } from "./replyDraft.ts";
import { buildExtensionReplyOptions } from "./replyOptions.ts";
import type { ReplyInsights } from "./replyOpportunities.ts";
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
}

function normalizeHandle(value: string | null | undefined): string {
  return value?.trim().replace(/^@+/, "").toLowerCase() || "creator";
}

function buildSyntheticCandidate(source: ChatReplySource): ExtensionOpportunityCandidate {
  return {
    postId: `${source.opportunityId}-post`,
    author: {
      id: null,
      handle: normalizeHandle(source.authorHandle),
      name: null,
      verified: false,
      followerCount: 0,
    },
    text: source.sourceText,
    url: source.sourceUrl || `https://x.com/${normalizeHandle(source.authorHandle)}/status/${source.opportunityId}`,
    createdAtIso: null,
    engagement: {
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      quoteCount: 0,
      viewCount: 0,
    },
    postType: "original",
    conversation: {
      conversationId: null,
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: false,
      hasImage: false,
      hasVideo: false,
      hasGif: false,
      hasLink: Boolean(source.sourceUrl),
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
    }),
  };
}

export function buildChatReplyDraft(args: {
  source: ChatReplySource;
  strategy: GrowthStrategySnapshot;
  replyInsights?: ReplyInsights | null;
  stage: ExtensionReplyDraftRequest["stage"];
  tone: ExtensionReplyTone;
  goal: string;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
  length?: "same" | "shorter" | "longer";
}) {
  const generated = buildExtensionReplyDraft({
    request: {
      tweetId: `${args.source.opportunityId}-post`,
      tweetText: args.source.sourceText,
      authorHandle: normalizeHandle(args.source.authorHandle),
      tweetUrl:
        args.source.sourceUrl ||
        `https://x.com/${normalizeHandle(args.source.authorHandle)}/status/${args.source.opportunityId}`,
      stage: args.stage,
      tone: args.tone,
      goal: args.goal,
    },
    strategy: args.strategy,
    replyInsights: args.replyInsights,
    selectedIntent: args.selectedIntent || undefined,
  });

  return {
    ...generated,
    response: lengthAdjustDraftOptions({
      response: generated.response,
      length: args.length || "same",
    }),
  };
}
