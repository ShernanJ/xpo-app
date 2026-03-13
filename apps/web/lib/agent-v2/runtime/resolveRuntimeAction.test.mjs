import test from "node:test";
import assert from "node:assert/strict";

import {
  mapIntentToRuntimeWorkflow,
  resolveRuntimeAction,
} from "./resolveRuntimeAction.ts";

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

test("structured ideation picks resolve directly into the plan_then_draft workflow", async () => {
  const result = await resolveRuntimeAction({
    turnSource: "ideation_pick",
    artifactContext: {
      kind: "selected_angle",
      angle: "what's the biggest friction you hit when launching a growth tool?",
      formatHint: "post",
    },
    explicitIntent: "draft",
    resolvedWorkflowHint: "plan_then_draft",
    turnPlan: null,
    userMessage: "",
    recentHistory: "",
    memory: buildMemory(),
  });

  assert.equal(result.workflow, "plan_then_draft");
  assert.equal(result.classifiedIntent, "draft");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "draft");
});

test("structured draft actions resolve directly into revise_draft", async () => {
  const result = await resolveRuntimeAction({
    turnSource: "draft_action",
    artifactContext: {
      kind: "draft_selection",
      action: "edit",
      selectedDraftContext: {
        messageId: "msg_1",
        versionId: "ver_1",
        content: "draft body",
      },
    },
    explicitIntent: "edit",
    resolvedWorkflowHint: "revise_draft",
    turnPlan: null,
    userMessage: "make it shorter",
    recentHistory: "",
    memory: buildMemory({ hasActiveDraft: true }),
  });

  assert.equal(result.workflow, "revise_draft");
  assert.equal(result.classifiedIntent, "edit");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "revise");
});

test("controller analyze actions map into analyze_post even though the classified intent stays answer_question", async () => {
  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "why is this underperforming?",
    recentHistory: "",
    memory: buildMemory(),
    controlTurnImpl: async () => ({
      action: "analyze",
      needs_memory_update: false,
      confidence: 0.9,
      rationale: "analysis request",
    }),
  });

  assert.equal(result.workflow, "analyze_post");
  assert.equal(result.classifiedIntent, "answer_question");
  assert.equal(result.source, "controller");
});

test("mapIntentToRuntimeWorkflow keeps edit/review inside revise_draft", () => {
  assert.equal(
    mapIntentToRuntimeWorkflow({
      classifiedIntent: "edit",
      controllerAction: "revise",
    }),
    "revise_draft",
  );
  assert.equal(
    mapIntentToRuntimeWorkflow({
      classifiedIntent: "review",
      controllerAction: "revise",
    }),
    "revise_draft",
  );
});
