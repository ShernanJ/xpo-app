import {
  computeContentDistribution,
  computeEngagementBaseline,
  computeGrowthStage,
  computeHookPatterns,
} from "./analysis";
import { resolveOnboardingDataSource } from "./sources/resolveOnboardingSource";
import type { OnboardingInput, OnboardingResult, StrategyState } from "./types";

function inferRecommendedPostsPerWeek(timeBudgetMinutes: number): number {
  if (timeBudgetMinutes <= 20) {
    return 3;
  }

  if (timeBudgetMinutes <= 45) {
    return 5;
  }

  return 7;
}

function buildStrategyState(
  growthStage: OnboardingResult["growthStage"],
  goal: OnboardingInput["goal"],
  timeBudgetMinutes: number,
): StrategyState {
  const recommendedPostsPerWeek = inferRecommendedPostsPerWeek(timeBudgetMinutes);

  if (growthStage === "0-1k") {
    return {
      growthStage,
      goal,
      recommendedPostsPerWeek,
      weights: {
        distribution: 0.65,
        authority: 0.3,
        leverage: 0.05,
      },
      rationale:
        "Prioritize distribution and pattern-testing to find repeatable traction loops.",
    };
  }

  if (growthStage === "1k-10k") {
    return {
      growthStage,
      goal,
      recommendedPostsPerWeek,
      weights: {
        distribution: 0.35,
        authority: 0.55,
        leverage: 0.1,
      },
      rationale:
        "Shift weight toward authority-building while maintaining consistent discovery reach.",
    };
  }

  return {
    growthStage,
    goal,
    recommendedPostsPerWeek,
    weights: {
      distribution: 0.2,
      authority: 0.45,
      leverage: 0.35,
    },
    rationale: "Focus on leverage loops while preserving core authority signals.",
  };
}

export async function runOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const dataSource = await resolveOnboardingDataSource(input);
  const { source, profile, posts, warnings } = dataSource;

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

  return {
    account: input.account,
    source,
    generatedAt: new Date().toISOString(),
    profile,
    recentPosts: posts,
    recentPostSampleCount: posts.length,
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
    ),
    warnings,
  };
}
