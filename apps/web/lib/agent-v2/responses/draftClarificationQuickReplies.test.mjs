import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftClarificationQuickReplies } from "./draftClarificationQuickReplies.ts";

test("draft clarification quick replies keep four parsed thread-scope choices", () => {
  const replies = buildDraftClarificationQuickReplies({
    question:
      "which part of the thread should i change: the opener, a specific post, the ending, or the whole thread?",
    userMessage: "make it more specific",
    styleCard: null,
    topicAnchors: [],
    seedTopic: null,
    isVerifiedAccount: false,
    requestedFormatPreference: "thread",
  });

  assert.equal(replies.length, 4);
  assert.deepEqual(
    replies.map((reply) => reply.value),
    ["the opener", "a specific post", "the ending", "the whole thread"],
  );
});
