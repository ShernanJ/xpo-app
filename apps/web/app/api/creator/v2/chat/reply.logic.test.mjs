import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplyParseEnvelope,
  parseEmbeddedReplyRequest,
  resolveReplyContinuation,
  shouldClearReplyWorkflow,
} from "./reply.logic.ts";

test("parseEmbeddedReplyRequest detects a pasted post plus reply ask", () => {
  const result = parseEmbeddedReplyRequest({
    message: `@naval\n\nSpecific knowledge is becoming the only durable leverage.\n\nhow do i reply to that?`,
  });

  assert.equal(result.classification, "reply_request_with_embedded_post");
  assert.equal(result.context?.authorHandle, "naval");
  assert.equal(result.context?.sourceText.includes("Specific knowledge"), true);
  assert.equal(result.context?.confidence, "high");
});

test("parseEmbeddedReplyRequest asks for missing source post when only a reply ask is present", () => {
  const result = parseEmbeddedReplyRequest({
    message: "how should i reply to that?",
  });

  assert.equal(result.classification, "reply_request_missing_post");
  assert.equal(result.context, null);
});

test("parseEmbeddedReplyRequest does not hijack short quoted snippets", () => {
  const result = parseEmbeddedReplyRequest({
    message: `"ship every day"\n\nwhat do you think about that framing?`,
  });

  assert.equal(result.classification, "plain_chat");
  assert.equal(result.context, null);
});

test("parseEmbeddedReplyRequest marks multiline pasted posts as medium-confidence reply requests", () => {
  const result = parseEmbeddedReplyRequest({
    message: `been thinking about this line all day:

most people sound generic because they optimize for approval first

how do i reply to that?`,
  });

  assert.equal(result.classification, "reply_request_with_embedded_post");
  assert.equal(result.context?.confidence, "medium");
});

test("parseEmbeddedReplyRequest keeps pasted posts without an explicit reply ask out of forced reply mode", () => {
  const result = parseEmbeddedReplyRequest({
    message: `@naval

Specific knowledge is becoming the only durable leverage.

This framing is interesting because it turns leverage into a positioning problem.

Can you break down what's strong about it?`,
  });

  assert.equal(result.classification, "embedded_post_without_reply_request");
  assert.equal(result.context?.authorHandle, "naval");
  assert.equal(result.context?.quotedUserAsk, null);
});

test("buildReplyParseEnvelope marks medium-confidence embedded reply requests as confirmation-needed", () => {
  const result = parseEmbeddedReplyRequest({
    message: `been thinking about this line all day:

most people sound generic because they optimize for approval first

how do i reply to that?`,
  });

  const envelope = buildReplyParseEnvelope(result);
  assert.equal(envelope?.detected, true);
  assert.equal(envelope?.needsConfirmation, true);
});

test("resolveReplyContinuation maps option picks and draft revisions from active reply context", () => {
  const activeReplyContext = {
    sourceText: "Most people optimize for approval first.",
    sourceUrl: null,
    authorHandle: "creator",
    quotedUserAsk: "how do i reply to that?",
    confidence: "high",
    parseReason: "reply_ask_with_post_metadata",
    awaitingConfirmation: false,
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
    opportunityId: "chat-reply-1",
    latestReplyOptions: [
      { id: "opt-1", label: "nuance", text: "Option 1" },
      { id: "opt-2", label: "example", text: "Option 2" },
    ],
    latestReplyDraftOptions: [
      { id: "safe-1", label: "safe", text: "Draft 1" },
      { id: "bold-1", label: "bold", text: "Draft 2" },
    ],
    selectedReplyOptionId: "opt-2",
  };

  assert.deepEqual(
    resolveReplyContinuation({
      userMessage: "go with option 2",
      activeReplyContext,
    }),
    { type: "select_option", optionIndex: 1 },
  );

  assert.deepEqual(
    resolveReplyContinuation({
      userMessage: "make it less harsh",
      activeReplyContext,
    }),
    { type: "revise_draft", tone: "warm", length: "same" },
  );
});

test("shouldClearReplyWorkflow clears stale reply state on unrelated non-reply turns", () => {
  const activeReplyContext = {
    sourceText: "Most people optimize for approval first.",
    sourceUrl: null,
    authorHandle: "creator",
    quotedUserAsk: "how do i reply to that?",
    confidence: "high",
    parseReason: "reply_ask_with_post_metadata",
    awaitingConfirmation: false,
    stage: "0_to_1k",
    tone: "builder",
    goal: "followers",
    opportunityId: "chat-reply-1",
    latestReplyOptions: [{ id: "opt-1", label: "nuance", text: "Option 1" }],
    latestReplyDraftOptions: [],
    selectedReplyOptionId: "opt-1",
  };

  assert.equal(
    shouldClearReplyWorkflow({
      activeReplyContext,
      turnSource: "free_text",
      replyParseResult: {
        classification: "plain_chat",
        context: null,
      },
      replyContinuation: null,
    }),
    true,
  );

  assert.equal(
    shouldClearReplyWorkflow({
      activeReplyContext,
      turnSource: "draft_action",
      replyParseResult: {
        classification: "plain_chat",
        context: null,
      },
      replyContinuation: null,
    }),
    true,
  );

  assert.equal(
    shouldClearReplyWorkflow({
      activeReplyContext,
      turnSource: "free_text",
      replyParseResult: {
        classification: "plain_chat",
        context: null,
      },
      replyContinuation: { type: "select_option", optionIndex: 0 },
    }),
    false,
  );

  assert.equal(
    shouldClearReplyWorkflow({
      activeReplyContext,
      turnSource: "reply_action",
      replyParseResult: {
        classification: "plain_chat",
        context: null,
      },
      replyContinuation: { type: "select_option", optionIndex: 0 },
    }),
    true,
  );
});
