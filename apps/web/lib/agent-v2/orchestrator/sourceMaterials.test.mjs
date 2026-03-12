import test from "node:test";
import assert from "node:assert/strict";

import {
  SourceMaterialAssetPatchSchema,
  buildPromotedDraftSourceMaterialInputs,
  buildSeedSourceMaterialInputs,
  extractAutoSourceMaterialInputs,
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

test("seed builder imports onboarding anchors and grounded draft sources without duplicates", () => {
  const seeds = buildSeedSourceMaterialInputs({
    examples: {
      bestPerforming: [
        {
          id: "post_1",
          lane: "original",
          text: "I turned our onboarding from a tour into one clear action.\nActivation jumped because setup stopped fighting the user.",
          createdAt: "2026-03-01T00:00:00.000Z",
          engagementTotal: 120,
          deltaVsBaselinePercent: 42,
          goalFitScore: 88,
          contentType: "insight",
          hookPattern: "bold_statement",
          features: {
            characterCount: 120,
            lineCount: 2,
            wordCount: 20,
            hashtagCount: 0,
            mentionCount: 0,
            urlCount: 0,
            mediaCount: 0,
            emojiCount: 0,
            questionMarkCount: 0,
            exclamationCount: 0,
            bulletLineCount: 0,
            hasNumberedList: false,
            uppercaseWordCount: 0,
            lowercaseStart: false,
            avgWordLength: 4.5,
            sentenceCount: 2,
            ctaType: "none",
            readabilityBand: "standard",
            tense: "present",
            sentimentBand: "neutral",
            isReply: false,
            entityCandidates: ["onboarding", "activation"],
          },
          selectionReason: "Strong product lesson",
        },
      ],
      voiceAnchors: [
        {
          id: "post_2",
          lane: "original",
          text: "Hiring playbook:\nPublish the work. Ask for a demo. Skip resume theater.",
          createdAt: "2026-03-02T00:00:00.000Z",
          engagementTotal: 75,
          deltaVsBaselinePercent: 20,
          goalFitScore: 81,
          contentType: "framework",
          hookPattern: "label_then_payoff",
          features: {
            characterCount: 85,
            lineCount: 3,
            wordCount: 13,
            hashtagCount: 0,
            mentionCount: 0,
            urlCount: 0,
            mediaCount: 0,
            emojiCount: 0,
            questionMarkCount: 0,
            exclamationCount: 0,
            bulletLineCount: 0,
            hasNumberedList: false,
            uppercaseWordCount: 0,
            lowercaseStart: false,
            avgWordLength: 4.8,
            sentenceCount: 3,
            ctaType: "none",
            readabilityBand: "standard",
            tense: "present",
            sentimentBand: "neutral",
            isReply: false,
            entityCandidates: ["hiring", "demo"],
          },
          selectionReason: "Clear repeated operating belief",
        },
      ],
    },
    draftCandidates: [
      {
        title: "Onboarding thread",
        sourcePlaybook: "thread_playbook",
        artifact: {
          groundingSources: [
            {
              type: "story",
              title: "Launch story",
              claims: ["I launched Xpo in public"],
              snippets: ["We kept the rollout small at first."],
            },
            {
              type: "story",
              title: "Launch story",
              claims: ["I launched Xpo in public"],
              snippets: ["We kept the rollout small at first."],
            },
          ],
        },
      },
    ],
  });

  assert.equal(seeds.length, 3);
  assert.equal(seeds[0]?.verified, true);
  assert.equal(seeds.some((asset) => asset.title === "Launch story"), true);
  assert.equal(
    seeds.some((asset) => asset.type === "playbook" || asset.type === "framework"),
    true,
  );
});

test("auto source extractor captures explicit framework messages from chat", () => {
  const extracted = extractAutoSourceMaterialInputs({
    userMessage:
      "Hiring playbook:\nPublish the work.\nAsk for a demo.\nSkip resume theater.",
    recentHistory: "user: Hiring playbook...",
    extractedFacts: null,
  });

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]?.type, "playbook");
  assert.equal(extracted[0]?.verified, true);
  assert.equal(extracted[0]?.claims.includes("Publish the work."), true);
});

test("auto source extractor captures short concrete answers after assistant questions", () => {
  const extracted = extractAutoSourceMaterialInputs({
    userMessage: "we cut the tour and activation went up.",
    recentHistory: "assistant: what changed when you fixed onboarding?",
    extractedFacts: null,
  });

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]?.type, "story");
  assert.equal(extracted[0]?.claims.includes("we cut the tour and activation went up."), true);
});

test("auto source extractor infers unlabeled operating lists as playbooks", () => {
  const extracted = extractAutoSourceMaterialInputs({
    userMessage: "Publish the work.\nAsk for a demo.\nSkip resume theater.",
    recentHistory: "",
    extractedFacts: null,
  });

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]?.type, "playbook");
  assert.equal(extracted[0]?.claims.includes("Publish the work."), true);
});

test("auto source extractor ignores draft commands", () => {
  const extracted = extractAutoSourceMaterialInputs({
    userMessage: "write me a post about onboarding",
    recentHistory: "",
    extractedFacts: ["User is building Xpo"],
  });

  assert.deepEqual(extracted, []);
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

test("approved draft promotion builds verified source assets from grounding sources", () => {
  const promoted = buildPromotedDraftSourceMaterialInputs({
    title: "Draft",
    content:
      "we cut the onboarding tour and more people finished setup.\n\nthat changed how i think about default product education.",
    groundingSources: [
      {
        type: "story",
        title: "Onboarding lesson",
        claims: ["We cut the onboarding tour and more people finished setup."],
        snippets: ["Shorter onboarding increased completion."],
      },
    ],
  });

  assert.equal(promoted.length, 1);
  assert.equal(promoted[0]?.verified, true);
  assert.equal(promoted[0]?.title, "Onboarding lesson");
  assert.equal(promoted[0]?.tags.includes("approved_draft"), true);
  assert.equal(promoted[0]?.tags.includes("accepted_output"), true);
  assert.equal(
    promoted[0]?.snippets.some((entry) => /default product education/i.test(entry)),
    true,
  );
});

test("approved draft promotion skips when there are no grounding sources", () => {
  const promoted = buildPromotedDraftSourceMaterialInputs({
    title: "Draft",
    content: "generic approved draft with no grounding",
    groundingSources: [],
  });

  assert.deepEqual(promoted, []);
});
