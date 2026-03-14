import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPendingStatusPlan,
  normalizeBackendPendingStatus,
  resolvePendingStatusLabel,
  resolvePendingStatusWorkflow,
} from "./pendingStatus.ts";

test("bare draft asks resolve to ideate status plans", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });

  assert.equal(plan.workflow, "ideate");
  assert.deepEqual(plan.steps.map((step) => step.label), [
    "thinking of a few directions",
    "picking the strongest one",
  ]);
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
  assert.deepEqual(plan.steps.map((step) => step.label), [
    "reworking the draft",
    "tightening the wording",
  ]);
});

test("thread conversion revisions get thread-specific copy", () => {
  const plan = buildPendingStatusPlan({
    message: "turn this into a thread with 4 to 6 posts",
    turnSource: "draft_action",
    intent: "edit",
    hasSelectedDraftContext: true,
  });

  assert.equal(plan.workflow, "revise_draft");
  assert.deepEqual(plan.steps.map((step) => step.label), [
    "mapping the thread flow",
    "turning it into a thread",
  ]);
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
  assert.deepEqual(plan.steps.map((step) => step.label), [
    "thinking this through",
  ]);
});

test("status progression advances once after the second-step delay", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });

  assert.equal(
    resolvePendingStatusLabel({
      plan,
      elapsedMs: 0,
    }),
    "thinking of a few directions",
  );
  assert.equal(
    resolvePendingStatusLabel({
      plan,
      elapsedMs: 1500,
    }),
    "picking the strongest one",
  );
  assert.equal(
    resolvePendingStatusLabel({
      plan,
      elapsedMs: 8000,
    }),
    "picking the strongest one",
  );
});

test("backend statuses override local pending status labels", () => {
  const plan = buildPendingStatusPlan({
    message: "write a post",
    turnSource: "free_text",
  });

  assert.equal(
    resolvePendingStatusLabel({
      plan,
      elapsedMs: 0,
      backendStatus: "Writing draft options.",
    }),
    "drafting it now",
  );
  assert.equal(
    normalizeBackendPendingStatus("Planning the next move."),
    "figuring out the angle",
  );
});
