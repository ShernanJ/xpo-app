import {
  computeContentDistribution,
  computeEngagementBaseline,
  computeGrowthStage,
  computeHookPatterns,
} from "../analysis/postAnalysis";
import { resolveOnboardingDataSource } from "../sources/resolveOnboardingSource";
import type {
  AnalysisConfidence,
  OnboardingInput,
  OnboardingResult,
  OnboardingSyncState,
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  StrategyState,
  TransformationMode,
  TransformationModeSource,
} from "../contracts/types";

function getRecommendedTargetPostCount(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_TARGET);
  if (!Number.isFinite(raw)) {
    return 80;
  }

  return Math.max(40, Math.min(120, Math.floor(raw)));
}

function getPostingCapacityMaxPostsPerWeek(
  postingCadenceCapacity: PostingCadenceCapacity,
): number {
  if (postingCadenceCapacity === "3_per_week") {
    return 3;
  }

  if (postingCadenceCapacity === "1_per_day") {
    return 7;
  }

  return 14;
}

function inferRecommendedPostsPerWeek(
  timeBudgetMinutes: number,
  postingCadenceCapacity: PostingCadenceCapacity,
): number {
  let budgetRecommended = 7;

  if (timeBudgetMinutes <= 20) {
    budgetRecommended = 3;
  } else if (timeBudgetMinutes <= 45) {
    budgetRecommended = 5;
  }

  return Math.min(
    budgetRecommended,
    getPostingCapacityMaxPostsPerWeek(postingCadenceCapacity),
  );
}

function buildAnalysisConfidence(
  sampleSize: number,
  syncState?: OnboardingSyncState | null,
): AnalysisConfidence {
  const targetPostCount = getRecommendedTargetPostCount();
  const hasMoreHistory = syncState?.phase !== "complete";

  if (sampleSize < 10) {
    return {
      sampleSize,
      score: 20,
      band: "very_low",
      minimumViableReached: false,
      recommendedDepthReached: !hasMoreHistory,
      backgroundBackfillRecommended: hasMoreHistory,
      targetPostCount,
      message:
        hasMoreHistory
          ? "Very little post history was captured. The current read is mostly directional and should not drive strong strategy bets yet."
          : "Very little post history exists for this account, so the current read is directional by nature.",
    };
  }

  if (sampleSize < 20) {
    return {
      sampleSize,
      score: 40,
      band: "low",
      minimumViableReached: false,
      recommendedDepthReached: !hasMoreHistory,
      backgroundBackfillRecommended: hasMoreHistory,
      targetPostCount,
      message:
        hasMoreHistory
          ? "The sample is still thin. You can infer basic voice and topic signals, but performance recommendations should stay cautious."
          : "The sample is thin because this account has limited original-post history available.",
    };
  }

  if (sampleSize < 40) {
    return {
      sampleSize,
      score: 58,
      band: "low",
      minimumViableReached: true,
      recommendedDepthReached: !hasMoreHistory,
      backgroundBackfillRecommended: hasMoreHistory,
      targetPostCount,
      message:
        hasMoreHistory
          ? "This is enough for a minimum viable onboarding read, but deeper history would improve reliability."
          : "This is enough for a minimum viable onboarding read, and the available history has already been exhausted.",
    };
  }

  if (sampleSize < targetPostCount && hasMoreHistory) {
    return {
      sampleSize,
      score: 74,
      band: "usable",
      minimumViableReached: true,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount,
      message:
        "The current sample is strong enough for useful recommendations, but deeper pagination could still surface hidden winners.",
    };
  }

  return {
    sampleSize,
    score: 90,
    band: "strong",
    minimumViableReached: true,
    recommendedDepthReached: true,
    backgroundBackfillRecommended: false,
    targetPostCount,
    message:
      "The current sample depth is strong enough for a reliable first-pass model.",
  };
}

function buildStrategyState(
  growthStage: OnboardingResult["growthStage"],
  goal: OnboardingInput["goal"],
  timeBudgetMinutes: number,
  postingCadenceCapacity: PostingCadenceCapacity,
  replyBudgetPerDay: ReplyBudgetPerDay,
  transformationMode: TransformationMode,
  transformationModeSource: TransformationModeSource,
): StrategyState {
  const recommendedPostsPerWeek = inferRecommendedPostsPerWeek(
    timeBudgetMinutes,
    postingCadenceCapacity,
  );
  const transformationRationale =
    transformationMode === "preserve"
      ? "Preserve what already works and improve execution without disrupting audience expectations."
      : transformationMode === "pivot_soft"
        ? "Shift gradually into adjacent positioning while protecting existing audience trust."
        : transformationMode === "pivot_hard"
          ? "Accept short-term volatility while building a clearer new position."
          : null;

  if (growthStage === "0-1k") {
    const lowReplyCapacity = replyBudgetPerDay === "0_5";
    const highReplyCapacity = replyBudgetPerDay === "15_30";

    return {
      growthStage,
      goal,
      postingCadenceCapacity,
      replyBudgetPerDay,
      transformationMode,
      transformationModeSource,
      recommendedPostsPerWeek,
      weights: {
        distribution: lowReplyCapacity ? 0.55 : highReplyCapacity ? 0.7 : 0.65,
        authority: lowReplyCapacity ? 0.4 : highReplyCapacity ? 0.25 : 0.3,
        leverage: 0.05,
      },
      rationale:
        transformationRationale ??
        lowReplyCapacity
        ? "Prioritize higher-quality standalone distribution because reply capacity is limited."
        : highReplyCapacity
          ? "Prioritize distribution and a structured reply habit to compound early traction loops."
          : "Prioritize distribution and pattern-testing to find repeatable traction loops.",
    };
  }

  if (growthStage === "1k-10k") {
    return {
      growthStage,
      goal,
      postingCadenceCapacity,
      replyBudgetPerDay,
      transformationMode,
      transformationModeSource,
      recommendedPostsPerWeek,
      weights: {
        distribution: 0.35,
        authority: 0.55,
        leverage: 0.1,
      },
      rationale:
        transformationRationale ??
        "Shift weight toward authority-building while maintaining consistent discovery reach.",
    };
  }

  return {
    growthStage,
    goal,
    postingCadenceCapacity,
    replyBudgetPerDay,
    transformationMode,
    transformationModeSource,
    recommendedPostsPerWeek,
    weights: {
      distribution: 0.2,
      authority: 0.45,
      leverage: 0.35,
    },
    rationale:
      transformationRationale ??
      "Focus on leverage loops while preserving core authority signals.",
  };
}

export async function runOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const postingCadenceCapacity = input.postingCadenceCapacity ?? "1_per_day";
  const replyBudgetPerDay = input.replyBudgetPerDay ?? "5_15";
  const dataSource = await resolveOnboardingDataSource(input);
  const {
    source,
    profile,
    pinnedPost,
    posts,
    replyPosts,
    quotePosts,
    capturedPostCount,
    capturedReplyPostCount,
    capturedQuotePostCount,
    syncState,
    warnings,
  } = dataSource;

  if (source === "mock") {
    throw new Error(
      warnings[0] ??
        "Mock onboarding data is disabled. Configure a real scrape source and retry.",
    );
  }

  const analysisConfidence = buildAnalysisConfidence(posts.length, syncState);

  const baseline = computeEngagementBaseline(posts, profile.followersCount);
  const growthStage = computeGrowthStage(
    profile.followersCount,
    baseline.engagementRate,
  );
  const contentDistribution = computeContentDistribution(posts);
  const hookPatterns = computeHookPatterns(posts);

  const rankedByEngagement = [...contentDistribution].sort(
    (a, b) => b.averageEngagement - a.averageEngagement,
  );

  const bestFormats = rankedByEngagement.slice(0, 2);
  const underperformingFormats = [...rankedByEngagement]
    .reverse()
    .slice(0, 2);
  const nextWarnings = [...warnings];

  if (!analysisConfidence.minimumViableReached) {
    nextWarnings.push(
      `Low-confidence analysis: only ${posts.length} usable posts were captured.`,
    );
  } else if (analysisConfidence.backgroundBackfillRecommended) {
    nextWarnings.push(
      `The current read is usable, but a deeper backfill toward ~${analysisConfidence.targetPostCount} posts would improve reliability.`,
    );
  }

  return {
    account: input.account,
    source,
    generatedAt: new Date().toISOString(),
    profile,
    pinnedPost: pinnedPost ?? null,
    recentPosts: posts,
    recentReplyPosts: replyPosts,
    recentQuotePosts: quotePosts,
    recentPostSampleCount: posts.length,
    replyPostSampleCount: replyPosts.length,
    quotePostSampleCount: quotePosts.length,
    capturedPostCount,
    capturedReplyPostCount,
    capturedQuotePostCount,
    totalCapturedActivityCount:
      capturedPostCount + capturedReplyPostCount + capturedQuotePostCount,
    analysisConfidence,
    baseline,
    growthStage,
    contentDistribution,
    hookPatterns,
    bestFormats,
    underperformingFormats,
    strategyState: buildStrategyState(
      growthStage,
      input.goal,
      input.timeBudgetMinutes,
      postingCadenceCapacity,
      replyBudgetPerDay,
      input.transformationMode ?? "optimize",
      input.transformationModeSource ?? "default",
    ),
    warnings: nextWarnings,
    syncState,
  };
}
