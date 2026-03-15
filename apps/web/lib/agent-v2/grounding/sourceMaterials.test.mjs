import test from "node:test";
import assert from "node:assert/strict";

import {
  SourceMaterialAssetPatchSchema,
  filterNewSourceMaterialInputs,
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
    ["asset_1"],
  );
});

test("source material retrieval prefers recent approved assets over older seeded matches", () => {
  const now = Date.now();
  const selected = selectRelevantSourceMaterials({
    userMessage: "write a post about the xpo launch rollout and what changed after shipping",
    topicSummary: null,
    assets: [
      {
        id: "asset_old_seed",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Xpo launch story",
        tags: ["launch", "xpo", "story"],
        verified: true,
        claims: ["I launched Xpo in public and kept the rollout narrow."],
        snippets: ["We started with a small rollout."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date(now - 190 * 86_400_000).toISOString(),
        updatedAt: new Date(now - 190 * 86_400_000).toISOString(),
      },
      {
        id: "asset_recent_approved",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Xpo rollout lesson",
        tags: ["launch", "xpo", "approved_draft", "accepted_output"],
        verified: true,
        claims: ["After shipping Xpo, we kept the first rollout intentionally small."],
        snippets: ["That rollout constraint changed how I think about launches."],
        doNotClaim: [],
        lastUsedAt: new Date(now - 2 * 86_400_000).toISOString(),
        createdAt: new Date(now - 10 * 86_400_000).toISOString(),
        updatedAt: new Date(now - 2 * 86_400_000).toISOString(),
      },
    ],
  });

  assert.equal(selected[0]?.id, "asset_recent_approved");
});

test("source material retrieval falls back to recent approved context for vague multi-post requests", () => {
  const now = Date.now();
  const selected = selectRelevantSourceMaterials({
    userMessage: "generate me multiple posts i can use",
    topicSummary: null,
    assets: [
      {
        id: "asset_old",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Old launch note",
        tags: ["launch"],
        verified: true,
        claims: ["I launched Xpo in public."],
        snippets: ["We kept the rollout narrow."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date(now - 220 * 86_400_000).toISOString(),
        updatedAt: new Date(now - 220 * 86_400_000).toISOString(),
      },
      {
        id: "asset_recent",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Approved rollout lesson",
        tags: ["approved_draft", "accepted_output"],
        verified: true,
        claims: ["After shipping Xpo, we kept the first rollout intentionally small."],
        snippets: ["That rollout constraint changed how I think about launches."],
        doNotClaim: [],
        lastUsedAt: new Date(now - 2 * 86_400_000).toISOString(),
        createdAt: new Date(now - 10 * 86_400_000).toISOString(),
        updatedAt: new Date(now - 2 * 86_400_000).toISOString(),
      },
    ],
  });

  assert.equal(selected[0]?.id, "asset_recent");
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

test("source material merge strips claims that conflict with newer forbidden grounding", () => {
  const packet = mergeSourceMaterialsIntoGroundingPacket({
    groundingPacket: {
      durableFacts: ["xpo doesn't generate hashtags automatically"],
      turnGrounding: [],
      allowedFirstPersonClaims: [],
      allowedNumbers: [],
      forbiddenClaims: ["Do not claim xpo generates hashtags automatically."],
      unknowns: [],
      sourceMaterials: [],
    },
    sourceMaterials: [
      {
        id: "asset_conflict",
        userId: "user_1",
        xHandle: "stan",
        type: "story",
        title: "Old hashtag workflow",
        tags: ["hashtags"],
        verified: true,
        claims: ["xpo generates hashtags automatically"],
        snippets: ["We generate hashtags automatically for every post."],
        doNotClaim: [],
        lastUsedAt: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
      },
    ],
  });

  assert.equal(packet.durableFacts.includes("xpo generates hashtags automatically"), false);
  assert.equal(packet.sourceMaterials.length, 0);
});


test("filterNewSourceMaterialInputs removes duplicates against existing assets", () => {
  const filtered = filterNewSourceMaterialInputs({
    existing: [
      {
        type: "story",
        title: "Launch story",
        claims: ["I launched Xpo in public"],
        snippets: ["We kept the rollout small."],
      },
    ],
    incoming: [
      {
        type: "story",
        title: "Launch story",
        tags: ["launch"],
        verified: true,
        claims: ["I launched Xpo in public"],
        snippets: ["We kept the rollout small."],
        doNotClaim: [],
      },
      {
        type: "framework",
        title: "Onboarding framework",
        tags: ["onboarding"],
        verified: true,
        claims: ["Reduce setup friction first."],
        snippets: ["Start with one clear action."],
        doNotClaim: [],
      },
    ],
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.title, "Onboarding framework");
});
