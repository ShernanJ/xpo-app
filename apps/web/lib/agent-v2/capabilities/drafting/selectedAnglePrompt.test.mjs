import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSelectedAngleDraftPrompt,
  stripSelectedAnglePromptPrefix,
} from "./selectedAnglePrompt.ts";

test("thread selected-angle prompts explicitly require serialized thread delivery", () => {
  const prompt = buildSelectedAngleDraftPrompt({
    angle: "the break-if-we-don't filter that cut 80% of ideas",
    formatHint: "thread",
  });

  assert.match(prompt, /4-6 complete posts/i);
  assert.match(prompt, /line containing only ---/i);
  assert.match(prompt, /do not collapse this into one standalone post/i);
});

test("stripSelectedAnglePromptPrefix removes the stronger thread wrapper cleanly", () => {
  const prompt = buildSelectedAngleDraftPrompt({
    angle: "the break-if-we-don't filter that cut 80% of ideas",
    formatHint: "thread",
  });

  assert.equal(
    stripSelectedAnglePromptPrefix(prompt),
    "the break-if-we-don't filter that cut 80% of ideas",
  );
});
