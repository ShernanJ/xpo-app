import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftCandidateOutcome,
} from "./route.logic.ts";

const threadBrief = {
  title: "thread: hiring lesson",
  prompt: "draft a thread about hiring lessons",
  formatPreference: "thread",
  sourcePlaybook: "thread_playbook",
};

function createBaseRoutingTrace(overrides = {}) {
  return {
    normalizedTurn: {
      turnSource: "free_text",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "plan_then_draft",
    },
    runtimeResolution: {
      workflow: "plan_then_draft",
      source: "structured_turn",
    },
    workerExecutions: [],
    workerExecutionSummary: {
      total: 0,
      parallel: 0,
      sequential: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      groups: [],
    },
    persistedStateChanges: null,
    validations: [],
    turnPlan: null,
    controllerAction: null,
    classifiedIntent: "draft",
    resolvedMode: "draft",
    routerState: null,
    planInputSource: null,
    clarification: null,
    draftGuard: null,
    planFailure: null,
    timings: null,
    ...overrides,
  };
}

test("buildDraftCandidateOutcome produces a thread artifact when the draft is valid", () => {
  const outcome = buildDraftCandidateOutcome({
    brief: threadBrief,
    rawResponse: {
      mode: "draft",
      outputShape: "thread_seed",
      response: "here's the thread.",
      memory: {
        conversationState: "draft_ready",
      },
      data: {
        draft: ["post one", "post two", "post three"].join("\n\n---\n\n"),
        threadFramingStyle: "soft_signal",
        retrievedAnchorIds: ["anchor-1", "anchor-2"],
        voiceTarget: {
          casing: "normal",
          compression: "medium",
          formality: "neutral",
          hookStyle: "story",
          emojiPolicy: "none",
          ctaPolicy: "none",
          risk: "safe",
          lane: "original",
          summary: "normal casing",
          rationale: [],
        },
        noveltyNotes: ["fresh angle"],
        groundingSources: [],
      },
    },
    routingTrace: createBaseRoutingTrace(),
    threadPostMaxCharacterLimit: 280,
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.equal(outcome.candidate.outputShape, "thread_seed");
  assert.equal(outcome.candidate.artifact.kind, "thread_seed");
  assert.equal(outcome.candidate.voiceTarget?.summary, "normal casing");
  assert.deepEqual(outcome.candidate.retrievedAnchorIds, ["anchor-1", "anchor-2"]);
});

test("buildDraftCandidateOutcome returns structured failures instead of silently dropping them", () => {
  const outcome = buildDraftCandidateOutcome({
    brief: threadBrief,
    rawResponse: {
      mode: "coach",
      outputShape: "coach_question",
      response: "What is the main point of the thread?",
      memory: {
        conversationState: "needs_more_context",
      },
    },
    routingTrace: createBaseRoutingTrace({
      clarification: {
        kind: "question",
        reason: "missing_topic",
        branchKey: null,
        question: "What is the main point of the thread?",
      },
    }),
    threadPostMaxCharacterLimit: 280,
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }

  assert.equal(outcome.failure.reason, "clarification_required");
  assert.equal(outcome.failure.traceReason, "missing_topic");
  assert.equal(
    outcome.failure.detail,
    "What is the main point of the thread?",
  );
});
