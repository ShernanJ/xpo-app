import test from "node:test";
import assert from "node:assert/strict";

import { parseExtensionDraftPublishRequest } from "../../route.logic.ts";
import { handleExtensionDraftPublishPost } from "./route.handler.ts";

test("POST /api/extension/drafts/[id]/publish returns 404 when the draft is not found for the requested handle", async () => {
  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        finalPublishedText: "final copy",
      }),
    }),
    { id: "draft_1" },
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
      }),
      parseExtensionDraftPublishRequest,
      finalizeDraftPublish: async () => ({
        ok: false,
        status: 404,
        field: "id",
        message: "Draft not found.",
      }),
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
        finalPublishedText: "Final published post",
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "handle_b",
      }),
      parseExtensionDraftPublishRequest,
      finalizeDraftPublish: async (payload) => {
        calls.push(payload);
        return { ok: true };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [
    {
      id: "draft_1",
      userId: "user_1",
      xHandle: "handle_b",
      finalPublishedText: "Final published post",
      publishedTweetId: "1901234567890",
    },
  ]);
});

test("POST /api/extension/drafts/[id]/publish returns 404 when the scoped publish update no longer matches", async () => {
  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        finalPublishedText: "final copy",
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "handle_b",
      }),
      parseExtensionDraftPublishRequest,
      finalizeDraftPublish: async () => ({
        ok: false,
        status: 404,
        field: "id",
        message: "Draft not found.",
      }),
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "id", message: "Draft not found." }],
  });
});

test("POST /api/extension/drafts/[id]/publish rejects non-draft items from the workspace feed", async () => {
  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        finalPublishedText: "final copy",
      }),
    }),
    { id: "draft_1" },
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
          activeXHandle: "@vitddnv",
        },
      }),
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "vitddnv",
      }),
      parseExtensionDraftPublishRequest,
      finalizeDraftPublish: async () => ({
        ok: false,
        status: 409,
        field: "status",
        message: "Only draft items can be published.",
      }),
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "status", message: "Only draft items can be published." }],
  });
});

test("POST /api/extension/drafts/[id]/publish requires finalPublishedText", async () => {
  const response = await handleExtensionDraftPublishPost(
    new Request("http://localhost/api/extension/drafts/draft_1/publish", {
      method: "POST",
      headers: {
        authorization: "Bearer token_123",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        finalPublishedText: "   ",
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "handle_b",
      }),
      parseExtensionDraftPublishRequest,
      finalizeDraftPublish: async () => {
        throw new Error("should not be reached");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "finalPublishedText", message: "Final published text is required." }],
  });
});
