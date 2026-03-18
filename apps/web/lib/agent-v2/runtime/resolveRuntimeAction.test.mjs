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

test("reply actions stay on the structured reply workflow", async () => {
  const result = await resolveRuntimeAction({
    turnSource: "reply_action",
    artifactContext: {
      kind: "reply_option_select",
      optionIndex: 1,
    },
    explicitIntent: null,
    resolvedWorkflowHint: "reply_to_post",
    turnPlan: null,
    userMessage: "",
    recentHistory: "",
    memory: buildMemory(),
  });

  assert.equal(result.workflow, "reply_to_post");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "answer");
});

test("pending plan approvals bypass the controller and stay structured", async () => {
  let controlTurnCalled = false;

  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "go ahead",
    recentHistory: "",
    memory: buildMemory({
      conversationState: "plan_pending_approval",
      hasPendingPlan: true,
    }),
    controlTurnImpl: async () => {
      controlTurnCalled = true;
      return {
        action: "ask",
        needs_memory_update: false,
        confidence: 0.1,
        rationale: "should not run",
      };
    },
  });

  assert.equal(controlTurnCalled, false);
  assert.equal(result.workflow, "plan_then_draft");
  assert.equal(result.classifiedIntent, "planner_feedback");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "draft");
});

test("malformed revision retry approvals bypass the controller and stay on revise_draft", async () => {
  let controlTurnCalled = false;

  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "yes",
    recentHistory:
      "user: needs an intro in post 1\nassistant: that revision came back malformed twice. want me to try again cleanly with the same edit goal?",
    memory: buildMemory({
      conversationState: "editing",
      hasActiveDraft: true,
      latestRefinementInstruction: "needs an intro in post 1",
    }),
    controlTurnImpl: async () => {
      controlTurnCalled = true;
      return {
        action: "answer",
        needs_memory_update: false,
        confidence: 0.1,
        rationale: "should not run",
      };
    },
  });

  assert.equal(controlTurnCalled, false);
  assert.equal(result.workflow, "revise_draft");
  assert.equal(result.classifiedIntent, "edit");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "revise");
});

test("generic approvals outside malformed revision retry prompts still fall through to the controller", async () => {
  let controlTurnCalled = false;

  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "yes",
    recentHistory: "assistant: drafted a version. tune tone, hook, or length?",
    memory: buildMemory({
      conversationState: "editing",
      hasActiveDraft: true,
      latestRefinementInstruction: "needs an intro in post 1",
    }),
    controlTurnImpl: async () => {
      controlTurnCalled = true;
      return {
        action: "answer",
        needs_memory_update: false,
        confidence: 0.8,
        rationale: "generic approval",
      };
    },
  });

  assert.equal(controlTurnCalled, true);
  assert.equal(result.workflow, "answer_question");
  assert.equal(result.source, "controller");
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

test("bare draft requests bypass conversational controller fallbacks and stay in plan_then_draft", async () => {
  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "write a post",
    recentHistory: "",
    memory: buildMemory({
      topicSummary: "hiring systems",
      concreteAnswerCount: 3,
    }),
    controlTurnImpl: async () => ({
      action: "answer",
      needs_memory_update: false,
      confidence: 0.98,
      rationale: "incorrect conversational fallback",
    }),
  });

  assert.equal(result.workflow, "plan_then_draft");
  assert.equal(result.classifiedIntent, "plan");
  assert.equal(result.decision.action, "plan");
});

test("simple social turns bypass the controller and stay in answer_question", async () => {
  let controlTurnCalled = false;

  const result = await resolveRuntimeAction({
    explicitIntent: null,
    turnPlan: null,
    userMessage: "hi",
    recentHistory: "",
    memory: buildMemory({
      topicSummary: "stale hiring topic",
      unresolvedQuestion: "do you want a thread or a post?",
    }),
    controlTurnImpl: async () => {
      controlTurnCalled = true;
      throw new Error("controller should not run for simple social turns");
    },
  });

  assert.equal(controlTurnCalled, false);
  assert.equal(result.workflow, "answer_question");
  assert.equal(result.classifiedIntent, "answer_question");
  assert.equal(result.source, "structured_turn");
  assert.equal(result.decision.action, "answer");
  assert.equal(result.decision.rationale, "deterministic simple social turn");
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
