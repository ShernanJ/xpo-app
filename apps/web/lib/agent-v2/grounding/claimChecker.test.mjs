import test from "node:test";
import assert from "node:assert/strict";

import { checkDraftClaimsAgainstGrounding } from "./claimChecker.ts";

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
