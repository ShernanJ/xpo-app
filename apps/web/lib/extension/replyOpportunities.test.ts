import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplyInsights,
  buildStrategyAdjustments,
} from "./replyOpportunities.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";

const strategySnapshot: GrowthStrategySnapshot = {
  knownFor: "software and product through product positioning",
  targetAudience: "builders who want clearer positioning",
  contentPillars: ["product positioning", "reply leverage", "proof-first posting"],
  replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
  profileConversionCues: [],
  offBrandThemes: ["broad motivational advice with no niche tie"],
  ambiguities: [],
  confidence: {
    overall: 72,
    positioning: 70,
    replySignal: 64,
    readiness: "ready",
  },
  truthBoundary: {
    verifiedFacts: [],
    inferredThemes: [],
    unknowns: [],
  },
};

test("buildReplyInsights summarizes lifecycle and top pillars", () => {
  const now = new Date("2026-03-11T12:00:00.000Z");
  const insights = buildReplyInsights([
    {
      id: "r1",
      userId: "u1",
      xHandle: "builder",
      tweetId: "t1",
      authorHandle: "target",
      tweetText: "text",
      tweetUrl: "https://x.com/target/status/1",
      tweetSnapshot: {},
      heuristicScore: 80,
      heuristicTier: "high",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      strategyPillar: "product positioning",
      generatedAngleLabel: "tradeoff",
      state: "observed",
      openedAt: now,
      generatedAt: now,
      selectedAt: now,
      copiedAt: now,
      postedAt: now,
      dismissedAt: null,
      observedAt: now,
      generatedOptions: null,
      notes: {
        analytics: {
          generatedReplyIntents: [
            {
              label: "nuance",
              strategyPillar: "product positioning",
              anchor: "positioning | clarity",
              rationale: "push past agreement by grounding the point in positioning clarity",
            },
          ],
          copiedReplyIntent: {
            label: "nuance",
            strategyPillar: "product positioning",
            anchor: "positioning | clarity",
            rationale: "push past agreement by grounding the point in positioning clarity",
          },
          followConversionOutcome: {
            observedAtIso: now.toISOString(),
            metrics: {
              likeCount: 6,
              replyCount: 2,
              profileClicks: 3,
              followerDelta: 1,
            },
            intentLabel: "nuance",
            intentAnchor: "positioning | clarity",
            intentStrategyPillar: "product positioning",
            intentRationale: "push past agreement by grounding the point in positioning clarity",
            selectedReplyId: "safe-1",
            hasProfileClickSignal: true,
            hasFollowConversionSignal: true,
          },
        },
      },
      selectedOptionId: "safe-1",
      selectedOptionText: "reply",
      selectedAngleLabel: "tradeoff",
      observedMetrics: { likeCount: 6, replyCount: 2, profileClicks: 3, followerDelta: 1 },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "r2",
      userId: "u1",
      xHandle: "builder",
      tweetId: "t2",
      authorHandle: "target",
      tweetText: "text",
      tweetUrl: "https://x.com/target/status/2",
      tweetSnapshot: {},
      heuristicScore: 61,
      heuristicTier: "medium",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      strategyPillar: "reply leverage",
      generatedAngleLabel: "implementation",
      state: "generated",
      openedAt: now,
      generatedAt: now,
      selectedAt: null,
      copiedAt: null,
      postedAt: null,
      dismissedAt: null,
      observedAt: null,
      generatedOptions: null,
      notes: {
        analytics: {
          generatedReplyIntents: [
            {
              label: "example",
              strategyPillar: "reply leverage",
              anchor: "generic agreement | the proof layer",
              rationale: "make the point concrete with a usable example tied to the proof layer",
            },
          ],
        },
      },
      selectedOptionId: null,
      selectedOptionText: null,
      selectedAngleLabel: null,
      observedMetrics: null,
      createdAt: now,
      updatedAt: now,
    },
  ] as never);

  assert.equal(insights.lifecycleCounts.generated, 2);
  assert.equal(insights.lifecycleCounts.posted, 1);
  assert.equal(insights.topPillars[0]?.label, "product positioning");
  assert.equal(insights.topIntentLabels[0]?.label, "nuance");
  assert.equal(insights.topIntentAnchors[0]?.label, "positioning | clarity");
  assert.equal(insights.topIntentAnchors[0]?.totalProfileClicks, 3);
  assert.equal(insights.topIntentLabels[0]?.totalFollowerDelta, 1);
  assert.equal(insights.intentAttribution.generatedIntentCount, 2);
  assert.equal(insights.intentAttribution.copiedIntentCount, 1);
  assert.equal(insights.intentAttribution.observedOutcomeCount, 1);
  assert.equal(insights.intentAttribution.fullyAttributedOutcomeCount, 1);
  assert.equal(insights.outcomeSnapshot.totalProfileClicks, 3);
  assert.equal(insights.selectionRate, 0.5);
  assert.equal(
    insights.bestSignals.some((entry) => entry.toLowerCase().includes("profile-click events")),
    true,
  );
  assert.equal(
    insights.bestSignals.some((entry) => entry.toLowerCase().includes("fully attributed")),
    true,
  );
});

test("buildStrategyAdjustments turns reply insights into reinforce and deprioritize cues", () => {
  const adjustments = buildStrategyAdjustments({
    strategySnapshot,
    replyInsights: {
      generatedAt: new Date().toISOString(),
      totalOpportunities: 2,
      lifecycleCounts: {
        ranked: 0,
        opened: 2,
        generated: 2,
        selected: 1,
        copied: 1,
        posted: 1,
        dismissed: 0,
        observed: 1,
      },
      selectionRate: 0.5,
      postRate: 0.5,
      observedRate: 1,
      topPillars: [
        {
          label: "product positioning",
          generatedCount: 1,
          selectedCount: 1,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 1,
          postedRate: 1,
        },
      ],
      topAngleLabels: [],
      topIntentLabels: [
        {
          label: "nuance",
          generatedCount: 1,
          selectedCount: 1,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 3,
          totalFollowerDelta: 1,
          averageProfileClicks: 3,
          averageFollowerDelta: 1,
        },
      ],
      topIntentAnchors: [
        {
          label: "positioning | clarity",
          generatedCount: 1,
          selectedCount: 1,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 3,
          totalFollowerDelta: 1,
          averageProfileClicks: 3,
          averageFollowerDelta: 1,
        },
      ],
      topIntentRationales: [
        {
          label: "push past agreement by grounding the point in positioning clarity",
          generatedCount: 1,
          selectedCount: 1,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 3,
          totalFollowerDelta: 1,
          averageProfileClicks: 3,
          averageFollowerDelta: 1,
        },
      ],
      intentAttribution: {
        generatedIntentCount: 2,
        copiedIntentCount: 1,
        observedOutcomeCount: 1,
        fullyAttributedOutcomeCount: 1,
      },
      topGoals: ["followers"],
      outcomeSnapshot: {
        averageLikes: 4,
        averageReplies: 2,
        totalProfileClicks: 3,
        totalFollowerDelta: 1,
      },
      bestSignals: [],
      cautionSignals: [],
      unknowns: [],
    },
  });

  assert.equal(
    adjustments.reinforce[0]?.toLowerCase().includes("product positioning"),
    true,
  );
  assert.equal(
    adjustments.reinforce.some((entry) => entry.toLowerCase().includes("positioning | clarity")),
    true,
  );
  assert.equal(
    adjustments.experiments[0]?.toLowerCase().includes("followers"),
    true,
  );
  assert.equal(adjustments.deprioritize.includes("broad motivational advice with no niche tie"), true);
  assert.equal(
    adjustments.notes.some((entry) => entry.toLowerCase().includes("profile-click events")),
    true,
  );
  assert.equal(
    adjustments.notes.some((entry) => entry.toLowerCase().includes("fully attributed")),
    true,
  );
});

test("buildReplyInsights weights recent observed reply wins above stale totals", () => {
  const recent = new Date("2026-03-11T12:00:00.000Z");
  const stale = new Date("2025-11-15T12:00:00.000Z");

  const insights = buildReplyInsights([
    {
      id: "stale_1",
      userId: "u1",
      xHandle: "builder",
      tweetId: "stale_1",
      authorHandle: "target",
      tweetText: "text",
      tweetUrl: "https://x.com/target/status/stale_1",
      tweetSnapshot: {},
      heuristicScore: 80,
      heuristicTier: "high",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      strategyPillar: "product positioning",
      generatedAngleLabel: "nuance",
      state: "observed",
      openedAt: stale,
      generatedAt: stale,
      selectedAt: stale,
      copiedAt: stale,
      postedAt: stale,
      dismissedAt: null,
      observedAt: stale,
      generatedOptions: null,
      notes: {
        analytics: {
          followConversionOutcome: {
            observedAtIso: stale.toISOString(),
            metrics: {
              likeCount: 5,
              replyCount: 2,
              profileClicks: 5,
              followerDelta: 0,
            },
            intentLabel: "nuance",
            intentAnchor: "positioning | clarity",
            intentStrategyPillar: "product positioning",
            intentRationale: "push past agreement by grounding the point in positioning clarity",
            selectedReplyId: "safe-1",
            hasProfileClickSignal: true,
            hasFollowConversionSignal: false,
          },
        },
      },
      selectedOptionId: "safe-1",
      selectedOptionText: "reply",
      selectedAngleLabel: "nuance",
      observedMetrics: { likeCount: 5, replyCount: 2, profileClicks: 5, followerDelta: 0 },
      createdAt: stale,
      updatedAt: stale,
    },
    {
      id: "recent_1",
      userId: "u1",
      xHandle: "builder",
      tweetId: "recent_1",
      authorHandle: "target",
      tweetText: "text",
      tweetUrl: "https://x.com/target/status/recent_1",
      tweetSnapshot: {},
      heuristicScore: 76,
      heuristicTier: "high",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      strategyPillar: "product positioning",
      generatedAngleLabel: "example",
      state: "observed",
      openedAt: recent,
      generatedAt: recent,
      selectedAt: recent,
      copiedAt: recent,
      postedAt: recent,
      dismissedAt: null,
      observedAt: recent,
      generatedOptions: null,
      notes: {
        analytics: {
          followConversionOutcome: {
            observedAtIso: recent.toISOString(),
            metrics: {
              likeCount: 4,
              replyCount: 1,
              profileClicks: 3,
              followerDelta: 1,
            },
            intentLabel: "example",
            intentAnchor: "proof | the proof layer",
            intentStrategyPillar: "product positioning",
            intentRationale: "make the point concrete with a usable example tied to the proof layer",
            selectedReplyId: "safe-1",
            hasProfileClickSignal: true,
            hasFollowConversionSignal: true,
          },
        },
      },
      selectedOptionId: "safe-1",
      selectedOptionText: "reply",
      selectedAngleLabel: "example",
      observedMetrics: { likeCount: 4, replyCount: 1, profileClicks: 3, followerDelta: 1 },
      createdAt: recent,
      updatedAt: recent,
    },
  ] as never);

  assert.equal(insights.topIntentLabels[0]?.label, "example");
  assert.equal(
    (insights.topIntentLabels[0]?.recencyWeightedOutcomeScore || 0) >
      (insights.topIntentLabels[1]?.recencyWeightedOutcomeScore || 0),
    true,
  );
});
