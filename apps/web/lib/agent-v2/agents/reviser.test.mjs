import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reviserSource = readFileSync(
  fileURLToPath(new URL("./reviser.ts", import.meta.url)),
  "utf8",
);

test("deterministic phrase removals attach a synthesized coach note", () => {
  assert.equal(
    reviserSource.includes(
      'return "Cut the flagged phrase to remove clutter and keep the main point landing faster.";',
    ),
    true,
  );
  assert.equal(
    reviserSource.includes("coach_note: buildPhraseRemovalCoachNote()"),
    true,
  );
});

test("deterministic last-line removals attach a synthesized coach note", () => {
  assert.equal(
    reviserSource.includes(
      'return "Snipped the last line so the post ends on the stronger beat instead of trailing into a softer close.";',
    ),
    true,
  );
  assert.equal(
    reviserSource.includes("coach_note: buildLastLineRemovalCoachNote()"),
    true,
  );
});

test("deterministic emoji cleanup attaches a synthesized coach note", () => {
  assert.equal(
    reviserSource.includes(
      'return "Removed emojis to tighten the tone and keep the read cleaner.";',
    ),
    true,
  );
  assert.equal(
    reviserSource.includes("coach_note: buildEmojiCleanupCoachNote()"),
    true,
  );
});
