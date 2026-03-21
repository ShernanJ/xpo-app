import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrapScrapeCapture: vi.fn(),
  isScrapeCaptureExpired: vi.fn(),
  readLatestScrapeCaptureByAccount: vi.fn(),
  resolveFreshOnboardingProfilePreview: vi.fn(),
  resolvePinnedPostImageUrls: vi.fn(),
}));

vi.mock("../profile/profilePreview", () => ({
  resolveFreshOnboardingProfilePreview: mocks.resolveFreshOnboardingProfilePreview,
}));

vi.mock("../profile/pinnedPostMedia", () => ({
  resolvePinnedPostImageUrls: mocks.resolvePinnedPostImageUrls,
}));

vi.mock("../store/scrapeCaptureStore", () => ({
  isScrapeCaptureExpired: mocks.isScrapeCaptureExpired,
  readLatestScrapeCaptureByAccount: mocks.readLatestScrapeCaptureByAccount,
}));

vi.mock("./scrapeBootstrap", () => ({
  bootstrapScrapeCapture: mocks.bootstrapScrapeCapture,
}));

import { resolveScrapeDataSource } from "./scrapeSource";

function createPost(index: number, overrides?: Partial<Record<string, unknown>>) {
  return {
    id: `post-${index}`,
    text: `post ${index}`,
    createdAt: new Date(Date.UTC(2026, 2, 20, 0, 0, 60 - index)).toISOString(),
    metrics: {
      likeCount: 1,
      replyCount: 1,
      repostCount: 1,
      quoteCount: 1,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrapScrapeCapture.mockResolvedValue(undefined);
  mocks.isScrapeCaptureExpired.mockReturnValue(false);
  mocks.resolveFreshOnboardingProfilePreview.mockResolvedValue(null);
  mocks.resolvePinnedPostImageUrls.mockResolvedValue(null);
});

describe("resolveScrapeDataSource", () => {
  test("returns 50 newest posts followed by top historical hooks ranked by total engagement", async () => {
    const newestPosts = Array.from({ length: 50 }, (_, index) => createPost(index));
    const historicalPosts = [
      createPost(50, {
        id: "historical-mid",
        text: "mid engagement",
        metrics: { likeCount: 40, replyCount: 5, repostCount: 4, quoteCount: 1 },
      }),
      createPost(51, {
        id: "historical-top-newer",
        text: "top engagement newer",
        metrics: { likeCount: 80, replyCount: 8, repostCount: 7, quoteCount: 5 },
      }),
      createPost(52, {
        id: "historical-top-older",
        text: "top engagement older",
        metrics: { likeCount: 80, replyCount: 8, repostCount: 7, quoteCount: 5 },
      }),
      createPost(53, {
        id: "historical-low",
        text: "low engagement",
        metrics: { likeCount: 3, replyCount: 0, repostCount: 0, quoteCount: 0 },
      }),
    ];

    mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
      captureId: "capture_1",
      capturedAt: "2026-03-20T00:00:00.000Z",
      account: "stan",
      profile: {
        username: "stan",
        name: "Stan",
        bio: "builder",
        followersCount: 100,
        followingCount: 50,
        createdAt: "2026-01-01T00:00:00.000Z",
        isVerified: false,
      },
      pinnedPost: null,
      posts: [...newestPosts, ...historicalPosts],
      replyPosts: [],
      quotePosts: [],
      metadata: {
        source: "agent",
        userAgent: null,
      },
    });

    const result = await resolveScrapeDataSource({
      account: "stan",
      goal: "followers",
      timeBudgetMinutes: 30,
      tone: { casing: "lowercase", risk: "safe" },
    });

    expect(result.posts).toHaveLength(54);
    expect(result.posts.slice(0, 50).map((post) => post.id)).toEqual(
      newestPosts.map((post) => post.id),
    );
    expect(result.posts.slice(50).map((post) => post.id)).toEqual([
      "historical-top-newer",
      "historical-top-older",
      "historical-mid",
      "historical-low",
    ]);
  });

  test("keeps small timelines in chronological order without inventing historical hooks", async () => {
    const posts = [createPost(0), createPost(1), createPost(2)];
    mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
      captureId: "capture_1",
      capturedAt: "2026-03-20T00:00:00.000Z",
      account: "stan",
      profile: {
        username: "stan",
        name: "Stan",
        bio: "builder",
        followersCount: 100,
        followingCount: 50,
        createdAt: "2026-01-01T00:00:00.000Z",
        isVerified: false,
      },
      pinnedPost: null,
      posts,
      replyPosts: [],
      quotePosts: [],
      metadata: {
        source: "agent",
        userAgent: null,
      },
    });

    const result = await resolveScrapeDataSource({
      account: "stan",
      goal: "followers",
      timeBudgetMinutes: 30,
      tone: { casing: "lowercase", risk: "safe" },
    });

    expect(result.posts).toEqual(posts);
  });
});
