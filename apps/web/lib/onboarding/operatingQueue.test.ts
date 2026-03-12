import test from "node:test";
import assert from "node:assert/strict";

import { buildOperatingQueue } from "./operatingQueue.ts";

test("operating queue returns profile, reply, post, and review lanes in order", () => {
  const queue = buildOperatingQueue({
    context: {
      growthStrategySnapshot: {
        knownFor: "reply leverage for builders",
        contentPillars: ["reply leverage", "product positioning"],
        replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
      },
      performanceModel: {
        nextActions: ["Post 2-3 short_form_post posts this week to exploit current edge."],
      },
    } as never,
    profileConversionAudit: {
      score: 42,
      headline: "Profile conversion is weak.",
      gaps: ["The bio does not make the positioning obvious on first glance."],
      recommendedBioEdits: ["Add one concrete niche promise."],
      recentPostCoherenceNotes: ["Only 1 of the last 6 posts reinforces the positioning."],
    } as never,
    replyInsights: null,
    strategyAdjustments: null,
    contentInsights: null,
    contentAdjustments: null,
  });

  assert.deepEqual(
    queue.map((item) => item.lane),
    ["profile", "reply", "post", "review"],
  );
  assert.equal(queue[0]?.actionTarget, "open_analysis");
  assert.equal(queue[1]?.actionTarget, "open_extension");
});

test("operating queue prioritizes review when posted drafts are missing observed outcomes", () => {
  const queue = buildOperatingQueue({
    context: {
      growthStrategySnapshot: {
        knownFor: "growth loops for creators",
        contentPillars: ["growth loops"],
        replyGoals: ["Add one concrete layer instead of broad agreement."],
      },
      performanceModel: {
        nextActions: ["Use how_to_open hook style in your next 3 posts."],
      },
    } as never,
    profileConversionAudit: {
      score: 78,
      headline: "Profile conversion is usable.",
      gaps: [],
      recommendedBioEdits: [],
      recentPostCoherenceNotes: [],
    } as never,
    replyInsights: {
      totalOpportunities: 2,
      selectionRate: 0.5,
      postRate: 0.5,
      observedRate: 1,
      topPillars: [{ label: "growth loops", generatedCount: 2, selectedCount: 1, postedCount: 1, observedCount: 1, selectionRate: 0.5, postedRate: 0.5 }],
      bestSignals: ["growth loops replies are getting selected"],
      cautionSignals: [],
      unknowns: [],
    } as never,
    strategyAdjustments: {
      reinforce: ["Lean harder into growth loops in replies."],
      experiments: ["Test growth loops replies against profile conversion cues."],
    } as never,
    contentInsights: {
      totalCandidates: 4,
      statusCounts: { pending: 1, approved: 0, rejected: 0, edited: 0, posted: 2, observed: 0 },
      postRate: 0.5,
      observedRate: 0,
      bestSignals: [],
      cautionSignals: ["Posts are getting marked posted, but observed outcome data is still missing."],
      unknowns: ["No observed post outcomes yet."],
    } as never,
    contentAdjustments: {
      reinforce: [],
      experiments: [],
      notes: [],
    } as never,
  });

  assert.equal(queue[3]?.lane, "review");
  assert.equal(queue[3]?.actionTarget, "open_draft_queue");
  assert.equal(queue[3]?.priority, "high");
});

test("operating queue review lane surfaces converting reply anchors when attribution exists", () => {
  const queue = buildOperatingQueue({
    context: {
      growthStrategySnapshot: {
        knownFor: "growth loops for creators",
        contentPillars: ["growth loops"],
        replyGoals: ["Add one concrete layer instead of broad agreement."],
      },
      performanceModel: {
        nextActions: ["Use how_to_open hook style in your next 3 posts."],
      },
    } as never,
    profileConversionAudit: {
      score: 78,
      headline: "Profile conversion is usable.",
      gaps: [],
      recommendedBioEdits: [],
      recentPostCoherenceNotes: [],
    } as never,
    replyInsights: {
      totalOpportunities: 3,
      selectionRate: 0.67,
      postRate: 0.67,
      observedRate: 1,
      topPillars: [
        {
          label: "growth loops",
          generatedCount: 3,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 0.67,
          postedRate: 0.67,
        },
      ],
      topIntentLabels: [
        {
          label: "nuance",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 2,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 1,
        },
      ],
      topIntentAnchors: [
        {
          label: "positioning | clarity",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 2,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 1,
        },
      ],
      topIntentRationales: [],
      intentAttribution: {
        generatedIntentCount: 3,
        copiedIntentCount: 2,
        observedOutcomeCount: 2,
        fullyAttributedOutcomeCount: 2,
      },
      bestSignals: [],
      cautionSignals: [],
      unknowns: [],
    } as never,
    strategyAdjustments: {
      reinforce: ["Lean harder into growth loops in replies."],
      experiments: ["Test growth loops replies against profile conversion cues."],
      notes: [],
      deprioritize: [],
      unknowns: [],
    } as never,
    contentInsights: null,
    contentAdjustments: null,
  });

  assert.equal(queue[3]?.lane, "review");
  assert.equal(queue[3]?.actionTarget, "open_analysis");
  assert.equal(queue[3]?.rationale.includes("positioning | clarity"), true);
  assert.equal(
    queue[3]?.supportingSignals.some((entry) => entry.includes("fully attributed")),
    true,
  );
});
