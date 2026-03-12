import test from "node:test";
import assert from "node:assert/strict";

import { planTurn } from "../orchestrator/turnPlanner.ts";

// ---------------------------------------------------------------------------
// Turn Planner — Edit intent detection
// ---------------------------------------------------------------------------

test("v3: edit instruction with active draft triggers edit override", () => {
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
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "edit");
  assert.equal(result.overrideClassifiedIntent, "edit");
  assert.equal(result.shouldGenerate, true);
});

test("v3: edit instruction without any draft context returns null", () => {
  const result = planTurn({
    userMessage: "make it less harsh",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.equal(result, null);
});

test("v3: edit instruction with currentDraftArtifactId triggers edit", () => {
  const result = planTurn({
    userMessage: "tone it down",
    recentHistory: "",
    memory: {
      conversationState: "editing",
      concreteAnswerCount: 1,
      topicSummary: "leadership lessons",
      pendingPlan: null,
      currentDraftArtifactId: "draft-123",
      assistantTurnCount: 5,
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "edit");
});

test("v3: 'no emojis' with a draft triggers edit (edit instruction)", () => {
  const result = planTurn({
    userMessage: "no emojis",
    recentHistory: "",
    activeDraft: "hey 🎉 great news!",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "product launch",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 3,
    },
  });

  assert.ok(result);
  // With an active draft, "no emojis" is an edit instruction
  assert.equal(result.overrideClassifiedIntent, "edit");
});

test("v3: 'make it shorter' with draft_ready state triggers edit", () => {
  const result = planTurn({
    userMessage: "make it shorter",
    recentHistory: "",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "SaaS pricing",
      pendingPlan: null,
      currentDraftArtifactId: "draft-abc",
      assistantTurnCount: 4,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "edit");
  assert.equal(result.overrideClassifiedIntent, "edit");
});

test("v3: reaction-style draft feedback routes to edit", () => {
  const result = planTurn({
    userMessage: "that one feels too forced",
    recentHistory: "",
    activeDraft: "some current draft",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "founder updates",
      pendingPlan: null,
      currentDraftArtifactId: "draft-xyz",
      assistantTurnCount: 4,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "edit");
});

test("v3: style-nudge draft feedback like 'less linkedin' routes to edit", () => {
  const result = planTurn({
    userMessage: "less linkedin",
    recentHistory: "",
    activeDraft: "some current draft",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "founder updates",
      pendingPlan: null,
      currentDraftArtifactId: "draft-xyz",
      assistantTurnCount: 4,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "edit");
  assert.equal(result.overrideClassifiedIntent, "edit");
});

test("v3: greeting routes to coach chat without generation", () => {
  const result = planTurn({
    userMessage: "hi how are you",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: small-talk reply after assistant asks back stays in coach chat", () => {
  const result = planTurn({
    userMessage: "vibing",
    recentHistory: "assistant: hey hey, doing good. you?",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 1,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: meta assistant question routes to coach chat", () => {
  const result = planTurn({
    userMessage: "how do i make u sound more human",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: conversation reset cue stays in coach chat", () => {
  const result = planTurn({
    userMessage: "wow super random",
    recentHistory: "assistant: what's the biggest pain point your app solves?",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 1,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: broad growth ask stays in coach chat", () => {
  const result = planTurn({
    userMessage: "help me grow",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: x-specific growth ask stays in coach chat", () => {
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
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

// ---------------------------------------------------------------------------
// Turn Planner — Immediate draft commands
// ---------------------------------------------------------------------------

test("v3: 'just write it' skips clarification when context exists", () => {
  const result = planTurn({
    userMessage: "just write it",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 2,
      topicSummary: "hiring is broken",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 4,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldGenerate, true);
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: 'go ahead' with pending plan routes to planner_feedback", () => {
  const plan = {
    objective: "Share a hiring lesson",
    angle: "what nobody tells you about hiring",
    targetLane: "original",
    mustInclude: [],
    mustAvoid: [],
    hookType: "question",
    pitchResponse: "yes",
  };

  const result = planTurn({
    userMessage: "go ahead",
    recentHistory: "",
    memory: {
      conversationState: "plan_pending_approval",
      concreteAnswerCount: 1,
      topicSummary: "hiring",
      pendingPlan: plan,
      currentDraftArtifactId: null,
      assistantTurnCount: 3,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "planner_feedback");
});

test("v3: diagnostic follow-up asking for examples stays in coach chat", () => {
  const result = planTurn({
    userMessage: "give me examples",
    recentHistory: [
      "assistant: a few things are probably suppressing reach right now:",
      "",
      "for you specifically, this looks less like a reach problem and more like making software and product through grow on legible through a sharper lived example.",
      "",
      "likely reasons:",
      "1. Most drafted posts are not getting to posted state yet, which suggests draft fit or specificity is still weak.",
      "",
      "next actions:",
      "1. Keep the bio tight and make \"software and product through grow on\" legible in one glance.",
      "2. Lean harder into built an in replies because it is earning the strongest downstream action.",
      "3. Test the next short form post draft against grow on.",
      "",
      "full breakdown is there if you want it. the best playbook match is reply ladder.",
    ].join("\n"),
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: answering the active clarification question routes forward instead of looping coach", () => {
  const result = planTurn({
    userMessage: "the problem is most builders only see vanity metrics",
    recentHistory: "assistant: what's the actual problem it fixes?",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 1,
      topicSummary: "analytics",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
      unresolvedQuestion: "what's the actual problem it fixes?",
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "plan");
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: 'just write it' without any context returns null (no override)", () => {
  const result = planTurn({
    userMessage: "just write it",
    recentHistory: "",
    memory: {
      conversationState: "collecting_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.equal(result, null);
});

test("v3: 'run with it' triggers draft when topic is known", () => {
  const result = planTurn({
    userMessage: "run with it",
    recentHistory: "",
    memory: {
      conversationState: "ready_to_ideate",
      concreteAnswerCount: 1,
      topicSummary: "cold email strategies",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
});

test("v3: 'generate me an example' uses the concrete assistant seed instead of looping", () => {
  const result = planTurn({
    userMessage: "generate me an example",
    recentHistory:
      "assistant: lost to stan? use that sting. show how that loss sparked your app. turn the defeat into a case study for grow on. show followers the exact tweak that would've flipped the match.",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldGenerate, true);
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: 'give me examples' also uses the concrete assistant seed when it is a content angle", () => {
  const result = planTurn({
    userMessage: "give me examples",
    recentHistory:
      "assistant: lost to stan? use that sting. show how that loss sparked your app. turn the defeat into a case study for grow on. show followers the exact tweak that would've flipped the match.",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldGenerate, true);
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: 'generate me an example' without a real seed still returns null", () => {
  const result = planTurn({
    userMessage: "generate me an example",
    recentHistory:
      "assistant: i can help with what to post on x, draft in your voice, revise drafts, and give blunt growth feedback. send what to post today, a rough idea, or a draft.",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 1,
      unresolvedQuestion: null,
    },
  });

  assert.equal(result, null);
});

test("v3: specific first-turn draft request routes straight to draft", () => {
  const result = planTurn({
    userMessage:
      "can you write me a post on playing league at the stan office against the ceo and losing hard",
    recentHistory: "",
    memory: {
      conversationState: "collecting_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldGenerate, true);
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: topical first-turn draft request routes straight to draft", () => {
  const result = planTurn({
    userMessage: "write one about onboarding mistakes early-stage founders keep making",
    recentHistory: "",
    memory: {
      conversationState: "collecting_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

test("v3: vague product draft request routes into plan clarification", () => {
  const result = planTurn({
    userMessage: "write a post about my extension for stanley",
    recentHistory: "",
    memory: {
      conversationState: "collecting_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "plan");
  assert.equal(result.shouldAutoDraftFromPlan, undefined);
});

test("v3: opaque entity draft request routes into plan clarification", () => {
  const result = planTurn({
    userMessage: "can you write me a post about xpo",
    recentHistory: "",
    memory: {
      conversationState: "collecting_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 0,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "plan");
  assert.equal(result.shouldAutoDraftFromPlan, undefined);
});

test("v3: grounded entity draft request goes straight to draft", () => {
  const result = planTurn({
    userMessage: "can you write me a post about xpo",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: "xpo",
      pendingPlan: null,
      currentDraftArtifactId: null,
      activeConstraints: [
        "Correction lock: xpo is a x growth/content engine",
        "Correction lock: xpo doesn't generate hashtags",
      ],
      assistantTurnCount: 2,
      unresolvedQuestion: null,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "draft");
  assert.equal(result.overrideClassifiedIntent, "draft");
  assert.equal(result.shouldAutoDraftFromPlan, true);
});

// ---------------------------------------------------------------------------
// Turn Planner — Chat question detection
// ---------------------------------------------------------------------------

test("v3: 'which angle is stronger' routes to coach", () => {
  const result = planTurn({
    userMessage: "which angle is stronger?",
    recentHistory: "",
    memory: {
      conversationState: "ready_to_ideate",
      concreteAnswerCount: 1,
      topicSummary: "product launch",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: 'what do you mean by that' routes to coach", () => {
  const result = planTurn({
    userMessage: "what do you mean by that?",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 1,
      topicSummary: "leadership",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
    },
  });

  assert.ok(result);
  assert.equal(result.overrideClassifiedIntent, "coach");
  assert.equal(result.shouldGenerate, false);
});

test("v3: long messages are not misclassified as chat", () => {
  const longMessage = "I want to write about how we rebuilt our entire data pipeline from scratch because the original architecture was causing cascading failures every sprint";
  const result = planTurn({
    userMessage: longMessage,
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 0,
      topicSummary: null,
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 1,
    },
  });

  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Turn Planner — Explicit intent passthrough
// ---------------------------------------------------------------------------

test("v3: explicit intent is never overridden by the turn planner", () => {
  const result = planTurn({
    userMessage: "make it less harsh",
    recentHistory: "",
    activeDraft: "some draft",
    explicitIntent: "coach",
    memory: {
      conversationState: "draft_ready",
      concreteAnswerCount: 1,
      topicSummary: "startup",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 3,
    },
  });

  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Turn Planner — Constraint without draft context
// ---------------------------------------------------------------------------

test("v3: 'no emojis' without a draft routes through chat (constraint capture)", () => {
  const result = planTurn({
    userMessage: "no emojis",
    recentHistory: "",
    memory: {
      conversationState: "needs_more_context",
      concreteAnswerCount: 1,
      topicSummary: "product launch",
      pendingPlan: null,
      currentDraftArtifactId: null,
      assistantTurnCount: 2,
    },
  });

  assert.ok(result);
  assert.equal(result.userGoal, "chat");
  assert.equal(result.shouldGenerate, false);
  // No override — will fall through to classifier which routes to coach
  assert.equal(result.overrideClassifiedIntent, undefined);
});
