import test from "node:test";
import assert from "node:assert/strict";

import { getChatRenderMode } from "./chatRenderMode.ts";

test("assistant prose surfaces render as markdown", () => {
  assert.equal(getChatRenderMode("assistant_message"), "markdown");
  assert.equal(getChatRenderMode("assistant_streaming_preview"), "markdown");
  assert.equal(getChatRenderMode("feedback_preview"), "markdown");
});

test("draft and thread preview surfaces stay literal", () => {
  assert.equal(getChatRenderMode("draft_artifact"), "literal");
  assert.equal(getChatRenderMode("thread_preview_post"), "literal");
  assert.equal(getChatRenderMode("draft_bundle_preview"), "literal");
});
