import test from "node:test";
import assert from "node:assert/strict";

import { buildConstraintAcknowledgment, isConstraintDeclaration } from "./constraintAcknowledgment.ts";
import { getDeterministicChatReply } from "./chatResponderDeterministic.ts";

test("deterministic chat replies stay minimal for greetings and capability chat", async () => {
  const greetingReply = await getDeterministicChatReply({
    userMessage: "hi how are you",
    recentHistory: "",
  });
  const capabilityReply = await getDeterministicChatReply({
    userMessage: "what can you do",
    recentHistory: "",
  });

  assert.equal(greetingReply, null);
  assert.equal(capabilityReply, null);
});

test("deterministic chat still explains the latest failure reason when present", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "why did it fail",
    recentHistory:
      "assistant: Failed to generate strategy plan because the planner returned invalid JSON.",
  });

  assert.equal(reply, "it failed because the planner returned invalid json.");
});

test("deterministic chat keeps self-knowledge answers grounded", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what do you know about me?",
    recentHistory: "",
    userContextString: [
      "User Profile Summary:",
      "- Stage: 0-1k",
      "- Primary Goal: follower growth",
    ].join("\n"),
    activeConstraints: ["no emojis"],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("hidden analytics"), true);
  assert.equal(reply?.toLowerCase().includes("0-1k"), true);
  assert.equal(reply?.toLowerCase().includes("200 votes"), false);
});

test("constraint declarations are detected without catching normal drafting asks", () => {
  assert.equal(isConstraintDeclaration("no emojis"), true);
  assert.equal(isConstraintDeclaration("less linkedin"), true);
  assert.equal(isConstraintDeclaration("write me a post with no emojis"), false);
});

test("constraint acknowledgments stay short when no draft is in play", () => {
  const reply = buildConstraintAcknowledgment({
    message: "no emojis",
    recentHistory: "",
  });

  assert.equal(reply, "got it. no emojis going forward.");
});

test("constraint acknowledgments offer revision only when a draft is already in play", () => {
  const reply = buildConstraintAcknowledgment({
    message: "no emojis",
    recentHistory: "assistant: here's the draft. take a look.",
  });

  assert.equal(reply, "got it. no emojis. i can clean up the current draft too if you want.");
});

test("generic constraint acknowledgments avoid workflow-y lock-in phrasing", () => {
  const reply = buildConstraintAcknowledgment({
    message: "less linkedin",
    recentHistory: "",
  });

  assert.equal(reply.includes("lock in"), false);
  assert.equal(reply.includes("?"), false);
  assert.equal(reply, "noted. i'll apply that going forward.");
});
