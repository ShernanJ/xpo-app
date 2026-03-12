import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  mapControllerActionToIntent,
  mapIntentToControllerAction,
  resolveArtifactContinuationAction,
} from "./controller.ts";

const baseMemory = {
  conversationState: "ready",
  topicSummary: "xpo continuity",
  hasPendingPlan: false,
  hasActiveDraft: false,
  unresolvedQuestion: null,
  concreteAnswerCount: 2,
};

test("controller intent mapping covers answer ask plan draft and revise paths", () => {
  assert.equal(mapIntentToControllerAction("answer_question"), "answer");
  assert.equal(mapIntentToControllerAction("coach"), "ask");
  assert.equal(mapIntentToControllerAction("plan"), "plan");
  assert.equal(mapIntentToControllerAction("ideate"), "plan");
  assert.equal(mapIntentToControllerAction("draft"), "draft");
  assert.equal(mapIntentToControllerAction("planner_feedback"), "draft");
  assert.equal(mapIntentToControllerAction("edit"), "revise");
  assert.equal(mapIntentToControllerAction("review"), "revise");
});

test("controller action mapping routes pending plan draft approvals to planner feedback", () => {
  const intent = mapControllerActionToIntent({
    action: "draft",
    memory: {
      conversationState: "plan_pending_approval",
      topicSummary: "xpo continuity",
      hasPendingPlan: true,
      hasActiveDraft: false,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
    },
  });

  assert.equal(intent, "planner_feedback");
});

test("controller action mapping routes revise decisions to edit intent", () => {
  const intent = mapControllerActionToIntent({
    action: "revise",
    memory: {
      conversationState: "draft_ready",
      topicSummary: "xpo continuity",
      hasPendingPlan: false,
      hasActiveDraft: true,
      unresolvedQuestion: null,
      concreteAnswerCount: 2,
    },
  });

  assert.equal(intent, "edit");
});

test("controller action mapping keeps direct response actions in answer_question", () => {
  for (const action of ["answer", "analyze", "retrieve_then_answer"]) {
    const intent = mapControllerActionToIntent({
      action,
      memory: baseMemory,
    });

    assert.equal(intent, "answer_question");
  }
});

test("controller action mapping keeps ask actions in coach mode", () => {
  const intent = mapControllerActionToIntent({
    action: "ask",
    memory: baseMemory,
  });

  assert.equal(intent, "coach");
});

test("controller action mapping upgrades draft decisions into edit when a draft is active", () => {
  const intent = mapControllerActionToIntent({
    action: "draft",
    memory: {
      ...baseMemory,
      conversationState: "draft_ready",
      hasActiveDraft: true,
    },
  });

  assert.equal(intent, "edit");
});

test("controller continuation resolver approves pending plans into draft", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "lets do it",
    memory: {
      ...baseMemory,
      conversationState: "plan_pending_approval",
      hasPendingPlan: true,
      pendingPlanSummary: "xpo continuity | context loss is the issue",
    },
  });

  assert.equal(action, "draft");
});

test("controller continuation resolver maps ideation option picks into plan", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "go with option 2",
    memory: {
      ...baseMemory,
      conversationState: "ready_to_ideate",
      lastIdeationAngles: [
        "why context loss kills continuity",
        "what makes an x growth agent feel natural",
      ],
    },
  });

  assert.equal(action, "plan");
});

test("controller continuation resolver maps short active-draft edits into revise", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "make that punchier",
    memory: {
      ...baseMemory,
      conversationState: "draft_ready",
      hasActiveDraft: true,
      latestRefinementInstruction: "drafted a version",
    },
  });

  assert.equal(action, "revise");
});

test("controller continuation resolver maps pending-plan refinements into plan", () => {
  const action = resolveArtifactContinuationAction({
    userMessage: "same angle but softer",
    memory: {
      ...baseMemory,
      conversationState: "plan_pending_approval",
      hasPendingPlan: true,
      pendingPlanSummary: "xpo continuity | context loss is the issue",
    },
  });

  assert.equal(action, "plan");
});

test("controller prompt contract defines answer ask analyze plan draft revise and retrieve behavior", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./controller.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes('"answer"'), true);
  assert.equal(source.includes('"ask"'), true);
  assert.equal(source.includes('"analyze"'), true);
  assert.equal(source.includes('"plan"'), true);
  assert.equal(source.includes('"draft"'), true);
  assert.equal(source.includes('"revise"'), true);
  assert.equal(source.includes('"retrieve_then_answer"'), true);
  assert.equal(
    source.includes(
      "Default to answer over ask when the user asked a direct question and the question is answerable from context.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "Default to ask when the request is autobiographical or product-specific and the missing facts would force invention.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      "Use retrieve_then_answer when the question is about their history, preferences, best posts, prior context, or stored learning.",
    ),
    true,
  );
  assert.equal(
    source.includes(
      'If there is a pending plan and the user says "lets do it", "write it", or plainly approves it, choose draft.',
    ),
    true,
  );
  assert.equal(
    source.includes(
      'If there are ideation angles in scope and the user picks "option 2", "the second one", or similar, choose plan.',
    ),
    true,
  );
  assert.equal(
    source.includes(
      'If there is an active draft and the user says "make that punchier", "same angle but softer", or another short edit follow-up, choose revise.',
    ),
    true,
  );
});
