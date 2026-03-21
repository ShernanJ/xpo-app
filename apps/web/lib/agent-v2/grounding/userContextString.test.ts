import { describe, expect, test } from "vitest";

import { buildUserContextString } from "./userContextString";

function createPost(index: number, text: string) {
  return {
    id: `post-${index}`,
    text,
    createdAt: new Date(Date.UTC(2026, 2, 20, 0, index, 0)).toISOString(),
    metrics: {
      likeCount: 1,
      replyCount: 0,
      repostCount: 0,
      quoteCount: 0,
    },
  };
}

describe("buildUserContextString", () => {
  test("separates recent posts from top historical hooks and truncates long hooks", () => {
    const recentPosts = Array.from({ length: 50 }, (_, index) =>
      createPost(index, index === 0 ? "shipping better creator workflows this week" : `recent ${index}`),
    );
    const longHistoricalText = "h".repeat(430);
    const result = buildUserContextString({
      onboardingResult: {
        profile: {
          username: "stan",
          name: "Stan",
          bio: "builder",
          followersCount: 100,
          followingCount: 50,
          createdAt: "2026-01-01T00:00:00.000Z",
          isVerified: false,
        },
        recentPosts: [...recentPosts, createPost(51, longHistoricalText)],
      } as never,
      recentPostLimit: 1,
    });

    expect(result).toContain("<recent_posts>");
    expect(result).toContain("</recent_posts>");
    expect(result).toContain("<top_historical_hooks>");
    expect(result).toContain("</top_historical_hooks>");
    expect(result).toContain('"shipping better creator workflows this week"');
    expect(result).toContain(`"${"h".repeat(397)}..."`);
  });
});
