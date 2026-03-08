import test from "node:test";
import assert from "node:assert/strict";

import {
  assessConcreteSceneDrift,
  buildConcreteSceneDraftBlock,
  extractConcreteSceneAnchors,
  isConcreteAnecdoteDraftRequest,
} from "./draftGrounding.ts";

test("concrete scene detector catches literal anecdote draft requests", () => {
  assert.equal(
    isConcreteAnecdoteDraftRequest(
      "can you write me a post on playing league at the stan office against the ceo and losing hard",
    ),
    true,
  );
});

test("concrete scene anchors capture the main transcript details", () => {
  const anchors = extractConcreteSceneAnchors(
    "can you write me a post on playing league at the stan office against the ceo and losing hard",
  );

  assert.deepEqual(anchors, ["stan office", "league", "ceo", "playing", "against"]);
});

test("grounding assessment flags unsupported growth-mechanic drift", () => {
  const result = assessConcreteSceneDrift({
    sourceUserMessage:
      "can you write me a post on playing league at the stan office against the ceo and losing hard",
    draft:
      "lost a league game with the ceo at the office. use real-time hashtag data instead of guessing.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Concrete scene drift: introduced a growth or product mechanic that was not in the user's prompt.",
  );
  assert.equal(result.unexpectedShiftTerms.includes("hashtag"), true);
  assert.equal(result.unexpectedShiftTerms.includes("data"), true);
});

test("grounding assessment allows a literal anecdote that stays anchored", () => {
  const result = assessConcreteSceneDrift({
    sourceUserMessage:
      "can you write me a post on playing league at the stan office against the ceo and losing hard",
    draft:
      "played league at the stan office against the ceo and got smoked. brutal, but funny in hindsight.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, false);
});

test("grounding assessment still protects follow-up turns that only carry the scene summary", () => {
  const result = assessConcreteSceneDrift({
    sourceUserMessage: "playing league at the stan office against the ceo and losing hard",
    draft:
      "lost a league game with the ceo at the office. use real-time hashtag data instead of guessing.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
});

test("grounding assessment does not reject explicit growth framing the user asked for", () => {
  const result = assessConcreteSceneDrift({
    sourceUserMessage:
      "write me a post about losing a league game against the ceo at the stan office and what it taught me about x growth",
    draft:
      "lost a league game against the ceo at the stan office. same lesson on x: overthinking the move is slower than reading the room.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, false);
});

test("concrete scene draft block tells the writer not to force a growth lesson", () => {
  const block = buildConcreteSceneDraftBlock(
    "can you write me a post on playing league at the stan office against the ceo and losing hard",
  );

  assert.equal(block?.includes("Do NOT inject a growth lesson"), true);
  assert.equal(block?.includes("stan office"), true);
  assert.equal(block?.includes("league"), true);
});
