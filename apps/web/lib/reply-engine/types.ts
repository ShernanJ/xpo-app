import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { VoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { ReplyInsights } from "../extension/replyOpportunities.ts";
import type {
  ExtensionOpportunityPostType,
  ExtensionReplyIntentMetadata,
  ExtensionReplyTone,
} from "../extension/types.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

export interface ReplySourcePost {
  id: string;
  url: string | null;
  text: string;
  authorHandle: string | null;
  postType: ExtensionOpportunityPostType;
}

export interface ReplySourceQuotedPost {
  id: string | null;
  url: string | null;
  text: string;
  authorHandle: string | null;
}

export interface ReplySourceImage {
  imageUrl?: string | null;
  imageDataUrl?: string | null;
  altText?: string | null;
}

export interface ReplySourceMediaContext {
  images: ReplySourceImage[];
  hasVideo: boolean;
  hasGif: boolean;
  hasLink: boolean;
}

export interface ReplySourceConversationContext {
  inReplyToPostId?: string | null;
  inReplyToHandle?: string | null;
}

export interface ReplySourceContext {
  primaryPost: ReplySourcePost;
  quotedPost?: ReplySourceQuotedPost | null;
  media?: ReplySourceMediaContext | null;
  conversation?: ReplySourceConversationContext | null;
}

export interface ReplyVisualContextSummary {
  primarySubject: string;
  setting: string;
  lightingAndMood: string;
  readableText: string;
  keyDetails: string[];
  summaryLines: string[];
}

export interface ReplyPromptBuildInput {
  sourceContext: ReplySourceContext;
  strategy: GrowthStrategySnapshot;
  tone: ExtensionReplyTone;
  goal: string;
  stage?: string | null;
  heuristicScore?: number | null;
  heuristicTier?: string | null;
  selectedIntent?: ExtensionReplyIntentMetadata | null;
  replyInsights?: ReplyInsights | null;
  styleCard?: VoiceStyleCard | null;
  creatorProfileHints?: CreatorProfileHints | null;
  creatorAgentContext?: CreatorAgentContext | null;
  profileReplyContext?: ProfileReplyContext | null;
  groundingPacket: GroundingPacket;
  maxCharacterLimit?: number;
}

export interface PreparedReplyPromptPacket {
  messages: ChatCompletionMessageParam[];
  sourceContext: ReplySourceContext;
  groundingPacket: GroundingPacket;
  voiceTarget: VoiceTarget;
  visualContext: ReplyVisualContextSummary | null;
}

export interface GeneratedReplyDraftResult {
  draft: string;
  model: string;
  voiceTarget: VoiceTarget;
  sourceContext: ReplySourceContext;
  groundingPacket: GroundingPacket;
  visualContext: ReplyVisualContextSummary | null;
}
