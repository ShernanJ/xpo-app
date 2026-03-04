import test from "node:test";
import assert from "node:assert/strict";

import { applyFinalDraftPolicy } from "./finalDraftPolicy.ts";

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
