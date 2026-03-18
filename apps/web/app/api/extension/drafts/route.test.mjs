import test from "node:test";
import assert from "node:assert/strict";

import {
  assertExtensionDraftsResponseShape,
} from "./route.logic.ts";
import { handleExtensionDraftsGet } from "./route.handler.ts";

test("GET /api/extension/drafts returns 401 when auth fails", async () => {
  const response = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer revoked",
      },
    }),
    {
      authenticateExtensionRequest: async () => null,
      listDrafts: async () => [],
      assertExtensionDraftsResponseShape,
    },
    "standev",
  );

  assert.equal(response.status, 401);
});

test("GET /api/extension/drafts returns 400 when handle is missing", async () => {
  const response = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
      },
    }),
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
        },
      }),
      listDrafts: async () => [],
      assertExtensionDraftsResponseShape,
    },
    null,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "handle", message: "A handle query parameter is required." }],
  });
});

test("GET /api/extension/drafts scopes to the requested handle and returns only valid draft payloads", async () => {
  const calls = [];

  const response = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
      },
    }),
    {
      authenticateExtensionRequest: async () => ({
        user: {
          id: "user_1",
        },
      }),
      listDrafts: async (args) => {
        calls.push(args);
        return [
          {
            id: "draft_1",
            title: "Queue item",
            sourcePrompt: "draft a sharp positioning post",
            sourcePlaybook: "recommended_angle",
            outputShape: "short_form_post",
            status: "DRAFT",
            reviewStatus: "pending",
            folder: {
              id: "folder_1",
              name: "Launch week",
              color: "#f59e0b",
              createdAt: "2026-03-17T12:00:00.000Z",
            },
            artifact: {
              id: "short_form_post-1",
              title: "Post 1",
              kind: "short_form_post",
              content: "shipping the content hub today",
              posts: [
                {
                  id: "post-1",
                  content: "shipping the content hub today",
                  weightedCharacterCount: 31,
                  maxCharacterLimit: 280,
                  isWithinXLimit: true,
                },
              ],
            },
            createdAt: "2026-03-17T12:00:00.000Z",
            updatedAt: "2026-03-17T12:05:00.000Z",
          },
        ];
      },
      assertExtensionDraftsResponseShape,
    },
    "@StanDev",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: "user_1", xHandle: "standev" }]);
  assert.deepEqual(await response.json(), {
    drafts: [
      {
        id: "draft_1",
        title: "Queue item",
        sourcePrompt: "draft a sharp positioning post",
        sourcePlaybook: "recommended_angle",
        outputShape: "short_form_post",
        status: "DRAFT",
        reviewStatus: "pending",
        folder: {
          id: "folder_1",
          name: "Launch week",
          color: "#f59e0b",
          createdAt: "2026-03-17T12:00:00.000Z",
        },
        artifact: {
          id: "short_form_post-1",
          title: "Post 1",
          kind: "short_form_post",
          content: "shipping the content hub today",
          posts: [
            {
              id: "post-1",
              content: "shipping the content hub today",
              weightedCharacterCount: 31,
              maxCharacterLimit: 280,
              isWithinXLimit: true,
            },
          ],
        },
        createdAt: "2026-03-17T12:00:00.000Z",
        updatedAt: "2026-03-17T12:05:00.000Z",
      },
    ],
  });
});
