import test from "node:test";
import assert from "node:assert/strict";

import { buildExtensionReplyOptions } from "./replyOptions.ts";
import type { GrowthStrategySnapshot } from "../onboarding/growthStrategy.ts";

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
