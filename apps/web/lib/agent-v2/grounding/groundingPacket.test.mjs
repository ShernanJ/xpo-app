import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroundingPacket,
  deriveTurnScopedGrounding,
  hasAutobiographicalGrounding,
} from "./groundingPacket.ts";

test("current-turn autobiographical grounding unlocks first-person story support immediately", () => {
  const sourceText = "I spent 1 month trying to get a job at Stan.";
  const packet = buildGroundingPacket({
    styleCard: null,
    activeConstraints: [],
    extractedFacts: [],
    turnScopedGrounding: deriveTurnScopedGrounding(sourceText),
  });

  assert.equal(hasAutobiographicalGrounding(packet), true);
  assert.equal(
    packet.allowedFirstPersonClaims.includes(sourceText),
    true,
  );
});
