import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExtensionReplyOptions,
  prepareExtensionReplyOptionsPolicy,
  verifyExtensionReplyOptionsResponse,
} from "./replyOptions.ts";
import type { GrowthStrategySnapshot } from "../onboarding/strategy/growthStrategy.ts";

const strategy: GrowthStrategySnapshot = {
  knownFor: "software and product through product positioning",
  targetAudience: "builders who want clearer positioning on X",
  contentPillars: ["product positioning", "reply leverage", "proof-first posting"],
  replyGoals: ["Turn relevant replies into profile clicks from the right niche."],
  profileConversionCues: ["Bio and pinned post should make the niche obvious."],
  offBrandThemes: ["broad motivational advice with no niche tie"],
  ambiguities: [],
  confidence: {
    overall: 72,
    positioning: 70,
    replySignal: 64,
    readiness: "ready",
  },
  truthBoundary: {
    verifiedFacts: ["Primary niche: software and product"],
    inferredThemes: ["product positioning", "reply leverage"],
    unknowns: [],
  },
};

test("buildExtensionReplyOptions returns 1 to 3 distinct grounded reply options", () => {
  const response = buildExtensionReplyOptions({
    post: {
      postId: "post_1",
      author: {
        id: "author_1",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 6200,
      },
      text: "Most people talk about positioning like a slogan problem instead of a product problem.",
      url: "https://x.com/builder/status/1",
      createdAtIso: "2026-03-11T10:00:00.000Z",
      engagement: {
        replyCount: 3,
        repostCount: 1,
        likeCount: 12,
        quoteCount: 0,
        viewCount: 550,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_1",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T10:10:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_1",
      postId: "post_1",
      score: 79,
      verdict: "reply",
      why: ["Strong niche overlap with your saved content pillars."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "high",
        profileClicks: "high",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 82,
        audience_fit: 74,
        freshness: 88,
        conversation_quality: 79,
        profile_click_potential: 84,
        follow_conversion_potential: 72,
        visibility_potential: 70,
        spam_risk: 8,
        off_niche_risk: 12,
        genericity_risk: 18,
        negative_signal_risk: 5,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "builder",
    goal: "followers",
  });

  assert.equal(response.options.length >= 1 && response.options.length <= 3, true);
  assert.equal(
    response.options.every((option) =>
      ["nuance", "sharpen", "disagree", "example", "translate", "known_for"].includes(option.label),
    ),
    true,
  );
  assert.equal(new Set(response.options.map((option) => option.text)).size, response.options.length);
  assert.equal(response.groundingNotes.length > 0, true);
});

test("buildExtensionReplyOptions avoids generic agreement-only replies", () => {
  const response = buildExtensionReplyOptions({
    post: {
      postId: "post_2",
      author: {
        id: "author_2",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 4100,
      },
      text: "Positioning breaks when the product promise stays too broad.",
      url: "https://x.com/builder/status/2",
      createdAtIso: "2026-03-11T11:00:00.000Z",
      engagement: {
        replyCount: 2,
        repostCount: 0,
        likeCount: 8,
        quoteCount: 0,
        viewCount: 300,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_2",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T11:05:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_2",
      postId: "post_2",
      score: 77,
      verdict: "reply",
      why: ["Strong niche overlap with your positioning pillar."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "medium",
        profileClicks: "medium",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 80,
        audience_fit: 72,
        freshness: 78,
        conversation_quality: 76,
        profile_click_potential: 75,
        follow_conversion_potential: 69,
        visibility_potential: 63,
        spam_risk: 9,
        off_niche_risk: 12,
        genericity_risk: 19,
        negative_signal_risk: 4,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "builder",
    goal: "followers",
  });

  for (const option of response.options) {
    assert.equal(/^(great|good|nice|agreed|totally|exactly)\b/i.test(option.text), false);
    assert.equal(/\b(positioning|product|usable|clarity)\b/i.test(option.text), true);
  }
});

test("buildExtensionReplyOptions removes combative lanes for sensitive room contexts", () => {
  const response = buildExtensionReplyOptions({
    post: {
      postId: "post_sensitive",
      author: {
        id: "author_sensitive",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 4100,
      },
      text: "i'm honestly exhausted by how hard this has been",
      url: "https://x.com/builder/status/sensitive",
      createdAtIso: "2026-03-11T11:00:00.000Z",
      engagement: {
        replyCount: 2,
        repostCount: 0,
        likeCount: 8,
        quoteCount: 0,
        viewCount: 300,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_sensitive",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T11:05:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_sensitive",
      postId: "post_sensitive",
      score: 74,
      verdict: "reply",
      why: ["Still niche-relevant, but tone needs care."],
      riskFlags: [],
      suggestedAngle: "disagree",
      expectedValue: {
        visibility: "medium",
        profileClicks: "medium",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 70,
        audience_fit: 70,
        freshness: 82,
        conversation_quality: 73,
        profile_click_potential: 69,
        follow_conversion_potential: 60,
        visibility_potential: 60,
        spam_risk: 8,
        off_niche_risk: 12,
        genericity_risk: 18,
        negative_signal_risk: 5,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "builder",
    goal: "followers",
    replyContext: {
      room_sentiment: "vulnerability",
      social_intent: "looking for care",
      recommended_stance: "be warm and avoid scoring points",
      banned_angles: ["disagree", "pushback"],
    },
  });

  assert.equal(response.options.some((option) => option.label === "disagree"), false);
  assert.equal(
    response.warnings.some((entry) => entry.includes("Sensitive room detected")),
    true,
  );
  assert.equal(
    response.groundingNotes.some((entry) => entry.includes("Recommended stance: be warm and avoid scoring points.")),
    true,
  );
});

test("buildExtensionReplyOptions follows a stable opportunity -> intent ordering", () => {
  const response = buildExtensionReplyOptions({
    post: {
      postId: "post_3",
      author: {
        id: "author_3",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 3000,
      },
      text: "Product positioning breaks when the promise sounds broad enough for everyone.",
      url: "https://x.com/builder/status/3",
      createdAtIso: "2026-03-11T12:00:00.000Z",
      engagement: {
        replyCount: 1,
        repostCount: 0,
        likeCount: 6,
        quoteCount: 0,
        viewCount: 210,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_3",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T12:05:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_3",
      postId: "post_3",
      score: 76,
      verdict: "reply",
      why: ["Clear overlap with your positioning content pillar."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "medium",
        profileClicks: "medium",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 77,
        audience_fit: 73,
        freshness: 79,
        conversation_quality: 70,
        profile_click_potential: 74,
        follow_conversion_potential: 68,
        visibility_potential: 62,
        spam_risk: 8,
        off_niche_risk: 11,
        genericity_risk: 17,
        negative_signal_risk: 4,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "builder",
    goal: "followers",
  });

  assert.deepEqual(response.options.map((option) => option.label), ["nuance", "sharpen", "example"]);
});

test("buildExtensionReplyOptions biases the first option toward converting learned intents", () => {
  const response = buildExtensionReplyOptions({
    post: {
      postId: "post_4",
      author: {
        id: "author_4",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 3000,
      },
      text: "Proof is what makes positioning advice actually land.",
      url: "https://x.com/builder/status/4",
      createdAtIso: "2026-03-11T12:30:00.000Z",
      engagement: {
        replyCount: 1,
        repostCount: 0,
        likeCount: 5,
        quoteCount: 0,
        viewCount: 220,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_4",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T12:35:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_4",
      postId: "post_4",
      score: 75,
      verdict: "reply",
      why: ["Strong overlap with your proof-first positioning pillar."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "medium",
        profileClicks: "high",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 79,
        audience_fit: 71,
        freshness: 80,
        conversation_quality: 72,
        profile_click_potential: 80,
        follow_conversion_potential: 68,
        visibility_potential: 61,
        spam_risk: 8,
        off_niche_risk: 11,
        genericity_risk: 16,
        negative_signal_risk: 4,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "builder",
    goal: "followers",
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
          label: "example",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 1,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 0.5,
        },
      ],
      topIntentAnchors: [
        {
          label: "proof | the proof layer",
          generatedCount: 2,
          selectedCount: 2,
          postedCount: 2,
          observedCount: 2,
          selectionRate: 1,
          postedRate: 1,
          totalProfileClicks: 5,
          totalFollowerDelta: 1,
          averageProfileClicks: 2.5,
          averageFollowerDelta: 0.5,
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

  assert.equal(response.options[0]?.label, "example");
  assert.equal(
    response.groundingNotes.some((entry) => entry.toLowerCase().includes("learning bias")),
    true,
  );
});

test("prepareExtensionReplyOptionsPolicy tags casual off-niche posts before generation", async () => {
  const prepared = await prepareExtensionReplyOptionsPolicy({
    post: {
      postId: "post_5",
      author: {
        id: "author_5",
        handle: "snacker",
        name: "Snacker",
        verified: false,
        followerCount: 1800,
      },
      text: "Just had a full bag of chips #fuckit",
      url: "https://x.com/snacker/status/5",
      createdAtIso: "2026-03-11T13:00:00.000Z",
      engagement: {
        replyCount: 1,
        repostCount: 0,
        likeCount: 5,
        quoteCount: 0,
        viewCount: 240,
      },
      postType: "original",
      conversation: {
        conversationId: "conv_5",
        inReplyToPostId: null,
        inReplyToHandle: null,
      },
      media: {
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T13:05:00.000Z",
    },
    strategy,
  });

  assert.equal(prepared.preflightResult.source_shape, "casual_observation");
  assert.equal(prepared.policy.allowStrategyLens, false);
  assert.equal(prepared.policy.allowBusinessInference, false);
});

test("buildExtensionReplyOptions uses literal casual riffs for off-niche observations", async () => {
  const post = {
    postId: "post_6",
    author: {
      id: "author_6",
      handle: "snacker",
      name: "Snacker",
      verified: false,
      followerCount: 1800,
    },
    text: "Just had a full bag of chips #fuckit",
    url: "https://x.com/snacker/status/6",
    createdAtIso: "2026-03-11T13:00:00.000Z",
    engagement: {
      replyCount: 1,
      repostCount: 0,
      likeCount: 5,
      quoteCount: 0,
      viewCount: 240,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_6",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: false,
      hasImage: false,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-11T13:05:00.000Z",
  };
  const prepared = await prepareExtensionReplyOptionsPolicy({ post, strategy });
  const response = buildExtensionReplyOptions({
    post,
    opportunity: {
      opportunityId: "opp_6",
      postId: "post_6",
      score: 48,
      verdict: "watch",
      why: ["Low-signal casual observation."],
      riskFlags: ["off niche risk"],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "low",
        profileClicks: "low",
        followConversion: "low",
      },
      scoringBreakdown: {
        niche_match: 12,
        audience_fit: 18,
        freshness: 78,
        conversation_quality: 32,
        profile_click_potential: 22,
        follow_conversion_potential: 18,
        visibility_potential: 41,
        spam_risk: 6,
        off_niche_risk: 74,
        genericity_risk: 52,
        negative_signal_risk: 2,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "playful",
    goal: "followers",
    preflightResult: prepared.preflightResult,
    policy: prepared.policy,
  });

  assert.equal(response.options.length >= 1, true);
  assert.equal(
    response.options.every(
      (option) => !/\b(sprint|workflow|operator|product|startup|next build|remember to|you should)\b/i.test(option.text),
    ),
    true,
  );
  assert.equal(
    response.groundingNotes.some((note) => note.includes("Literal casual riff mode is active")),
    true,
  );
});

test("image-led joke posts stay anchored to the screenshot instead of business drift", async () => {
  const post = {
    postId: "post_7",
    author: {
      id: "author_7",
      handle: "chribjel",
      name: "Christoffer Bjelke",
      verified: true,
      followerCount: 12000,
    },
    text: "Perfect algo pull",
    url: "https://x.com/chribjel/status/7",
    createdAtIso: "2026-03-18T15:29:00.000Z",
    engagement: {
      replyCount: 8,
      repostCount: 12,
      likeCount: 420,
      quoteCount: 4,
      viewCount: 64000,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_7",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: true,
      hasImage: true,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
      images: [
        {
          altText:
            'Tweet screenshot showing the X app banner "Posts aren\'t loading right now" above a nested tweet image.',
        },
      ],
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-18T15:31:00.000Z",
  };
  const prepared = await prepareExtensionReplyOptionsPolicy({ post, strategy });
  const response = buildExtensionReplyOptions({
    post,
    opportunity: {
      opportunityId: "opp_7",
      postId: "post_7",
      score: 63,
      verdict: "watch",
      why: ["The screenshot is doing the heavy lifting for the joke."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "medium",
        profileClicks: "low",
        followConversion: "low",
      },
      scoringBreakdown: {
        niche_match: 32,
        audience_fit: 41,
        freshness: 82,
        conversation_quality: 61,
        profile_click_potential: 38,
        follow_conversion_potential: 30,
        visibility_potential: 58,
        spam_risk: 4,
        off_niche_risk: 46,
        genericity_risk: 29,
        negative_signal_risk: 1,
      },
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0-1k",
    tone: "playful",
    goal: "followers",
    sourceContext: prepared.sourceContext,
    visualContext: prepared.visualContext,
    preflightResult: prepared.preflightResult,
    policy: prepared.policy,
  });

  assert.equal(prepared.preflightResult.image_role, "punchline");
  assert.equal(
    response.options.some((option) => /posts? aren'?t loading right now|perfect algo pull/i.test(option.text)),
    true,
  );
  assert.equal(
    response.options.every(
      (option) => !/\b(cheap traffic hack|real win|repeatable onboarding|workflow|startup|product)\b/i.test(option.text),
    ),
    true,
  );
});

test("verifyExtensionReplyOptionsResponse rewrites unsupported adjacent ideation on parody mockups", async () => {
  const post = {
    postId: "post_8",
    author: {
      id: "author_8",
      handle: "elkelk",
      name: "Eli",
      verified: true,
      followerCount: 12000,
    },
    text: "Idea: X Premium Pro Max Plus where you can see who's viewed your profile and bookmarked your tweets",
    url: "https://x.com/elkelk/status/8",
    createdAtIso: "2026-03-17T19:04:00.000Z",
    engagement: {
      replyCount: 4,
      repostCount: 3,
      likeCount: 38,
      quoteCount: 1,
      viewCount: 390,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_8",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: true,
      hasImage: true,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
      images: [
        {
          altText:
            'Fake premium UI screenshot showing "Unlock X Premium", "See Who\'s Viewing You!", and "$800 / month".',
        },
      ],
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-17T19:05:00.000Z",
  };
  const prepared = await prepareExtensionReplyOptionsPolicy({ post, strategy });
  const verified = await verifyExtensionReplyOptionsResponse({
    response: {
      options: [
        {
          id: "nuance-1",
          label: "nuance",
          text: "that's an interesting idea, but it'd be more valuable if you could also see who's replied to your tweets.",
        },
      ],
      warnings: [],
      groundingNotes: [],
    },
    sourceContext: prepared.sourceContext,
    visualContext: prepared.visualContext,
    preflightResult: prepared.preflightResult,
  });

  assert.equal(prepared.preflightResult.interpretation?.literality, "non_literal");
  assert.equal(
    verified.response.options.every((option) => !/\b(replied to your tweets|more valuable if)\b/i.test(option.text)),
    true,
  );
});

test("buildExtensionReplyOptions keeps recruiting posts in public-reaction mode instead of self-nomination", async () => {
  const post = {
    postId: "post_9",
    author: {
      id: "author_9",
      handle: "hiringguy",
      name: "Hiring Guy",
      verified: false,
      followerCount: 4200,
    },
    text:
      "me (and some of my friends) are hiring soon if you love meeting people, finding undiscovered talent before anyone else, and working insanely hard..... @ reply or DM me",
    url: "https://x.com/hiringguy/status/9",
    createdAtIso: "2026-03-19T15:00:00.000Z",
    engagement: {
      replyCount: 12,
      repostCount: 4,
      likeCount: 55,
      quoteCount: 1,
      viewCount: 3100,
    },
    postType: "original" as const,
    conversation: {
      conversationId: "conv_9",
      inReplyToPostId: null,
      inReplyToHandle: null,
    },
    media: {
      hasMedia: true,
      hasImage: true,
      hasVideo: false,
      hasGif: false,
      hasLink: false,
      hasPoll: false,
      images: [{ altText: 'Photo with the word "hiring" above a group of people.' }],
    },
    surface: "home" as const,
    captureSource: "graphql" as const,
    capturedAtIso: "2026-03-19T15:01:00.000Z",
  };
  const prepared = await prepareExtensionReplyOptionsPolicy({ post, strategy });
  const response = buildExtensionReplyOptions({
    post,
    opportunity: {
      opportunityId: "opp_9",
      verdict: "reply",
      suggestedAngle: "nuance",
      expectedValue: "medium",
      riskFlags: [],
      notes: [],
    },
    strategy,
    strategyPillar: "product positioning",
    styleCard: null,
    stage: "0_to_1k",
    tone: "playful",
    goal: "followers",
    sourceContext: prepared.sourceContext,
    visualContext: prepared.visualContext,
    preflightResult: prepared.preflightResult,
    policy: prepared.policy,
  });

  assert.equal(prepared.preflightResult.interpretation?.post_frame, "recruiting_call");
  assert.equal(
    response.options.every((option) => !/\b(dm me|hit me up|count me in|i'?m down|if you need someone)\b/i.test(option.text)),
    true,
  );
  assert.equal(
    response.options.some((option) => /\b(filter|hiring|work insanely hard|qualifier|pitch)\b/i.test(option.text)),
    true,
  );
});
