import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConcreteSceneDraftBlock,
  buildConcreteScenePlanBlock,
} from "../orchestrator/draftGrounding.ts";
import {
  NO_FABRICATION_CONSTRAINT,
  NO_FABRICATION_MUST_AVOID,
} from "../orchestrator/draftGrounding.ts";

test("planner concrete-scene block stays anchored to the literal anecdote", () => {
  const instruction = buildConcreteScenePlanBlock(
    "can you write me a post on playing league at the stan office against the ceo and losing hard",
  );

  assert.equal(instruction.includes("CONCRETE SCENE MODE:"), true);
  assert.equal(instruction.includes("league"), true);
  assert.equal(instruction.includes("ceo"), true);
  assert.equal(
    instruction.includes("keep the angle observational or story-first instead of inventing one"),
    true,
  );
  assert.equal(
    instruction.includes(
      "Do not introduce hashtags, analytics, product features, internal tools, or strategy jargon",
    ),
    true,
  );
});

test("writer concrete-scene block prevents neat fake growth morals", () => {
  const source = [
    "write one about playing league at the stan office against the ceo and losing hard",
    NO_FABRICATION_CONSTRAINT,
    NO_FABRICATION_MUST_AVOID,
  ].join(" ");
  const instruction = buildConcreteSceneDraftBlock(source);

  assert.equal(instruction.includes("CONCRETE SCENE MODE:"), true);
  assert.equal(
    instruction.includes(
      "Do not swap the scene for a product pitch, hashtag strategy, analytics lesson",
    ),
    true,
  );
  assert.equal(instruction.includes("Do not force a neat moral."), true);
  assert.equal(
    instruction.includes("If details are missing, write around the exact details you do have."),
    true,
  );
  assert.equal(instruction.includes("stan office"), true);
  assert.equal(instruction.includes("ceo"), true);
});
