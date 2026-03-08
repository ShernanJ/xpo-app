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
  assert.equal(reply?.toLowerCase().includes("post ideas"), true);
  assert.equal(reply?.toLowerCase().includes("draft something"), true);
  assert.equal(reply?.toLowerCase().includes("pain point"), false);
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
  assert.equal(reply?.toLowerCase().includes("post ideas"), true);
  assert.equal(reply?.toLowerCase().includes("pain point"), false);
});

test("chat responder answers capability questions with the product role", async () => {
  const reply = await getDeterministicChatReply({
    userMessage: "what can you do",
    recentHistory: "",
  });

  assert.equal(typeof reply, "string");
  assert.equal(reply?.toLowerCase().includes("draft in your voice"), true);
  assert.equal(reply?.toLowerCase().includes("growth feedback"), true);
  assert.equal(reply?.toLowerCase().includes("overthink it"), true);
});
