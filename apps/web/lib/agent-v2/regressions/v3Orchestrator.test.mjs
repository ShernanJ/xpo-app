import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { planTurn } from "../runtime/turnPlanner.ts";

test("v3: edit instruction with active draft still routes to edit override", () => {
  const result = planTurn({
    userMessage: "make it less harsh",
    recentHistory: "assistant: here is a draft",
    activeDraft: "some draft text",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "startup culture",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 3,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "edit");
  assert.equal(result.userGoal, "edit");
});

test("v3: edit-style request without draft context stays in coach safety mode", () => {
  const result = planTurn({
    userMessage: "help me improve this draft",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: pending plan approvals now fall through to the controller", () => {
  const result = planTurn({
    userMessage: "lets do it",
    recentHistory: "assistant: this is the cleanest angle",
    memory: {
      conversationState: "plan_pending_approval",
      concreteAnswerCount: 1,
      topicSummary: "xpo continuity",
      pendingPlan: {
        objective: "xpo continuity",
        angle: "the issue is context loss, not model capability",
        targetLane: "original",
        mustInclude: [],
        mustAvoid: [],
        hookType: "contrarian",
        pitchResponse: "this is the cleanest angle",
        formatPreference: "shortform",
      },
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.equal(result, null);
});

test("v3: broad routing now falls through to the controller instead of deterministic overrides", () => {
  const result = planTurn({
    userMessage: "help me grow on x",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
      unresolvedQuestion: null,
    },
  });

  assert.equal(result, null);
});

test("v3: ideation retry shortcuts no longer bypass the controller in conversation manager", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../orchestrator/conversationManager.ts", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("looksLikeIdeationRetryCommand"), false);
  assert.equal(source.includes('mode = "ideate";'), false);
});
