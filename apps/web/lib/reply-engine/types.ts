import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { VoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type { ReplyContextCard } from "../agent-v2/core/replyContextExtractor.ts";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../agent-v2/grounding/groundingPacket.ts";
import type { ProfileReplyContext } from "../agent-v2/grounding/profileReplyContext.ts";
import type { ReplyInsights } from "../extension/replyOpportunities.ts";
import type {
  ExtensionOpportunityPostType,
  ExtensionReplyIntentMetadata,
  ExtensionReplyMode,
  ExtensionReplyTone,
  ReplyImageArtifactType,
  ReplyDraftImageRole,
  ReplyDraftImageSceneType,
  ReplyDraftPreflightResult,
  SourceInterpretation,
} from "../extension/types.ts";
import type { CreatorAgentContext } from "../onboarding/strategy/agentContext.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

export interface ReplySourcePost {
  id: string;
  url: string | null;
  text: string;
  authorHandle: string | null;
  authorDisplayName?: string | null;
  postType: ExtensionOpportunityPostType;
}

export interface ReplySourceQuotedPost {
  id: string | null;
  url: string | null;
  text: string;
  authorHandle: string | null;
  authorDisplayName?: string | null;
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
  brandSignals: string[];
  absurdityMarkers: string[];
  artifactTargetHint: string;
  imageCount: number;
  sceneType: ReplyDraftImageSceneType;
  imageArtifactType: ReplyImageArtifactType;
  imageRole: ReplyDraftImageRole;
  imageReplyAnchor: string;
  shouldReferenceImageText: boolean;
  replyRelevance: string;
  images: Array<{
    imageUrl: string | null;
    source: "vision" | "alt_text";
    sceneType: ReplyDraftImageSceneType;
    imageRole: ReplyDraftImageRole;
    primarySubject: string;
    setting: string;
    lightingAndMood: string;
    readableText: string;
    keyDetails: string[];
    brandSignals: string[];
    absurdityMarkers: string[];
    artifactTargetHint: string;
    imageArtifactType: ReplyImageArtifactType;
    jokeAnchor: string;
    replyRelevance: string;
  }>;
  summaryLines: string[];
}

export type ReplyExternalClaimType =
  | "product_capability"
  | "policy_or_rule"
  | "market_or_company_fact"
  | "person_or_role_fact"
  | "numeric_or_current_state";

export type ReplyClaimEvidenceSource = "source_local" | "cache" | "live_web" | "heuristic";

export type ReplyClaimVerificationOutcome =
  | "not_needed"
  | "supported"
  | "contradicted"
  | "unverified"
  | "rewritten"
  | "rejected";

export interface ReplyExtractedClaim {
  text: string;
  type: ReplyExternalClaimType;
  query: string;
  needsVerification: boolean;
  outcome?: Exclude<ReplyClaimVerificationOutcome, "not_needed" | "rewritten" | "rejected">;
}

export interface ReplyClaimEvidence {
  source: ReplyClaimEvidenceSource;
  summary: string;
  url?: string | null;
}

export interface ClaimVerificationResult {
  outcome: ReplyClaimVerificationOutcome;
  draft: string;
  claims: ReplyExtractedClaim[];
  evidence: ReplyClaimEvidence[];
  usedLiveLookup: boolean;
}

export interface ReplyGoldenExample {
  text: string;
  source: "golden_example" | "fallback_anchor";
  replyMode: ExtensionReplyMode;
}

export interface ReplyVoiceRetrievalContext {
  userId: string;
  xHandle: string;
}

export interface ReplyVoiceEvidence {
  targetLane: "reply" | "quote";
  draftPreference: "voice_first";
  formatPreference: "shortform";
  laneMatchedAnchors: string[];
  fallbackAnchors: string[];
  antiPatterns: string[];
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
  replyContext?: ReplyContextCard | null;
  maxCharacterLimit?: number;
  retrievalContext?: ReplyVoiceRetrievalContext | null;
  userHandle?: string | null;
}

export interface PreparedReplyPromptPacket {
  messages: ChatCompletionMessageParam[];
  sourceContext: ReplySourceContext;
  groundingPacket: GroundingPacket;
  replyContext: ReplyContextCard | null;
  voiceTarget: VoiceTarget;
  visualContext: ReplyVisualContextSummary | null;
  interpretation: SourceInterpretation;
  voiceEvidence: ReplyVoiceEvidence;
  styleCard: VoiceStyleCard | null;
  maxCharacterLimit: number;
  preflightResult: ReplyDraftPreflightResult;
  goldenExamples: ReplyGoldenExample[];
}

export interface GeneratedReplyDraftResult {
  draft: string;
  model: string;
  voiceTarget: VoiceTarget;
  sourceContext: ReplySourceContext;
  groundingPacket: GroundingPacket;
  visualContext: ReplyVisualContextSummary | null;
  interpretation?: SourceInterpretation;
  claimVerification?: ClaimVerificationResult | null;
}
