import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplyIntentPlanForDraft,
  buildReplyIntentPlansFromOpportunity,
} from "./replyIntent.ts";
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

test("buildReplyIntentPlansFromOpportunity creates ordered reply intents before drafting", () => {
  const intents = buildReplyIntentPlansFromOpportunity({
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
  });

  assert.equal(intents.length, 3);
  assert.deepEqual(intents.map((intent) => intent.angleLabel), ["nuance", "sharpen", "example"]);
  assert.equal(intents.every((intent) => intent.rationale.length > 12), true);
  assert.equal(intents.every((intent) => intent.anchor.length > 6), true);
});

test("buildReplyIntentPlanForDraft picks a first-class intent before reply writing", () => {
  const intent = buildReplyIntentPlanForDraft({
    sourceText: "How do you make replies worth reading instead of generic agreement?",
    goal: "followers",
    strategy,
  });

  assert.equal(intent.angleLabel, "translate");
  assert.equal(intent.strategyPillar, "product positioning");
  assert.match(intent.rationale, /translate|practical language/i);
});

test("reply intent planning reprioritizes labels with proven conversion outcomes", () => {
  const intents = buildReplyIntentPlansFromOpportunity({
    post: {
      postId: "post_4",
      author: {
        id: "author_4",
        handle: "builder",
        name: "Builder",
        verified: false,
        followerCount: 4100,
      },
      text: "Positioning gets easier once the product proof is concrete.",
      url: "https://x.com/builder/status/4",
      createdAtIso: "2026-03-11T12:00:00.000Z",
      engagement: {
        replyCount: 1,
        repostCount: 0,
        likeCount: 6,
        quoteCount: 0,
        viewCount: 240,
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
      capturedAtIso: "2026-03-11T12:05:00.000Z",
    },
    opportunity: {
      opportunityId: "opp_4",
      postId: "post_4",
      score: 74,
      verdict: "reply",
      why: ["Clear overlap with your proof-first content pillar."],
      riskFlags: [],
      suggestedAngle: "nuance",
      expectedValue: {
        visibility: "medium",
        profileClicks: "medium",
        followConversion: "medium",
      },
      scoringBreakdown: {
        niche_match: 76,
        audience_fit: 70,
        freshness: 80,
        conversation_quality: 73,
        profile_click_potential: 71,
        follow_conversion_potential: 69,
        visibility_potential: 62,
        spam_risk: 8,
        off_niche_risk: 10,
        genericity_risk: 17,
        negative_signal_risk: 4,
      },
    },
    strategy,
    strategyPillar: "product positioning",
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
          totalProfileClicks: 4,
          totalFollowerDelta: 1,
          averageProfileClicks: 2,
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
          totalProfileClicks: 4,
          totalFollowerDelta: 1,
          averageProfileClicks: 2,
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

  assert.equal(intents[0]?.angleLabel, "example");
});
