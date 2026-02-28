import {
  computeContentDistribution,
  computeEngagementBaseline,
  computeGrowthStage,
  computeHookPatterns,
} from "./analysis";
import { resolveOnboardingDataSource } from "./sources/resolveOnboardingSource";
import type {
  AnalysisConfidence,
  OnboardingInput,
  OnboardingResult,
  StrategyState,
  TransformationMode,
  TransformationModeSource,
} from "./types";

function inferRecommendedPostsPerWeek(timeBudgetMinutes: number): number {
  if (timeBudgetMinutes <= 20) {
    return 3;
  }

  if (timeBudgetMinutes <= 45) {
    return 5;
  }

  return 7;
}

function buildAnalysisConfidence(sampleSize: number): AnalysisConfidence {
  const targetPostCount = 80;

  if (sampleSize < 10) {
    return {
      sampleSize,
      score: 20,
      band: "very_low",
      minimumViableReached: false,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount,
      message:
        "Very little post history was captured. The current read is mostly directional and should not drive strong strategy bets yet.",
    };
  }

  if (sampleSize < 20) {
    return {
      sampleSize,
      score: 40,
      band: "low",
      minimumViableReached: false,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount,
      message:
        "The sample is still thin. You can infer basic voice and topic signals, but performance recommendations should stay cautious.",
    };
  }

  if (sampleSize < 40) {
    return {
      sampleSize,
      score: 58,
      band: "low",
      minimumViableReached: true,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount,
      message:
        "This is enough for a minimum viable onboarding read, but deeper history would improve reliability.",
    };
  }

  if (sampleSize < targetPostCount) {
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
  transformationMode: TransformationMode,
  transformationModeSource: TransformationModeSource,
): StrategyState {
  const recommendedPostsPerWeek = inferRecommendedPostsPerWeek(timeBudgetMinutes);
  const transformationRationale =
    transformationMode === "preserve"
      ? "Preserve what already works and improve execution without disrupting audience expectations."
      : transformationMode === "pivot_soft"
        ? "Shift gradually into adjacent positioning while protecting existing audience trust."
        : transformationMode === "pivot_hard"
          ? "Accept short-term volatility while building a clearer new position."
          : null;

  if (growthStage === "0-1k") {
    return {
      growthStage,
      goal,
      transformationMode,
      transformationModeSource,
      recommendedPostsPerWeek,
      weights: {
        distribution: 0.65,
        authority: 0.3,
        leverage: 0.05,
      },
      rationale:
        transformationRationale ??
        "Prioritize distribution and pattern-testing to find repeatable traction loops.",
    };
  }

  if (growthStage === "1k-10k") {
    return {
      growthStage,
      goal,
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
  const dataSource = await resolveOnboardingDataSource(input);
  const { source, profile, posts, replyPosts, quotePosts, warnings } = dataSource;
  const analysisConfidence = buildAnalysisConfidence(posts.length);

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
    recentPosts: posts,
    recentReplyPosts: replyPosts,
    recentQuotePosts: quotePosts,
    recentPostSampleCount: posts.length,
    replyPostSampleCount: replyPosts.length,
    quotePostSampleCount: quotePosts.length,
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
      input.transformationMode ?? "optimize",
      input.transformationModeSource ?? "default",
    ),
    warnings: nextWarnings,
  };
}
