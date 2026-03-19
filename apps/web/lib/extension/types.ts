export type ExtensionReplyStage =
  | "0_to_1k"
  | "1k_to_10k"
  | "10k_to_50k"
  | "50k_plus";

export type ExtensionReplyTone = "dry" | "bold" | "builder" | "warm" | "playful";

export type ExtensionReplyOptionLabel = "safe" | "bold";

export type ExtensionReplyMode =
  | "joke_riff"
  | "agree_and_amplify"
  | "contrarian_pushback"
  | "insightful_add_on"
  | "empathetic_support";

export type ReplyDraftImageRole =
  | "none"
  | "punchline"
  | "proof"
  | "reaction"
  | "context"
  | "decorative";

export type ReplyDraftImageSceneType =
  | "screenshot"
  | "meme"
  | "product_ui"
  | "photo"
  | "mixed"
  | "unknown";

export type ReplyDraftSourceShape =
  | "strategic_take"
  | "casual_observation"
  | "joke_setup"
  | "emotional_update";

export interface ExtensionReplyQuotedPost {
  tweetId?: string | null;
  tweetText: string;
  authorHandle?: string | null;
  tweetUrl?: string | null;
}

export interface ExtensionReplyMediaImage {
  imageUrl?: string | null;
  imageDataUrl?: string | null;
  altText?: string | null;
}

export interface ExtensionReplyMediaContext {
  images: ExtensionReplyMediaImage[];
  hasVideo: boolean;
  hasGif: boolean;
  hasLink: boolean;
}

export interface ExtensionReplyConversationContext {
  inReplyToPostId?: string | null;
  inReplyToHandle?: string | null;
}

export interface ExtensionReplyIntentMetadata {
  label: ExtensionSuggestedAngle;
  strategyPillar: string;
  anchor: string;
  rationale: string;
}

export interface ReplyDraftPreflightResult {
  op_tone: string;
  post_intent: string;
  recommended_reply_mode: ExtensionReplyMode;
  source_shape: ReplyDraftSourceShape;
  image_role: ReplyDraftImageRole;
  image_reply_anchor: string;
  should_reference_image_text: boolean;
}

export interface ExtensionObservedReplyMetrics {
  likeCount: number;
  replyCount: number;
  profileClicks?: number;
  followerDelta?: number;
}

export interface ExtensionReplyDraftRequest {
  tweetId: string;
  tweetText: string;
  authorHandle: string;
  tweetUrl: string;
  postType?: ExtensionOpportunityPostType | null;
  quotedPost?: ExtensionReplyQuotedPost | null;
  imageUrls?: string[] | null;
  media?: ExtensionReplyMediaContext | null;
  conversation?: ExtensionReplyConversationContext | null;
  stage: ExtensionReplyStage;
  tone: ExtensionReplyTone;
  goal: string;
  heuristicScore?: number | null;
  heuristicTier?: string | null;
}

export interface ExtensionReplyOption {
  id: string;
  label: ExtensionReplyOptionLabel;
  text: string;
  intent?: ExtensionReplyIntentMetadata;
}

export interface ExtensionReplyDraftResponse {
  options: ExtensionReplyOption[];
  notes?: string[];
}

export type ReplyOpportunityLifecycleEvent =
  | "ranked"
  | "opened"
  | "generated"
  | "selected"
  | "copied"
  | "posted"
  | "dismissed"
  | "observed";

export type ExtensionOpportunitySurface =
  | "home"
  | "search"
  | "thread"
  | "list"
  | "profile"
  | "unknown";

export type ExtensionOpportunityPostType =
  | "original"
  | "reply"
  | "quote"
  | "repost"
  | "unknown";

export type ExtensionOpportunityCaptureSource = "graphql" | "dom";

export type ExtensionOpportunityVerdict = "reply" | "watch" | "dont_reply";

export type ExtensionSuggestedAngle =
  | "nuance"
  | "sharpen"
  | "disagree"
  | "example"
  | "translate"
  | "known_for";

export type ExtensionExpectedValueLevel = "low" | "medium" | "high";

export interface ExtensionOpportunityAuthor {
  id: string | null;
  handle: string;
  name: string | null;
  verified: boolean;
  followerCount: number;
}

export interface ExtensionOpportunityEngagement {
  replyCount: number;
  repostCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
}

export interface ExtensionOpportunityConversation {
  conversationId: string | null;
  inReplyToPostId: string | null;
  inReplyToHandle: string | null;
}

export interface ExtensionOpportunityMedia {
  hasMedia: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  hasGif: boolean;
  hasLink: boolean;
  hasPoll: boolean;
  images?: ExtensionReplyMediaImage[];
}

export interface ExtensionOpportunityCandidate {
  postId: string;
  author: ExtensionOpportunityAuthor;
  text: string;
  url: string;
  createdAtIso: string | null;
  engagement: ExtensionOpportunityEngagement;
  postType: ExtensionOpportunityPostType;
  conversation: ExtensionOpportunityConversation;
  media: ExtensionOpportunityMedia;
  surface: ExtensionOpportunitySurface;
  captureSource: ExtensionOpportunityCaptureSource;
  capturedAtIso: string;
}

export interface ExtensionOpportunityExpectedValue {
  visibility: ExtensionExpectedValueLevel;
  profileClicks: ExtensionExpectedValueLevel;
  followConversion: ExtensionExpectedValueLevel;
}

export interface ExtensionOpportunityScoringBreakdown {
  niche_match: number;
  audience_fit: number;
  freshness: number;
  conversation_quality: number;
  profile_click_potential: number;
  follow_conversion_potential: number;
  visibility_potential: number;
  spam_risk: number;
  off_niche_risk: number;
  genericity_risk: number;
  negative_signal_risk: number;
}

export interface ExtensionOpportunity {
  opportunityId: string;
  postId: string;
  score: number;
  verdict: ExtensionOpportunityVerdict;
  why: string[];
  riskFlags: string[];
  suggestedAngle: ExtensionSuggestedAngle;
  expectedValue: ExtensionOpportunityExpectedValue;
  scoringBreakdown: ExtensionOpportunityScoringBreakdown;
}

export interface ExtensionOpportunityBatchRequest {
  pageUrl: string;
  surface: ExtensionOpportunitySurface;
  candidates: ExtensionOpportunityCandidate[];
}

export interface ExtensionOpportunityBatchScore {
  tweetId: string;
  opportunityScore: number;
  reason: string;
}

export interface ExtensionOpportunityBatchResponse {
  scores: ExtensionOpportunityBatchScore[];
}

export interface ExtensionReplyOptionsRequest {
  opportunityId: string;
  post: ExtensionOpportunityCandidate;
  opportunity: ExtensionOpportunity;
}

export interface ExtensionReplyOptionChoice {
  id: string;
  label: ExtensionSuggestedAngle;
  text: string;
  intent?: ExtensionReplyIntentMetadata;
}

export interface ExtensionReplyOptionsResponse {
  options: ExtensionReplyOptionChoice[];
  warnings: string[];
  groundingNotes: string[];
}

export interface ExtensionReplyLogRequest {
  event: ReplyOpportunityLifecycleEvent;
  opportunityId?: string | null;
  postId: string;
  postText: string;
  postUrl: string;
  authorHandle: string;
  surface: ExtensionOpportunitySurface;
  verdict?: ExtensionOpportunityVerdict | null;
  angle?: ExtensionSuggestedAngle | null;
  expectedValue?: ExtensionOpportunityExpectedValue | null;
  riskFlags?: string[] | null;
  source?: string | null;
  generatedReplyIds?: string[] | null;
  generatedReplyLabels?: ExtensionSuggestedAngle[] | null;
  generatedReplyIntents?: ExtensionReplyIntentMetadata[] | null;
  copiedReplyId?: string | null;
  copiedReplyLabel?: ExtensionSuggestedAngle | null;
  copiedReplyText?: string | null;
  copiedReplyIntent?: ExtensionReplyIntentMetadata | null;
  observedMetrics?: ExtensionObservedReplyMetrics | null;
  originalDraft?: string | null;
  finalPostedText?: string | null;
  replyMode?: ExtensionReplyMode | null;
}

export interface ExtensionReplyEditLogRequest {
  originalDraft: string;
  finalPostedText: string;
  replyMode: ExtensionReplyMode;
}

export interface ExtensionDraftFolder {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface ExtensionDraft {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  status: "DRAFT";
  reviewStatus: string;
  folder: ExtensionDraftFolder | null;
  artifact: {
    id: string;
    title: string;
    kind: string;
    content: string;
    posts: Array<{
      id: string;
      content: string;
      weightedCharacterCount: number;
      maxCharacterLimit: number;
      isWithinXLimit: boolean;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionDraftsResponse {
  drafts: ExtensionDraft[];
}

export interface ExtensionDraftPublishRequest {
  publishedTweetId?: string | null;
}
