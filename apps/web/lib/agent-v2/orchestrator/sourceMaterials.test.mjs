import test from "node:test";
import assert from "node:assert/strict";

import {
  SourceMaterialAssetPatchSchema,
  mergeSourceMaterialsIntoGroundingPacket,
  normalizeSourceMaterialInput,
  normalizeSourceMaterialPatch,
  selectRelevantSourceMaterials,
} from "./sourceMaterials.ts";

test("source material normalization trims fields and dedupes tags", () => {
  const normalized = normalizeSourceMaterialInput({
    type: "story",
    title: "  Launch story  ",
    tags: ["Launch", " launch ", "Founder voice"],
    verified: true,
    claims: ["I launched Xpo in public", "I launched Xpo in public"],
    snippets: ["  customers kept asking for threads  "],
    doNotClaim: ["I hit 10k users", "I hit 10k users"],
  });

  assert.deepEqual(normalized.tags, ["launch", "founder voice"]);
  assert.deepEqual(normalized.claims, ["I launched Xpo in public"]);
  assert.deepEqual(normalized.snippets, ["customers kept asking for threads"]);
  assert.deepEqual(normalized.doNotClaim, ["I hit 10k users"]);
});

test("source material patch schema requires at least one field", () => {
  const parsed = SourceMaterialAssetPatchSchema.safeParse({});
  assert.equal(parsed.success, false);
});

test("source material patch normalization preserves partial updates", () => {
  const normalized = normalizeSourceMaterialPatch({
    tags: [" Product ", "product"],
    verified: false,
  });

  assert.deepEqual(normalized, {
    tags: ["product"],
    verified: false,
  });
});

test("source material retrieval only selects verified relevant assets", () => {
  const selected = selectRelevantSourceMaterials({
    userMessage: "write a post about the xpo launch story and public rollout",
    topicSummary: null,
    assets: [
      {
        id: "asset_1",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Xpo launch story",
        tags: ["launch", "xpo"],
        verified: true,
        claims: ["I launched Xpo in public"],
        snippets: ["We kept the rollout small at first."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "asset_2",
        userId: "user_1",
        xHandle: "stan",
        type: "case_study",
        title: "Unverified launch brag",
        tags: ["launch"],
        verified: false,
        claims: ["I hit 50k users in a week"],
        snippets: ["Huge growth spike."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date("2026-03-02T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-02T00:00:00.000Z").toISOString(),
      },
      {
        id: "asset_3",
        userId: "user_1",
        xHandle: "stan",
        type: "framework",
        title: "Thread framework",
        tags: ["thread", "framework"],
        verified: true,
        claims: ["Use a problem -> tension -> payoff structure for product threads"],
        snippets: ["Lead with tension, then payoff."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date("2026-03-03T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-03T00:00:00.000Z").toISOString(),
      },
    ],
  });

  assert.deepEqual(
    selected.map((asset) => asset.id),
    ["asset_1", "asset_3"],
  );
});

test("source material retrieval adds verified claims to the grounding packet", () => {
  const packet = mergeSourceMaterialsIntoGroundingPacket({
    groundingPacket: {
      durableFacts: ["User is building Xpo"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: [],
      unknowns: [],
      sourceMaterials: [],
    },
    sourceMaterials: [
      {
        id: "asset_1",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Launch story",
        tags: ["launch"],
        verified: true,
        claims: ["I launched Xpo in public", "We kept the first rollout small"],
        snippets: ["Start with the rollout constraint."],
        doNotClaim: ["Do not claim I had 50k users"],
        lastUsedAt: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
      },
    ],
  });

  assert.equal(packet.durableFacts.includes("I launched Xpo in public"), true);
  assert.equal(packet.allowedFirstPersonClaims.includes("I launched Xpo in public"), true);
  assert.equal(packet.forbiddenClaims.includes("Do not claim I had 50k users"), true);
  assert.equal(packet.sourceMaterials[0]?.title, "Launch story");
});
