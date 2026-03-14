import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentAdjustments,
  buildContentInsights,
} from "./analysis/contentInsights.ts";

test("content insights roll up statuses, shapes, and outcomes", () => {
  const insights = buildContentInsights([
    {
      status: "observed",
      sourcePlaybook: "reply_to_post",
      outputShape: "short_form_post",
      postedAt: new Date("2026-03-01T00:00:00.000Z"),
      observedAt: new Date("2026-03-02T00:00:00.000Z"),
      observedMetrics: {
        likeCount: 12,
        replyCount: 4,
        profileClicks: 3,
        followerDelta: 1,
      },
    },
    {
      status: "posted",
      sourcePlaybook: "reply_to_post",
      outputShape: "short_form_post",
      postedAt: new Date("2026-03-03T00:00:00.000Z"),
      observedAt: null,
      observedMetrics: null,
    },
    {
      status: "pending",
      sourcePlaybook: "weekly_series",
      outputShape: "thread_seed",
      postedAt: null,
      observedAt: null,
      observedMetrics: null,
    },
  ] as never);

  assert.equal(insights.totalCandidates, 3);
  assert.equal(insights.statusCounts.observed, 1);
  assert.equal(insights.topPlaybooks[0]?.label, "reply_to_post");
  assert.equal(insights.outcomeSnapshot.totalProfileClicks, 3);
  assert.equal(insights.postRate, 0.67);
});

test("content adjustments reinforce winning shapes and deprioritize generic filler", () => {
  const adjustments = buildContentAdjustments({
    strategySnapshot: {
      contentPillars: ["reply leverage"],
      offBrandThemes: ["broad generalist commentary"],
    } as never,
    contentInsights: {
      totalCandidates: 3,
      postRate: 0.2,
      topPlaybooks: [{ label: "reply_to_post", totalCount: 2, postedCount: 1, observedCount: 1, postRate: 0.5, observedRate: 1 }],
      topOutputShapes: [{ label: "short_form_post", totalCount: 2, postedCount: 1, observedCount: 1, postRate: 0.5, observedRate: 1 }],
      outcomeSnapshot: {
        totalProfileClicks: 2,
        totalFollowerDelta: 1,
      },
      unknowns: [],
    } as never,
  });

  assert.equal(
    adjustments.reinforce.some((entry) => entry.includes("reply to post")),
    true,
  );
  assert.equal(
    adjustments.deprioritize.some((entry) => entry.includes("generic")),
    true,
  );
  assert.equal(adjustments.experiments.length > 0, true);
});
