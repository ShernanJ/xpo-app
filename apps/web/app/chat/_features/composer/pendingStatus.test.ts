import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAgentProgressStep,
  buildPendingStatusPlan,
  completeAgentProgressRun,
  createAgentProgressRun,
  formatAgentProgressDuration,
  formatAgentProgressThoughtDuration,
  normalizeBackendPendingStatus,
  resolveAgentProgressSnapshot,
  resolvePendingStatusSnapshot,
  resolvePendingStatusLabel,
  resolvePendingStatusWorkflow,
} from "./pendingStatus.ts";

test("bare draft asks resolve to ideate status plans", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });

  assert.equal(plan.workflow, "ideate");
  assert.deepEqual(plan.steps.map((step) => step.id), [
    "understand_request",
    "gather_context",
    "plan_response",
    "generate_output",
  ]);
  assert.equal(
    plan.steps[0]?.explanation,
    "This helps the assistant focus on the job you actually want done.",
  );
});

test("selected ideation picks resolve to plan_then_draft", () => {
  assert.equal(
    resolvePendingStatusWorkflow({
      message: "",
      turnSource: "ideation_pick",
      artifactContext: {
        kind: "selected_angle",
        angle: "what's the biggest friction?",
        formatHint: "post",
      },
    }),
    "plan_then_draft",
  );
});

test("draft revisions resolve to revise_draft", () => {
  const plan = buildPendingStatusPlan({
    message: "make it shorter",
    turnSource: "draft_action",
    artifactContext: {
      kind: "draft_selection",
      action: "edit",
      selectedDraftContext: {
        messageId: "msg_1",
        versionId: "ver_1",
        content: "draft",
      },
    },
    intent: "edit",
    hasSelectedDraftContext: true,
  });

  assert.equal(plan.workflow, "revise_draft");
  assert.deepEqual(plan.steps.map((step) => step.id), [
    "understand_request",
    "gather_context",
    "generate_output",
    "persist_response",
  ]);
});

test("thread conversion revisions get thread-specific copy", () => {
  const plan = buildPendingStatusPlan({
    message: "turn into thread",
    turnSource: "draft_action",
    intent: "edit",
    hasSelectedDraftContext: true,
  });

  assert.equal(plan.workflow, "revise_draft");
  assert.equal(plan.steps[1]?.label, "Mapping the thread flow");
  assert.equal(plan.steps[2]?.label, "Turning it into a thread");
});

test("reply option flow resolves to reply_to_post", () => {
  assert.equal(
    resolvePendingStatusWorkflow({
      message: "",
      turnSource: "reply_action",
      artifactContext: {
        kind: "reply_option_select",
        optionIndex: 1,
      },
    }),
    "reply_to_post",
  );
});

test("analysis prompts resolve to analyze_post", () => {
  assert.equal(
    resolvePendingStatusWorkflow({
      message: "why is this underperforming?",
      turnSource: "free_text",
    }),
    "analyze_post",
  );
});

test("generic fallback resolves to answer_question", () => {
  const plan = buildPendingStatusPlan({
    message: "hello",
    turnSource: "free_text",
  });

  assert.equal(plan.workflow, "answer_question");
  assert.deepEqual(plan.steps.map((step) => step.id), [
    "understand_request",
    "gather_context",
    "generate_output",
    "persist_response",
  ]);
});

test("status progression advances through the predicted step sequence", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });

  const initialSnapshot = resolvePendingStatusSnapshot({
    plan,
    elapsedMs: 0,
  });
  const lateSnapshot = resolvePendingStatusSnapshot({
    plan,
    elapsedMs: 5000,
  });

  assert.equal(initialSnapshot?.activeStepId, "understand_request");
  assert.deepEqual(
    lateSnapshot?.steps.map((step) => step.status),
    ["completed", "completed", "completed", "active"],
  );
});

test("backend statuses override local pending status labels", () => {
  const plan = buildPendingStatusPlan({
    message: "draft a post about retention",
    turnSource: "free_text",
  });

  assert.equal(
    resolvePendingStatusLabel({
      plan,
      elapsedMs: 0,
      backendStatus: "Writing draft options.",
    }),
    "Drafting the post",
  );
  assert.equal(
    normalizeBackendPendingStatus("Planning the next move."),
    "Gather Context",
  );
});

test("explicit streamed progress overrides predicted timing", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });
  const run = createAgentProgressRun({
    plan,
    startedAtMs: 1_000,
  });

  const updated = applyAgentProgressStep(run, {
    workflow: "ideate",
    activeStepId: "plan_response",
    label: "Noticing a recent pattern around hiring playbooks",
    explanation: "This helps keep the response anchored in a theme the account already returns to.",
  });
  const snapshot = resolveAgentProgressSnapshot(updated!, 1_500);

  assert.equal(snapshot.activeStepId, "plan_response");
  assert.equal(
    snapshot.steps[2]?.label,
    "Noticing a recent pattern around hiring playbooks",
  );
  assert.equal(
    snapshot.steps[2]?.explanation,
    "This helps keep the response anchored in a theme the account already returns to.",
  );
  assert.deepEqual(
    snapshot.steps.map((step) => step.status),
    ["completed", "completed", "active", "pending"],
  );
});

test("completed progress freezes all steps and duration formatting is stable", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });
  const completed = completeAgentProgressRun(
    createAgentProgressRun({
      plan,
      startedAtMs: 1_000,
    }),
    "completed",
    19_500,
  );

  assert.equal(formatAgentProgressDuration(18_500), "0:18");
  assert.equal(formatAgentProgressThoughtDuration(18_500), "18s");
  assert.equal(completed?.phase, "completed");
  assert.deepEqual(
    completed?.frozenSnapshot?.steps.map((step) => step.status),
    ["completed", "completed", "completed", "completed"],
  );
});
