import test from "node:test";
import assert from "node:assert/strict";

import { selectResponseShapePlan } from "./surfaceModeSelector.ts";
import { shapeAssistantResponse } from "./responseShaper.ts";

test("response shaper strips memory notices and follow-up prompts for direct answers", () => {
  const plan = selectResponseShapePlan({
    outputShape: "coach_question",
    response:
      "Noted - I'll remember that feedback for next drafts.\n\nthat one feels cleaner now. want me to turn that into a post?",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: false,
    conversationState: "needs_more_context",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response:
      "Noted - I'll remember that feedback for next drafts.\n\nthat one feels cleaner now. want me to turn that into a post?",
    outputShape: "coach_question",
    plan,
  });

  assert.equal(plan.surfaceMode, "ask_one_question");
  assert.equal(response, "that one feels cleaner now.");
});

test("surface mode selector marks draft revisions as revise_and_return", () => {
  const plan = selectResponseShapePlan({
    outputShape: "short_form_post",
    response: "updated it based on your note. want any tweaks before posting?",
    hasQuickReplies: false,
    hasAngles: false,
    hasPlan: false,
    hasDraft: true,
    conversationState: "editing",
    preferredSurfaceMode: "natural",
  });

  const response = shapeAssistantResponse({
    response: "updated it based on your note. want any tweaks before posting?",
    outputShape: "short_form_post",
    plan,
  });

  assert.equal(plan.surfaceMode, "revise_and_return");
  assert.equal(response, "updated it based on your note.");
});

test("surface mode selector keeps structured generations structured", () => {
  const plan = selectResponseShapePlan({
    outputShape: "planning_outline",
    response: "this direction feels strongest.\n\nwant me to draft this as-is, or tweak the angle first?",
    hasQuickReplies: true,
    hasAngles: false,
    hasPlan: true,
    hasDraft: false,
    conversationState: "plan_pending_approval",
    preferredSurfaceMode: "structured",
  });

  assert.deepEqual(plan, {
    mode: "structured_generation",
    surfaceMode: "offer_options",
    shouldShowArtifacts: true,
    shouldExplainReasoning: false,
    shouldAskFollowUp: true,
    maxFollowUps: 1,
  });
});
