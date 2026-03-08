import test from "node:test";
import assert from "node:assert/strict";

import {
  assessGroundedProductDrift,
  buildGroundedProductRetryConstraint,
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

test("grounded product assessment flags invented first-person usage", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "i let xpo handle the mental load so i can write and grow faster on x.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft invented first-person product usage that the user never provided.",
  );
});

test("grounded product assessment flags implied first-person benefit phrasing", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "xpo lets me write faster on x, grow quicker, and stay mentally clear.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft invented first-person product usage that the user never provided.",
  );
});

test("grounded product assessment allows plain grounded product claims", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "xpo helps people write and grow faster on x without the mental load.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, false);
  assert.equal(buildGroundedProductRetryConstraint().includes("do not invent first-person"), true);
});

test("grounded product assessment flags invented adjacent mechanics", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "xpo wipes the mental load and handles timing, analytics, and the rest so you grow faster on x.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced adjacent product mechanics that were not in the user's grounding.",
  );
  assert.equal(buildGroundedProductRetryConstraint().includes("adjacent mechanics"), true);
});

test("grounded product assessment flags inflated market contrast when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "every growth tool promises speed. xpo helps people write and grow faster on x without the mental load.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced inflated market contrast that was not in the user's grounding.",
  );
  assert.equal(buildGroundedProductRetryConstraint().includes("inflated market contrast"), true);
});

test("grounded product assessment allows contrast when the user explicitly asked for comparison", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post comparing xpo vs other x growth tools. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "most tools add more mental load. xpo helps people write and grow faster on x without the mental load.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, false);
});

test("grounded product assessment flags promotional payoff language when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "xpo removes the mental load of drafting, letting you go straight to post-ready tweets. give it a try and see the speed for yourself.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced promotional payoff or CTA language that was not in the user's grounding.",
  );
  assert.equal(buildGroundedProductRetryConstraint().includes("CTA/payoff"), true);
});

test("grounded product assessment flags imperative promo phrasing when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "tired of mental overload? try xpo. it strips the process so you can write and grow faster on x. no extra steps, just results.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced promotional payoff or CTA language that was not in the user's grounding.",
  );
});

test("grounded product assessment flags invented pain-point setup when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "stopped overthinking tweets. xpo lifts the mental load, letting you write and grow faster on x.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced promotional payoff or CTA language that was not in the user's grounding.",
  );
});

test("grounded product assessment flags invented forced-feeling setup when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "posting on x feels forced by mental load. xpo lifts that, letting you write and grow faster.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced promotional payoff or CTA language that was not in the user's grounding.",
  );
});

test("grounded product assessment flags duplicate benefit paraphrase when the user gave plain facts", () => {
  const result = assessGroundedProductDrift({
    activeConstraints: [
      "Topic grounding: xpo: it helps people write and grow faster on x without the mental load",
    ],
    sourceUserMessage:
      "write a post about xpo. factual grounding: xpo: it helps people write and grow faster on x without the mental load",
    draft:
      "cut the mental load of writing on x with xpo. write and grow faster—no extra thinking required.",
  });

  assert.equal(result.shouldGuard, true);
  assert.equal(result.hasDrift, true);
  assert.equal(
    result.reason,
    "Grounded product drift: draft introduced promotional payoff or CTA language that was not in the user's grounding.",
  );
});
