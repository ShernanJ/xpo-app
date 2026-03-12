import test from "node:test";
import assert from "node:assert/strict";

import { buildExtensionReplyDraft } from "./replyDraft.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";

const strategy: GrowthStrategySnapshot = {
  knownFor: "software and product through product positioning",
  targetAudience: "builders who want clearer positioning on X",
  contentPillars: ["product positioning", "reply leverage", "proof-first posting"],
  replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
  profileConversionCues: ["Bio and pinned post should make the niche obvious."],
  offBrandThemes: ["broad motivational advice with no niche tie"],
  ambiguities: ["The account still reads broad, so default to software and product until stronger proof arrives."],
  confidence: {
    overall: 68,
    positioning: 63,
    replySignal: 51,
    readiness: "caution",
  },
  truthBoundary: {
    verifiedFacts: ["Primary niche: software and product"],
    inferredThemes: ["product positioning", "reply leverage"],
    unknowns: ["No profile click data yet."],
  },
};

test("buildExtensionReplyDraft returns safe and bold options with strategy notes", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_1",
      tweetText: "Most people overcomplicate positioning and end up sounding like everyone else.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/1",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  assert.equal(result.response.options.length, 2);
  assert.deepEqual(
    result.response.options.map((option) => option.label),
    ["safe", "bold"],
  );
  assert.equal(result.strategyPillar, "product positioning");
  assert.equal(
    result.response.notes?.some((entry) => entry.toLowerCase().includes("tentative positioning")),
    true,
  );
});

test("buildExtensionReplyDraft does not invent first-person or numeric claims", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_2",
      tweetText: "How do you make replies worth reading instead of generic agreement?",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/2",
      stage: "0_to_1k",
      tone: "dry",
      goal: "followers",
    },
    strategy,
  });

  for (const option of result.response.options) {
    assert.equal(/\b(i|we|my|our)\b/i.test(option.text), false);
    assert.equal(/\b\d[\d,.%]*\b/.test(option.text), false);
    assert.equal(option.text.length > 20, true);
  }
});

test("buildExtensionReplyDraft keeps replies anchored instead of generic agreement", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_3",
      tweetText: "Replies only work when they add a real layer instead of agreement.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/3",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  for (const option of result.response.options) {
    assert.equal(/^(great|good|nice|agreed|totally|exactly)\b/i.test(option.text), false);
    assert.equal(/\b(layer|reply|usable|system|follow-through)\b/i.test(option.text), true);
  }
});

test("buildExtensionReplyDraft records the chosen reply intent in notes", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_4",
      tweetText: "How do you make replies worth reading instead of generic agreement?",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/4",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  assert.equal(
    result.response.notes?.some((entry) => entry.toLowerCase().startsWith("intent:")),
    true,
  );
});

test("buildExtensionReplyDraft can bias toward a converting learned reply intent", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_5",
      tweetText: "How do you make replies worth reading instead of generic agreement?",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/5",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    replyInsights: {
      topPillars: [
        {
          label: "product positioning",
          generatedCount: 4,
          selectedCount: 3,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 0.75,
          postedRate: 0.5,
        },
      ],
      topIntentLabels: [
        {
          label: "known_for",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 4,
          totalFollowerDelta: 2,
          averageProfileClicks: 2,
          averageFollowerDelta: 1,
        },
      ],
      topIntentAnchors: [
        {
          label: "product positioning",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 4,
          totalFollowerDelta: 2,
          averageProfileClicks: 2,
          averageFollowerDelta: 1,
        },
      ],
      intentAttribution: {
        generatedIntentCount: 4,
        copiedIntentCount: 2,
        observedOutcomeCount: 2,
        fullyAttributedOutcomeCount: 2,
      },
    } as never,
  });

  assert.equal(result.angleLabel, "known_for");
  assert.equal(
    result.response.notes?.some((entry) => entry.toLowerCase().includes("learning bias")),
    true,
  );
});
