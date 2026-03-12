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
