import assert from "node:assert/strict";
import test from "node:test";

import { applyMemorySaliencePolicy } from "./memorySalience.ts";

test("memory salience keeps hard grounding while trimming noisy constraints", () => {
  const result = applyMemorySaliencePolicy({
    topicSummary: "  Building Xpo for multi-account creator workflows with cleaner thread context carryover.  ",
    concreteAnswerCount: 19,
    envelope: {
      constraints: [
        "Use normal capitalization.",
        "Correction lock: handle A does not run the 30M ARR company.",
        "Do not use emojis.",
        "Correction lock: handle B is the one tied to the 30M ARR company.",
        "Keep a balance between sounding like me and optimizing for growth.",
        "When using lists, use \">\" as the list marker.",
        "Frame this as a usable playbook with one decision per post.",
        "Do not invent extra first-person scenes.",
        "Keep the opener tight.",
        "Keep the opener tight.",
      ],
      lastIdeationAngles: [
        "angle 1",
        "angle 2",
        "angle 3",
        "angle 4",
        "angle 5",
      ],
      rollingSummary: [
        "Current topic: multi-account workspace isolation",
        "Approved angle: explicit handle over session-global state",
        "Preferences discovered: keep it clean and direct",
        "Latest draft status: draft created",
        "Open question: should reply learning also be handle-scoped?",
        "Extra line 1",
        "Extra line 2",
      ].join("\n"),
      latestRefinementInstruction:
        "Tighten the explanation so the difference between tab state and session defaults is obvious without sounding like a migration note.",
      unresolvedQuestion:
        "Which low-value memory fields should decay first when the conversation moves away from the current draft?",
    },
  });

  assert.equal(result.topicSummary?.includes("Building Xpo"), true);
  assert.equal(result.concreteAnswerCount, 12);
  assert.deepEqual(result.envelope.lastIdeationAngles, [
    "angle 2",
    "angle 3",
    "angle 4",
    "angle 5",
  ]);
  assert.equal(
    result.envelope.constraints.includes(
      "Correction lock: handle A does not run the 30M ARR company.",
    ),
    true,
  );
  assert.equal(
    result.envelope.constraints.includes("Do not invent extra first-person scenes."),
    true,
  );
  assert.equal(result.envelope.constraints.length <= 8, true);
  assert.equal(result.envelope.rollingSummary?.split("\n").length, 6);
});

test("memory salience collapses whitespace and removes empty values", () => {
  const result = applyMemorySaliencePolicy({
    topicSummary: "   ",
    concreteAnswerCount: 0,
    envelope: {
      constraints: ["   ", "Do not use emojis.", "Do not use emojis."],
      lastIdeationAngles: ["  ", "keep the thread about system boundaries"],
      rollingSummary: " \n Current topic: workspace handles \n ",
      latestRefinementInstruction: "   ",
      unresolvedQuestion: "   ",
    },
  });

  assert.equal(result.topicSummary, null);
  assert.deepEqual(result.envelope.constraints, ["Do not use emojis."]);
  assert.deepEqual(result.envelope.lastIdeationAngles, [
    "keep the thread about system boundaries",
  ]);
  assert.equal(result.envelope.rollingSummary, "Current topic: workspace handles");
  assert.equal(result.envelope.latestRefinementInstruction, null);
  assert.equal(result.envelope.unresolvedQuestion, null);
});
