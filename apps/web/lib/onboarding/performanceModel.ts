import {
  classifyContentType,
  computePostEngagement,
  detectHookPattern,
} from "./analysis";
import type {
  ContentType,
  HookPattern,
  LengthBand,
  OnboardingResult,
  PerformanceBandInsight,
  PerformanceModel,
  XPublicPost,
} from "./types";

function toDeltaPercent(average: number, baseline: number): number {
  if (baseline <= 0) {
    return 0;
  }

  return Number((((average - baseline) / baseline) * 100).toFixed(2));
}

function summarizeGroups(
  posts: XPublicPost[],
  baselineAverageEngagement: number,
  keySelector: (post: XPublicPost) => string,
): PerformanceBandInsight[] {
  const counters = new Map<string, { count: number; totalEngagement: number }>();

  for (const post of posts) {
    const key = keySelector(post);
    const current = counters.get(key) ?? { count: 0, totalEngagement: 0 };
    counters.set(key, {
      count: current.count + 1,
      totalEngagement: current.totalEngagement + computePostEngagement(post),
    });
  }

  return Array.from(counters.entries())
    .map(([key, value]) => {
      const averageEngagement = Number(
        (value.totalEngagement / Math.max(1, value.count)).toFixed(2),
      );
      return {
        key,
        count: value.count,
        averageEngagement,
        deltaVsBaselinePercent: toDeltaPercent(
          averageEngagement,
          baselineAverageEngagement,
        ),
      };
    })
    .sort((a, b) => b.averageEngagement - a.averageEngagement);
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
  formatInsights: PerformanceBandInsight[],
  hookInsights: PerformanceBandInsight[],
): string[] {
  const strengths: string[] = [];

  const topFormat = formatInsights[0];
  if (topFormat && topFormat.deltaVsBaselinePercent > 0) {
    strengths.push(
      `${topFormat.key} posts are ${topFormat.deltaVsBaselinePercent}% above your baseline engagement.`,
    );
  }

  const topHook = hookInsights[0];
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
  formatInsights: PerformanceBandInsight[],
  hookInsights: PerformanceBandInsight[],
): string[] {
  const weaknesses: string[] = [];

  const weakestFormat = formatInsights.at(-1);
  if (weakestFormat && weakestFormat.deltaVsBaselinePercent < 0) {
    weaknesses.push(
      `${weakestFormat.key} format is under baseline by ${Math.abs(
        weakestFormat.deltaVsBaselinePercent,
      )}%.`,
    );
  }

  const weakestHook = hookInsights.at(-1);
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

function buildNextActions(params: {
  bestContentType: ContentType | null;
  weakestContentType: ContentType | null;
  bestHookPattern: HookPattern | null;
  recommendedLengthBand: LengthBand | null;
}): string[] {
  const actions: string[] = [];

  if (params.bestContentType) {
    actions.push(
      `Post 2-3 ${params.bestContentType} posts this week to exploit current edge.`,
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
  const baselineAverageEngagement = params.onboarding.baseline.averageEngagement;

  const formatInsights = summarizeGroups(posts, baselineAverageEngagement, (post) =>
    classifyContentType(post.text),
  );
  const hookInsights = summarizeGroups(posts, baselineAverageEngagement, (post) =>
    detectHookPattern(post.text),
  );
  const lengthInsights = summarizeGroups(posts, baselineAverageEngagement, (post) =>
    getLengthBand(post.text),
  );

  const bestContentType = (formatInsights[0]?.key ?? null) as ContentType | null;
  const weakestContentType = (formatInsights.at(-1)?.key ?? null) as
    | ContentType
    | null;
  const bestHookPattern = (hookInsights[0]?.key ?? null) as HookPattern | null;
  const recommendedLengthBand = (lengthInsights[0]?.key ?? null) as LengthBand | null;

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
          (posts.filter(
            (post) => post.text.includes("?") && post.metrics.replyCount > 0,
          ).length /
            posts.length) *
          100
        ).toFixed(2),
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    sourceRunId: params.sourceRunId,
    baselineAverageEngagement,
    bestContentType,
    weakestContentType,
    bestHookPattern,
    conversationTriggerRate,
    formatInsights,
    hookInsights,
    lengthOptimization: {
      recommendedBand: recommendedLengthBand,
      averageLength,
      bands: lengthInsights,
    },
    strengths: buildStrengths(formatInsights, hookInsights),
    weaknesses: buildWeaknesses(formatInsights, hookInsights),
    nextActions: buildNextActions({
      bestContentType,
      weakestContentType,
      bestHookPattern,
      recommendedLengthBand,
    }),
  };
}
