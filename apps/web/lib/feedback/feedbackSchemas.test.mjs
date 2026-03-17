import test from "node:test";
import assert from "node:assert/strict";

import {
  FeedbackContextSchema,
  FeedbackRequestContextSchema,
} from "./feedbackSchemas.ts";

test("request feedback context accepts scoped message report fields", () => {
  const result = FeedbackRequestContextSchema.safeParse({
    pagePath: "/chat/thread-1",
    threadId: "thread-1",
    source: "message_report",
    reportedMessageId: "assistant-1",
    assistantExcerpt: "assistant excerpt",
    precedingUserExcerpt: "user excerpt",
    transcriptExcerpt: [
      {
        messageId: "user-1",
        role: "user",
        excerpt: "user excerpt",
      },
      {
        messageId: "assistant-1",
        role: "assistant",
        excerpt: "assistant excerpt",
      },
    ],
  });

  assert.equal(result.success, true);
});

test("stored feedback context defaults global source when omitted", () => {
  const result = FeedbackContextSchema.parse({
    pagePath: "/chat",
    appSurface: "chat",
  });

  assert.equal(result.source, "global_feedback");
  assert.deepEqual(result.transcriptExcerpt ?? [], []);
});
