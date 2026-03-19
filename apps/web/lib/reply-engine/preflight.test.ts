import test from "node:test";
import assert from "node:assert/strict";

import { classifyReplyDraftMode } from "./preflight.ts";

test("classifyReplyDraftMode falls back to joke riff for playful posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "lol this meme format keeps winning because the screenshot is the whole bit",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode falls back to joke riff for self-own shitposts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "my startup strategy is just drinking 4 redbulls and hoping",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode falls back to joke riff for internet slang sarcasm in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "lwk this launch plan is just vibes and a dream",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "joke_setup");
});

test("classifyReplyDraftMode tags casual self-reports as casual observations", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "Just had a full bag of chips #fuckit",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
  assert.equal(result.source_shape, "casual_observation");
});

test("classifyReplyDraftMode falls back to empathetic support for emotionally heavy posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "this week was brutal and i'm still trying to process it",
  });

  assert.equal(result.recommended_reply_mode, "empathetic_support");
  assert.equal(result.source_shape, "emotional_update");
});

test("classifyReplyDraftMode defaults to insightful add-on when no strong heuristic fires", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "good interfaces usually make the next step feel obvious",
  });

  assert.equal(result.recommended_reply_mode, "insightful_add_on");
  assert.equal(result.source_shape, "strategic_take");
});
