import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOnboardingProfilePreview: vi.fn(),
  readLatestScrapeCaptureByAccount: vi.fn(),
}));

vi.mock("@/lib/onboarding/profile/profilePreview", () => ({
  resolveOnboardingProfilePreview: mocks.resolveOnboardingProfilePreview,
}));

vi.mock("@/lib/onboarding/store/scrapeCaptureStore", () => ({
  readLatestScrapeCaptureByAccount: mocks.readLatestScrapeCaptureByAccount,
}));

import { GET } from "./route";

function createProfile() {
  return {
    username: "stan",
    name: "Stan",
    bio: "I help SaaS founders grow with AI growth systems.",
    avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
    headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
    isVerified: false,
    followersCount: 2400,
    followingCount: 310,
    createdAt: "2020-01-01T00:00:00.000Z",
  };
}

function createPost(id: string, text: string) {
  return {
    id,
    text,
    createdAt: "2026-03-10T12:00:00.000Z",
    metrics: {
      likeCount: 10,
      replyCount: 2,
      repostCount: 1,
      quoteCount: 0,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/onboarding/analysis", () => {
  test("returns 400 for an invalid account", async () => {
    const response = await GET(new Request("http://localhost/api/onboarding/analysis?account="));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
  });

  test("returns analysis when preview and scrape coverage are both available", async () => {
    mocks.resolveOnboardingProfilePreview.mockResolvedValue({
      profile: createProfile(),
      source: "cache",
      attempts: [],
    });
    mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
      account: "stan",
      profile: createProfile(),
      pinnedPost: {
        ...createPost("pin-1", "My thesis for SaaS founders is that clarity compounds."),
        url: "https://x.com/stan/status/pin-1",
      },
      posts: [
        createPost("1", "AI growth systems work best when positioning is obvious."),
        createPost("2", "SaaS founders need a bio that says who they help."),
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/onboarding/analysis?account=@stan"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.analysis.coverage.hasRecentPosts).toBe(true);
    expect(payload.analysis.profileSnapshot.pinnedPost).toBeTruthy();
  });

  test("returns partial analysis when only preview data exists", async () => {
    mocks.resolveOnboardingProfilePreview.mockResolvedValue({
      profile: createProfile(),
      source: "user_by_screen_name",
      attempts: [],
    });
    mocks.readLatestScrapeCaptureByAccount.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/onboarding/analysis?account=stan"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.analysis.source).toBe("user_by_screen_name");
    expect(payload.analysis.coverage.completeness).toBe("partial");
    expect(
      payload.analysis.evidence.find((item: { key: string }) => item.key === "pinned_post")?.status,
    ).toBe("unknown");
  });
});
