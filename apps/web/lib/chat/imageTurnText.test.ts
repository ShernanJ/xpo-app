import assert from "node:assert/strict";
import test from "node:test";

import { parseImagePostConfirmationDecision } from "./imageTurnText.ts";

test("parseImagePostConfirmationDecision recognizes affirmative follow-ups", () => {
  assert.equal(parseImagePostConfirmationDecision("yes"), "confirm");
  assert.equal(parseImagePostConfirmationDecision("okay, write it"), "confirm");
  assert.equal(parseImagePostConfirmationDecision("let's do it"), "confirm");
});

test("parseImagePostConfirmationDecision recognizes declines", () => {
  assert.equal(parseImagePostConfirmationDecision("not now"), "decline");
  assert.equal(parseImagePostConfirmationDecision("no thanks"), "decline");
});

test("parseImagePostConfirmationDecision ignores unrelated text", () => {
  assert.equal(
    parseImagePostConfirmationDecision("can you make this sound more direct?"),
    null,
  );
});
