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

test("soft-signal threads strip x/x numbering without forcing a canned opener", () => {
  const result = applyFinalDraftPolicy({
    draft: [
      "1/6 Momentum is a myth. I’m Vitalii, founder of Stan.\n• $30M ARR, profitable\n• 10 engineers, 60k creators",
      "2/6 We changed how we hired.",
    ].join("\n\n---\n\n"),
    formatPreference: "thread",
    isVerifiedAccount: true,
    threadFramingStyle: "soft_signal",
  });

  assert.equal(result.includes("1/6"), false);
  assert.equal(result.includes("2/6"), false);
  assert.equal(result.toLowerCase().startsWith("here's what happened:"), false);
  assert.equal(result.startsWith("Momentum is a myth."), true);
  assert.equal(result.includes("•"), false);
});

test("soft-signal threads preserve a natural opener when one already exists", () => {
  const result = applyFinalDraftPolicy({
    draft: [
      "The boardroom buzzed as the dashboard lit up with a sudden spike in sign-ups.",
      "Three days later the curve flattened.",
    ].join("\n\n---\n\n"),
    formatPreference: "thread",
    isVerifiedAccount: true,
    threadFramingStyle: "soft_signal",
  });

  assert.equal(
    result.startsWith("The boardroom buzzed as the dashboard lit up with a sudden spike in sign-ups."),
    true,
  );
  assert.equal(result.toLowerCase().includes("here's what happened:"), false);
});

test("soft-signal thread openers expand inline bullet stacks into cleaner paragraphs", () => {
  const result = applyFinalDraftPolicy({
    draft: [
      "I built a hiring playbook that flips the cold-apply script. • Publish a live hiring board so candidates see the work. • Require a short public demo instead of a resume.",
      "One of our best candidates found us through it.",
    ].join("\n\n---\n\n"),
    formatPreference: "thread",
    isVerifiedAccount: true,
    threadFramingStyle: "soft_signal",
  });

  assert.equal(result.includes("•"), false);
  assert.match(result, /script\.\n\nPublish a live hiring board/i);
  assert.match(result, /\n\nRequire a short public demo/i);
});

test("numbered threads preserve numbering markers", () => {
  const result = applyFinalDraftPolicy({
    draft: [
      "1/5 first post",
      "2/5 second post",
    ].join("\n\n---\n\n"),
    formatPreference: "thread",
    isVerifiedAccount: true,
    threadFramingStyle: "numbered",
  });

  assert.equal(result.includes("1/5"), true);
  assert.equal(result.includes("2/5"), true);
});
