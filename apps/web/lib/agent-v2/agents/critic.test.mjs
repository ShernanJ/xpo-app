import test from "node:test";
import assert from "node:assert/strict";

import {
  repairAbruptEnding,
  stripThreadishLeadLabel,
  stripTrailingPromptEcho,
} from "./draftCompletion.ts";

test("repairAbruptEnding trims dangling conjunction fragments", () => {
  assert.equal(
    repairAbruptEnding(
      "the tool gives simple prompts, tracks tweet performance, and sugge",
    ),
    "the tool gives simple prompts, tracks tweet performance",
  );
});

test("repairAbruptEnding leaves complete sentences alone", () => {
  const draft = "the tool gives simple prompts, tracks tweet performance, and suggests the next move.";
  assert.equal(repairAbruptEnding(draft), draft);
});

test("repairAbruptEnding trims short broken clause tails", () => {
  assert.equal(
    repairAbruptEnding(
      "growth on x feels like a different beast each day - algorithms shift, noise r",
    ),
    "growth on x feels like a different beast each day - algorithms shift",
  );
});

test("repairAbruptEnding trims dangling multi-word tails that end in a broken final word", () => {
  assert.equal(
    repairAbruptEnding(
      [
        "the app, xpo, automates the tactics i've learned to boost visibility without relying on hashtags.",
        "my goal? show stan what i can do and earn a sp",
      ].join("\n"),
    ),
    [
      "the app, xpo, automates the tactics i've learned to boost visibility without relying on hashtags.",
      "my goal? show stan what i can do",
    ].join("\n"),
  );
});

test("stripThreadishLeadLabel removes thread-style prefixes from standalone posts", () => {
  assert.equal(
    stripThreadishLeadLabel(
      "thread: after a decade off x i added one habit that jump-started my growth",
    ),
    "after a decade off x i added one habit that jump-started my growth",
  );
  assert.equal(
    stripThreadishLeadLabel("post 1: here's the lesson"),
    "here's the lesson",
  );
});

test("repairAbruptEnding trims unfinished trailing question stubs", () => {
  assert.equal(
    repairAbruptEnding(
      [
        "i run a 30-minute idea dump every morning.",
        "the habit forces the weird stuff that later becomes ampm spam or a feature in xpo.",
        "now it's a repeatable growth loop.",
        "what habit gives you",
      ].join("\n"),
    ),
    [
      "i run a 30-minute idea dump every morning.",
      "the habit forces the weird stuff that later becomes ampm spam or a feature in xpo.",
      "now it's a repeatable growth loop.",
    ].join("\n"),
  );
});

test("stripTrailingPromptEcho removes unfinished selected-angle echoes from the draft tail", () => {
  assert.equal(
    stripTrailingPromptEcho(
      [
        "my friction? i spammed ampm nonstop, went from 0 to 100 followers in a couple days and became the ampm guy",
        "what's the toughest",
      ].join("\n"),
      "Turn the following angle into a draft: what's the toughest friction you hit when launching a growth tool on x?",
    ),
    "my friction? i spammed ampm nonstop, went from 0 to 100 followers in a couple days and became the ampm guy",
  );
});
