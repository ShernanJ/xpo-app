import test from "node:test";
import assert from "node:assert/strict";

import { getDeterministicChatReply } from "./chatResponderDeterministic.ts";

test("chat responder keeps greeting turns conversational", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "hi how are you",
    recentHistory: "",
  });

  assert.equal(reply, "doing good. you?");
});

test("chat responder offers generic help after a small-talk reply", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "vibing",
    recentHistory: "assistant: hey hey, doing good. you?",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("love that"), false);
  assert.equal(reply?.toLowerCase().includes("what to post"), true);
  assert.equal(reply?.toLowerCase().includes("draft something"), true);
  assert.equal(reply?.toLowerCase().includes("pain point"), false);
  assert.equal(reply?.includes("?"), false);
});

test("chat responder answers meta assistant questions directly", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "how do i make u sound more human",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("contractions"), true);
  assert.equal(reply?.toLowerCase().includes("strategy too early"), true);
  assert.equal(reply?.toLowerCase().includes("tweak the angle"), false);
});

test("chat responder resets awkward discovery turns back to a generic help offer", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "wow super random",
    recentHistory: "assistant: what's the biggest pain point your app solves for toronto growth pros?",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("fair lol"), false);
  assert.equal(reply?.toLowerCase().includes("what to post"), true);
  assert.equal(reply?.toLowerCase().includes("pain point"), false);
  assert.equal(reply?.includes("?"), false);
});

test("chat responder answers capability questions with the product role", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what can you do",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("draft in your voice"), true);
  assert.equal(reply?.toLowerCase().includes("growth feedback"), true);
  assert.equal(reply?.toLowerCase().includes("what to post on x"), true);
  assert.equal(reply?.includes("?"), false);
});

test("chat responder answers broad x growth asks with a concrete starting point", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "help me grow on x",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("what to post on x"), true);
  assert.equal(reply?.toLowerCase().includes("rough idea"), true);
  assert.equal(reply?.includes("?"), false);
});

test("chat responder keeps self-knowledge answers grounded", async () => {
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

test("chat responder refuses to invent best-post analytics", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what is my best post",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("can't see your actual top posts"), true);
  assert.equal(reply?.toLowerCase().includes("paste a few posts"), true);
  assert.equal(reply?.toLowerCase().includes("day 28"), false);
});

test("chat responder gives general image advice without inventing product specifics", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "should i use images in my post?",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("adds proof"), true);
  assert.equal(reply?.toLowerCase().includes("hashtag"), false);
  assert.equal(reply?.toLowerCase().includes("app ui"), false);
});

test("chat responder explains the last planner failure instead of inventing a new reason", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "why did it fail",
    recentHistory:
      "assistant: Failed to generate strategy plan because the planner returned invalid JSON.",
  });

  assert.equal(reply, "it failed because the planner returned invalid json.");
});

test("chat responder asks for the actual draft on missing-draft improvement requests", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "help me improve this draft",
    recentHistory: "",
  });

  assert.equal(reply, "paste the draft you want me to improve and i'll tighten it up.");
});

test("chat responder makes diagnostic replies more user-specific when context exists", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "why am i not getting views",
    recentHistory:
      "assistant: lost to stan? use that sting. show how that loss sparked your app. turn the defeat into a case study for grow on.",
    userContextString: [
      "User Profile Summary:",
      "- Stage: 1k-10k",
      "- Primary Goal: follower growth",
      "- Known Facts: built grow on after losing to stan in league",
    ].join("\n"),
    diagnosticContext: {
      stage: "1k-10k",
      knownFor: "product lessons",
      reasons: [
        "your positioning is still blurry across the bio and recent posts",
        "recent posts are not repeating the same pillar enough",
      ],
      nextActions: [
        "tighten the bio around one promise",
        "publish three posts from the same pillar this week",
      ],
      recommendedPlaybooks: [
        {
          id: "weekly-series",
          name: "Weekly series",
          whyFit: "this gives the account a more repeatable format.",
        },
      ],
    },
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("for you specifically"), true);
  assert.equal(reply?.toLowerCase().includes("product lessons"), true);
  assert.equal(reply?.toLowerCase().includes("lived example"), true);
});

test("chat responder transcript flow stays generic after small talk", async () => {
  const openingReply = await getDeterministicChatReply({
    userMessage: "hi how are you",
    recentHistory: "",
  });
  const smallTalkReply = await getDeterministicChatReply({
    userMessage: "vibing",
    recentHistory: `assistant: ${openingReply}`,
  });

  assert.equal(openingReply, "doing good. you?");
  assert.equal(typeof smallTalkReply, "string");
  assert.equal(smallTalkReply?.toLowerCase().includes("what's the biggest pain point"), false);
  assert.equal(smallTalkReply?.toLowerCase().includes("toronto growth pros"), false);
  assert.equal(smallTalkReply?.toLowerCase().includes("what to post"), true);
  assert.equal(smallTalkReply?.toLowerCase().includes("draft something"), true);
});
