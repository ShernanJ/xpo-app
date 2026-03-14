import {
  analyzePostFeatures,
} from "./postAnalysis";
import type {
  ContentType,
  HookPattern,
  LengthBand,
  OnboardingResult,
  PerformanceBandInsight,
  PerformanceModel,
  PostFeatureSnapshot,
  XPublicPost,
} from "../types";

interface FeaturedPost {
  post: XPublicPost;
  features: PostFeatureSnapshot;
}

function toDeltaPercent(average: number, baseline: number): number {
  if (baseline <= 0) {
    return 0;
  }

  return Number((((average - baseline) / baseline) * 100).toFixed(2));
}

function computeInsightConfidence(count: number, totalPosts: number): number {
  if (totalPosts <= 0) {
    return 0;
  }

  const sampleShare = count / totalPosts;
  const coverageWeight = Math.min(1, count / Math.min(4, totalPosts));

  return Number(
    Math.max(10, Math.min(100, 20 + coverageWeight * 50 + sampleShare * 30)).toFixed(2),
  );
}

function isInsightReliable(count: number, totalPosts: number): boolean {
  if (totalPosts < 2) {
    return false;
  }

  const sampleShare = count / totalPosts;
  return count >= 2 && sampleShare >= 0.15;
}

function summarizeGroups(
  posts: FeaturedPost[],
  baselineAverageEngagement: number,
  keySelector: (post: FeaturedPost) => string,
): PerformanceBandInsight[] {
  const counters = new Map<string, { count: number; totalEngagement: number }>();

  for (const post of posts) {
    const key = keySelector(post);
    const current = counters.get(key) ?? { count: 0, totalEngagement: 0 };
    counters.set(key, {
      count: current.count + 1,
      totalEngagement: current.totalEngagement + post.features.engagementTotal,
    });
  }

  const totalPosts = posts.length;

  return Array.from(counters.entries())
    .map(([key, value]) => {
      const averageEngagement = Number(
        (value.totalEngagement / Math.max(1, value.count)).toFixed(2),
      );
      const sampleSharePercent = Number(((value.count / Math.max(1, totalPosts)) * 100).toFixed(2));
      const confidence = computeInsightConfidence(value.count, totalPosts);
      const reliable = isInsightReliable(value.count, totalPosts);

      return {
        key,
        count: value.count,
        sampleSharePercent,
        confidence,
        isReliable: reliable,
        averageEngagement,
        deltaVsBaselinePercent: toDeltaPercent(
          averageEngagement,
          baselineAverageEngagement,
        ),
      };
    })
    .sort((a, b) => b.averageEngagement - a.averageEngagement);
}

function getBestReliableInsight(
  insights: PerformanceBandInsight[],
): PerformanceBandInsight | null {
  return insights.find((insight) => insight.isReliable) ?? null;
}

function getWeakestReliableInsight(
  insights: PerformanceBandInsight[],
): PerformanceBandInsight | null {
  const reliable = insights.filter((insight) => insight.isReliable);
  if (reliable.length < 2) {
    return null;
  }

  return reliable.at(-1) ?? null;
}

function getLengthBand(text: string): LengthBand {
  const length = text.trim().length;
  if (length <= 120) {
    return "short";
  }

  if (length <= 220) {
    return "medium";
  }

  return "long";
}

function buildStrengths(
  topFormat: PerformanceBandInsight | null,
  topHook: PerformanceBandInsight | null,
): string[] {
  const strengths: string[] = [];

  if (topFormat && topFormat.deltaVsBaselinePercent > 0) {
    strengths.push(
      `${topFormat.key} posts are ${topFormat.deltaVsBaselinePercent}% above your baseline engagement.`,
    );
  }

  if (topHook && topHook.deltaVsBaselinePercent > 0) {
    strengths.push(
      `${topHook.key} hooks are currently your strongest opener pattern.`,
    );
  }

  if (strengths.length === 0) {
    strengths.push("No clear dominant pattern yet; continue pattern-testing.");
  }

  return strengths;
}

function buildWeaknesses(
  weakestFormat: PerformanceBandInsight | null,
  weakestHook: PerformanceBandInsight | null,
): string[] {
  const weaknesses: string[] = [];

  if (weakestFormat && weakestFormat.deltaVsBaselinePercent < 0) {
    weaknesses.push(
      `${weakestFormat.key} format is under baseline by ${Math.abs(
        weakestFormat.deltaVsBaselinePercent,
      )}%.`,
    );
  }

  if (weakestHook && weakestHook.deltaVsBaselinePercent < 0) {
    weaknesses.push(
      `${weakestHook.key} hooks are underperforming against your average post.`,
    );
  }

  if (weaknesses.length === 0) {
    weaknesses.push("No major structural weakness detected in current sample.");
  }

  return weaknesses;
}

function pickSaferActionContentType(params: {
  bestContentType: ContentType | null;
  formatInsights: PerformanceBandInsight[];
  growthGoal: OnboardingResult["strategyState"]["goal"];
}): ContentType | null {
  if (params.bestContentType !== "link_post") {
    return params.bestContentType;
  }

  if (params.growthGoal !== "followers") {
    return params.bestContentType;
  }

  const saferInsight = params.formatInsights.find(
    (insight) => insight.isReliable && insight.key !== "link_post",
  );

  return (saferInsight?.key ?? null) as ContentType | null;
}

function buildNextActions(params: {
  bestContentType: ContentType | null;
  weakestContentType: ContentType | null;
  bestHookPattern: HookPattern | null;
  recommendedLengthBand: LengthBand | null;
  formatInsights: PerformanceBandInsight[];
  growthGoal: OnboardingResult["strategyState"]["goal"];
}): string[] {
  const actions: string[] = [];
  const saferActionContentType = pickSaferActionContentType({
    bestContentType: params.bestContentType,
    formatInsights: params.formatInsights,
    growthGoal: params.growthGoal,
  });

  if (params.bestContentType === "link_post" && params.growthGoal === "followers") {
    if (saferActionContentType && saferActionContentType !== "link_post") {
      actions.push(
        `Favor native ${saferActionContentType} posts over link_post for follower growth. If you need the link, put it in the first reply after the post earns distribution.`,
      );
    } else {
      actions.push(
        "Do not default to link_post for follower growth. Publish the core idea natively first, then place the link in the first reply only if it adds value.",
      );
    }
  } else if (saferActionContentType) {
    actions.push(
      `Post 2-3 ${saferActionContentType} posts this week to exploit current edge.`,
    );
  }

  if (params.weakestContentType) {
    actions.push(
      `Reduce ${params.weakestContentType} usage until you test a stronger structure.`,
    );
  }

  if (params.bestHookPattern) {
    actions.push(`Use ${params.bestHookPattern} hook style in your next 3 posts.`);
  }

  if (params.recommendedLengthBand) {
    actions.push(
      `Draft within ${params.recommendedLengthBand} length band for the next batch.`,
    );
  }

  return actions.slice(0, 4);
}

export function buildPerformanceModel(params: {
  sourceRunId: string;
  onboarding: OnboardingResult;
}): PerformanceModel {
  const posts = params.onboarding.recentPosts ?? [];
  const featuredPosts = posts.map((post) => ({
    post,
    features: analyzePostFeatures(post),
  }));
  const baselineAverageEngagement = params.onboarding.baseline.averageEngagement;

  const formatInsights = summarizeGroups(featuredPosts, baselineAverageEngagement, (post) =>
    post.features.contentType,
  );
  const hookInsights = summarizeGroups(featuredPosts, baselineAverageEngagement, (post) =>
    post.features.hookPattern,
  );
  const lengthInsights = summarizeGroups(featuredPosts, baselineAverageEngagement, (post) =>
    getLengthBand(post.post.text),
  );
  const bestFormatInsight = getBestReliableInsight(formatInsights);
  const weakestFormatInsight = getWeakestReliableInsight(formatInsights);
  const bestHookInsight = getBestReliableInsight(hookInsights);
  const weakestHookInsight = getWeakestReliableInsight(hookInsights);
  const bestLengthInsight = getBestReliableInsight(lengthInsights);

  const bestContentType = (bestFormatInsight?.key ?? null) as ContentType | null;
  const weakestContentType = (weakestFormatInsight?.key ?? null) as ContentType | null;
  const bestHookPattern = (bestHookInsight?.key ?? null) as HookPattern | null;
  const recommendedLengthBand = (bestLengthInsight?.key ?? null) as LengthBand | null;

  const averageLength = posts.length
    ? Number(
        (
          posts.reduce((sum, post) => sum + post.text.trim().length, 0) / posts.length
        ).toFixed(2),
      )
    : 0;

  const conversationTriggerRate = posts.length
    ? Number(
        (
          (featuredPosts.filter(
            (post) => post.features.hasQuestion && post.post.metrics.replyCount > 0,
          ).length /
            featuredPosts.length) *
          100
        ).toFixed(2),
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    sourceRunId: params.sourceRunId,
    baselineAverageEngagement,
    bestContentType,
    bestContentTypeConfidence: bestFormatInsight?.confidence ?? null,
    weakestContentType,
    weakestContentTypeConfidence: weakestFormatInsight?.confidence ?? null,
    bestHookPattern,
    bestHookPatternConfidence: bestHookInsight?.confidence ?? null,
    conversationTriggerRate,
    formatInsights,
    hookInsights,
    lengthOptimization: {
      recommendedBand: recommendedLengthBand,
      recommendedBandConfidence: bestLengthInsight?.confidence ?? null,
      averageLength,
      bands: lengthInsights,
    },
    strengths: buildStrengths(bestFormatInsight, bestHookInsight),
    weaknesses: buildWeaknesses(weakestFormatInsight, weakestHookInsight),
    nextActions: buildNextActions({
      bestContentType,
      weakestContentType,
      bestHookPattern,
      recommendedLengthBand,
      formatInsights,
      growthGoal: params.onboarding.strategyState.goal,
    }),
  };
}
