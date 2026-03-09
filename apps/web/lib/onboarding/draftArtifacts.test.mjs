import test from "node:test";
import assert from "node:assert/strict";

import { inferThreadFramingStyleFromPrompt } from "./draftArtifacts.ts";

test("generic educational thread prompts default to soft-signal framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "write me a thread breaking down the hiring playbook we used",
    ),
    "soft_signal",
  );
});

test("explicit numbering requests still resolve to numbered framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "write me a numbered x/x thread with 1/5 style labels",
    ),
    "numbered",
  );
});

test("no-numbering requests resolve to natural framing", () => {
  assert.equal(
    inferThreadFramingStyleFromPrompt(
      "turn this into a thread without x/x numbering",
    ),
    "none",
  );
});
