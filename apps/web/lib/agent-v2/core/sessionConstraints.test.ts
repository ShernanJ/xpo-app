import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionConstraints,
  sessionConstraintsToLegacyStrings,
} from "./sessionConstraints.ts";

test("buildSessionConstraints keeps explicit and inferred rules separate while exposing a deduped legacy view", () => {
  const sessionConstraints = buildSessionConstraints({
    activeConstraints: ["keep all lowercase", "no listicles"],
    inferredConstraints: ["no listicles", "make it angrier"],
  });

  assert.deepEqual(sessionConstraints, [
    { source: "explicit", text: "keep all lowercase" },
    { source: "explicit", text: "no listicles" },
    { source: "inferred", text: "make it angrier" },
  ]);
  assert.deepEqual(sessionConstraintsToLegacyStrings(sessionConstraints), [
    "keep all lowercase",
    "no listicles",
    "make it angrier",
  ]);
});

test("buildSessionConstraints can source inferred rules from a pending plan", () => {
  const sessionConstraints = buildSessionConstraints({
    activeConstraints: ["keep all lowercase"],
    pendingPlan: {
      extractedConstraints: ["no listicles", "keep the same skeleton"],
    },
  });

  assert.deepEqual(sessionConstraints, [
    { source: "explicit", text: "keep all lowercase" },
    { source: "inferred", text: "no listicles" },
    { source: "inferred", text: "keep the same skeleton" },
  ]);
});
