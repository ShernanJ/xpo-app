import test from "node:test";
import assert from "node:assert/strict";

import { resolveThreadHistoryHydration } from "./chatThreadHistoryState.ts";

test("resolveThreadHistoryHydration maps raw thread messages into chat messages", () => {
  const result = resolveThreadHistoryHydration({
    rawMessages: [
      {
        id: "assistant-1",
        role: "assistant" as const,
        content: "hello",
        createdAt: "2026-03-14T12:00:00.000Z",
        threadId: "thread-1",
        feedbackValue: "up",
        data: {
          draft: "draft body",
          outputShape: "short_form_post",
        },
      },
      {
        id: "user-1",
        role: "user" as const,
        content: "hey",
        createdAt: 123,
        feedbackValue: "unknown",
        data: null,
      },
    ],
    activeThreadId: "thread-fallback",
    shouldJumpToBottomAfterSwitch: true,
  });

  assert.deepEqual(result, {
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: "hello",
        createdAt: "2026-03-14T12:00:00.000Z",
        threadId: "thread-1",
        feedbackValue: "up",
        draft: "draft body",
        outputShape: "short_form_post",
      },
      {
        id: "user-1",
        role: "user",
        content: "hey",
        createdAt: undefined,
        threadId: "thread-fallback",
        feedbackValue: null,
      },
    ],
    shouldJumpToBottom: true,
  });
});

test("resolveThreadHistoryHydration preserves a false jump-to-bottom plan", () => {
  const result = resolveThreadHistoryHydration({
    rawMessages: [],
    activeThreadId: null,
    shouldJumpToBottomAfterSwitch: false,
  });

  assert.deepEqual(result, {
    messages: [],
    shouldJumpToBottom: false,
  });
});
