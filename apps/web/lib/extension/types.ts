export type ExtensionReplyStage =
  | "0_to_1k"
  | "1k_to_10k"
  | "10k_to_50k"
  | "50k_plus";

export type ExtensionReplyTone = "dry" | "bold" | "builder" | "warm";

export type ExtensionReplyOptionLabel = "safe" | "bold";

export interface ExtensionReplyIntentMetadata {
  label: ExtensionSuggestedAngle;
  strategyPillar: string;
  anchor: string;
  rationale: string;
}

export interface ExtensionReplyDraftRequest {
  tweetId: string;
  tweetText: string;
  authorHandle: string;
  tweetUrl: string;
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

export interface ExtensionOpportunityBatchResponse {
  opportunities: ExtensionOpportunity[];
  notes: string[];
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
  copiedReplyId?: string | null;
  copiedReplyLabel?: ExtensionSuggestedAngle | null;
  copiedReplyText?: string | null;
}
