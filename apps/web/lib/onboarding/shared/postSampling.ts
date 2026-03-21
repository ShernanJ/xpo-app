import type { XPostMetrics, XPublicPost } from "../contracts/types";

export const RECENT_POST_SAMPLE_SIZE = 50;
export const HISTORICAL_HOOK_SAMPLE_SIZE = 50;
export const MAX_ONBOARDING_ANALYSIS_POSTS =
  RECENT_POST_SAMPLE_SIZE + HISTORICAL_HOOK_SAMPLE_SIZE;

function getCreatedAtMs(post: Pick<XPublicPost, "createdAt">): number {
  const createdAtMs = Date.parse(post.createdAt);
  return Number.isFinite(createdAtMs) ? createdAtMs : 0;
}

export function getPostEngagementTotal(
  metrics: XPostMetrics | null | undefined,
): number {
  if (!metrics) {
    return 0;
  }

  return [
    metrics.likeCount,
    metrics.replyCount,
    metrics.repostCount,
    metrics.quoteCount,
  ]
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
}

export function splitCuratedOnboardingPosts(sampledPosts: XPublicPost[]): {
  recentPosts: XPublicPost[];
  topHistoricalPosts: XPublicPost[];
  analysisPosts: XPublicPost[];
} {
  const recentPosts = sampledPosts.slice(0, RECENT_POST_SAMPLE_SIZE);
  const topHistoricalPosts = sampledPosts.slice(
    RECENT_POST_SAMPLE_SIZE,
    MAX_ONBOARDING_ANALYSIS_POSTS,
  );

  return {
    recentPosts,
    topHistoricalPosts,
    analysisPosts: [...recentPosts, ...topHistoricalPosts],
  };
}

export function selectCuratedOnboardingPosts(allPosts: XPublicPost[]): {
  recentPosts: XPublicPost[];
  topHistoricalPosts: XPublicPost[];
  analysisPosts: XPublicPost[];
} {
  const recentPosts = allPosts.slice(0, RECENT_POST_SAMPLE_SIZE);
  const topHistoricalPosts = [...allPosts.slice(RECENT_POST_SAMPLE_SIZE)]
    .sort((left, right) => {
      const engagementDelta =
        getPostEngagementTotal(right.metrics) - getPostEngagementTotal(left.metrics);
      if (engagementDelta !== 0) {
        return engagementDelta;
      }

      return getCreatedAtMs(right) - getCreatedAtMs(left);
    })
    .slice(0, HISTORICAL_HOOK_SAMPLE_SIZE);

  return {
    recentPosts,
    topHistoricalPosts,
    analysisPosts: [...recentPosts, ...topHistoricalPosts],
  };
}
