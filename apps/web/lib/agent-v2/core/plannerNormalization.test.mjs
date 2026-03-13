import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlannerOutput } from "./plannerNormalization.ts";

test("normalizePlannerOutput dedupes plan lists and removes overlaps", () => {
  const result = normalizePlannerOutput({
    objective: "  lead with the real shift  ",
    angle: "  lead with the real shift instead of the feature list ",
    targetLane: "original",
    mustInclude: [
      "mention the contradiction",
      "mention the contradiction",
      "keep one concrete example",
      "keep one concrete example ",
      "show the payoff",
      "one more thing",
    ],
    mustAvoid: [
      "generic feature list",
      "mention the contradiction",
      "generic feature list ",
    ],
    hookType: " counter ",
    pitchResponse: "got it. here's the plan: lead with the contradiction. sound good?",
  });

  assert.equal(result.objective, "lead with the real shift");
  assert.equal(result.angle, "lead with the real shift instead of the feature list");
  assert.equal(result.hookType, "counter");
  assert.deepEqual(result.mustInclude, [
    "mention the contradiction",
    "keep one concrete example",
    "show the payoff",
    "one more thing",
  ]);
  assert.deepEqual(result.mustAvoid, ["generic feature list"]);
  assert.equal(result.pitchResponse, "lead with the contradiction.");
});

test("normalizePlannerOutput trims thread plans to six posts and cleans proof points", () => {
  const result = normalizePlannerOutput({
    objective: "thread objective",
    angle: "thread angle",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "direct",
    pitchResponse: "draft it",
    posts: [
      { role: "hook", objective: "  open hard ", proofPoints: ["point a", "point a", "point b"], transitionHint: " move to setup " },
      { role: "setup", objective: " set context ", proofPoints: ["scene", "scene", "stakes"], transitionHint: " shift to proof " },
      { role: "proof", objective: " proof 1 ", proofPoints: ["fact 1", "fact 1", "fact 2"], transitionHint: " next proof " },
      { role: "proof", objective: " proof 2 ", proofPoints: ["fact 3", "fact 4", "fact 5"], transitionHint: " turn " },
      { role: "turn", objective: " twist ", proofPoints: ["counter"], transitionHint: " payoff " },
      { role: "payoff", objective: " payoff ", proofPoints: ["lesson", "lesson"], transitionHint: " close " },
      { role: "close", objective: " close ", proofPoints: ["cta"], transitionHint: "should be dropped" },
    ],
  });

  assert.equal(result.posts.length, 6);
  assert.deepEqual(result.posts[0].proofPoints, ["point a", "point b"]);
  assert.deepEqual(result.posts[3].proofPoints, ["fact 3", "fact 4"]);
  assert.equal(result.posts[0].transitionHint, "move to setup");
  assert.equal(result.posts[5].transitionHint, null);
});
