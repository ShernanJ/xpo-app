import test from "node:test";
import assert from "node:assert/strict";

import { buildConstraintAcknowledgment, isConstraintDeclaration } from "./constraintAcknowledgment.ts";
import { getDeterministicChatReply } from "./chatResponderDeterministic.ts";

const baseProfileReplyContext = {
  accountLabel: "shernan @shernanjavier",
  bio: "building xpo. helping builders turn ideas into posts that actually ship.",
  knownFor: "builder-focused x growth systems",
  targetAudience: "builders trying to ship sharper posts",
  contentPillars: ["retrieval quality", "proof-first writing", "x growth systems"],
  stage: "0-1k",
  goal: "authority",
  topicBullets: [
    "Retrieval quality and proof-first writing",
    "Narrowing the lane before scaling output",
    "Posting the proof while building",
  ],
  recentPostSnippets: [
    "generic ai copy usually comes from weak retrieval, not weak models.",
    "the real unlock was narrowing the lane before trying to scale output.",
  ],
  pinnedPost: "xpo helps turn rough notes into x posts and replies without losing your actual voice.",
  recentPostCount: 3,
  strongestPost: null,
};

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
    profileReplyContext: baseProfileReplyContext,
    activeConstraints: ["no emojis"],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.includes("Lately you've been posting about:"), true);
  assert.equal(reply?.includes("- Retrieval quality and proof-first writing"), true);
  assert.equal(reply?.toLowerCase().includes("synced profile"), false);
  assert.equal(reply?.includes("- **Bottom line:**"), false);
});

test("deterministic chat acknowledges synced x posts when available", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what posts do you have of me?",
    recentHistory: "",
    profileReplyContext: baseProfileReplyContext,
    activeConstraints: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.includes("I can see a few recent posts in the current sample."), true);
  assert.equal(reply?.includes("- \"generic ai copy usually comes from weak retrieval, not weak models.\""), true);
  assert.equal(reply?.toLowerCase().includes("attached x account"), false);
  assert.equal(reply?.toLowerCase().includes("paste"), false);
});

test("deterministic chat builds profile summaries from synced context", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "write a summary about my profile",
    recentHistory: "",
    profileReplyContext: {
      ...baseProfileReplyContext,
      strongestPost: {
        timeframe: "recent",
        text: "generic ai copy usually comes from weak retrieval, not weak models.",
        createdAt: "2026-03-10T00:00:00.000Z",
        engagementTotal: 4200,
        metrics: {
          likeCount: 3200,
          replyCount: 700,
          repostCount: 250,
          quoteCount: 50,
        },
        comparison: {
          basis: "baseline_average_engagement",
          referenceEngagementTotal: 1200,
          ratio: 3.5,
        },
        reasons: [
          "The opener gets to the point fast, which makes the post easy to process.",
        ],
        hookPattern: "statement_open",
        contentType: "multi_line",
      },
    },
    activeConstraints: [],
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("synced profile"), false);
  assert.equal(reply?.toLowerCase().includes("builder-focused x growth systems"), true);
  assert.equal(reply?.includes("Lately you've been posting about:"), true);
  assert.equal(reply?.toLowerCase().includes("recent posts in scope include"), false);
  assert.equal(reply?.toLowerCase().includes("paste a quick snapshot"), false);
  assert.equal(
    reply?.includes("I can also pull the strongest recent post I can see here and break down why it worked."),
    true,
  );
});

test("deterministic profile summaries admit when no synced profile exists", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "summarize my profile",
    recentHistory: "",
    userContextString: "",
    activeConstraints: [],
    topicAnchors: [],
  });

  assert.equal(
    reply,
    "i don't have your profile synced in this workspace yet. reconnect or rescrape it here, or paste a quick snapshot and i'll summarize it.",
  );
});

test("deterministic chat can break down the strongest recent post from grounded metrics", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what performed best recently?",
    recentHistory: "",
    profileReplyContext: {
      ...baseProfileReplyContext,
      strongestPost: {
        timeframe: "recent",
        text: "Engineers think OpenClaw is about speed. What it really bought us was leverage across the whole team.",
        createdAt: "2026-03-12T12:00:00.000Z",
        engagementTotal: 44000,
        metrics: {
          likeCount: 40000,
          replyCount: 2600,
          repostCount: 1200,
          quoteCount: 200,
        },
        comparison: {
          basis: "previous_best_7d",
          referenceEngagementTotal: 4400,
          ratio: 10,
        },
        reasons: [
          "The hook makes a clear point of view early, which tends to pull people into the replies.",
          "It pulled a healthy number of replies too, which usually means the topic landed as a conversation starter.",
        ],
        hookPattern: "hot_take_open",
        contentType: "multi_line",
      },
    },
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.includes("Your strongest recent post I can see here was about"), true);
  assert.equal(reply?.includes("**40,000** likes"), true);
  assert.equal(reply?.includes("**10x**"), true);
  assert.equal(reply?.includes("- "), true);
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
