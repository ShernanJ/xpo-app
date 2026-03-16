import test from "node:test";
import assert from "node:assert/strict";

import {
  extractEntityCandidates,
  isLowSignalEntityCandidate,
} from "./postAnalysis.ts";

test("low-signal verb tokens do not survive as entity candidates", () => {
  assert.equal(isLowSignalEntityCandidate("built"), true);
  assert.equal(isLowSignalEntityCandidate("than"), true);

  const candidates = extractEntityCandidates(
    "Built a $30M company with a small team. Revenue matters more than vanity.",
  );

  assert.equal(candidates.includes("built"), false);
  assert.equal(candidates.includes("than"), false);
  assert.equal(candidates.includes("company"), true);
  assert.equal(candidates.includes("team"), true);
  assert.equal(candidates.includes("revenue"), true);
});

test("stopword-led and low-signal bigrams are filtered out", () => {
  const candidates = extractEntityCandidates(
    "Just wrote a guide on the hiring system that built my company.",
  );

  assert.equal(candidates.includes("hiring"), true);
  assert.equal(candidates.includes("hiring system"), true);
  assert.equal(candidates.includes("built my"), false);
  assert.equal(candidates.includes("that built"), false);
});

test("number-led metric phrases do not become profile topics", () => {
  const candidates = extractEntityCandidates(
    "Just wrote a 21-page full guide on the exact hiring system. $10M ARR could happen after growing a company with a strong team.",
  );

  assert.equal(candidates.includes("21"), false);
  assert.equal(candidates.includes("21 page"), false);
  assert.equal(candidates.includes("wrote 21 page"), false);
  assert.equal(candidates.includes("full guide"), false);
  assert.equal(candidates.includes("exact hiring"), false);
  assert.equal(candidates.includes("mrr could"), false);
  assert.equal(candidates.includes("10m"), false);
  assert.equal(candidates.includes("10m arr"), false);
  assert.equal(candidates.includes("hiring system"), true);
  assert.equal(candidates.includes("company"), true);
});

test("cta-ish and role-edge phrases are filtered out", () => {
  const candidates = extractEntityCandidates(
    "Reply talent below if you're hiring. Here who I think is great: Vitalii founder and operator.",
  );

  assert.equal(candidates.includes("reply talent"), false);
  assert.equal(candidates.includes("talent below"), false);
  assert.equal(candidates.includes("here who"), false);
  assert.equal(candidates.includes("vitalii founder"), false);
  assert.equal(candidates.includes("talent"), true);
  assert.equal(candidates.includes("operator"), true);
});
