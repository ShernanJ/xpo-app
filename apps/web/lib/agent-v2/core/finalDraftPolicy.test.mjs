import test from "node:test";
import assert from "node:assert/strict";

import { applyFinalDraftPolicy, applyFinalDraftPolicyWithReport } from "./finalDraftPolicy.ts";

test("strips unsupported markdown and weak phrase-only CTAs", () => {
  const result = applyFinalDraftPolicy({
    draft: '**the daily grind**\nreply "FOCUS" if you\'ll try it.',
    formatPreference: "shortform",
    isVerifiedAccount: false,
  });

  assert.equal(result.includes("**"), false);
  assert.equal(result.includes('"FOCUS"'), false);
  assert.equal(result.includes("if you try it, let me know how it goes."), true);
});

test("preserves incentivized CTAs", () => {
  const result = applyFinalDraftPolicy({
    draft: 'comment "FOCUS" and i\'ll send you the checklist.',
    formatPreference: "shortform",
    isVerifiedAccount: false,
  });

  assert.equal(result.includes('"FOCUS"'), true);
  assert.equal(result.includes("checklist"), true);
});

test("applies casing, bullet style, and blacklist preferences", () => {
  const result = applyFinalDraftPolicy({
    draft: "here we go\n- first item\n- second item\nthis grind gets real",
    formatPreference: "shortform",
    isVerifiedAccount: false,
    userPreferences: {
      casing: "uppercase",
      bulletStyle: "angle",
      blacklist: ["real"],
    },
  });

  assert.equal(result.includes("> FIRST ITEM"), true);
  assert.equal(result.includes("> SECOND ITEM"), true);
  assert.equal(result.includes("REAL"), false);
});

test("keeps verified accounts shortform by default unless longform is explicit", () => {
  const sourceDraft = "a".repeat(600);
  const shortformResult = applyFinalDraftPolicy({
    draft: sourceDraft,
    formatPreference: "shortform",
    isVerifiedAccount: true,
  });
  const longformResult = applyFinalDraftPolicy({
    draft: sourceDraft,
    formatPreference: "longform",
    isVerifiedAccount: true,
  });

  assert.equal(shortformResult.length < sourceDraft.length, true);
  assert.equal(longformResult.length, sourceDraft.length);
});

test("applies style-card lowercase normalization inside the final policy layer", () => {
  const result = applyFinalDraftPolicy({
    draft: "This Is A Test.",
    formatPreference: "shortform",
    isVerifiedAccount: false,
    styleCard: {
      sentenceOpenings: ["ship fast"],
      sentenceClosers: ["keep going"],
      pacing: "short, punchy",
      emojiPatterns: [],
      slangAndVocabulary: [],
      formattingRules: ["never uses capitalization"],
      customGuidelines: [],
      contextAnchors: [],
      antiExamples: [],
    },
  });

  assert.equal(result, "this is a test.");
});

test("returns adjustment metadata for downstream issue reporting", () => {
  const result = applyFinalDraftPolicyWithReport({
    draft: '**bold**\nreply "FOCUS" if you\'ll try it.',
    formatPreference: "shortform",
    isVerifiedAccount: false,
  });

  assert.equal(result.adjustments.markdownAdjusted, true);
  assert.equal(result.adjustments.engagementAdjusted, true);
});
