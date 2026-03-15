import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_USER_PREFERENCES,
  buildPreferenceConstraintsFromPreferences,
  mergeUserPreferences,
} from "./preferenceConstraints.ts";

test("mergeUserPreferences preserves stored values when overrides are partial", () => {
  const merged = mergeUserPreferences(
    {
      casing: "lowercase",
      bulletStyle: "angle",
      emojiUsage: "off",
      profanity: "off",
      blacklist: ["foo"],
      writingGoal: "voice_first",
      verifiedMaxChars: 5000,
    },
    {
      writingGoal: "growth_first",
    },
  );

  assert.equal(merged.casing, "lowercase");
  assert.equal(merged.bulletStyle, "angle");
  assert.equal(merged.emojiUsage, "off");
  assert.equal(merged.profanity, "off");
  assert.deepEqual(merged.blacklist, ["foo"]);
  assert.equal(merged.writingGoal, "growth_first");
  assert.equal(merged.verifiedMaxChars, 5000);
});

test("mergeUserPreferences allows explicit reset of verifiedMaxChars and blacklist", () => {
  const merged = mergeUserPreferences(
    {
      ...DEFAULT_USER_PREFERENCES,
      blacklist: ["foo", "bar"],
      verifiedMaxChars: 9000,
    },
    {
      blacklist: [],
      verifiedMaxChars: null,
    },
  );

  assert.deepEqual(merged.blacklist, []);
  assert.equal(merged.verifiedMaxChars, null);
});

test("buildPreferenceConstraintsFromPreferences reflects merged preference goal and cap", () => {
  const merged = mergeUserPreferences(
    {
      writingGoal: "voice_first",
      verifiedMaxChars: 8000,
    },
    {
      writingGoal: "growth_first",
    },
  );

  const constraints = buildPreferenceConstraintsFromPreferences(merged, {
    isVerifiedAccount: true,
  });

  assert.ok(
    constraints.includes("Optimize for growth while staying recognizably in my voice."),
  );
  assert.ok(
    constraints.includes("Prefer staying under 8,000 characters unless the user explicitly asks for longer."),
  );
});
