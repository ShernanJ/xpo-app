import assert from "node:assert/strict";
import test from "node:test";

import type { OnboardingResult } from "./contracts/types.ts";
import {
  hydrateOnboardingProfile,
  hydrateOnboardingProfileForAnalysis,
  mergeLatestScrapeIntoOnboarding,
  mergeFreshProfileIntoOnboarding,
} from "./profile/profileHydration.ts";

function createOnboarding(avatarUrl: string | null): OnboardingResult {
  return {
    account: "stan",
    source: "scrape",
    generatedAt: "2026-03-13T00:00:00.000Z",
    profile: {
      username: "stan",
      name: "Stan",
      bio: "builder",
      avatarUrl,
      headerImageUrl: null,
      isVerified: false,
      followersCount: 1200,
      followingCount: 200,
      createdAt: "2020-01-01T00:00:00.000Z",
    },
    pinnedPost: null,
    recentPosts: [],
    recentReplyPosts: [],
    recentQuotePosts: [],
    recentPostSampleCount: 0,
    replyPostSampleCount: 0,
    quotePostSampleCount: 0,
    capturedPostCount: 0,
    capturedReplyPostCount: 0,
    capturedQuotePostCount: 0,
    totalCapturedActivityCount: 0,
    analysisConfidence: {
      sampleSize: 0,
      score: 20,
      band: "very_low",
      minimumViableReached: false,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount: 80,
      message: "thin sample",
    },
    baseline: {
      averageEngagement: 0,
      medianEngagement: 0,
      engagementRate: 0,
      postingCadencePerWeek: 0,
      averagePostLength: 0,
    },
    growthStage: "1k-10k",
    contentDistribution: [],
    hookPatterns: [],
    bestFormats: [],
    underperformingFormats: [],
    strategyState: {
      growthStage: "1k-10k",
      goal: "followers",
      postingCadenceCapacity: "1_per_day",
      replyBudgetPerDay: "5_15",
      transformationMode: "preserve",
      transformationModeSource: "default",
      recommendedPostsPerWeek: 5,
      weights: {
        distribution: 0.35,
        authority: 0.55,
        leverage: 0.1,
      },
      rationale: "keep compounding authority",
    },
    warnings: [],
  };
}

test("mergeFreshProfileIntoOnboarding replaces the avatar when X returns a newer one", () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/old_400x400.jpg");

  const hydrated = mergeFreshProfileIntoOnboarding(onboarding, {
    name: onboarding.profile.name,
    avatarUrl: "https://pbs.twimg.com/profile_images/new_400x400.jpg",
    bio: onboarding.profile.bio,
    headerImageUrl: onboarding.profile.headerImageUrl,
    isVerified: false,
    followersCount: onboarding.profile.followersCount,
    followingCount: onboarding.profile.followingCount,
    createdAt: onboarding.profile.createdAt,
    statusesCount: null,
  });

  assert.equal(
    hydrated.profile.avatarUrl,
    "https://pbs.twimg.com/profile_images/new_400x400.jpg",
  );
});

test("mergeFreshProfileIntoOnboarding does not blank an existing avatar when the live fetch has none", () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg");

  const hydrated = mergeFreshProfileIntoOnboarding(onboarding, {
    name: onboarding.profile.name,
    avatarUrl: null,
    bio: onboarding.profile.bio,
    headerImageUrl: onboarding.profile.headerImageUrl,
    isVerified: false,
    followersCount: onboarding.profile.followersCount,
    followingCount: onboarding.profile.followingCount,
    createdAt: onboarding.profile.createdAt,
    statusesCount: null,
  });

  assert.equal(
    hydrated.profile.avatarUrl,
    "https://pbs.twimg.com/profile_images/existing_400x400.jpg",
  );
  assert.equal(hydrated, onboarding);
});

test("hydrateOnboardingProfile falls back to the stored profile when the live preview fails", async () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg");

  const hydrated = await hydrateOnboardingProfile(onboarding, async () => {
    throw new Error("x preview failed");
  });

  assert.equal(hydrated.profile.avatarUrl, onboarding.profile.avatarUrl);
  assert.equal(hydrated, onboarding);
});

test("mergeLatestScrapeIntoOnboarding refreshes the pinned post from the latest scrape capture", () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg");

  const hydrated = mergeLatestScrapeIntoOnboarding(onboarding, {
    profile: {
      name: onboarding.profile.name,
      avatarUrl: onboarding.profile.avatarUrl,
      bio: onboarding.profile.bio,
      headerImageUrl: onboarding.profile.headerImageUrl,
      isVerified: false,
      followersCount: onboarding.profile.followersCount,
      followingCount: onboarding.profile.followingCount,
      createdAt: onboarding.profile.createdAt,
      statusesCount: null,
    },
    pinnedPost: {
      id: "2010284331479249364",
      text: "I’m planning to be more intentional on Twitter in 2026.",
      createdAt: "2026-01-11T09:35:08.000Z",
      metrics: {
        likeCount: 580,
        replyCount: 102,
        repostCount: 29,
        quoteCount: 1,
      },
      url: "https://x.com/stan/status/2010284331479249364",
    },
  });

  assert.equal(hydrated.pinnedPost?.id, "2010284331479249364");
});

test("mergeLatestScrapeIntoOnboarding preserves the current pinned post but upgrades its media fields", () => {
  const onboarding = {
    ...createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg"),
    pinnedPost: {
      id: "2010284331479249364",
      text: "I’m planning to be more intentional on Twitter in 2026.",
      createdAt: "2026-01-11T09:35:08.000Z",
      metrics: {
        likeCount: 580,
        replyCount: 102,
        repostCount: 29,
        quoteCount: 1,
      },
      url: "https://x.com/stan/status/2010284331479249364",
      imageUrls: null,
    },
  } satisfies OnboardingResult;

  const hydrated = mergeLatestScrapeIntoOnboarding(onboarding, {
    profile: {
      name: onboarding.profile.name,
      avatarUrl: onboarding.profile.avatarUrl,
      bio: onboarding.profile.bio,
      headerImageUrl: onboarding.profile.headerImageUrl,
      isVerified: false,
      followersCount: onboarding.profile.followersCount,
      followingCount: onboarding.profile.followingCount,
      createdAt: onboarding.profile.createdAt,
      statusesCount: null,
    },
    pinnedPost: {
      ...onboarding.pinnedPost,
      imageUrls: ["https://pbs.twimg.com/media/pinned-photo.jpg"],
    },
  });

  assert.deepEqual(hydrated.pinnedPost?.imageUrls, [
    "https://pbs.twimg.com/media/pinned-photo.jpg",
  ]);
});

test("hydrateOnboardingProfileForAnalysis merges live profile fields and latest scrape pinned post", async () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg");

  const hydrated = await hydrateOnboardingProfileForAnalysis(
    onboarding,
    async () => ({
      name: "Stanley X",
      avatarUrl: "https://pbs.twimg.com/profile_images/new_400x400.jpg",
      bio: "updated bio",
      headerImageUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
      isVerified: true,
      followersCount: 1337,
      followingCount: 222,
      createdAt: onboarding.profile.createdAt,
      statusesCount: 456,
    }),
    async () => ({
      profile: {
        name: "Stanley X",
        avatarUrl: onboarding.profile.avatarUrl,
        bio: onboarding.profile.bio,
        headerImageUrl: onboarding.profile.headerImageUrl,
        isVerified: false,
        followersCount: 1337,
        followingCount: 222,
        createdAt: onboarding.profile.createdAt,
        statusesCount: 456,
      },
      pinnedPost: {
        id: "2010284331479249364",
        text: "I’m planning to be more intentional on Twitter in 2026.",
        createdAt: "2026-01-11T09:35:08.000Z",
        metrics: {
          likeCount: 580,
          replyCount: 102,
          repostCount: 29,
          quoteCount: 1,
        },
        url: "https://x.com/stan/status/2010284331479249364",
      },
    }),
  );

  assert.equal(hydrated.profile.bio, "updated bio");
  assert.equal(hydrated.profile.name, "Stanley X");
  assert.equal(hydrated.profile.headerImageUrl, "https://pbs.twimg.com/profile_banners/123/1500x500");
  assert.equal(hydrated.profile.isVerified, true);
  assert.equal(hydrated.profile.followersCount, 1337);
  assert.equal(hydrated.profile.followingCount, 222);
  assert.equal(hydrated.pinnedPost?.id, "2010284331479249364");
});

test("mergeLatestScrapeIntoOnboarding refreshes the recent post sample and capture counts", () => {
  const onboarding = createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg");

  const hydrated = mergeLatestScrapeIntoOnboarding(onboarding, {
    profile: {
      name: "Stanley Fresh",
      avatarUrl: onboarding.profile.avatarUrl,
      bio: "new bio",
      headerImageUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
      isVerified: true,
      followersCount: 1500,
      followingCount: 210,
      createdAt: onboarding.profile.createdAt,
      statusesCount: 999,
    },
    pinnedPost: null,
    posts: [
      {
        id: "new_1",
        text: "Newest post",
        createdAt: "2026-03-20T10:00:00.000Z",
        metrics: { likeCount: 10, replyCount: 2, repostCount: 1, quoteCount: 0 },
      },
      {
        id: "old_viral",
        text: "Older viral post",
        createdAt: "2025-01-01T10:00:00.000Z",
        metrics: { likeCount: 200, replyCount: 40, repostCount: 20, quoteCount: 10 },
      },
    ],
    replyPosts: [
      {
        id: "reply_1",
        text: "Reply",
        createdAt: "2026-03-19T10:00:00.000Z",
        metrics: { likeCount: 1, replyCount: 0, repostCount: 0, quoteCount: 0 },
      },
    ],
    quotePosts: [
      {
        id: "quote_1",
        text: "Quote",
        createdAt: "2026-03-18T10:00:00.000Z",
        metrics: { likeCount: 3, replyCount: 0, repostCount: 1, quoteCount: 0 },
      },
    ],
  });

  assert.equal(hydrated.recentPosts[0]?.id, "new_1");
  assert.equal(hydrated.capturedPostCount, 2);
  assert.equal(hydrated.capturedReplyPostCount, 1);
  assert.equal(hydrated.capturedQuotePostCount, 1);
  assert.equal(hydrated.totalCapturedActivityCount, 4);
});

test("hydrateOnboardingProfileForAnalysis resolves missing pinned media when the latest scrape still lacks it", async () => {
  const onboarding = {
    ...createOnboarding("https://pbs.twimg.com/profile_images/existing_400x400.jpg"),
    pinnedPost: {
      id: "2010284331479249364",
      text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      createdAt: "2026-01-11T09:35:08.000Z",
      metrics: {
        likeCount: 580,
        replyCount: 102,
        repostCount: 29,
        quoteCount: 1,
      },
      url: "https://x.com/stan/status/2010284331479249364",
      imageUrls: null,
    },
  } satisfies OnboardingResult;

  const hydrated = await hydrateOnboardingProfileForAnalysis(
    onboarding,
    async () => null,
    async () => null,
    async () => ["https://pbs.twimg.com/media/pinned-photo.jpg"],
  );

  assert.deepEqual(hydrated.pinnedPost?.imageUrls, [
    "https://pbs.twimg.com/media/pinned-photo.jpg",
  ]);
});
