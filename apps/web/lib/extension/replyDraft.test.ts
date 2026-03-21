import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../db.ts";
import {
  buildExtensionReplyDraft,
  buildReplyDraftGenerationContext,
  buildReplyDraftSystemPrompt,
  buildReplyDraftUserPrompt,
  cleanReplyDraftStreamChunk,
  finalizeReplyDraftText,
  prepareExtensionReplyDraftPromptPacket,
} from "./replyDraft.ts";
import {
  buildExtensionReplyDraftSnippet,
  buildExtensionReplyDraftTitle,
  persistGeneratedExtensionReplyDraft,
  syncPostedExtensionReplyDraft,
} from "./savedReplyDrafts.ts";
import { looksAcceptableReplyDraft } from "../reply-engine/index.ts";
import { resolveVoiceTarget } from "../agent-v2/core/voiceTarget.ts";
import type { VoiceStyleCard } from "../agent-v2/core/styleProfile.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";
import type { ReplySourcePreview } from "../reply-engine/replySourcePreview.ts";

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

const replySourcePreviewFixture: ReplySourcePreview = {
  postId: "tweet_source_1",
  sourceUrl: "https://x.com/builder/status/tweet_source_1",
  author: {
    displayName: "builder",
    username: "builder",
    avatarUrl: null,
    isVerified: false,
  },
  text: "Source post text",
  media: [],
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

test("buildExtensionReplyDraft softens fallback copy for sensitive room contexts", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_sensitive_1",
      tweetText: "i'm honestly exhausted by how hard this has been",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/sensitive-1",
      stage: "0_to_1k",
      tone: "bold",
      goal: "followers",
    },
    strategy,
    replyContext: {
      room_sentiment: "frustration",
      social_intent: "looking for validation",
      recommended_stance: "acknowledge the pain before adding anything else",
      banned_angles: ["pushback", "hotter take"],
    },
  });

  assert.equal(
    result.response.options.every((option) => !/\b(hotter take|pushback|counterpoint|lmao)\b/i.test(option.text)),
    true,
  );
  assert.equal(
    result.response.notes?.some((entry) => entry.includes("Recommended stance: acknowledge the pain before adding anything else.")),
    true,
  );
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
    userHandle: "shernanjavier",
    preflightResult: {
      op_tone: "practical",
      post_intent: "push a useful next layer",
      recommended_reply_mode: "insightful_add_on",
      source_shape: "strategic_take",
    },
    goldenExamples: [
      {
        text: "yeah the useful layer is usually what makes the reply worth reading",
        source: "golden_example",
        replyMode: "insightful_add_on",
      },
      {
        text: "most of the time the next sentence is where the proof shows up",
        source: "fallback_anchor",
        replyMode: "insightful_add_on",
      },
    ],
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
    preflightResult: {
      op_tone: "practical",
      post_intent: "push a useful next layer",
      recommended_reply_mode: "insightful_add_on",
      source_shape: "strategic_take",
    },
  });

  assert.equal(systemPrompt.includes("Known for: software and product through product positioning"), true);
  assert.equal(systemPrompt.includes("Target audience: builders who want clearer positioning on X"), true);
  assert.equal(systemPrompt.includes("You are ghostwriting for @shernanjavier."), true);
  assert.equal(systemPrompt.includes("CLASSIFIER READ:"), true);
  assert.equal(systemPrompt.includes("RETRIEVED GOLDEN EXAMPLES:"), true);
  assert.equal(systemPrompt.includes("Golden example 1: yeah the useful layer is usually what makes the reply worth reading"), true);
  assert.equal(systemPrompt.includes("Fallback example 2: most of the time the next sentence is where the proof shows up"), true);
  assert.equal(systemPrompt.includes("CREATOR REPLY STYLE:"), true);
  assert.equal(systemPrompt.includes("this creator skews casual and internet-native"), true);
  assert.equal(systemPrompt.includes("Do not unpack it into product advice, system design, or strategy analysis."), true);
  assert.equal(systemPrompt.includes("BACKUP VOICE EVIDENCE:"), true);
  assert.equal(systemPrompt.includes("Forbidden phrases: interesting angle | would love to see"), true);
  assert.equal(
    systemPrompt.indexOf("yeah that ux is rough. the lag makes the whole thing feel heavier than it is.") <
      systemPrompt.indexOf("good products feel obvious in use, not just in screenshots."),
    true,
  );
  assert.equal(systemPrompt.includes("Translate-style replies are most likely to get posted."), false);
  assert.equal(systemPrompt.includes("Generic agreement underperforms."), false);
  assert.equal(userPrompt.includes("Classifier reply mode: insightful_add_on"), true);
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

test("reply draft prompt injects explicit playful tone enforcement", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_9b",
      tweetText: "this meme format keeps winning because the screenshot is the whole bit",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9b",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_9b",
      tweetText: "this meme format keeps winning because the screenshot is the whole bit",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9b",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    generation,
    preflightResult: {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
      image_role: "none",
      image_reply_anchor: "",
      should_reference_image_text: false,
    },
  });

  assert.equal(
    systemPrompt.includes(
      "TONE ENFORCEMENT: Be playful in a deadpan, understated, internet-native way. Lean into the joke or meme without sounding performative, caption-y, or try-hard. Do NOT give serious advice, operator frameworks, or over-explain the post.",
    ),
    true,
  );
});

test("reply draft prompt trusts joke-riff preflight for playful source handling", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_9c",
      tweetText: "my startup strategy is just drinking 4 redbulls and hoping",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9c",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_9c",
      tweetText: "my startup strategy is just drinking 4 redbulls and hoping",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9c",
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
    },
    strategy,
    generation,
    preflightResult: {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
    },
  });

  assert.equal(systemPrompt.includes("This post is playful / joke-shaped."), true);
  assert.equal(systemPrompt.includes("This source uses a playful analogy."), false);
});

test("buildExtensionReplyDraft keeps playful fallback copy casual", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_9d",
      tweetText: "my startup strategy is just drinking 4 redbulls and hoping",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9d",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
  });

  assert.equal(result.response.options[0]?.text.includes("whole bit"), true);
  assert.equal(result.response.options[1]?.text.includes("serious"), true);
  assert.equal(result.response.options[1]?.text.includes("ruin it"), true);
});

test("casual observation drafts drop the strategic lens and stay literal", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_9e",
      tweetText: "Just had a full bag of chips #fuckit",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9e",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    preflightResult: {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
      image_role: "none",
      image_reply_anchor: "",
      should_reference_image_text: false,
    },
  });

  const systemPrompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_9e",
      tweetText: "Just had a full bag of chips #fuckit",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9e",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    generation,
    preflightResult: {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
    },
  });

  assert.equal(generation.intent, null);
  assert.equal(
    systemPrompt.includes(
      "Do not turn snacks, sleep, errands, vibes, or jokes into work, product, startup, or operator advice unless the post itself is already there.",
    ),
    true,
  );
  assert.equal(systemPrompt.includes("No aligned strategic lens. Stay with the literal post and creator voice instead."), true);
  assert.equal(systemPrompt.includes("Do not tell the author what they should do next."), true);
});

test("buildExtensionReplyDraft keeps casual observation fallback copy out of business advice", () => {
  const result = buildExtensionReplyDraft({
    request: {
      tweetId: "tweet_9f",
      tweetText: "Just had a full bag of chips #fuckit",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/9f",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    preflightResult: {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
    },
  });

  assert.equal(result.response.options.every((option) => option.intent === undefined), true);
  assert.equal(
    result.response.options.every(
      (option) => !/\b(sprint|workflow|operator|product|startup|next build)\b/i.test(option.text),
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
  assert.equal(["joke_riff", "agree_and_amplify", "contrarian_pushback", "insightful_add_on", "empathetic_support"].includes(packet.preflightResult.recommended_reply_mode), true);
  assert.equal(Array.isArray(packet.goldenExamples), true);
  assert.equal(String(packet.messages[0]?.content || "").includes("RETRIEVED GOLDEN EXAMPLES:"), true);
});

test("prepareExtensionReplyDraftPromptPacket carries room context into the system prompt", async () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_room_1",
      tweetText: "today feels heavier than usual",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/room-1",
      stage: "0_to_1k",
      tone: "warm",
      goal: "followers",
    },
    strategy,
    replyContext: {
      room_sentiment: "vulnerability",
      social_intent: "looking for care",
      recommended_stance: "be warm and avoid scoring points",
      banned_angles: ["sarcasm", "dunking"],
    },
  });

  const packet = await prepareExtensionReplyDraftPromptPacket({
    request: {
      tweetId: "tweet_room_1",
      tweetText: "today feels heavier than usual",
      authorHandle: "creator",
      tweetUrl: "https://x.com/creator/status/room-1",
      stage: "0_to_1k",
      tone: "warm",
      goal: "followers",
    },
    strategy,
    generation,
  });

  assert.deepEqual(packet.replyContext, {
    room_sentiment: "vulnerability",
    social_intent: "looking for care",
    recommended_stance: "be warm and avoid scoring points",
    banned_angles: ["sarcasm", "dunking"],
  });
  assert.equal(String(packet.messages[0]?.content || "").includes("ROOM CONTEXT:"), true);
  assert.equal(
    String(packet.messages[0]?.content || "").includes("be warm and avoid scoring points"),
    true,
  );
  assert.equal(
    String(packet.messages[0]?.content || "").includes("CRITICAL: If ROOM CONTEXT is present, you must read the room."),
    true,
  );
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

test("finalizeReplyDraftText applies lowercase voice style without stripping sentence-start capitalization", () => {
  const finalized = finalizeReplyDraftText("Reply: I Feel That Too. The Lag Makes It Worse.", {
    styleCard: lowercaseStyleCard,
  });

  assert.equal(finalized, "i Feel That Too. the Lag Makes It Worse.");
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

test("looksAcceptableReplyDraft rejects serious product language when preflight marks a joke riff", () => {
  const rejected = looksAcceptableReplyDraft({
    draft: "the product problem is relying on caffeine instead of a real strategy",
    sourceContext: {
      primaryPost: {
        id: "tweet_15",
        url: "https://x.com/creator/status/15",
        text: "my startup strategy is just drinking 4 redbulls and hoping",
        authorHandle: "creator",
        postType: "original",
      },
    },
    preflightResult: {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
    },
  });

  assert.equal(rejected, false);
});

test("looksAcceptableReplyDraft rejects business and advice drift on casual observations", () => {
  const businessDrift = looksAcceptableReplyDraft({
    draft: "chips are the unofficial fuel for sprint sessions",
    sourceContext: {
      primaryPost: {
        id: "tweet_16",
        url: "https://x.com/creator/status/16",
        text: "Just had a full bag of chips #fuckit",
        authorHandle: "creator",
        postType: "original",
      },
    },
    preflightResult: {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
    },
  });
  const adviceDrift = looksAcceptableReplyDraft({
    draft: "just remember to swap that for a quick walk before the next build",
    sourceContext: {
      primaryPost: {
        id: "tweet_17",
        url: "https://x.com/creator/status/17",
        text: "Just had a full bag of chips #fuckit",
        authorHandle: "creator",
        postType: "original",
      },
    },
    preflightResult: {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
      image_role: "none",
      image_reply_anchor: "",
      should_reference_image_text: false,
    },
  });

  assert.equal(businessDrift, false);
  assert.equal(adviceDrift, false);
});

test("reply draft prompt treats image punchlines as first-class source material", () => {
  const generation = buildReplyDraftGenerationContext({
    request: {
      tweetId: "tweet_18",
      tweetText: "Perfect algo pull",
      authorHandle: "chribjel",
      tweetUrl: "https://x.com/chribjel/status/18",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    visualContext: {
      primarySubject: "app or tweet screenshot",
      setting: "digital interface",
      lightingAndMood: "internet-native and jokey",
      readableText: "Posts aren't loading right now",
      keyDetails: ["screenshot layout", "nested tweet image"],
      imageCount: 1,
      sceneType: "screenshot",
      imageRole: "punchline",
      imageReplyAnchor: "Posts aren't loading right now",
      shouldReferenceImageText: true,
      replyRelevance: "high",
      images: [
        {
          imageUrl: null,
          source: "alt_text",
          sceneType: "screenshot",
          imageRole: "punchline",
          primarySubject: "app or tweet screenshot",
          setting: "digital interface",
          lightingAndMood: "internet-native and jokey",
          readableText: "Posts aren't loading right now",
          keyDetails: ["screenshot layout", "nested tweet image"],
          jokeAnchor: "Posts aren't loading right now",
          replyRelevance: "high",
        },
      ],
      summaryLines: [
        "Image scene type: screenshot",
        "Image role: punchline",
        "Image readable text: Posts aren't loading right now",
      ],
    },
    preflightResult: {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
      image_role: "punchline",
      image_reply_anchor: "Posts aren't loading right now",
      should_reference_image_text: true,
    },
  });

  const prompt = buildReplyDraftSystemPrompt({
    request: {
      tweetId: "tweet_18",
      tweetText: "Perfect algo pull",
      authorHandle: "chribjel",
      tweetUrl: "https://x.com/chribjel/status/18",
      stage: "0_to_1k",
      tone: "playful",
      goal: "followers",
    },
    strategy,
    generation,
    visualContext: generation.policy.allowImageAnchoring
      ? {
          primarySubject: "app or tweet screenshot",
          setting: "digital interface",
          lightingAndMood: "internet-native and jokey",
          readableText: "Posts aren't loading right now",
          keyDetails: ["screenshot layout", "nested tweet image"],
          imageCount: 1,
          sceneType: "screenshot",
          imageRole: "punchline",
          imageReplyAnchor: "Posts aren't loading right now",
          shouldReferenceImageText: true,
          replyRelevance: "high",
          images: [
            {
              imageUrl: null,
              source: "alt_text",
              sceneType: "screenshot",
              imageRole: "punchline",
              primarySubject: "app or tweet screenshot",
              setting: "digital interface",
              lightingAndMood: "internet-native and jokey",
              readableText: "Posts aren't loading right now",
              keyDetails: ["screenshot layout", "nested tweet image"],
              jokeAnchor: "Posts aren't loading right now",
              replyRelevance: "high",
            },
          ],
          summaryLines: [
            "Image scene type: screenshot",
            "Image role: punchline",
            "Image readable text: Posts aren't loading right now",
          ],
        }
      : null,
    preflightResult: {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
      image_role: "punchline",
      image_reply_anchor: "Posts aren't loading right now",
      should_reference_image_text: true,
    },
  });

  assert.match(prompt, /image is carrying the punchline/i);
  assert.match(prompt, /posts aren't loading right now/i);
});

test("looksAcceptableReplyDraft rejects ai-coded business drift on image-led jokes", () => {
  const visualContext = {
    primarySubject: "app or tweet screenshot",
    setting: "digital interface",
    lightingAndMood: "internet-native and jokey",
    readableText: "Posts aren't loading right now",
    keyDetails: ["screenshot layout", "nested tweet image"],
    imageCount: 1,
    sceneType: "screenshot" as const,
    imageRole: "punchline" as const,
    imageReplyAnchor: "Posts aren't loading right now",
    shouldReferenceImageText: true,
    replyRelevance: "high",
    images: [
      {
        imageUrl: null,
        source: "alt_text" as const,
        sceneType: "screenshot" as const,
        imageRole: "punchline" as const,
        primarySubject: "app or tweet screenshot",
        setting: "digital interface",
        lightingAndMood: "internet-native and jokey",
        readableText: "Posts aren't loading right now",
        keyDetails: ["screenshot layout", "nested tweet image"],
        jokeAnchor: "Posts aren't loading right now",
        replyRelevance: "high",
      },
    ],
    summaryLines: [
      "Image scene type: screenshot",
      "Image role: punchline",
      "Image readable text: Posts aren't loading right now",
    ],
  };
  const preflightResult = {
    op_tone: "playful",
    post_intent: "riff on a joke or observation",
    recommended_reply_mode: "joke_riff" as const,
    source_shape: "joke_setup" as const,
    image_role: "punchline" as const,
    image_reply_anchor: "Posts aren't loading right now",
    should_reference_image_text: true,
  };
  const rejected = looksAcceptableReplyDraft({
    draft:
      "nice, that pull could be the cheap traffic hack most early teams miss. the real win is turning that cheap signal into repeatable onboarding.",
    sourceContext: {
      primaryPost: {
        id: "tweet_19",
        url: "https://x.com/chribjel/status/19",
        text: "Perfect algo pull",
        authorHandle: "chribjel",
        postType: "original",
      },
      media: {
        images: [{ altText: 'Tweet screenshot showing "Posts aren\'t loading right now".' }],
        hasVideo: false,
        hasGif: false,
        hasLink: false,
      },
    },
    preflightResult,
    visualContext,
  });
  const rejectedLoopDraft = looksAcceptableReplyDraft({
    draft: "nice, that pull will surface the edge cases faster and let you iterate on the core loop.",
    sourceContext: {
      primaryPost: {
        id: "tweet_19b",
        url: "https://x.com/chribjel/status/19",
        text: "Perfect algo pull",
        authorHandle: "chribjel",
        postType: "original",
      },
      media: {
        images: [{ altText: 'Tweet screenshot showing "Posts aren\'t loading right now".' }],
        hasVideo: false,
        hasGif: false,
        hasLink: false,
      },
    },
    preflightResult,
    visualContext,
  });
  const acceptable = looksAcceptableReplyDraft({
    draft: `the "posts aren't loading right now" banner really sold it`,
    sourceContext: {
      primaryPost: {
        id: "tweet_20",
        url: "https://x.com/chribjel/status/20",
        text: "Perfect algo pull",
        authorHandle: "chribjel",
        postType: "original",
      },
      media: {
        images: [{ altText: 'Tweet screenshot showing "Posts aren\'t loading right now".' }],
        hasVideo: false,
        hasGif: false,
        hasLink: false,
      },
    },
    preflightResult,
    visualContext,
  });
  const rejectedCaptionRewrite = looksAcceptableReplyDraft({
    draft: `perfect algo pull? more like "posts aren't loading right now, try again"`,
    sourceContext: {
      primaryPost: {
        id: "tweet_20b",
        url: "https://x.com/chribjel/status/20",
        text: "Perfect algo pull",
        authorHandle: "chribjel",
        postType: "original",
      },
      media: {
        images: [{ altText: 'Tweet screenshot showing "Posts aren\'t loading right now".' }],
        hasVideo: false,
        hasGif: false,
        hasLink: false,
      },
    },
    preflightResult,
    visualContext,
  });

  assert.equal(rejected, false);
  assert.equal(rejectedLoopDraft, false);
  assert.equal(rejectedCaptionRewrite, false);
  assert.equal(acceptable, true);
});

test("looksAcceptableReplyDraft rejects self-nomination replies on recruiting calls", () => {
  const sourceContext = {
    primaryPost: {
      id: "tweet_21",
      url: "https://x.com/hiring/status/21",
      text:
        "me (and some of my friends) are hiring soon if you love meeting people, finding undiscovered talent before anyone else, and working insanely hard..... @ reply or DM me",
      authorHandle: "hiring",
      postType: "original" as const,
    },
    media: {
      images: [{ altText: 'Photo with the word "hiring" above a group of people.' }],
      hasVideo: false,
      hasGif: false,
      hasLink: false,
    },
  };
  const visualContext = {
    primarySubject: "group photo with hiring sign",
    setting: "real-world event or room",
    lightingAndMood: "energetic",
    readableText: "hiring",
    keyDetails: ["group of people", "hiring sign"],
    brandSignals: [],
    absurdityMarkers: [],
    artifactTargetHint: "",
    imageCount: 1,
    sceneType: "photo" as const,
    imageArtifactType: "photo" as const,
    imageRole: "context" as const,
    imageReplyAnchor: "hiring",
    shouldReferenceImageText: true,
    replyRelevance: "medium",
    images: [
      {
        imageUrl: null,
        source: "alt_text" as const,
        sceneType: "photo" as const,
        imageArtifactType: "photo" as const,
        imageRole: "context" as const,
        primarySubject: "group photo with hiring sign",
        setting: "real-world event or room",
        lightingAndMood: "energetic",
        readableText: "hiring",
        keyDetails: ["group of people", "hiring sign"],
        brandSignals: [],
        absurdityMarkers: [],
        artifactTargetHint: "",
        jokeAnchor: "hiring",
        replyRelevance: "medium",
      },
    ],
    summaryLines: ["Image readable text: hiring"],
  };
  const rejected = looksAcceptableReplyDraft({
    draft: "count me in - love hunting hidden talent and grinding hard. dm me.",
    sourceContext,
    visualContext,
  });
  const acceptable = looksAcceptableReplyDraft({
    draft: 'the "work insanely hard" line is a serious filter',
    sourceContext,
    visualContext,
  });

  assert.equal(rejected, false);
  assert.equal(acceptable, true);
});

test("buildExtensionReplyDraftSnippet normalizes whitespace and truncates only when needed", () => {
  assert.equal(buildExtensionReplyDraftSnippet("  useful    layer  "), "useful layer");
  assert.equal(buildExtensionReplyDraftSnippet("12345678901234567890"), "12345678901234567890");
  assert.equal(buildExtensionReplyDraftSnippet("123456789012345678901"), "12345678901234567890...");
});

test("buildExtensionReplyDraftTitle formats reply titles as handle plus snippet", () => {
  assert.equal(
    buildExtensionReplyDraftTitle({
      sourceAuthorHandle: "@Builder",
      replyText: "  useful   layer for the reader  ",
    }),
    "@builder - useful layer for the...",
  );
});

test("persistGeneratedExtensionReplyDraft creates a saved reply draft when no active draft exists", async () => {
  const originalFindFirst = prisma.draftCandidate.findFirst;
  const originalCreate = prisma.draftCandidate.create;
  const originalUpdate = prisma.draftCandidate.update;
  const calls: Array<[string, unknown]> = [];

  try {
    (prisma.draftCandidate.findFirst as unknown as (...args: unknown[]) => unknown) = async () => {
      calls.push(["findFirst", null]);
      return null;
    };
    (prisma.draftCandidate.create as unknown as (...args: unknown[]) => unknown) = async (
      payload,
    ) => {
      calls.push(["create", payload]);
      return payload;
    };
    (prisma.draftCandidate.update as unknown as (...args: unknown[]) => unknown) = async () => {
      throw new Error("update should not be called when creating a fresh reply draft");
    };

    await persistGeneratedExtensionReplyDraft({
      userId: "user_1",
      xHandle: "standev",
      replySourcePostId: "tweet_123",
      sourcePostText: "Source post text",
      sourceAuthorHandle: "builder",
      replyText: "useful layer for the reader",
      replySourcePreview: replySourcePreviewFixture,
      voiceTarget: { lane: "reply" },
    });
  } finally {
    (prisma.draftCandidate.findFirst as unknown as typeof prisma.draftCandidate.findFirst) =
      originalFindFirst;
    (prisma.draftCandidate.create as unknown as typeof prisma.draftCandidate.create) =
      originalCreate;
    (prisma.draftCandidate.update as unknown as typeof prisma.draftCandidate.update) =
      originalUpdate;
  }

  const createCall = calls.find(([name]) => name === "create");
  assert.equal(Boolean(createCall), true);
  const createPayload = createCall?.[1] as { data: Record<string, unknown> };
  assert.equal(createPayload.data.replySourcePostId, "tweet_123");
  assert.equal(createPayload.data.status, "DRAFT");
  assert.equal(createPayload.data.reviewStatus, "pending");
  assert.equal(createPayload.data.threadId, null);
  assert.equal(createPayload.data.messageId, null);
  assert.equal(createPayload.data.title, "@builder - useful layer for the...");
  assert.equal(
    (createPayload.data.artifact as { replySourcePreview?: { author?: { username?: string } } })
      .replySourcePreview?.author?.username,
    "builder",
  );
});

test("persistGeneratedExtensionReplyDraft updates the existing draft for the same source post", async () => {
  const originalFindFirst = prisma.draftCandidate.findFirst;
  const originalCreate = prisma.draftCandidate.create;
  const originalUpdate = prisma.draftCandidate.update;
  const calls: Array<[string, unknown]> = [];

  try {
    (prisma.draftCandidate.findFirst as unknown as (...args: unknown[]) => unknown) = async () => ({
      id: "draft_1",
      title: "@builder - old reply",
      sourcePrompt: "old source prompt",
      artifact: {
        id: "extension-reply-tweet_123",
        title: "@builder - old reply",
        kind: "reply_candidate",
        content: "old reply",
        replySourcePreview: replySourcePreviewFixture,
      },
      voiceTarget: { lane: "reply" },
    });
    (prisma.draftCandidate.create as unknown as (...args: unknown[]) => unknown) = async () => {
      throw new Error("create should not be called when updating an existing draft");
    };
    (prisma.draftCandidate.update as unknown as (...args: unknown[]) => unknown) = async (
      payload,
    ) => {
      calls.push(["update", payload]);
      return payload;
    };

    await persistGeneratedExtensionReplyDraft({
      userId: "user_1",
      xHandle: "standev",
      replySourcePostId: "tweet_123",
      sourcePostText: "Source post text",
      sourceAuthorHandle: "builder",
      replyText: "refined reply text",
      replySourcePreview: replySourcePreviewFixture,
      voiceTarget: { lane: "reply" },
    });
  } finally {
    (prisma.draftCandidate.findFirst as unknown as typeof prisma.draftCandidate.findFirst) =
      originalFindFirst;
    (prisma.draftCandidate.create as unknown as typeof prisma.draftCandidate.create) =
      originalCreate;
    (prisma.draftCandidate.update as unknown as typeof prisma.draftCandidate.update) =
      originalUpdate;
  }

  const updatePayload = calls[0]?.[1] as {
    where: { id: string };
    data: Record<string, unknown>;
  };
  assert.equal(updatePayload.where.id, "draft_1");
  assert.equal(updatePayload.data.status, "DRAFT");
  assert.equal(updatePayload.data.publishedTweetId, null);
  assert.equal(updatePayload.data.postedAt, null);
  assert.equal(updatePayload.data.observedAt, null);
  assert.equal(updatePayload.data.title, "@builder - refined reply text");
  assert.equal(
    (updatePayload.data.artifact as { id?: string; content?: string }).id,
    "extension-reply-tweet_123",
  );
  assert.equal(
    (updatePayload.data.artifact as { content?: string }).content,
    "refined reply text",
  );
});

test("persistGeneratedExtensionReplyDraft creates a new draft when only posted reply history exists", async () => {
  const originalFindFirst = prisma.draftCandidate.findFirst;
  const originalCreate = prisma.draftCandidate.create;
  const originalUpdate = prisma.draftCandidate.update;
  let createCount = 0;

  try {
    (prisma.draftCandidate.findFirst as unknown as (...args: unknown[]) => unknown) = async () =>
      null;
    (prisma.draftCandidate.create as unknown as (...args: unknown[]) => unknown) = async (
      payload,
    ) => {
      createCount += 1;
      return payload;
    };
    (prisma.draftCandidate.update as unknown as (...args: unknown[]) => unknown) = async () => {
      throw new Error("posted history should not be overwritten");
    };

    await persistGeneratedExtensionReplyDraft({
      userId: "user_1",
      xHandle: "standev",
      replySourcePostId: "tweet_123",
      sourcePostText: "Source post text",
      sourceAuthorHandle: "builder",
      replyText: "brand new draft after posting",
      replySourcePreview: replySourcePreviewFixture,
    });
  } finally {
    (prisma.draftCandidate.findFirst as unknown as typeof prisma.draftCandidate.findFirst) =
      originalFindFirst;
    (prisma.draftCandidate.create as unknown as typeof prisma.draftCandidate.create) =
      originalCreate;
    (prisma.draftCandidate.update as unknown as typeof prisma.draftCandidate.update) =
      originalUpdate;
  }

  assert.equal(createCount, 1);
});

test("syncPostedExtensionReplyDraft promotes the saved reply draft and syncs the final text", async () => {
  const originalFindFirst = prisma.draftCandidate.findFirst;
  const originalUpdate = prisma.draftCandidate.update;
  const postedAt = new Date("2026-03-20T15:30:00.000Z");
  const calls: Array<unknown> = [];

  try {
    (prisma.draftCandidate.findFirst as unknown as (...args: unknown[]) => unknown) = async () => ({
      id: "draft_1",
      title: "@builder - old reply",
      sourcePrompt: "old source prompt",
      artifact: {
        id: "extension-reply-tweet_123",
        title: "@builder - old reply",
        kind: "reply_candidate",
        content: "old reply",
        replySourcePreview: replySourcePreviewFixture,
      },
      voiceTarget: { lane: "reply" },
    });
    (prisma.draftCandidate.update as unknown as (...args: unknown[]) => unknown) = async (
      payload,
    ) => {
      calls.push(payload);
      return payload;
    };

    await syncPostedExtensionReplyDraft({
      userId: "user_1",
      xHandle: "standev",
      replySourcePostId: "tweet_123",
      sourceAuthorHandle: "builder",
      finalReplyText: "final posted reply",
      postedAt,
    });
  } finally {
    (prisma.draftCandidate.findFirst as unknown as typeof prisma.draftCandidate.findFirst) =
      originalFindFirst;
    (prisma.draftCandidate.update as unknown as typeof prisma.draftCandidate.update) =
      originalUpdate;
  }

  const updatePayload = calls[0] as {
    where: { id: string };
    data: Record<string, unknown>;
  };
  assert.equal(updatePayload.where.id, "draft_1");
  assert.equal(updatePayload.data.status, "PUBLISHED");
  assert.equal(updatePayload.data.reviewStatus, "posted");
  assert.equal(updatePayload.data.postedAt, postedAt);
  assert.equal(updatePayload.data.title, "@builder - final posted reply");
  assert.equal(
    (updatePayload.data.artifact as { content?: string }).content,
    "final posted reply",
  );
});
