import test from "node:test";
import assert from "node:assert/strict";

import { validateDraft } from "./draftValidator.ts";

const exemplarText = [
  "I’m planning to be more intentional on Twitter in 2026, so here’s who I am and what I do:",
  "I’m Vitalii, founder of Stan.",
  "- Built a $30M/y profitable company with a small team",
  "- 10 engineers power a platform used by 60k creators",
  "- Hit $10M ARR in 2.5 years (less than 1% did this)",
].join(" ");

const evidenceMetrics = [
  "Built a $30M/y profitable company with a small team",
  "10 engineers power a platform used by 60k creators",
  "Hit $10M ARR in 2.5 years (less than 1% did this)",
];

function buildValidDraft() {
  return [
    "THESIS:",
    "small teams win when the operating system is tighter than the org chart.",
    "the advantage is not headcount. it's clarity under pressure.",
    "",
    "PROOF:",
    "- a small team doing $30M/y proves tight standards can outproduce more layers.",
    "- a 10-person engineering group supporting 60k creators shows leverage scales cleanly.",
    "- crossing $10M in ARR within 30 months shows disciplined execution compounds fast.",
    "",
    "MECHANISM:",
    "1) keep the team small enough that every strong hire changes output immediately.",
    "2) define a few metrics you can defend weekly instead of chasing vanity graphs.",
    "3) raise the talent bar until execution quality stays high without extra layers.",
    "",
    "CTA:",
    "small teams do not need more motion. they need better constraints.",
    "i'll keep posting the operating rules that make lean teams compound.",
    "Follow — I'm posting operator lessons for the next 14 days.",
  ].join("\n");
}

function validateLongForm(draft, overrides = {}) {
  return validateDraft({
    draft,
    mode: "long_form_post",
    exemplarText,
    evidenceMetrics,
    metricTarget: { min: 3, max: 5 },
    ...overrides,
  });
}

test("passes a known-good long_form_post", () => {
  const result = validateLongForm(buildValidDraft());

  assert.equal(result.pass, true);
  assert.deepEqual(result.errors, []);
});

test("fails missing labels with E_SECTION_COUNT", () => {
  const result = validateLongForm(
    buildValidDraft().replace("THESIS:", "INTRO:"),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_SECTION_COUNT"));
});

test("fails spacing with E_SPACING", () => {
  const result = validateLongForm(
    buildValidDraft().replace("\n\nPROOF:", "\n\n\nPROOF:"),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_SPACING"));
});

test("fails proof bullet count with E_PROOF_BULLETS", () => {
  const result = validateLongForm(
    buildValidDraft().replace(
      "\n- crossing $10M in ARR within 30 months shows disciplined execution compounds fast.",
      "",
    ),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_PROOF_BULLETS"));
});

test("fails mechanism step count with E_MECHANISM_STEPS", () => {
  const result = validateLongForm(
    buildValidDraft().replace(
      "\n3) raise the talent bar until execution quality stays high without extra layers.",
      "",
    ),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_MECHANISM_STEPS"));
});

test("fails ngram overlap with E_NGRAM_OVERLAP_5", () => {
  const overlapping = buildValidDraft().replace(
    "the advantage is not headcount. it's clarity under pressure.",
    "i’m planning to be more intentional on twitter in 2026.",
  );
  const result = validateLongForm(overlapping);

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_NGRAM_OVERLAP_5"));
});

test("fails banned opener hit with E_BANNED_OPENER", () => {
  const result = validateLongForm(
    buildValidDraft().replace(
      "small teams win when the operating system is tighter than the org chart.",
      "hot take: small teams win when the operating system is tighter than the org chart.",
    ),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_BANNED_OPENER"));
});

test("fails CTA mismatch with E_INVALID_CTA", () => {
  const invalidCta = buildValidDraft().replace(
    "Follow — I'm posting operator lessons for the next 14 days.",
    "Reply \"PLAYBOOK\" and I'll send the breakdown.",
  );
  const result = validateLongForm(invalidCta, { ctaMode: "B" });

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_INVALID_CTA"));
});

test("fails thesis question mark with E_THESIS_QUESTION", () => {
  const result = validateLongForm(
    buildValidDraft().replace(
      "the advantage is not headcount. it's clarity under pressure.",
      "is the advantage really headcount?",
    ),
  );

  assert.equal(result.pass, false);
  assert.ok(result.errors.includes("E_THESIS_QUESTION"));
});
