import test from "node:test";
import assert from "node:assert/strict";

import { buildProfileConversionAudit } from "./profileConversionAudit.ts";

test("profile conversion audit flags broad bios and low coherence", () => {
  const audit = buildProfileConversionAudit({
    onboarding: {
      profile: {
        bio: "builder sharing thoughts on startups and tech",
      },
      recentPosts: [
        { text: "random career thought" },
        { text: "another broad hot take" },
        { text: "weekend note" },
      ],
    } as never,
    context: {
      growthStrategySnapshot: {
        knownFor: "software and product through reply leverage",
        targetAudience: "builders who want clearer positioning",
        contentPillars: ["reply leverage", "product positioning", "growth loops"],
      },
    } as never,
  });

  assert.equal(audit.score < 60, true);
  assert.equal(
    audit.gaps.some((entry) => entry.toLowerCase().includes("bio")),
    true,
  );
  assert.equal(
    audit.unknowns.some((entry) => entry.toLowerCase().includes("pinned-post")),
    true,
  );
});

test("profile conversion audit rewards aligned bios and recent posts", () => {
  const audit = buildProfileConversionAudit({
    onboarding: {
      profile: {
        bio: "Helping product builders use reply leverage to grow on X.",
      },
      recentPosts: [
        { text: "reply leverage is the fastest way to earn profile clicks early" },
        { text: "product positioning gets easier when the niche is obvious" },
        { text: "growth loops start with repeatable reply systems" },
      ],
    } as never,
    context: {
      growthStrategySnapshot: {
        knownFor: "product builders through reply leverage",
        targetAudience: "product builders",
        contentPillars: ["reply leverage", "product positioning", "growth loops"],
      },
    } as never,
  });

  assert.equal(audit.score >= 70, true);
  assert.equal(audit.strengths.length > 0, true);
  assert.equal(audit.recentPostCoherenceNotes.length > 0, true);
});
