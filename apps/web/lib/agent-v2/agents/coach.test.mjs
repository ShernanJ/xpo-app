import test from "node:test";
import assert from "node:assert/strict";

import { finalizeCoachReplyForSurface } from "./coachReplyNormalizer.ts";

test("coach reply finalizer keeps one useful question and strips workflow tails", () => {
  const result = finalizeCoachReplyForSurface({
    response:
      "i can help with that. if this lands, i can draft it now - or we can tweak it first. what part matters most here? do you want the funny loss or the takeaway?",
    probingQuestion: "quick check: do you want the funny loss or the takeaway",
  });

  assert.deepEqual(result, {
    response:
      "i can help with that. do you want the funny loss or the takeaway?",
    probingQuestion: "do you want the funny loss or the takeaway?",
  });
});

test("coach reply finalizer leaves direct answers alone when no question is needed", () => {
  const result = finalizeCoachReplyForSurface({
    response: "react to what they actually said, use contractions, and don't jump into strategy too early.",
    probingQuestion: null,
  });

  assert.deepEqual(result, {
    response:
      "react to what they actually said, use contractions, and don't jump into strategy too early.",
    probingQuestion: null,
  });
});
