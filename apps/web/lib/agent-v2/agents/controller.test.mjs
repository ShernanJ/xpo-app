import test from "node:test";
import assert from "node:assert/strict";

import {
  mapControllerActionToIntent,
  mapIntentToControllerAction,
} from "./controller.ts";

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
  assert.equal(mapIntentToControllerAction("answer_question"), "answer");
});
