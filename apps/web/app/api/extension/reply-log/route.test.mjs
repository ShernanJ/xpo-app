import test from "node:test";
import assert from "node:assert/strict";
import { parseExtensionReplyLogRequest } from "./route.logic.ts";
import { handleExtensionReplyLogPost } from "./route.handler.ts";

const validPayload = {
  event: "generated",
  opportunityId: "opp_1",
  postId: "post_1",
  postText: "Positioning usually breaks because the product promise stays too broad.",
  postUrl: "https://x.com/builder/status/1",
  authorHandle: "builder",
  surface: "home",
  verdict: "reply",
  angle: "nuance",
  expectedValue: {
    visibility: "high",
    profileClicks: "medium",
    followConversion: "medium",
  },
  riskFlags: ["genericity risk"],
  source: "remote",
  generatedReplyIds: ["r1", "r2"],
  generatedReplyLabels: ["nuance", "disagree"],
  generatedReplyIntents: [
    {
      label: "nuance",
      strategyPillar: "product positioning",
      anchor: "positioning | clarity",
      rationale: "push past agreement by grounding the point in positioning clarity",
    },
  ],
};

test("parseExtensionReplyLogRequest accepts generated lifecycle payloads", () => {
  const parsed = parseExtensionReplyLogRequest(validPayload);
  assert.equal(parsed.ok, true);
});

test("parseExtensionReplyLogRequest rejects invalid lifecycle values", () => {
  const parsed = parseExtensionReplyLogRequest({
    ...validPayload,
    event: "bad",
  });

  assert.equal(parsed.ok, false);
});

test("parseExtensionReplyLogRequest keeps copied reply payloads", () => {
  const parsed = parseExtensionReplyLogRequest({
    ...validPayload,
    event: "copied",
    copiedReplyId: "r1",
    copiedReplyLabel: "nuance",
    copiedReplyText: "the useful nuance is the positioning clarity.",
    copiedReplyIntent: {
      label: "nuance",
      strategyPillar: "product positioning",
      anchor: "positioning | clarity",
      rationale: "push past agreement by grounding the point in positioning clarity",
    },
  });

  assert.equal(parsed.ok, true);
});

test("parseExtensionReplyLogRequest accepts observed outcome metrics", () => {
  const parsed = parseExtensionReplyLogRequest({
    ...validPayload,
    event: "observed",
    copiedReplyId: "r1",
    copiedReplyLabel: "nuance",
    copiedReplyIntent: {
      label: "nuance",
      strategyPillar: "product positioning",
      anchor: "positioning | clarity",
      rationale: "push past agreement by grounding the point in positioning clarity",
    },
    observedMetrics: {
      likeCount: 12,
      replyCount: 4,
      profileClicks: 3,
      followerDelta: 1,
    },
  });

  assert.equal(parsed.ok, true);
});

test("POST returns ok:true when persistence throws after auth and validation", async () => {
  const logCalls = [];
  const recordCalls = [];

  const response = await handleExtensionReplyLogPost(
    new Request("http://localhost/api/extension/reply-log", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token_123",
      },
      body: JSON.stringify(validPayload),
    }),
    {
      authenticateExtensionRequest: async () => ({
        tokenId: "tok_1",
        scope: "xpo-companion-extension",
        expiresAt: "2026-04-01T00:00:00.000Z",
        user: {
          id: "user_1",
          activeXHandle: "standev",
          handle: "standev",
          email: "stan@example.com",
          name: "Stan",
        },
      }),
      parseExtensionReplyLogRequest,
      findReplyOpportunity: async () => {
        throw new Error("db exploded");
      },
      mergeStoredOpportunityNotes: () => ({}),
      updateReplyOpportunity: async () => {},
      recordProductEvent: async (payload) => {
        recordCalls.push(payload);
      },
      logExtensionRouteFailure: (payload) => {
        logCalls.push(payload);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(recordCalls.length, 0);
  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0]?.route, "reply-log");
});

test("POST persists observed metrics and follow conversion outcome metadata", async () => {
  const updateCalls = [];
  const eventCalls = [];

  const existing = {
    id: "opp_1",
    userId: "user_1",
    xHandle: "standev",
    tweetId: "post_1",
    authorHandle: "builder",
    tweetText: validPayload.postText,
    tweetUrl: validPayload.postUrl,
    tweetSnapshot: {},
    heuristicScore: 72,
    heuristicTier: "high",
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
    strategyPillar: "product positioning",
    generatedAngleLabel: "nuance",
    state: "copied",
    openedAt: new Date("2026-03-12T12:00:00.000Z"),
    generatedAt: new Date("2026-03-12T12:01:00.000Z"),
    selectedAt: new Date("2026-03-12T12:02:00.000Z"),
    copiedAt: new Date("2026-03-12T12:03:00.000Z"),
    postedAt: new Date("2026-03-12T12:04:00.000Z"),
    dismissedAt: null,
    observedAt: null,
    generatedOptions: null,
    notes: {
      analytics: {
        copiedReplyIntent: {
          label: "nuance",
          strategyPillar: "product positioning",
          anchor: "positioning | clarity",
          rationale: "push past agreement by grounding the point in positioning clarity",
        },
      },
    },
    selectedOptionId: "r1",
    selectedOptionText: "reply text",
    selectedAngleLabel: "nuance",
    observedMetrics: null,
    createdAt: new Date("2026-03-12T12:00:00.000Z"),
    updatedAt: new Date("2026-03-12T12:04:00.000Z"),
  };

  const response = await handleExtensionReplyLogPost(
    new Request("http://localhost/api/extension/reply-log", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token_123",
      },
      body: JSON.stringify({
        ...validPayload,
        event: "observed",
        copiedReplyId: "r1",
        copiedReplyLabel: "nuance",
        copiedReplyIntent: {
          label: "nuance",
          strategyPillar: "product positioning",
          anchor: "positioning | clarity",
          rationale: "push past agreement by grounding the point in positioning clarity",
        },
        observedMetrics: {
          likeCount: 12,
          replyCount: 4,
          profileClicks: 3,
          followerDelta: 1,
        },
      }),
    }),
    {
      authenticateExtensionRequest: async () => ({
        tokenId: "tok_1",
        scope: "xpo-companion-extension",
        expiresAt: "2026-04-01T00:00:00.000Z",
        user: {
          id: "user_1",
          activeXHandle: "standev",
          handle: "standev",
          email: "stan@example.com",
          name: "Stan",
        },
      }),
      parseExtensionReplyLogRequest,
      findReplyOpportunity: async () => existing,
      mergeStoredOpportunityNotes: (_record, patch) => patch,
      updateReplyOpportunity: async (payload) => {
        updateCalls.push(payload);
      },
      recordProductEvent: async (payload) => {
        eventCalls.push(payload);
      },
      logExtensionRouteFailure: () => {},
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0]?.data.observedMetrics, {
    likeCount: 12,
    replyCount: 4,
    profileClicks: 3,
    followerDelta: 1,
  });
  assert.equal(
    updateCalls[0]?.data.notes.analytics.followConversionOutcome.intentAnchor,
    "positioning | clarity",
  );
  assert.equal(
    updateCalls[0]?.data.notes.analytics.followConversionOutcome.hasFollowConversionSignal,
    true,
  );
  assert.equal(eventCalls[0]?.properties.profileClicks, 3);
  assert.equal(eventCalls[0]?.properties.followerDelta, 1);
});
