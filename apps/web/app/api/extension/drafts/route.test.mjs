import test from "node:test";
import assert from "node:assert/strict";

import {
  assertExtensionDraftsResponseShape,
} from "./route.logic.ts";
import { handleExtensionDraftsGet } from "./route.handler.ts";
import {
  WORKSPACE_HANDLE_HEADER,
  getWorkspaceHandleFromRequest,
} from "../../../../lib/workspaceHandle.ts";

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
      resolveExtensionHandleForRequest: async () => {
        throw new Error("should not be reached");
      },
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
      resolveExtensionHandleForRequest: async () => ({
        ok: false,
        status: 400,
        field: "xHandle",
        message: "A workspace X handle is required for this request.",
      }),
      listDrafts: async () => [],
      assertExtensionDraftsResponseShape,
    },
    null,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "xHandle", message: "A workspace X handle is required for this request." }],
  });
});

test("GET /api/extension/drafts rejects unattached handles", async () => {
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
      resolveExtensionHandleForRequest: async () => ({
        ok: false,
        status: 404,
        field: "xHandle",
        message: "That X handle is not attached to this Xpo profile.",
      }),
      listDrafts: async () => [],
      assertExtensionDraftsResponseShape,
    },
    "@OtherHandle",
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: [{ field: "xHandle", message: "That X handle is not attached to this Xpo profile." }],
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "standev",
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
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), `Authorization, ${WORKSPACE_HANDLE_HEADER}`);
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

test("GET /api/extension/drafts includes published and archived workspace items while keeping the extension response backward-compatible", async () => {
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "vitddnv",
      }),
      listDrafts: async () => [
        {
          id: "draft_a",
          title: "Queue item",
          sourcePrompt: "prompt a",
          sourcePlaybook: "recommended_angle",
          outputShape: "short_form_post",
          status: "DRAFT",
          reviewStatus: "pending",
          folder: null,
          artifact: {
            id: "artifact_a",
            title: "Post A",
            kind: "short_form_post",
            content: "draft content",
            posts: [
              {
                id: "post_a",
                content: "draft content",
                weightedCharacterCount: 13,
                maxCharacterLimit: 280,
                isWithinXLimit: true,
              },
            ],
          },
          createdAt: "2026-03-17T12:00:00.000Z",
          updatedAt: "2026-03-17T12:05:00.000Z",
        },
        {
          id: "draft_b",
          title: "Published item",
          sourcePrompt: "prompt b",
          sourcePlaybook: "thread_playbook",
          outputShape: "thread_seed",
          status: "PUBLISHED",
          reviewStatus: "posted",
          folder: null,
          artifact: {
            id: "artifact_b",
            title: "Thread B",
            kind: "thread_seed",
            content: "published thread",
            posts: [
              {
                id: "post_b_1",
                content: "published thread 1",
                weightedCharacterCount: 18,
                maxCharacterLimit: 280,
                isWithinXLimit: true,
              },
              {
                id: "post_b_2",
                content: "published thread 2",
                weightedCharacterCount: 18,
                maxCharacterLimit: 280,
                isWithinXLimit: true,
              },
            ],
          },
          createdAt: "2026-03-18T12:00:00.000Z",
          updatedAt: "2026-03-18T12:05:00.000Z",
        },
        {
          id: "draft_c",
          title: "Archived item",
          sourcePrompt: "prompt c",
          sourcePlaybook: "chat_thread",
          outputShape: "long_form_post",
          status: "ARCHIVED",
          reviewStatus: "edited",
          folder: null,
          artifact: {
            id: "artifact_c",
            title: "Post C",
            kind: "long_form_post",
            content: "archived content",
            posts: [
              {
                id: "post_c",
                content: "archived content",
                weightedCharacterCount: 16,
                maxCharacterLimit: 280,
                isWithinXLimit: true,
              },
            ],
          },
          createdAt: "2026-03-19T12:00:00.000Z",
          updatedAt: "2026-03-19T12:05:00.000Z",
        },
      ],
      assertExtensionDraftsResponseShape,
    },
    "vitddnv",
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).drafts.map((item) => item.status), [
    "DRAFT",
    "DRAFT",
    "DRAFT",
  ]);
});

test("GET /api/extension/drafts sanitizes incomplete items instead of failing the whole workspace fetch", async () => {
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
      resolveExtensionHandleForRequest: async () => ({
        ok: true,
        xHandle: "vitddnv",
      }),
      listDrafts: async () => [
        {
          id: "draft_legacy",
          title: "  ",
          sourcePrompt: "",
          sourcePlaybook: "",
          outputShape: "thread_seed",
          status: "PUBLISHED",
          reviewStatus: "",
          folder: {
            id: "folder_1",
            name: " Launches ",
            color: "",
            createdAt: "2026-03-17T12:00:00.000Z",
          },
          artifact: {
            id: "",
            title: "",
            kind: "",
            content: "",
            posts: Array.from({ length: 13 }, (_, index) => ({
              id: "",
              content: `post ${index + 1}`,
              weightedCharacterCount: Number.NaN,
              maxCharacterLimit: 0,
              isWithinXLimit: true,
            })),
          },
          createdAt: "2026-03-17T12:00:00.000Z",
          updatedAt: "2026-03-17T12:05:00.000Z",
        },
      ],
      assertExtensionDraftsResponseShape,
    },
    "vitddnv",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    drafts: [
      {
        id: "draft_legacy",
        title: "Workspace post",
        sourcePrompt: "post 1\n\npost 2\n\npost 3\n\npost 4\n\npost 5\n\npost 6\n\npost 7\n\npost 8\n\npost 9\n\npost 10\n\npost 11\n\npost 12",
        sourcePlaybook: null,
        outputShape: "thread_seed",
        status: "DRAFT",
        reviewStatus: "pending",
        folder: {
          id: "folder_1",
          name: "Launches",
          color: null,
          createdAt: "2026-03-17T12:00:00.000Z",
        },
        artifact: {
          id: "draft_legacy-artifact",
          title: "Workspace post",
          kind: "thread_seed",
          content: "post 1\n\npost 2\n\npost 3\n\npost 4\n\npost 5\n\npost 6\n\npost 7\n\npost 8\n\npost 9\n\npost 10\n\npost 11\n\npost 12",
          posts: Array.from({ length: 12 }, (_, index) => ({
            id: `draft_legacy-post-${index + 1}`,
            content: `post ${index + 1}`,
            weightedCharacterCount: `post ${index + 1}`.length,
            maxCharacterLimit: 280,
            isWithinXLimit: true,
          })),
        },
        createdAt: "2026-03-17T12:00:00.000Z",
        updatedAt: "2026-03-17T12:05:00.000Z",
      },
    ],
  });
});

test("GET /api/extension/drafts changes the response when the x-xpo-handle header changes and restores the prior scope when switching back", async () => {
  const calls = [];
  const deps = {
    authenticateExtensionRequest: async () => ({
      user: {
        id: "user_1",
      },
    }),
    resolveExtensionHandleForRequest: async ({ request }) => {
      const xHandle = getWorkspaceHandleFromRequest(request);
      if (!xHandle) {
        return {
          ok: false,
          status: 400,
          field: "xHandle",
          message: "A workspace X handle is required for this request.",
        };
      }

      return {
        ok: true,
        xHandle,
      };
    },
    listDrafts: async ({ userId, xHandle }) => {
      calls.push({ userId, xHandle });
      return [
        {
          id: `draft_${xHandle}`,
          title: `Queue item ${xHandle}`,
          sourcePrompt: `prompt ${xHandle}`,
          sourcePlaybook: "recommended_angle",
          outputShape: "short_form_post",
          status: "DRAFT",
          reviewStatus: "pending",
          folder: null,
          artifact: {
            id: `short_form_post-${xHandle}`,
            title: `Post ${xHandle}`,
            kind: "short_form_post",
            content: `content for ${xHandle}`,
            posts: [
              {
                id: `post-${xHandle}`,
                content: `content for ${xHandle}`,
                weightedCharacterCount: 20,
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
  };

  const handleAResponse = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
        [WORKSPACE_HANDLE_HEADER]: "handle_a",
      },
    }),
    deps,
    null,
  );
  const handleBResponse = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
        [WORKSPACE_HANDLE_HEADER]: "handle_b",
      },
    }),
    deps,
    null,
  );
  const handleAReturnResponse = await handleExtensionDraftsGet(
    new Request("http://localhost/api/extension/drafts", {
      method: "GET",
      headers: {
        authorization: "Bearer token_123",
        [WORKSPACE_HANDLE_HEADER]: "handle_a",
      },
    }),
    deps,
    null,
  );

  assert.deepEqual(calls, [
    { userId: "user_1", xHandle: "handle_a" },
    { userId: "user_1", xHandle: "handle_b" },
    { userId: "user_1", xHandle: "handle_a" },
  ]);
  const handleAJson = await handleAResponse.json();
  const handleBJson = await handleBResponse.json();
  const handleAReturnJson = await handleAReturnResponse.json();

  assert.notDeepEqual(handleAJson, handleBJson);
  assert.deepEqual(handleAJson, handleAReturnJson);
});
