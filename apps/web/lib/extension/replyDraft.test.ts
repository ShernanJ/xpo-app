import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExtensionReplyDraft,
  buildReplyDraftGenerationContext,
  buildReplyDraftSystemPrompt,
  buildReplyDraftUserPrompt,
  cleanReplyDraftStreamChunk,
  finalizeReplyDraftText,
} from "./replyDraft.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

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

test("buildExtensionReplyDraft can stay locked to a selected reply intent", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_6",
      tweetText: "Replies only work when they add a real layer instead of agreement.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/6",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    selectedIntent: {
      label: "example",
      strategyPillar: "proof-first posting",
      anchor: "proof | concrete example",
      rationale: "Use a concrete example so the reply adds proof instead of agreement.",
    },
  });

  assert.equal(result.angleLabel, "example");
  assert.equal(result.strategyPillar, "proof-first posting");
  assert.equal(
    result.response.options.every((option) => option.intent?.label === "example"),
    true,
  );
});

test("reply draft prompt includes durable facts, analytics, and raw tweet text", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_7",
      tweetText: "Replies should translate big ideas into workflows people can actually use.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/7",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    replyInsights: {
      topAngleLabels: [
        {
          label: "translate",
          generatedCount: 3,
          selectedCount: 2,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 0.67,
          postedRate: 0.33,
        },
      ],
      bestSignals: ["Translate-style replies are most likely to get posted."],
      cautionSignals: ["Generic agreement underperforms."],
    } as never,
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_7",
      tweetText: "Replies should translate big ideas into workflows people can actually use.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/7",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    replyInsights: {
      topAngleLabels: [
        {
          label: "translate",
          generatedCount: 3,
          selectedCount: 2,
          postedCount: 1,
          observedCount: 1,
          selectionRate: 0.67,
          postedRate: 0.33,
        },
      ],
      bestSignals: ["Translate-style replies are most likely to get posted."],
      cautionSignals: ["Generic agreement underperforms."],
    } as never,
    generation,
  });
  const userPrompt = buildReplyDraftUserPrompt({
    request: {
      tweetId: "tweet_7",
      tweetText: "Replies should translate big ideas into workflows people can actually use.",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/7",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    generation,
  });

  assert.equal(systemPrompt.includes("Known for: software and product through product positioning"), true);
  assert.equal(systemPrompt.includes("Target audience: builders who want clearer positioning on X"), true);
  assert.equal(systemPrompt.includes("Translate-style replies are most likely to get posted."), true);
  assert.equal(systemPrompt.includes("Generic agreement underperforms."), true);
  assert.equal(userPrompt.includes('"""Replies should translate big ideas into workflows people can actually use."""'), true);
});

test("reply draft prompt keeps quote-tweet context visible before quoted context", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_8",
      tweetText: "lwk thought that i was the only one that was frustrated with the ux",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/8",
      postType: "quote",
      quotedPost: {
        tweetId: "tweet_9",
        tweetText:
          "the new posthog website is a prime example of why you shouldn't let your designers take LSD",
        authorHandle: "posthog",
      },
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_8",
      tweetText: "lwk thought that i was the only one that was frustrated with the ux",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/8",
      postType: "quote",
      quotedPost: {
        tweetId: "tweet_9",
        tweetText:
          "the new posthog website is a prime example of why you shouldn't let your designers take LSD",
        authorHandle: "posthog",
      },
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    generation,
  });
  const userPrompt = buildReplyDraftUserPrompt({
    request: {
      tweetId: "tweet_8",
      tweetText: "lwk thought that i was the only one that was frustrated with the ux",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/8",
      postType: "quote",
      quotedPost: {
        tweetId: "tweet_9",
        tweetText:
          "the new posthog website is a prime example of why you shouldn't let your designers take LSD",
        authorHandle: "posthog",
      },
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    generation,
  });

  assert.equal(systemPrompt.includes("respond to the visible quote-tweet text first"), true);
  assert.equal(userPrompt.includes('"""lwk thought that i was the only one that was frustrated with the ux"""'), true);
  assert.equal(
    userPrompt.includes(
      `"""the new posthog website is a prime example of why you shouldn't let your designers take LSD"""`,
    ),
    true,
  );
});

test("reply draft stream cleanup strips labels, markdown, hashtags, and emoji wrappers", () => {
  assert.equal(cleanReplyDraftStreamChunk("Reply: **Sharper point** #build 🚀", false), "Sharper point build");
  assert.equal(finalizeReplyDraftText('  "Reply: useful angle first #signal 🚀"  '), "useful angle first signal");
});

test("reply draft stream cleanup preserves leading spaces in later chunks", () => {
  assert.equal(cleanReplyDraftStreamChunk(" first", true), " first");
  assert.equal(cleanReplyDraftStreamChunk(" second line", true), " second line");
});
