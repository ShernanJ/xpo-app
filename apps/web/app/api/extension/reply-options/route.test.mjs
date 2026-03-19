import test from "node:test";
import assert from "node:assert/strict";

import {
  assertExtensionReplyOptionsResponseShape,
  parseExtensionReplyOptionsRequest,
} from "./route.logic.ts";

const validRequest = {
  opportunityId: "opp_1",
  post: {
    postId: "post_1",
    author: {
      id: "author_1",
      handle: "builder",
      name: "Builder",
      verified: false,
      followerCount: 4200,
    },
    text: "Positioning usually breaks because the product promise stays too broad.",
    url: "https://x.com/builder/status/1",
    createdAtIso: "2026-03-11T10:00:00.000Z",
    engagement: {
      replyCount: 2,
      repostCount: 1,
      likeCount: 9,
      quoteCount: 0,
      viewCount: 380,
    },
    postType: "original",
    conversation: {
      conversationId: "conv_1",
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
          imageUrl: "https://pbs.twimg.com/media/example.jpg",
          altText: 'Tweet screenshot showing "Posts aren\'t loading right now".',
        },
      ],
    },
    surface: "home",
    captureSource: "graphql",
    capturedAtIso: "2026-03-11T10:05:00.000Z",
  },
  opportunity: {
    opportunityId: "opp_1",
    postId: "post_1",
    score: 81,
    verdict: "reply",
    why: ["Strong niche overlap with your saved content pillars."],
    riskFlags: [],
    suggestedAngle: "nuance",
    expectedValue: {
      visibility: "high",
      profileClicks: "medium",
      followConversion: "medium",
    },
    scoringBreakdown: {
      niche_match: 85,
      audience_fit: 70,
      freshness: 82,
      conversation_quality: 75,
      profile_click_potential: 78,
      follow_conversion_potential: 69,
      visibility_potential: 64,
      spam_risk: 10,
      off_niche_risk: 14,
      genericity_risk: 18,
      negative_signal_risk: 4,
    },
  },
};

test("parseExtensionReplyOptionsRequest accepts the extension contract payload", () => {
  const parsed = parseExtensionReplyOptionsRequest(validRequest);
  assert.equal(parsed.ok, true);
});

test("assertExtensionReplyOptionsResponseShape enforces allowed labels and option counts", () => {
  assert.equal(
    assertExtensionReplyOptionsResponseShape({
      options: [
        {
          id: "nuance-1",
          label: "nuance",
          text: "the useful nuance is the positioning clarity.",
          intent: {
            label: "nuance",
            strategyPillar: "product positioning",
            anchor: "positioning | clarity",
            rationale: "push past agreement by grounding the point in positioning clarity",
          },
        },
        {
          id: "sharpen-2",
          label: "sharpen",
          text: "sharper take: the positioning clarity is the hinge.",
        },
      ],
      warnings: [],
      groundingNotes: ["Anchored to product positioning."],
    }),
    true,
  );
  assert.equal(
    assertExtensionReplyOptionsResponseShape({
      options: [{ id: "bad", label: "other", text: "bad" }],
      warnings: [],
      groundingNotes: ["note"],
    }),
    false,
  );
});
