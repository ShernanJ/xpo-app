import test from "node:test";
import assert from "node:assert/strict";

import { classifyReplyDraftMode } from "./preflight.ts";

test("classifyReplyDraftMode falls back to joke riff for playful posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "lol this meme format keeps winning because the screenshot is the whole bit",
  });

  assert.equal(result.recommended_reply_mode, "joke_riff");
});

test("classifyReplyDraftMode falls back to empathetic support for emotionally heavy posts in tests", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "this week was brutal and i'm still trying to process it",
  });

  assert.equal(result.recommended_reply_mode, "empathetic_support");
});

test("classifyReplyDraftMode defaults to insightful add-on when no strong heuristic fires", async () => {
  const result = await classifyReplyDraftMode({
    sourceText: "good interfaces usually make the next step feel obvious",
  });

  assert.equal(result.recommended_reply_mode, "insightful_add_on");
});
