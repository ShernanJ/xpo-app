import test from "node:test";
import assert from "node:assert/strict";

import { buildDynamicDraftChoices } from "./orchestrator/clarificationDraftChips.ts";
import { normalizeDraftRevisionInstruction } from "./orchestrator/draftRevision.ts";
import {
  looksLikeMechanicalEdit,
  looksLikeNegativeFeedback,
} from "./agents/antiPatternExtractor.ts";
import { buildRollingSummary, shouldRefreshRollingSummary } from "./memory/summaryManager.ts";
import {
  buildEffectiveContext,
  retrieveRelevantContext,
} from "./memory/contextRetriever.ts";

const baseStyleCard = {
  contextAnchors: [
    "building in public while shipping xpo",
    "turning linkedin posts into x posts",
  ],
  pacing: "fast, bullet-friendly, scan-friendly",
};

test("verified topic clarification returns topic-aware format chips", () => {
  const result = buildDynamicDraftChoices({
    mode: "topic_known",
    seedTopic: "internship hunt and taiv interview",
    styleCard: baseStyleCard,
    topicAnchors: ["internship hunt", "cold dms"],
    isVerifiedAccount: true,
  });

  assert.equal(result.length, 3);
  assert.equal(result[0].label, "Shortform on internship hunt");
  assert.equal(result[0].formatPreference, "shortform");
  assert.equal(result[1].label, "Longform on internship hunt");
  assert.equal(result[1].formatPreference, "longform");
  assert.equal(result[2].label, "Angle on internship hunt");
  assert.equal(result[2].explicitIntent, "ideate");
});

test("loose draft fallback keeps balanced safe choices when topic confidence is weak", () => {
  const result = buildDynamicDraftChoices({
    mode: "loose",
    seedTopic: "this",
    styleCard: {
      ...baseStyleCard,
      contextAnchors: ["this", "something", "my thing"],
    },
    topicAnchors: ["that", "anything"],
    isVerifiedAccount: false,
  });

  assert.deepEqual(
    result.map((reply) => reply.label),
    ["my usual lane", "something recent", "Pick an angle first"],
  );
  assert.equal(result[2].explicitIntent, "ideate");
});

test("draft revision normalizer keeps quoted phrase removals local", () => {
  const directive = normalizeDraftRevisionInstruction(
    'why does it say "see screenshot of my feed"',
    "my feed looks like a rave. (see screenshot of my feed)",
  );

  assert.equal(directive.changeKind, "local_phrase_edit");
  assert.equal(directive.targetText, "see screenshot of my feed");
  assert.match(directive.instruction, /remove or replace the phrase/i);
});

test("draft revision normalizer recognizes length trims", () => {
  const directive = normalizeDraftRevisionInstruction(
    "make it shorter",
    "a long draft that needs to be tightened",
  );

  assert.equal(directive.changeKind, "length_trim");
  assert.match(directive.instruction, /shorten the current draft/i);
});

test("anti-pattern helpers separate mechanical edits from tonal rejection", () => {
  assert.equal(looksLikeMechanicalEdit("remove commas and fix punctuation"), true);
  assert.equal(looksLikeNegativeFeedback("this sounds like linkedin"), true);
  assert.equal(looksLikeMechanicalEdit("this sounds like linkedin"), false);
});

test("rolling summary keeps longform preference and correction locks", () => {
  const summary = buildRollingSummary({
    currentSummary:
      "Current topic: xpo launch\nApproved angle: none yet\nFormat preference: shortform\nKnown facts: none recorded",
    topicSummary: "xpo launch",
    approvedPlan: {
      objective: "xpo launch",
      angle: "why building in public compounds faster",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "direct",
      pitchResponse: "test",
      formatPreference: "longform",
    },
    activeConstraints: [
      "Correction lock: taiv requested an interview",
      "keep all lowercase",
      "use > for bullets",
    ],
    latestDraftStatus: "draft ready",
    formatPreference: "longform",
  });

  assert.match(summary, /Format preference: longform/);
  assert.match(summary, /Known facts: taiv requested an interview/);
  assert.match(summary, /Preferences discovered: keep all lowercase \| use > for bullets/);
});

test("context retrieval prioritizes correction locks and builds fact-first context", () => {
  const relevant = retrieveRelevantContext({
    userMessage: "internship hunt",
    topicSummary: null,
    rollingSummary: null,
    topicAnchors: [
      "taiv requested an interview and now the internship hunt is real",
      "general internship grind with no specific interview context",
      "xpo build in public update",
    ],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.equal(relevant[0], "taiv requested an interview and now the internship hunt is real");

  const effectiveContext = buildEffectiveContext({
    recentHistory: "user: make it shorter\nassistant: here's a tighter version.",
    rollingSummary: "Current topic: internship hunt",
    relevantTopicAnchors: relevant,
    contextAnchors: ["taiv is a real interview checkpoint"],
    activeConstraints: ["Correction lock: taiv requested an interview"],
  });

  assert.match(effectiveContext, /FACTS YOU ALREADY KNOW:/);
  assert.match(effectiveContext, /taiv is a real interview checkpoint/);
  assert.match(effectiveContext, /taiv requested an interview/);
});

test("rolling summary refresh cadence stays stable", () => {
  assert.equal(shouldRefreshRollingSummary(0, false), false);
  assert.equal(shouldRefreshRollingSummary(3, false), true);
  assert.equal(shouldRefreshRollingSummary(4, false), false);
  assert.equal(shouldRefreshRollingSummary(1, true), true);
});
