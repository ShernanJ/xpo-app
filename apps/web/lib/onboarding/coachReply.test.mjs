import test from "node:test";
import assert from "node:assert/strict";

import {
  isThinCoachInput,
  validateCoachReplyText,
} from "./coachReply.ts";

test("isThinCoachInput treats taxonomy labels as thin", () => {
  assert.equal(isThinCoachInput("operator lessons"), true);
  assert.equal(isThinCoachInput("build in public"), true);
});

test("isThinCoachInput allows concrete user context", () => {
  assert.equal(
    isThinCoachInput("a user said our onboarding confused them yesterday"),
    false,
  );
});

test("validateCoachReplyText requires exactly one closing question", () => {
  const valid = validateCoachReplyText(
    "Specificity matters here because one real episode gives us better raw material. What happened most recently that made this feel real?",
  );
  assert.equal(valid.hasExactlyOneQuestionMark, true);
  assert.equal(valid.endsWithQuestion, true);
  assert.equal(valid.isValid, true);

  const invalid = validateCoachReplyText(
    "Specificity matters? What happened after that.",
  );
  assert.equal(invalid.hasExactlyOneQuestionMark, true);
  assert.equal(invalid.endsWithQuestion, false);
  assert.equal(invalid.isValid, false);
});
