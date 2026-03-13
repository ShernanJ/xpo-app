import test from "node:test";
import assert from "node:assert/strict";

import { resolveTopLevelAction } from "./controller.ts";

function buildMemory(overrides = {}) {
  return {
    conversationState: "ready_to_ideate",
    topicSummary: null,
    hasPendingPlan: false,
    hasActiveDraft: false,
    unresolvedQuestion: null,
    concreteAnswerCount: 0,
    pendingPlanSummary: null,
    latestRefinementInstruction: null,
    lastIdeationAngles: [],
    ...overrides,
  };
}

test("resolveTopLevelAction prefers explicit intent over turn plan overrides", async () => {
  const result = await resolveTopLevelAction({
    explicitIntent: "edit",
    turnPlan: { overrideClassifiedIntent: "draft" },
    userMessage: "make it shorter",
    recentHistory: "",
    memory: buildMemory({ hasActiveDraft: true }),
    controlTurnImpl: async () => {
      throw new Error("controller should not run");
    },
  });

  assert.equal(result.source, "explicit_intent");
  assert.equal(result.classifiedIntent, "edit");
  assert.equal(result.decision.action, "revise");
});

test("resolveTopLevelAction uses turn plan overrides before controller inference", async () => {
  const result = await resolveTopLevelAction({
    explicitIntent: null,
    turnPlan: { overrideClassifiedIntent: "plan" },
    userMessage: "let's do it",
    recentHistory: "",
    memory: buildMemory({ hasPendingPlan: true }),
    controlTurnImpl: async () => {
      throw new Error("controller should not run");
    },
  });

  assert.equal(result.source, "turn_plan");
  assert.equal(result.classifiedIntent, "plan");
  assert.equal(result.decision.action, "plan");
});

test("resolveTopLevelAction maps controller output into one classified intent", async () => {
  const result = await resolveTopLevelAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "write a post about growth loops",
    recentHistory: "",
    memory: buildMemory({ topicSummary: "growth loops", concreteAnswerCount: 2 }),
    controlTurnImpl: async () => ({
      action: "draft",
      needs_memory_update: false,
      confidence: 0.9,
      rationale: "enough context to write",
    }),
  });

  assert.equal(result.source, "controller");
  assert.equal(result.classifiedIntent, "draft");
  assert.equal(result.decision.action, "draft");
});
