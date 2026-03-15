import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPromotedDraftSourceMaterialInputs,
  buildSeedSourceMaterialInputs,
  extractAutoSourceMaterialInputs,
} from "./sourceMaterialSeeds.ts";

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
