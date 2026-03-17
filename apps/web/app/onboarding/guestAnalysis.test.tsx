import { expect, test } from "vitest";

import { buildGuestOnboardingAnalysis } from "@/lib/onboarding/guestAnalysis";
import type { XPublicPost, XPublicProfile, XPinnedPost } from "@/lib/onboarding/types";

function createProfile(args?: Partial<XPublicProfile>): XPublicProfile {
  return {
    username: "stan",
    name: "Stan",
    bio: "I help SaaS founders grow with clear positioning and AI growth systems.",
    avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
    headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
    isVerified: false,
    followersCount: 2400,
    followingCount: 310,
    createdAt: "2020-01-01T00:00:00.000Z",
    ...args,
  };
}

function createPost(id: string, text: string): XPublicPost {
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

function createPinnedPost(text: string, createdAt = "2026-03-01T12:00:00.000Z"): XPinnedPost {
  return {
    ...createPost("pin-1", text),
    createdAt,
    url: "https://x.com/stan/status/pin-1",
  };
}

test("guest analysis highlights a weak pinned post even when the bio is strong", () => {
  const analysis = buildGuestOnboardingAnalysis({
    profile: createProfile(),
    source: "cache",
    pinnedPost: createPinnedPost("random thought"),
    recentPosts: [
      createPost("1", "AI growth systems work best when the positioning is obvious."),
      createPost("2", "SaaS founders need a bio that says who they help and how."),
      createPost("3", "Clear positioning compounds faster than more posting."),
    ],
  });

  expect(analysis.evidence.find((item) => item.key === "bio")?.status).toBe("pass");
  expect(analysis.evidence.find((item) => item.key === "pinned_post")?.status).toBe("fail");
  expect(analysis.priorities[0]?.key).toBe("pinned_post");
});

test("guest analysis flags a missing banner when scrape-backed coverage is available", () => {
  const analysis = buildGuestOnboardingAnalysis({
    profile: createProfile({ headerImageUrl: null }),
    source: "cache",
    pinnedPost: createPinnedPost(
      "My thesis for SaaS founders: clear positioning compounds faster than more posting.\n\n1. Specificity beats cleverness.\n2. Proof beats vibes.",
    ),
    recentPosts: [
      createPost("1", "Specific positioning makes SaaS distribution easier."),
      createPost("2", "AI growth systems work when the audience is explicit."),
    ],
  });

  expect(analysis.evidence.find((item) => item.key === "banner")?.status).toBe("fail");
  expect(analysis.priorities.some((item) => item.key === "banner")).toBe(true);
});

test("guest analysis downgrades pinned-post certainty when no scrape capture exists", () => {
  const analysis = buildGuestOnboardingAnalysis({
    profile: createProfile(),
    source: "user_by_screen_name",
    pinnedPost: null,
    recentPosts: [],
  });

  expect(analysis.coverage.completeness).toBe("partial");
  expect(analysis.evidence.find((item) => item.key === "pinned_post")?.status).toBe("unknown");
  expect(analysis.evidence.find((item) => item.key === "recent_posts")?.status).toBe("unknown");
});

test("guest analysis falls back cleanly for low-signal profiles", () => {
  const analysis = buildGuestOnboardingAnalysis({
    profile: createProfile({
      bio: "",
      headerImageUrl: null,
      followersCount: 120,
    }),
    source: "html",
    pinnedPost: null,
    recentPosts: [],
  });

  expect(analysis.stage).toBe("0 → 1k");
  expect(analysis.priorities).toHaveLength(3);
  expect(analysis.voicePreview.shortform.length).toBeGreaterThan(0);
  expect(analysis.verdict.length).toBeGreaterThan(0);
});

test("guest analysis ranks the major profile leaks before stage advice", () => {
  const analysis = buildGuestOnboardingAnalysis({
    profile: createProfile({
      bio: "building in public",
      headerImageUrl: null,
    }),
    source: "cache",
    pinnedPost: createPinnedPost("old thought", "2024-01-01T12:00:00.000Z"),
    recentPosts: [
      createPost("1", "One random take about coffee."),
      createPost("2", "Another unrelated thought about weather."),
      createPost("3", "A joke with no niche signal."),
    ],
  });

  expect(analysis.priorities.map((item) => item.key).sort()).toEqual(
    ["banner", "bio", "pinned_post"].sort(),
  );
  expect(analysis.priorities.some((item) => item.key === "stage")).toBe(false);
});
