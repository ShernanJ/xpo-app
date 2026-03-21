import { expect, test } from "vitest";

import { buildProfileReplyContext } from "./profileReplyContext";

test("buildProfileReplyContext filters low-signal single-word themes and keeps evidence-backed topic insights", () => {
  const context = buildProfileReplyContext({
    onboardingResult: {
      profile: {
        username: "kkevinvalencia",
        name: "Kevin Valencia",
        bio: "19, gpu infra // eng @cloverlabsco",
        followersCount: 109,
        followingCount: 121,
        createdAt: "2025-08-01T00:00:00.000Z",
      },
      pinnedPost: null,
      recentPosts: [
        {
          id: "post-1",
          text: "i have no prime i will evolve till i die",
          createdAt: "2026-03-18T00:00:00.000Z",
          metrics: {
            likeCount: 24,
            replyCount: 4,
            repostCount: 2,
            quoteCount: 0,
          },
        },
        {
          id: "post-2",
          text: "built gpu infra this weekend and the inference stack finally held under load",
          createdAt: "2026-03-17T00:00:00.000Z",
          metrics: {
            likeCount: 31,
            replyCount: 5,
            repostCount: 3,
            quoteCount: 0,
          },
        },
        {
          id: "post-3",
          text: "gpu infra work gets a lot easier once you optimize for inference bottlenecks first",
          createdAt: "2026-03-16T00:00:00.000Z",
          metrics: {
            likeCount: 29,
            replyCount: 3,
            repostCount: 2,
            quoteCount: 0,
          },
        },
      ],
    } as never,
    creatorProfileHints: {
      knownFor: "gpu infra systems",
      targetAudience: "gpu engineers",
      contentPillars: ["Till", "Will", "GPU infra systems"],
    } as never,
  });

  expect(context).not.toBeNull();
  expect(context?.topicInsights?.some((insight) => /(?:^| )(till|will|year)(?:$| )/i.test(insight.label))).toBe(false);
  expect(context?.topicInsights?.some((insight) => /gpu infra/i.test(insight.label))).toBe(true);
  expect(context?.topicInsights?.some((insight) => insight.kind === "positioning")).toBe(true);
  expect(
    context?.topicInsights?.find((insight) => /gpu infra/i.test(insight.label))?.evidenceSnippets
      .length,
  ).toBeGreaterThan(0);
});

test("buildProfileReplyContext ignores media-only chatter when extracting progress-facing topics", () => {
  const context = buildProfileReplyContext({
    onboardingResult: {
      profile: {
        username: "shernanjavier",
        name: "Shernan Javier",
        bio: "sharing my learnings as i build in public / road to gmi",
        followersCount: 125,
        followingCount: 245,
        createdAt: "2025-08-01T00:00:00.000Z",
      },
      pinnedPost: null,
      recentPosts: [
        {
          id: "post-1",
          text: "asian men in toronto all dress the same https://t.co/mock-image",
          createdAt: "2026-03-18T00:00:00.000Z",
          metrics: {
            likeCount: 94,
            replyCount: 17,
            repostCount: 3,
            quoteCount: 1,
          },
          linkSignal: "media_only",
          imageUrls: ["https://pbs.twimg.com/media/mock-image.jpg"],
        },
        {
          id: "post-2",
          text: "growth and distribution lessons from running ampm experiments every week",
          createdAt: "2026-03-17T00:00:00.000Z",
          metrics: {
            likeCount: 41,
            replyCount: 5,
            repostCount: 4,
            quoteCount: 0,
          },
        },
      ],
    } as never,
    creatorProfileHints: {
      knownFor: "growth and distribution lessons",
      targetAudience: "builders in toronto",
      contentPillars: [],
    } as never,
  });

  expect(context).not.toBeNull();
  expect(context?.topicBullets.some((bullet) => /asian men in toronto/i.test(bullet))).toBe(false);
  expect(context?.topicBullets.some((bullet) => /https?:\/\//i.test(bullet))).toBe(false);
  expect(context?.topicInsights?.some((insight) => /asian men in toronto/i.test(insight.label))).toBe(
    false,
  );
  expect(context?.topicInsights?.some((insight) => /growth and distribution/i.test(insight.label))).toBe(
    true,
  );
});

test("buildProfileReplyContext keeps top historical hooks out of recent-post topic inference", () => {
  const recentPosts = Array.from({ length: 50 }, (_, index) => ({
    id: `recent-${index}`,
    text:
      index < 3
        ? "agentic product experiments keep teaching me where automation breaks"
        : `recent product build note ${index}`,
    createdAt: new Date(Date.UTC(2026, 2, 20, 0, index, 0)).toISOString(),
    metrics: {
      likeCount: 10,
      replyCount: 1,
      repostCount: 1,
      quoteCount: 0,
    },
  }));

  const historicalHook = {
    id: "historical-1",
    text: "crypto alpha threads still print if you manufacture urgency",
    createdAt: "2024-01-01T00:00:00.000Z",
    metrics: {
      likeCount: 900,
      replyCount: 60,
      repostCount: 30,
      quoteCount: 10,
    },
  };

  const context = buildProfileReplyContext({
    onboardingResult: {
      profile: {
        username: "stan",
        name: "Stan",
        bio: "building ai tools",
        followersCount: 500,
        followingCount: 300,
        createdAt: "2025-08-01T00:00:00.000Z",
      },
      pinnedPost: null,
      recentPosts: [...recentPosts, historicalHook],
    } as never,
    creatorProfileHints: {
      knownFor: "agentic product experiments",
      targetAudience: "builders",
      contentPillars: [],
    } as never,
  });

  expect(context).not.toBeNull();
  expect(context?.recentPostCount).toBe(50);
  expect(context?.topicBullets.some((bullet) => /crypto alpha/i.test(bullet))).toBe(false);
  expect(context?.topicInsights?.some((insight) => /crypto alpha/i.test(insight.label))).toBe(false);
  expect(context?.recentPostSnippets.some((snippet) => /crypto alpha/i.test(snippet))).toBe(false);
});
