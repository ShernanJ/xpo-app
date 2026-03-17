import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_HANDLE_HEADER,
  buildChatWorkspaceUrl,
  buildContentWorkspaceUrl,
  buildWorkspaceHandleHeaders,
  getWorkspaceHandleFromRequest,
  normalizeWorkspaceHandle,
} from "./workspaceHandle.ts";

test("normalizeWorkspaceHandle strips @ prefixes and lowercases", () => {
  assert.equal(normalizeWorkspaceHandle(" @StanDev "), "standev");
  assert.equal(normalizeWorkspaceHandle(""), null);
  assert.equal(normalizeWorkspaceHandle(null), null);
});

test("getWorkspaceHandleFromRequest prefers the explicit header over query params", () => {
  const request = new Request("https://example.com/chat?xHandle=handle_b", {
    headers: {
      [WORKSPACE_HANDLE_HEADER]: "@Handle_A",
    },
  });

  assert.equal(getWorkspaceHandleFromRequest(request), "handle_a");
});

test("buildWorkspaceHandleHeaders preserves existing headers and injects the workspace handle", () => {
  const headers = new Headers(
    buildWorkspaceHandleHeaders("@Handle_A", {
      "Content-Type": "application/json",
    }),
  );

  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get(WORKSPACE_HANDLE_HEADER), "handle_a");
});

test("buildChatWorkspaceUrl preserves the handle across root and thread routes", () => {
  assert.equal(buildChatWorkspaceUrl({ xHandle: "@Handle_A" }), "/chat?xHandle=handle_a");
  assert.equal(
    buildChatWorkspaceUrl({ threadId: "thread_123", xHandle: "@Handle_A" }),
    "/chat/thread_123?xHandle=handle_a",
  );
  assert.equal(
    buildChatWorkspaceUrl({
      threadId: "thread_123",
      xHandle: "@Handle_A",
      messageId: "message_456",
    }),
    "/chat/thread_123?xHandle=handle_a&messageId=message_456",
  );
});

test("buildContentWorkspaceUrl preserves the handle for the content hub", () => {
  assert.equal(buildContentWorkspaceUrl({ xHandle: "@Handle_A" }), "/content?xHandle=handle_a");
  assert.equal(buildContentWorkspaceUrl({ xHandle: null }), "/content");
});
