import test from "node:test";
import assert from "node:assert/strict";
import {
  assertExtensionOpportunityBatchResponseShape,
  parseExtensionOpportunityBatchRequest,
} from "./route.logic.ts";
import { handleExtensionOpportunityBatchPost } from "./route.handler.ts";

const validPayload = {
  pageUrl: "https://x.com/home",
  surface: "home",
  candidates: [
    {
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
        hasMedia: false,
        hasImage: false,
        hasVideo: false,
        hasGif: false,
        hasLink: false,
        hasPoll: false,
      },
      surface: "home",
      captureSource: "graphql",
      capturedAtIso: "2026-03-11T10:05:00.000Z",
    },
  ],
};

test("parseExtensionOpportunityBatchRequest accepts the extension contract payload", () => {
  const parsed = parseExtensionOpportunityBatchRequest(validPayload);
  assert.equal(parsed.ok, true);
});

test("parseExtensionOpportunityBatchRequest rejects unknown keys from strict schemas", () => {
  const parsed = parseExtensionOpportunityBatchRequest({
    ...validPayload,
    candidates: [{ ...validPayload.candidates[0], unexpected: true }],
  });

  assert.equal(parsed.ok, false);
});

test("assertExtensionOpportunityBatchResponseShape enforces exact response structure", () => {
  assert.equal(
    assertExtensionOpportunityBatchResponseShape({
      opportunities: [
        {
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
      ],
      notes: ["Backend scoring is authoritative and tuned for 0 to 1,000 follower growth."],
    }),
    true,
  );
  assert.equal(
    assertExtensionOpportunityBatchResponseShape({
      opportunities: [
        {
          opportunityId: "opp_1",
          postId: "post_1",
          score: 81,
          verdict: "reply",
          why: [],
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
      ],
      notes: ["note"],
    }),
    false,
  );
});

test("POST returns 401 when extension auth rejects the bearer token", async () => {
  const response = await handleExtensionOpportunityBatchPost(
    new Request("http://localhost/api/extension/opportunity-batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer revoked_token",
      },
      body: JSON.stringify(validPayload),
    }),
    {
      authenticateExtensionRequest: async () => null,
      parseExtensionOpportunityBatchRequest,
      loadExtensionUserContext: async () => {
        throw new Error("should not be reached");
      },
      getReplyInsightsForUser: async () => {
        throw new Error("should not be reached");
      },
      rankOpportunityBatch: () => {
        throw new Error("should not be reached");
      },
      persistRankedOpportunity: async () => {
        throw new Error("should not be reached");
      },
      assertExtensionOpportunityBatchResponseShape,
      recordProductEvent: async () => {},
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 401);
});

test("POST passes reply insights into opportunity ranking", async () => {
  const rankCalls = [];

  const response = await handleExtensionOpportunityBatchPost(
    new Request("http://localhost/api/extension/opportunity-batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token_123",
      },
      body: JSON.stringify(validPayload),
    }),
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "standev",
        },
      }),
      parseExtensionOpportunityBatchRequest,
      loadExtensionUserContext: async () => ({
        ok: true,
        xHandle: "standev",
        styleCard: null,
        storedRun: {
          result: {
            growthStage: "0_to_1k",
            strategyState: {
              growthStage: "0_to_1k",
              goal: "followers",
            },
          },
        },
        context: {
          growthStrategySnapshot: {
            knownFor: "product positioning",
          },
        },
      }),
      getReplyInsightsForUser: async () => ({
        topIntentAnchors: [
          {
            label: "proof | the proof layer",
            totalProfileClicks: 5,
          },
        ],
      }),
      rankOpportunityBatch: (args) => {
        rankCalls.push(args);
        return {
          ranked: [
            {
              candidate: { postId: "post_1" },
              opportunity: {
                opportunityId: "opp_1",
                postId: "post_1",
                score: 82,
                verdict: "reply",
                why: ["Strong niche overlap with your saved content pillars."],
                riskFlags: [],
                suggestedAngle: "example",
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
            },
          ],
          topRanked: [{ candidate: { postId: "post_1" } }],
          notes: ["Ranking is biased toward reply patterns similar to \"proof | the proof layer\"."],
        };
      },
      persistRankedOpportunity: async () => ({
        candidate: { postId: "post_1" },
        opportunity: {
          opportunityId: "opp_1",
          postId: "post_1",
          score: 82,
          verdict: "reply",
          why: ["Strong niche overlap with your saved content pillars."],
          riskFlags: [],
          suggestedAngle: "example",
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
      }),
      assertExtensionOpportunityBatchResponseShape,
      recordProductEvent: async () => {},
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(rankCalls.length, 1);
  assert.equal(rankCalls[0]?.replyInsights?.topIntentAnchors?.[0]?.label, "proof | the proof layer");
});
