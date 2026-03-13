import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFastReplyOrchestratorResponse,
  finalizeResponseEnvelope,
} from "./responseEnvelope.ts";

test("buildFastReplyOrchestratorResponse includes surface mode and response shape plan", () => {
  const response = buildFastReplyOrchestratorResponse({
    response: "what core takeaway do you want readers to walk away with?",
    memory: {
      conversationState: "needs_more_context",
      topicSummary: "growth on x",
      lastIdeationAngles: [],
      concreteAnswerCount: 0,
      currentDraftArtifactId: null,
      activeDraftRef: null,
      rollingSummary: null,
      pendingPlan: null,
      clarificationState: null,
      assistantTurnCount: 1,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: "natural",
      formatPreference: "shortform",
      activeConstraints: [],
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
  });

  assert.equal(response.surfaceMode, "ask_one_question");
  assert.equal(response.responseShapePlan.shouldAskFollowUp, true);
  assert.equal(response.responseShapePlan.maxFollowUps, 1);
});

test("finalizeResponseEnvelope preserves structured draft outputs", () => {
  const response = finalizeResponseEnvelope({
    mode: "draft",
    outputShape: "short_form_post",
    response: "draft text",
    data: {
      draft: "draft text",
    },
    memory: {
      conversationState: "editing",
      topicSummary: "growth on x",
      lastIdeationAngles: [],
      concreteAnswerCount: 1,
      currentDraftArtifactId: null,
      activeDraftRef: null,
      rollingSummary: null,
      pendingPlan: null,
      clarificationState: null,
      assistantTurnCount: 2,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: "structured",
      formatPreference: "shortform",
      activeConstraints: [],
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
  });

  assert.equal(response.surfaceMode, "revise_and_return");
  assert.equal(response.responseShapePlan.shouldShowArtifacts, true);
  assert.equal(response.responseShapePlan.shouldAskFollowUp, false);
});
