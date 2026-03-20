import assert from "node:assert/strict";
import test from "node:test";

import { scopeMemoryForCurrentTurn } from "./turnScopedMemory.ts";
import type { V2ConversationMemory } from "../contracts/chat.ts";

function buildMemory(overrides: Partial<V2ConversationMemory> = {}): V2ConversationMemory {
  return {
    conversationState: "draft_ready",
    activeConstraints: [
      "Correction lock: handle a is not the 30M ARR company.",
      "keep all lowercase",
    ],
    topicSummary: "xpo launch thread",
    lastIdeationAngles: ["ship the ugly first version", "why launch momentum compounds"],
    concreteAnswerCount: 3,
    currentDraftArtifactId: "draft_123",
    activeDraftRef: {
      messageId: "msg_1",
      versionId: "ver_1",
    },
    rollingSummary:
      "Current topic: xpo launch\nApproved angle: ugly first version\nLatest draft status: draft ready",
    pendingPlan: {
      objective: "xpo launch thread",
      angle: "show why ugly launches compound faster than polished waiting",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "lead with the ugly first version",
    },
    clarificationState: null,
    assistantTurnCount: 4,
    latestRefinementInstruction: "make the opener more skeptical and less polished",
    unresolvedQuestion: "do you want this as a thread or a single post?",
    clarificationQuestionsAsked: 1,
    preferredSurfaceMode: "natural",
    formatPreference: "thread",
    activeReplyContext: null,
    activeReplyArtifactRef: null,
    activeProfileAnalysisRef: null,
    selectedReplyOptionId: null,
    voiceFidelity: "balanced",
    ...overrides,
  };
}

test("scopeMemoryForCurrentTurn preserves draft-scoped memory for local edit follow-ups", () => {
  const memory = buildMemory();

  const result = scopeMemoryForCurrentTurn({
    userMessage: "make it shorter and less polished",
    activeDraft: "draft text",
    memory,
  });

  assert.equal(result.topicSummary, memory.topicSummary);
  assert.equal(result.latestRefinementInstruction, memory.latestRefinementInstruction);
  assert.equal(result.pendingPlan?.angle, memory.pendingPlan?.angle);
  assert.equal(result.currentDraftArtifactId, memory.currentDraftArtifactId);
  assert.deepEqual(result.activeConstraints, memory.activeConstraints);
});

test("scopeMemoryForCurrentTurn clears topic-bound residue on a strong topic shift", () => {
  const memory = buildMemory();

  const result = scopeMemoryForCurrentTurn({
    userMessage: "help me write about hiring mistakes instead",
    memory,
  });

  assert.equal(result.conversationState, "ready_to_ideate");
  assert.equal(result.topicSummary, null);
  assert.equal(result.rollingSummary, null);
  assert.equal(result.pendingPlan, null);
  assert.equal(result.latestRefinementInstruction, null);
  assert.equal(result.unresolvedQuestion, null);
  assert.deepEqual(result.lastIdeationAngles, []);
  assert.equal(result.currentDraftArtifactId, null);
  assert.deepEqual(result.activeConstraints, memory.activeConstraints);
  assert.equal(result.formatPreference, memory.formatPreference);
});

test("scopeMemoryForCurrentTurn keeps same-topic memory when the user stays in lane", () => {
  const memory = buildMemory({
    topicSummary: "internship hunt thread",
    pendingPlan: {
      objective: "internship hunt thread",
      angle: "show how one interview changes the emotional stakes",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "counter",
      pitchResponse: "focus on the emotional shift after the interview lands",
    },
  });

  const result = scopeMemoryForCurrentTurn({
    userMessage: "write another internship post about the interview momentum",
    memory,
  });

  assert.equal(result.topicSummary, "internship hunt thread");
  assert.notEqual(result.pendingPlan, null);
  assert.equal(result.latestRefinementInstruction, memory.latestRefinementInstruction);
});

test("scopeMemoryForCurrentTurn preserves clarification state for substantive answers", () => {
  const memory = buildMemory({
    conversationState: "editing",
    topicSummary: "ampm thread",
    clarificationState: {
      branchKey: "semantic_repair",
      stepKey: "await_exact_fix",
      seedTopic: "ampm thread",
      options: [],
    },
    unresolvedQuestion:
      "what core takeaway do you want readers to walk away with?",
    currentDraftArtifactId: "draft_thread_1",
  });

  const result = scopeMemoryForCurrentTurn({
    userMessage: "growing on x is consistency",
    activeDraft: "thread draft body",
    memory,
  });

  assert.equal(result.conversationState, "editing");
  assert.equal(result.topicSummary, "ampm thread");
  assert.equal(result.unresolvedQuestion, memory.unresolvedQuestion);
  assert.deepEqual(result.clarificationState, memory.clarificationState);
  assert.equal(result.currentDraftArtifactId, "draft_thread_1");
});

test("scopeMemoryForCurrentTurn clears stale reply workflow state on non-reply turns", () => {
  const memory = buildMemory({
    activeReplyContext: {
      sourceText: "Most people optimize for approval first.",
      sourceUrl: null,
      authorHandle: "creator",
      quotedUserAsk: "how should i reply to that?",
      confidence: "high",
      parseReason: "reply_ask_with_post_metadata",
      awaitingConfirmation: false,
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      opportunityId: "chat-reply-1",
      latestReplyOptions: [{ id: "opt-1", label: "nuance", text: "Option 1" }],
      latestReplyDraftOptions: [],
      selectedReplyOptionId: "opt-1",
    },
    activeReplyArtifactRef: {
      messageId: "assistant_reply_1",
      kind: "reply_options",
    },
    selectedReplyOptionId: "opt-1",
  });

  const result = scopeMemoryForCurrentTurn({
    userMessage: "write a post about consistency on x",
    memory,
    resolvedWorkflow: "plan_then_draft",
  });

  assert.equal(result.activeReplyContext, null);
  assert.equal(result.activeReplyArtifactRef, null);
  assert.equal(result.selectedReplyOptionId, null);
  assert.equal(result.topicSummary, memory.topicSummary);
});

test("scopeMemoryForCurrentTurn clears both reply and draft residue on a strong topic switch", () => {
  const memory = buildMemory({
    activeReplyContext: {
      sourceText: "Most people optimize for approval first.",
      sourceUrl: null,
      authorHandle: "creator",
      quotedUserAsk: "how should i reply to that?",
      confidence: "high",
      parseReason: "reply_ask_with_post_metadata",
      awaitingConfirmation: false,
      stage: "0_to_1k",
      tone: "builder",
      goal: "followers",
      opportunityId: "chat-reply-1",
      latestReplyOptions: [{ id: "opt-1", label: "nuance", text: "Option 1" }],
      latestReplyDraftOptions: [],
      selectedReplyOptionId: "opt-1",
    },
    activeReplyArtifactRef: {
      messageId: "assistant_reply_1",
      kind: "reply_options",
    },
    selectedReplyOptionId: "opt-1",
  });

  const result = scopeMemoryForCurrentTurn({
    userMessage: "different topic: help me write about onboarding mistakes instead",
    memory,
    resolvedWorkflow: "plan_then_draft",
  });

  assert.equal(result.conversationState, "ready_to_ideate");
  assert.equal(result.topicSummary, null);
  assert.equal(result.currentDraftArtifactId, null);
  assert.equal(result.activeDraftRef, null);
  assert.equal(result.activeReplyContext, null);
  assert.equal(result.activeReplyArtifactRef, null);
  assert.equal(result.selectedReplyOptionId, null);
  assert.deepEqual(result.activeConstraints, memory.activeConstraints);
});
