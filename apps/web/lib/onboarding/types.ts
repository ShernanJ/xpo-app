export type UserGoal = "followers" | "leads" | "authority";

export type ToneCasing = "lowercase" | "normal";

export type ToneRisk = "safe" | "bold";

export type GrowthStage = "0-1k" | "1k-10k" | "10k+";

export type ContentType =
  | "single_line"
  | "multi_line"
  | "list_post"
  | "question_post"
  | "link_post";

export type HookPattern =
  | "question_open"
  | "numeric_open"
  | "how_to_open"
  | "hot_take_open"
  | "story_open"
  | "statement_open";

export interface TonePreference {
  casing: ToneCasing;
  risk: ToneRisk;
}

export interface OnboardingInput {
  account: string;
  goal: UserGoal;
  timeBudgetMinutes: number;
  tone: TonePreference;
  transformationMode?: TransformationMode;
  transformationModeSource?: TransformationModeSource;
  scrapeFreshness?: ScrapeFreshnessMode;
  forceMock?: boolean;
  forceFreshScrape?: boolean;
}

export interface XPublicProfile {
  username: string;
  name: string;
  bio: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  followersCount: number;
  followingCount: number;
  createdAt: string;
}

export interface XPostMetrics {
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
}

export interface XPublicPost {
  id: string;
  text: string;
  createdAt: string;
  metrics: XPostMetrics;
}

export interface EngagementBaseline {
  averageEngagement: number;
  medianEngagement: number;
  engagementRate: number;
  postingCadencePerWeek: number;
  averagePostLength: number;
}

export interface ContentDistributionItem {
  type: ContentType;
  count: number;
  percentage: number;
  averageEngagement: number;
}

export interface HookPatternItem {
  pattern: HookPattern;
  count: number;
  percentage: number;
  averageEngagement: number;
}

export interface StrategyWeights {
  distribution: number;
  authority: number;
  leverage: number;
}

export interface StrategyState {
  growthStage: GrowthStage;
  goal: UserGoal;
  transformationMode: TransformationMode;
  transformationModeSource: TransformationModeSource;
  recommendedPostsPerWeek: number;
  weights: StrategyWeights;
  rationale: string;
}

export type AnalysisConfidenceBand =
  | "very_low"
  | "low"
  | "usable"
  | "strong";

export interface AnalysisConfidence {
  sampleSize: number;
  score: number;
  band: AnalysisConfidenceBand;
  minimumViableReached: boolean;
  recommendedDepthReached: boolean;
  backgroundBackfillRecommended: boolean;
  targetPostCount: number;
  message: string;
}

export interface OnboardingResult {
  account: string;
  source: "mock" | "x_api" | "scrape";
  generatedAt: string;
  profile: XPublicProfile;
  recentPosts: XPublicPost[];
  recentReplyPosts: XPublicPost[];
  recentQuotePosts: XPublicPost[];
  recentPostSampleCount: number;
  replyPostSampleCount: number;
  quotePostSampleCount: number;
  capturedPostCount: number;
  capturedReplyPostCount: number;
  capturedQuotePostCount: number;
  totalCapturedActivityCount: number;
  analysisConfidence: AnalysisConfidence;
  baseline: EngagementBaseline;
  growthStage: GrowthStage;
  contentDistribution: ContentDistributionItem[];
  hookPatterns: HookPatternItem[];
  bestFormats: ContentDistributionItem[];
  underperformingFormats: ContentDistributionItem[];
  strategyState: StrategyState;
  warnings: string[];
}

export type LengthBand = "short" | "medium" | "long";

export interface PerformanceBandInsight {
  key: string;
  averageEngagement: number;
  count: number;
  sampleSharePercent: number;
  confidence: number;
  isReliable: boolean;
  deltaVsBaselinePercent: number;
}

export interface LengthOptimizationInsight {
  recommendedBand: LengthBand | null;
  recommendedBandConfidence: number | null;
  averageLength: number;
  bands: PerformanceBandInsight[];
}

export interface PerformanceModel {
  generatedAt: string;
  sourceRunId: string;
  baselineAverageEngagement: number;
  bestContentType: ContentType | null;
  bestContentTypeConfidence: number | null;
  weakestContentType: ContentType | null;
  weakestContentTypeConfidence: number | null;
  bestHookPattern: HookPattern | null;
  bestHookPatternConfidence: number | null;
  conversationTriggerRate: number;
  formatInsights: PerformanceBandInsight[];
  hookInsights: PerformanceBandInsight[];
  lengthOptimization: LengthOptimizationInsight;
  strengths: string[];
  weaknesses: string[];
  nextActions: string[];
}

export type CreatorArchetype =
  | "builder"
  | "founder_operator"
  | "job_seeker"
  | "educator"
  | "curator"
  | "social_operator"
  | "hybrid";

export type TopicSpecificity = "broad" | "niche" | "local_scene";

export type TopicStability = "emerging" | "steady" | "fading";

export type AudienceBreadth = "broad" | "mixed" | "narrow";

export type DependenceLevel = "low" | "moderate" | "high";

export type DeliveryStyle = "standalone" | "mixed" | "reply_led";

export type DistributionLoopType =
  | "reply_driven"
  | "standalone_discovery"
  | "quote_commentary"
  | "profile_conversion"
  | "authority_building";

export type ReplyTone =
  | "supportive"
  | "playful"
  | "inquisitive"
  | "insightful"
  | "direct";

export type ReplyStyle =
  | "one_liner"
  | "question"
  | "agreement"
  | "insight_add_on";

export type TransformationMode =
  | "preserve"
  | "optimize"
  | "pivot_soft"
  | "pivot_hard";

export type TransformationModeSource = "default" | "user_selected";

export type ScrapeFreshnessMode = "always" | "if_stale" | "cache_only";

export interface TopicSignal {
  label: string;
  count: number;
  percentage: number;
  recentSharePercent: number;
  averageEngagement: number;
  score: number;
  specificity: TopicSpecificity;
  stability: TopicStability;
}

export interface CreatorIdentityProfile {
  username: string;
  displayName: string;
  followersCount: number;
  followingCount: number;
  followerBand: GrowthStage;
  isVerified: boolean;
  accountAgeDays: number;
}

export interface CreatorVoiceProfile {
  primaryCasing: ToneCasing;
  averageLengthBand: LengthBand | null;
  lowercaseSharePercent: number;
  questionPostRate: number;
  multiLinePostRate: number;
  emojiPostRate: number;
  dominantContentType: ContentType | null;
  dominantHookPattern: HookPattern | null;
  styleNotes: string[];
}

export interface CreatorTopicProfile {
  dominantTopics: TopicSignal[];
  contentPillars: string[];
  audienceSignals: string[];
  audienceBreadth: AudienceBreadth;
  specificityTradeoff: string;
}

export interface CreatorPerformanceProfile {
  baselineAverageEngagement: number;
  medianEngagement: number;
  engagementRate: number;
  postingCadencePerWeek: number;
  bestContentType: ContentType | null;
  weakestContentType: ContentType | null;
  bestHookPattern: HookPattern | null;
  recommendedLengthBand: LengthBand | null;
  recommendedPostsPerWeek: number;
}

export interface CreatorExecutionProfile {
  linkUsageRate: number;
  mentionUsageRate: number;
  ctaUsageRate: number;
  replyStyleRate: number;
  standaloneStyleRate: number;
  linkDependence: DependenceLevel;
  mentionDependence: DependenceLevel;
  ctaIntensity: DependenceLevel;
  deliveryStyle: DeliveryStyle;
  distributionNotes: string[];
}

export interface CreatorDistributionLoopProfile {
  primaryLoop: DistributionLoopType;
  secondaryLoop: DistributionLoopType | null;
  confidence: number;
  signals: string[];
  rationale: string;
}

export interface ReplyStyleMixItem {
  style: ReplyStyle;
  count: number;
  percentage: number;
}

export interface CreatorReplyProfile {
  replyCount: number;
  replyShareOfCapturedActivity: number;
  signalConfidence: number;
  isReliable: boolean;
  averageReplyEngagement: number;
  replyEngagementDeltaVsOriginalPercent: number | null;
  averageReplyLengthBand: LengthBand | null;
  dominantReplyTone: ReplyTone | null;
  dominantReplyStyle: ReplyStyle | null;
  replyStyleMix: ReplyStyleMixItem[];
  replyUsageNote: string;
}

export interface CreatorQuoteProfile {
  quoteCount: number;
  quoteShareOfCapturedActivity: number;
  signalConfidence: number;
  isReliable: boolean;
  averageQuoteEngagement: number;
  quoteEngagementDeltaVsOriginalPercent: number | null;
  averageQuoteLengthBand: LengthBand | null;
  dominantQuotePattern: HookPattern | null;
  quoteUsageNote: string;
}

export interface CreatorCurrentStateProfile {
  followerBand: GrowthStage;
  primaryArchetype: CreatorArchetype;
  secondaryArchetype: CreatorArchetype | null;
  audienceBreadth: AudienceBreadth;
}

export interface CreatorTargetStateProfile {
  targetPrimaryArchetype: CreatorArchetype;
  targetAudienceBreadth: AudienceBreadth | "same";
  planningNote: string;
}

export type CreatorStrategyDeltaDirection =
  | "increase"
  | "decrease"
  | "protect"
  | "shift";

export type CreatorStrategyDeltaPriority = "high" | "medium" | "low";

export interface CreatorStrategyDeltaItem {
  area:
    | "audience_breadth"
    | "topic_specificity"
    | "standalone_posts"
    | "reply_activity"
    | "quote_activity"
    | "link_dependence"
    | "mention_dependence";
  direction: CreatorStrategyDeltaDirection;
  priority: CreatorStrategyDeltaPriority;
  note: string;
}

export interface CreatorStrategyDeltaProfile {
  primaryGap: string;
  preserveTraits: string[];
  shiftTraits: string[];
  adjustments: CreatorStrategyDeltaItem[];
}

export interface CreatorStrategyProfile {
  primaryGoal: UserGoal;
  archetype: CreatorArchetype;
  transformationMode: TransformationMode;
  transformationModeSource: TransformationModeSource;
  currentState: CreatorCurrentStateProfile;
  targetState: CreatorTargetStateProfile;
  delta: CreatorStrategyDeltaProfile;
  currentStrengths: string[];
  currentWeaknesses: string[];
  recommendedAngles: string[];
  nextMoves: string[];
  rationale: string;
}

export interface PostFeatureSnapshot {
  contentType: ContentType;
  hookPattern: HookPattern;
  engagementTotal: number;
  hasLinks: boolean;
  linkCount: number;
  hasMentions: boolean;
  mentionCount: number;
  hasQuestion: boolean;
  hasNumbers: boolean;
  hasCta: boolean;
  lineCount: number;
  wordCount: number;
  emojiCount: number;
  isReply: boolean;
  entityCandidates: string[];
}

export type CreatorContentLane = "original" | "reply" | "quote";

export interface CreatorRepresentativePost {
  id: string;
  lane: CreatorContentLane;
  text: string;
  createdAt: string;
  engagementTotal: number;
  deltaVsBaselinePercent: number;
  goalFitScore: number;
  contentType: ContentType;
  hookPattern: HookPattern;
  features: PostFeatureSnapshot;
  selectionReason: string;
}

export interface CreatorRepresentativeExamples {
  bestPerforming: CreatorRepresentativePost[];
  voiceAnchors: CreatorRepresentativePost[];
  strategyAnchors: CreatorRepresentativePost[];
  goalAnchors: CreatorRepresentativePost[];
  goalConflictExamples: CreatorRepresentativePost[];
  cautionExamples: CreatorRepresentativePost[];
}

export interface CreatorProfile {
  generatedAt: string;
  sourceRunId: string;
  identity: CreatorIdentityProfile;
  voice: CreatorVoiceProfile;
  topics: CreatorTopicProfile;
  performance: CreatorPerformanceProfile;
  execution: CreatorExecutionProfile;
  distribution: CreatorDistributionLoopProfile;
  reply: CreatorReplyProfile;
  quote: CreatorQuoteProfile;
  archetype: CreatorArchetype;
  secondaryArchetype: CreatorArchetype | null;
  archetypeConfidence: number;
  examples: CreatorRepresentativeExamples;
  strategy: CreatorStrategyProfile;
}
