import test from "node:test";
import assert from "node:assert/strict";

import { checkDraftClaimsAgainstGrounding } from "./claimChecker.ts";
import { buildDraftRequestPolicy } from "./requestPolicy.ts";

function buildGroundingPacket() {
  return {
    durableFacts: [],
    turnGrounding: [],
    allowedFirstPersonClaims: [],
    allowedNumbers: [],
    forbiddenClaims: [],
    unknowns: [],
    sourceMaterials: [],
    factualAuthority: [],
    voiceContextHints: [],
  };
}

test("claim checker preserves keyword resource CTAs for downloadable assets", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: 'Comment "HIRING" to get access to my hiring playbook PDF.',
    groundingPacket: buildGroundingPacket(),
  });

  assert.equal(
    result.draft,
    'Comment "HIRING" to get access to my hiring playbook PDF.',
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.hasUnsupportedClaims, false);
});

test("claim checker still removes unsupported autobiographical claims outside resource CTAs", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "I built this system last week and it doubled conversions.",
    groundingPacket: buildGroundingPacket(),
  });

  assert.equal(result.draft, "");
  assert.equal(result.hasUnsupportedClaims, true);
});

test("claim checker preserves bracketed placeholders while stripping unsupported unbracketed metrics", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "I used [Tool] and grew 43% in 3 weeks.",
    groundingPacket: buildGroundingPacket(),
    requestPolicy: buildDraftRequestPolicy({
      userMessage: "write this as a story",
      formatIntent: "story",
    }),
  });

  assert.equal(result.draft, "I used [Tool].");
  assert.equal(result.hasUnsupportedClaims, true);
  assert.match(
    result.issues.join(" "),
    /preserving placeholders/i,
  );
});

test("claim checker only protects text strictly inside balanced brackets", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft: "I used [Tool and grew 43% in 3 weeks.",
    groundingPacket: buildGroundingPacket(),
    requestPolicy: buildDraftRequestPolicy({
      userMessage: "write this as a story",
      formatIntent: "story",
    }),
  });

  assert.equal(result.draft, "");
  assert.equal(result.hasUnsupportedClaims, true);
});

test("placeholder protection does not shield unsupported claims in a separate sentence", () => {
  const result = checkDraftClaimsAgainstGrounding({
    draft:
      "I used [Tool] on [Project]. It increased revenue by 43% in 3 weeks.",
    groundingPacket: buildGroundingPacket(),
    requestPolicy: buildDraftRequestPolicy({
      userMessage: "write this as a story",
      formatIntent: "story",
    }),
  });

  assert.equal(result.draft, "I used [Tool] on [Project].");
  assert.equal(result.hasUnsupportedClaims, true);
});

test("claim checker bypasses anti-fabrication stripping for jokes", () => {
  const draft = "My coffee has a better roadmap than most startups.";
  const result = checkDraftClaimsAgainstGrounding({
    draft,
    groundingPacket: buildGroundingPacket(),
    requestPolicy: buildDraftRequestPolicy({
      userMessage: "make it a joke",
      formatIntent: "joke",
    }),
  });

  assert.equal(result.draft, draft);
  assert.equal(result.hasUnsupportedClaims, false);
  assert.equal(result.issues.length, 0);
});
