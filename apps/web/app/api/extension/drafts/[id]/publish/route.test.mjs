import test from "node:test";
import assert from "node:assert/strict";

import { parseExtensionDraftPublishRequest } from "../../route.logic.ts";
import { handleExtensionDraftPublishPost } from "./route.handler.ts";

test("POST /api/extension/drafts/[id]/publish returns 404 when the draft is not found for the active handle", async () => {
  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }),
    { id: "draft_1" },
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "standev",
        },
      }),
      parseExtensionDraftPublishRequest,
      findDraft: async () => null,
      publishDraft: async () => {
        throw new Error("should not be reached");
      },
    },
  );

  assert.equal(response.status, 404);
});

test("POST /api/extension/drafts/[id]/publish passes the published tweet id through to persistence", async () => {
  const calls = [];

  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publishedTweetId: "1901234567890",
      }),
    }),
    { id: "draft_1" },
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "@StanDev",
        },
      }),
      parseExtensionDraftPublishRequest,
      findDraft: async () => ({
        id: "draft_1",
        publishedTweetId: null,
      }),
      publishDraft: async (payload) => {
        calls.push(payload);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [
    {
      id: "draft_1",
      publishedTweetId: "1901234567890",
    },
  ]);
});
