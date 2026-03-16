import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFastReplyRawResponse,
  buildFastReplyOrchestratorResponse,
  finalizeResponseEnvelope,
} from "./responseEnvelope.ts";

const baseMemory = {
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
};

test("buildFastReplyRawResponse returns a raw envelope without surface metadata", () => {
  const response = buildFastReplyRawResponse({
    response: "what core takeaway do you want readers to walk away with?",
    data: {
      routingTrace: {
        normalizedTurn: {
          turnSource: "free_text",
          artifactKind: null,
          planSeedSource: null,
          replyHandlingBypassedReason: null,
          resolvedWorkflow: "free_text",
        },
      },
    },
    memory: baseMemory,
  });

  assert.equal("surfaceMode" in response, false);
  assert.equal("responseShapePlan" in response, false);
  assert.equal(response.mode, "coach");
  assert.equal(response.outputShape, "coach_question");
});

test("buildFastReplyOrchestratorResponse includes surface mode and response shape plan", () => {
  const response = buildFastReplyOrchestratorResponse({
    response: "what core takeaway do you want readers to walk away with?",
    data: {
      routingTrace: {
        normalizedTurn: {
          turnSource: "free_text",
          artifactKind: null,
          planSeedSource: null,
          replyHandlingBypassedReason: null,
          resolvedWorkflow: "free_text",
        },
      },
    },
    memory: baseMemory,
  });

  assert.equal(response.surfaceMode, "ask_one_question");
  assert.equal(response.responseShapePlan.shouldAskFollowUp, true);
  assert.equal(response.responseShapePlan.maxFollowUps, 1);
  assert.equal(response.data?.routingTrace?.normalizedTurn?.turnSource, "free_text");
});

test("buildFastReplyOrchestratorResponse preserves authored profile reply structure", () => {
  const response = buildFastReplyOrchestratorResponse({
    response: [
      "I see you've positioned yourself as a builder focused on growth systems.",
      "",
      "Lately you've been posting about:",
      "- Retrieval quality and proof-first writing",
      "- Narrowing the lane before scaling output",
    ].join("\n"),
    memory: baseMemory,
    presentationStyle: "preserve_authored_structure",
  });

  assert.equal(response.response.includes("- **Bottom line:**"), false);
  assert.equal(response.response.includes("Lately you've been posting about:"), true);
  assert.equal("presentationStyle" in response, false);
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
      ...baseMemory,
      conversationState: "editing",
      concreteAnswerCount: 1,
      assistantTurnCount: 2,
      preferredSurfaceMode: "structured",
    },
  });

  assert.equal(response.surfaceMode, "revise_and_return");
  assert.equal(response.responseShapePlan.shouldShowArtifacts, true);
  assert.equal(response.responseShapePlan.shouldAskFollowUp, false);
});
