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
