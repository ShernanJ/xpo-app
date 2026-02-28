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
  forceMock?: boolean;
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
  recommendedPostsPerWeek: number;
  weights: StrategyWeights;
  rationale: string;
}

export interface OnboardingResult {
  account: string;
  source: "mock" | "x_api" | "scrape";
  generatedAt: string;
  profile: XPublicProfile;
  recentPosts: XPublicPost[];
  recentPostSampleCount: number;
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
  deltaVsBaselinePercent: number;
}

export interface LengthOptimizationInsight {
  recommendedBand: LengthBand | null;
  averageLength: number;
  bands: PerformanceBandInsight[];
}

export interface PerformanceModel {
  generatedAt: string;
  sourceRunId: string;
  baselineAverageEngagement: number;
  bestContentType: ContentType | null;
  weakestContentType: ContentType | null;
  bestHookPattern: HookPattern | null;
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

export type AudienceBreadth = "broad" | "mixed" | "narrow";

export interface TopicSignal {
  label: string;
  count: number;
  percentage: number;
  averageEngagement: number;
  score: number;
  specificity: TopicSpecificity;
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

export interface CreatorStrategyProfile {
  primaryGoal: UserGoal;
  archetype: CreatorArchetype;
  currentStrengths: string[];
  currentWeaknesses: string[];
  recommendedAngles: string[];
  nextMoves: string[];
  rationale: string;
}

export interface CreatorProfile {
  generatedAt: string;
  sourceRunId: string;
  identity: CreatorIdentityProfile;
  voice: CreatorVoiceProfile;
  topics: CreatorTopicProfile;
  performance: CreatorPerformanceProfile;
  archetype: CreatorArchetype;
  strategy: CreatorStrategyProfile;
}
