import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExtensionReplyDraft,
  buildReplyDraftGenerationContext,
  buildReplyDraftSystemPrompt,
  buildReplyDraftUserPrompt,
  cleanReplyDraftStreamChunk,
  finalizeReplyDraftText,
  prepareExtensionReplyDraftPromptPacket,
} from "./replyDraft.ts";
import { looksAcceptableReplyDraft } from "../reply-engine/index.ts";
import { resolveVoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
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

const lowercaseStyleCard: VoiceStyleCard = {
  sentenceOpenings: ["yeah", "lwk", "honestly"],
  sentenceClosers: ["idk", "that's kind of it"],
  pacing: "short casual replies",
  emojiPatterns: [],
  slangAndVocabulary: ["lwk", "idk", "ngl"],
  formattingRules: ["all lowercase", "no bullet points"],
  customGuidelines: ["don't sound polished", "stay literal to the post"],
  contextAnchors: [],
  factLedger: {
    durableFacts: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    sourceMaterials: [],
  },
  antiExamples: [
    {
      badSnippet: "Would love to see it in the next build.",
      reason: "Sounds like a product manager or AI assistant.",
      guidance: "avoid polished pm-speak and assistant phrasing",
      createdAt: "2026-03-18T00:00:00.000Z",
    },
  ],
  userPreferences: {
    casing: "lowercase",
    bulletStyle: "auto",
    emojiUsage: "off",
    profanity: "auto",
    blacklist: ["cheap signal"],
    writingGoal: "voice_first",
    verifiedMaxChars: null,
  },
};

const creatorAgentContext = {
  creatorProfile: {
    identity: {
      username: "shernanjavier",
    },
    voice: {
      primaryCasing: "lowercase",
      averageLengthBand: "medium",
      lowercaseSharePercent: 96,
      questionPostRate: 8,
      multiLinePostRate: 12,
      emojiPostRate: 0,
      dominantContentType: "observation",
      dominantHookPattern: "statement",
      styleNotes: ["casual", "direct", "not polished"],
    },
    styleCard: {
      preferredOpeners: ["yo", "yeah", "lwk"],
      preferredClosers: ["thats it", "idk"],
      signaturePhrases: ["lwk", "thats kind of it"],
      punctuationGuidelines: ["prefer lowercase", "keep punctuation light"],
      emojiPolicy: "off",
      forbiddenPhrases: ["interesting angle", "would love to see"],
    },
    examples: {
      replyVoiceAnchors: [
        { text: "yeah that ux is rough. the lag makes the whole thing feel heavier than it is." },
        { text: "lwk the frustration usually starts when the product makes you guess too much." },
      ],
      quoteVoiceAnchors: [
        { text: "yeah the quote is the whole point here. the original post just explains why it hit." },
      ],
      voiceAnchors: [{ text: "good products feel obvious in use, not just in screenshots." }],
      bestPerforming: [{ text: "most product takes land harder when the wording stays plain." }],
    },
  },
} as never;

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

test("reply draft prompt prioritizes lane-matched anchors and anti-pattern guidance", () => {
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
    styleCard: lowercaseStyleCard,
    creatorAgentContext,
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
  assert.equal(systemPrompt.includes("DELIVERY BIAS (draft):"), true);
  assert.equal(systemPrompt.includes("FORMAT BIAS (draft):"), true);
  assert.equal(systemPrompt.includes("NEGATIVE GUIDANCE:"), true);
  assert.equal(systemPrompt.includes("CREATOR REPLY STYLE:"), true);
  assert.equal(systemPrompt.includes("this creator skews casual and internet-native"), true);
  assert.equal(systemPrompt.includes("Do not unpack it into product advice, system design, or strategy analysis."), true);
  assert.equal(systemPrompt.includes("VOICE / SHAPE LAYER:"), true);
  assert.equal(systemPrompt.includes("avoid polished pm-speak and assistant phrasing"), true);
  assert.equal(systemPrompt.includes("stay literal to the post"), true);
  assert.equal(systemPrompt.includes("avoid cheap signal"), true);
  assert.equal(systemPrompt.includes("Forbidden phrases: interesting angle | would love to see"), true);
  assert.equal(
    systemPrompt.indexOf("yeah that ux is rough. the lag makes the whole thing feel heavier than it is.") <
      systemPrompt.indexOf("good products feel obvious in use, not just in screenshots."),
    true,
  );
  assert.equal(systemPrompt.includes("Translate-style replies are most likely to get posted."), false);
  assert.equal(systemPrompt.includes("Generic agreement underperforms."), false);
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

test("reply draft prompt treats playful analogy posts like riffs instead of product analysis", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_9",
      tweetText: 'waterloo should market themselves like hinge, like "designed to be dropped out of"',
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_9",
      tweetText: 'waterloo should market themselves like hinge, like "designed to be dropped out of"',
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    styleCard: lowercaseStyleCard,
    creatorAgentContext,
    generation,
  });

  assert.equal(systemPrompt.includes("This source uses a playful analogy. Continue the analogy or joke"), true);
  assert.equal(systemPrompt.includes("This post is playful / joke-shaped."), true);
  assert.equal(systemPrompt.includes("For this reply, do not explain the joke. Add to the joke."), true);
  assert.equal(systemPrompt.includes("Use creator profile hints as background voice calibration only."), true);
});

test("reply draft stream cleanup strips labels, markdown, hashtags, and emoji wrappers", () => {
  assert.equal(cleanReplyDraftStreamChunk("Reply: **Sharper point** #build 🚀", false), "Sharper point build");
  assert.equal(finalizeReplyDraftText('  "Reply: useful angle first #signal 🚀"  '), "useful angle first signal");
});

test("reply draft stream cleanup preserves leading spaces in later chunks", () => {
  assert.equal(cleanReplyDraftStreamChunk(" first", true), " first");
  assert.equal(cleanReplyDraftStreamChunk(" second line", true), " second line");
});

test("prepareExtensionReplyDraftPromptPacket uses voice-first shortform reply evidence defaults", async () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_10",
      tweetText: "the ux gets worse when every click makes you wait",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/10",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  const packet = await prepareExtensionReplyDraftPromptPacket({
    request: {
      tweetId: "tweet_10",
      tweetText: "the ux gets worse when every click makes you wait",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/10",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    styleCard: lowercaseStyleCard,
    creatorAgentContext,
    generation,
  });

  assert.equal(packet.voiceEvidence.targetLane, "reply");
  assert.equal(packet.voiceEvidence.draftPreference, "voice_first");
  assert.equal(packet.voiceEvidence.formatPreference, "shortform");
  assert.equal(packet.voiceEvidence.laneMatchedAnchors.length > 0, true);
  assert.equal(String(packet.messages[0]?.content || "").includes("VOICE / SHAPE LAYER:"), true);
});

test("resolveVoiceTarget does not default replies to question CTA or curious hook", () => {
  const target = resolveVoiceTarget({
    styleCard: null,
    userMessage: "keep it direct and close to my normal reply tone",
    draftPreference: "voice_first",
    formatPreference: "shortform",
    lane: "reply",
  });

  assert.equal(target.ctaPolicy, "none");
  assert.equal(target.hookStyle, "blunt");
});

test("finalizeReplyDraftText preserves lowercase creator style", () => {
  const finalized = finalizeReplyDraftText("Reply: I Feel That Too. The Lag Makes It Worse.", {
    styleCard: lowercaseStyleCard,
  });

  assert.equal(finalized, "i feel that too. the lag makes it worse.");
});

test("looksAcceptableReplyDraft rejects product-marketing phrasing", () => {
  const acceptable = looksAcceptableReplyDraft({
    draft: "yeah the ux part is what makes it feel broken",
    sourceContext: {
      primaryPost: {
        id: "tweet_11",
        url: "https://x.com/creator/status/11",
        text: "the ux feels broken when every click stalls",
        authorHandle: "creator",
        postType: "original",
      },
    },
  });
  const rejected = looksAcceptableReplyDraft({
    draft: "Dislike = cheap signal. If you add it, you get real data to iterate on content.",
    sourceContext: {
      primaryPost: {
        id: "tweet_12",
        url: "https://x.com/creator/status/12",
        text: "we should probably have dislikes on here",
        authorHandle: "creator",
        postType: "original",
      },
    },
  });

  assert.equal(acceptable, true);
  assert.equal(rejected, false);
});

test("looksAcceptableReplyDraft rejects off-topic product drift on casual sources", () => {
  const rejected = looksAcceptableReplyDraft({
    draft:
      'interesting angle. if waterloo framed the platform as "designed to be dropped out of," the onboarding and feedback loops would need to be rock solid.',
    sourceContext: {
      primaryPost: {
        id: "tweet_13",
        url: "https://x.com/creator/status/13",
        text: 'waterloo should market themselves like hinge, like "designed to be dropped out of"',
        authorHandle: "creator",
        postType: "original",
      },
    },
  });

  assert.equal(rejected, false);
});

test("looksAcceptableReplyDraft rejects literalizing a playful analogy into product talk", () => {
  const rejected = looksAcceptableReplyDraft({
    draft:
      'the system behind waterloo feels like a dating app. if you can\'t swipe left you\'re stuck. need a clear exit path.',
    sourceContext: {
      primaryPost: {
        id: "tweet_14",
        url: "https://x.com/creator/status/14",
        text: 'waterloo should market themselves like hinge, like "designed to be dropped out of"',
        authorHandle: "creator",
        postType: "original",
      },
    },
  });

  assert.equal(rejected, false);
});
