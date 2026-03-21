import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureThreadPlanPosts,
  normalizePlannerOutput,
} from "./plannerNormalization.ts";

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
  assert.equal(result.posts[0].transitionHint, "set up context");
  assert.equal(result.posts[5].transitionHint, null);
});

test("normalizePlannerOutput drops meta proof points and objective duplicates", () => {
  const result = normalizePlannerOutput({
    objective: "thread objective",
    angle: "thread angle",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "direct",
    pitchResponse: "lead with the real tension",
    posts: [
      {
        role: "hook",
        objective: "open with the gap between the promise and what actually changed",
        proofPoints: [
          "be specific",
          "open with the gap between the promise and what actually changed",
          "the launch promise slipped in the first week",
          "make it clear",
        ],
        transitionHint: "move into the reset",
      },
      {
        role: "payoff",
        objective: "land the actual lesson",
        proofPoints: ["keep it engaging", "one concrete change fixed the rollout"],
        transitionHint: null,
      },
    ],
  });

  assert.deepEqual(result.posts[0].proofPoints, [
    "the launch promise slipped in the first week",
  ]);
  assert.deepEqual(result.posts[1].proofPoints, [
    "one concrete change fixed the rollout",
  ]);
});

test("normalizePlannerOutput repairs duplicate thread beats into a clean arc", () => {
  const result = normalizePlannerOutput({
    objective: "thread objective",
    angle: "thread angle",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "direct",
    pitchResponse: "lead with the real shift",
    posts: [
      {
        role: "hook",
        objective: "open on the first leadership shift",
        proofPoints: ["the first team handoff changed everything"],
        transitionHint: "next proof",
      },
      {
        role: "proof",
        objective: "show the same shift again",
        proofPoints: ["the first team handoff changed everything", "the first sprint changed the pace"],
        transitionHint: "proof",
      },
      {
        role: "proof",
        objective: "show the same shift again",
        proofPoints: ["the next delegation unlocked focus"],
        transitionHint: "payoff",
      },
      {
        role: "payoff",
        objective: "show the same shift again",
        proofPoints: ["delegation became the growth lever"],
        transitionHint: "close",
      },
      {
        role: "payoff",
        objective: "show the same shift again",
        proofPoints: ["ask what they still own"],
        transitionHint: "close",
      },
    ],
  });

  assert.deepEqual(
    result.posts.map((post) => post.role),
    ["hook", "setup", "proof", "payoff", "close"],
  );
  assert.deepEqual(result.posts[1].proofPoints, ["the first sprint changed the pace"]);
  assert.equal(result.posts[1].transitionHint, "show the next delegation unlocked focus");
  assert.equal(result.posts[4].transitionHint, null);
  assert.match(result.posts[4].objective, /close on/i);
});

test("normalizePlannerOutput preserves live-context metadata from planner snake_case fields", () => {
  const result = normalizePlannerOutput({
    objective: "react to the latest product launch",
    angle: "lead with what actually changed in the launch",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "direct",
    pitchResponse: "lead with what actually changed",
    requires_live_context: false,
    search_queries: [
      "latest product launch update",
      "Latest product launch update",
      " product launch user reaction ",
      "",
      "product launch pricing change",
    ],
  });

  assert.equal(result.requiresLiveContext, true);
  assert.deepEqual(result.searchQueries, [
    "latest product launch update",
    "product launch user reaction",
    "product launch pricing change",
  ]);
});

test("ensureThreadPlanPosts synthesizes a thread beat plan when a thread request falls back to a generic plan", () => {
  const result = ensureThreadPlanPosts({
    objective: "the break-if-we-don't filter that cut 80% of ideas",
    angle: "show the hard tradeoff behind the filter instead of turning it into a generic creativity take",
    targetLane: "original",
    mustInclude: [
      "why the team needed a sharper filter",
      "what got cut",
      "what changed after the filter held",
    ],
    mustAvoid: ["generic brainstorming advice"],
    hookType: "story",
    pitchResponse: "lead with the tension and land the payoff",
    formatPreference: "thread",
  });

  assert.ok(Array.isArray(result.posts));
  assert.equal(result.posts.length, 5);
  assert.deepEqual(
    result.posts.map((post) => post.role),
    ["hook", "setup", "proof", "payoff", "close"],
  );
  assert.equal(result.posts[0].transitionHint, "set up the context");
  assert.equal(result.posts.at(-1)?.transitionHint, null);
});
