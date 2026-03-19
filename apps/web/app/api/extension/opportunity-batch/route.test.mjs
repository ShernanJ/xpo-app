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
  ],
};

test("parseExtensionOpportunityBatchRequest accepts the extension contract payload", () => {
  const parsed = parseExtensionOpportunityBatchRequest({
    ...validPayload,
    candidates: Array.from({ length: 3 }, (_, index) => ({
      ...validPayload.candidates[0],
      postId: `post_${index + 1}`,
      url: `https://x.com/builder/status/${index + 1}`,
    })),
  });
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
      scores: [
        {
          tweetId: "post_1",
          opportunityScore: 81,
          reason: "Strong niche overlap with the creator's saved content pillars.",
        },
        { tweetId: "post_2", opportunityScore: 72, reason: "Good audience fit with room for a useful operator take." },
        { tweetId: "post_3", opportunityScore: 64, reason: "Relevant topic, but the angle looks a bit crowded already." },
      ],
    }),
    true,
  );
  assert.equal(
    assertExtensionOpportunityBatchResponseShape({
      scores: [
        {
          tweetId: "post_1",
          opportunityScore: 181,
          reason: "ok",
        },
      ],
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
      resolveExtensionHandleForRequest: async () => {
        throw new Error("should not be reached");
      },
      parseExtensionOpportunityBatchRequest,
      loadExtensionUserContext: async () => {
        throw new Error("should not be reached");
      },
      getReplyInsightsForUser: async () => {
        throw new Error("should not be reached");
      },
      scoreOpportunityBatch: async () => {
        throw new Error("should not be reached");
      },
      assertExtensionOpportunityBatchResponseShape,
      recordProductEvent: async () => {},
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 401);
});

test("POST returns 400 when no explicit workspace handle is provided", async () => {
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
        },
      }),
      resolveExtensionHandleForRequest: async () => ({
        ok: false,
        status: 400,
        field: "xHandle",
        message: "A workspace X handle is required for this request.",
      }),
      parseExtensionOpportunityBatchRequest,
      loadExtensionUserContext: async () => {
        throw new Error("should not be reached");
      },
      getReplyInsightsForUser: async () => {
        throw new Error("should not be reached");
      },
      scoreOpportunityBatch: async () => {
        throw new Error("should not be reached");
      },
      assertExtensionOpportunityBatchResponseShape,
      recordProductEvent: async () => {},
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 400);
});

test("POST passes reply insights into opportunity ranking", async () => {
  const scoreCalls = [];
  const contextCalls = [];
  const expandedPayload = {
    ...validPayload,
    candidates: Array.from({ length: 5 }, (_, index) => ({
      ...validPayload.candidates[0],
      postId: `post_${index + 1}`,
      url: `https://x.com/builder/status/${index + 1}`,
    })),
  };

  const response = await handleExtensionOpportunityBatchPost(
    new Request("http://localhost/api/extension/opportunity-batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token_123",
      },
      body: JSON.stringify(expandedPayload),
    }),
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "standev",
        },
      }),
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "handle_b",
        attachedHandles: ["standev", "handle_b"],
      }),
      parseExtensionOpportunityBatchRequest,
      loadExtensionUserContext: async (args) => {
        contextCalls.push(args);
        return {
          ok: true,
          xHandle: "handle_b",
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
        };
      },
      getReplyInsightsForUser: async () => ({
        bestSignals: ["Example-driven replies are earning the strongest downstream action."],
        cautionSignals: ["Generic agreement is underperforming."],
        topIntentAnchors: [
          {
            label: "proof | the proof layer",
            totalProfileClicks: 5,
          },
        ],
      }),
      scoreOpportunityBatch: async (args) => {
        scoreCalls.push(args);
        return {
          scores: expandedPayload.candidates.map((candidate, index) => ({
            tweetId: candidate.postId,
            opportunityScore: 82 - index,
            reason: `Score uses reply history similar to proof | the proof layer for ${candidate.postId}.`,
          })),
        };
      },
      assertExtensionOpportunityBatchResponseShape,
      recordProductEvent: async () => {},
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(scoreCalls.length, 1);
  assert.deepEqual(contextCalls, [
    {
      userId: "user_1",
      requestedHandle: "handle_b",
      attachedHandles: ["standev", "handle_b"],
    },
  ]);
  assert.equal(scoreCalls[0]?.replyInsights?.topIntentAnchors?.[0]?.label, "proof | the proof layer");
  assert.equal(scoreCalls[0]?.growthStage, "0_to_1k");
  assert.equal(scoreCalls[0]?.goal, "followers");
});
