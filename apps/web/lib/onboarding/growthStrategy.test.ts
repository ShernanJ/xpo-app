import test from "node:test";
import assert from "node:assert/strict";

import { buildGrowthStrategySnapshot } from "./strategy/growthStrategy.ts";

function createProfile(overrides = {}) {
  return {
    identity: {
      followerBand: "0-1k",
    },
    niche: {
      primaryNiche: "generalist",
      targetNiche: "software_and_product",
      audienceIntent: "early-stage builders who want clearer positioning",
    },
    topics: {
      contentPillars: ["product positioning", "reply leverage", "founder learning loops"],
      audienceSignals: ["builders who want clearer positioning"],
    },
    strategy: {
      primaryGoal: "followers",
      currentStrengths: ["clear operator framing"],
      recommendedAngles: ["show the positioning tradeoff", "turn strong replies into posts"],
      nextMoves: ["turn stronger replies into posts"],
      delta: {
        adjustments: [
          {
            area: "audience_breadth",
            direction: "decrease",
            priority: "high",
            note: "broad motivational advice with no operator proof",
          },
        ],
      },
      targetState: {
        planningNote: "builders who want a repeatable growth system",
      },
    },
    performance: {
      bestHookPattern: "how_to_open",
    },
    distribution: {
      primaryLoop: "reply_driven",
    },
    playbook: {
      contentContract: "Make each post or reply ladder back to one operator lesson.",
      conversationTactic: "Add one specific layer before asking a follow-up question.",
    },
    reply: {
      signalConfidence: 42,
    },
    execution: {
      linkDependence: "high",
      mentionDependence: "moderate",
    },
    ...overrides,
  };
}

test("growth strategy snapshot narrows a broad account into the target niche", () => {
  const snapshot = buildGrowthStrategySnapshot({
    creatorProfile: createProfile() as never,
    performanceModel: {
      nextActions: ["double down on proof-first replies"],
    } as never,
    evaluationChecks: [
      { key: "niche_overlay_quality", score: 54 },
      { key: "target_niche_quality", score: 71 },
      { key: "strategy_specificity", score: 58 },
    ] as never,
    evaluationOverallScore: 62,
    readiness: "caution",
    sampleSize: 18,
  });

  assert.equal(snapshot.knownFor.includes("software and product"), true);
  assert.equal(snapshot.contentPillars.includes("product positioning"), true);
  assert.equal(
    snapshot.ambiguities.some((entry) => entry.toLowerCase().includes("still reads broad")),
    true,
  );
  assert.equal(snapshot.replyGoals[0]?.toLowerCase().includes("prioritize replies"), true);
});

test("growth strategy snapshot carries off-brand and truth-boundary cues", () => {
  const snapshot = buildGrowthStrategySnapshot({
    creatorProfile: createProfile({
      execution: {
        linkDependence: "high",
        mentionDependence: "high",
      },
    }) as never,
    performanceModel: {
      nextActions: [],
    } as never,
    evaluationChecks: [] as never,
    evaluationOverallScore: 70,
    readiness: "ready",
    sampleSize: 55,
  });

  assert.equal(snapshot.offBrandThemes.length >= 2, true);
  assert.equal(
    snapshot.truthBoundary.verifiedFacts.some((entry) =>
      entry.toLowerCase().includes("primary goal"),
    ),
    true,
  );
});
