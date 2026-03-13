import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanPitch,
  sanitizePlanPitchResponse,
} from "./planPitch.ts";

const basePlan = {
  objective: "show why the feature list misses the real shift",
  angle: "lead with the contradiction between the promise and what actually changed",
  targetLane: "original",
  mustInclude: ["mention the product promise", "keep the contrast concrete"],
  mustAvoid: ["generic product hype"],
  hookType: "counter",
  pitchResponse: "",
  formatPreference: "shortform",
};

test("sanitizePlanPitchResponse strips workflowy lead-ins and approval asks", () => {
  const result = sanitizePlanPitchResponse(
    "got it. here's the plan: let's lead with the contradiction between the promise and what actually changed. sound good?",
  );

  assert.equal(
    result,
    "lead with the contradiction between the promise and what actually changed.",
  );
});

test("buildPlanPitch falls back to the plan angle when pitchResponse is just a drafting stub", () => {
  const result = buildPlanPitch({
    ...basePlan,
    pitchResponse: "drafting it.",
  });

  assert.match(
    result,
    /^Lead with the contradiction between the promise and what actually changed\./,
  );
  assert.doesNotMatch(result, /^Drafting it\./);
  assert.match(result, /if that works, i'll draft it|if you want that version, i'll write it|if you're into that angle, i'll turn it into a post/i);
});
