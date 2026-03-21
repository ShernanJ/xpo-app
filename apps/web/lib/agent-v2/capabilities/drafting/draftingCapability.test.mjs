import test from "node:test";
import assert from "node:assert/strict";

import { executeDraftingCapability } from "./draftingCapability.ts";
import { buildDraftRequestPolicy } from "../../grounding/requestPolicy.ts";

function createMemory() {
  return {
    rollingSummary: null,
  };
}

function createDraftResult(draft = "draft text") {
  return {
    kind: "success",
    writerOutput: {
      angle: "angle",
      draft,
      supportAsset: null,
      whyThisWorks: "why",
      watchOutFor: "watch",
    },
    criticOutput: {
      approved: true,
      finalAngle: "angle",
      finalDraft: draft,
      issues: [],
    },
    draftToDeliver: draft,
    voiceTarget: {
      tone: "balanced",
      hookStyle: "direct",
      compression: "tight",
    },
    retrievalReasons: [],
    threadFramingStyle: null,
  };
}

function createArgs(overrides = {}) {
  return {
    workflow: "plan_then_draft",
    capability: "drafting",
    activeContextRefs: [],
    context: {
      memory: createMemory(),
      plan: {
        objective: "default topic",
        angle: "default angle",
        targetLane: "original",
        mustInclude: [],
        mustAvoid: [],
        hookType: "direct",
        pitchResponse: "lead with the tension",
        formatPreference: "shortform",
        formatIntent: "lesson",
      },
      activeConstraints: [],
      historicalTexts: [],
      userMessage: "write a post",
      draftPreference: "balanced",
      turnFormatPreference: "shortform",
      styleCard: null,
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 2,
      latestDraftStatus: "Draft delivered",
      refreshRollingSummary: false,
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
      creatorProfileHints: {
        preferredOutputShape: "short_form_post",
        threadBias: "low",
        preferredHookPatterns: [],
        toneGuidelines: [],
        ctaPolicy: "minimal",
        topExampleSnippets: [],
        knownFor: "tactical leadership deep dives",
        targetAudience: "b2b saas founders",
        contentPillars: ["leadership systems", "b2b saas growth"],
        offBrandThemes: ["gaming memes", "coffee jokes"],
      },
      requestPolicy: buildDraftRequestPolicy({
        userMessage: "write a lesson about gaming",
        formatIntent: "lesson",
      }),
      ...overrides.context,
    },
    services: {
      checkDeterministicNovelty: () => ({
        isNovel: true,
        reason: null,
        maxSimilarity: 0,
      }),
      runDraft: async () => createDraftResult(),
      buildNoveltyNotes: () => [],
      ...overrides.services,
    },
  };
}

test("drafting capability appends a coach note for strongly off-niche lesson requests", async () => {
  const result = await executeDraftingCapability(
    createArgs({
      context: {
        userMessage: "write a lesson about gaming",
        plan: {
          objective: "gaming lessons",
          angle: "teach what gaming taught me about feedback loops",
          targetLane: "original",
          mustInclude: [],
          mustAvoid: [],
          hookType: "contrarian",
          pitchResponse: "teach the gaming lesson",
          formatPreference: "shortform",
          formatIntent: "lesson",
        },
      },
      services: {
        runDraft: async () => createDraftResult("gaming draft"),
      },
    }),
  );

  assert.equal(result.output.kind, "draft_ready");
  assert.equal(result.output.responseSeed.data.draft, "gaming draft");
  assert.match(result.output.responseSeed.response, /Coach's Note:/);
});

test("drafting capability skips coach notes for joke-mode personality posts", async () => {
  const result = await executeDraftingCapability(
    createArgs({
      context: {
        userMessage: "make it a coffee joke",
        plan: {
          objective: "coffee joke",
          angle: "play up the absurd dependency on coffee",
          targetLane: "original",
          mustInclude: [],
          mustAvoid: [],
          hookType: "joke",
          pitchResponse: "lean into the coffee bit",
          formatPreference: "shortform",
          formatIntent: "joke",
        },
        requestPolicy: buildDraftRequestPolicy({
          userMessage: "make it a coffee joke",
          formatIntent: "joke",
        }),
      },
      services: {
        runDraft: async () => createDraftResult("coffee draft"),
      },
    }),
  );

  assert.equal(result.output.kind, "draft_ready");
  assert.equal(result.output.responseSeed.data.draft, "coffee draft");
  assert.equal(
    result.output.responseSeed.response.includes("Coach's Note:"),
    false,
  );
});

test("drafting capability keeps inferred session constraints in the rolling summary without flattening them into active constraints", async () => {
  const result = await executeDraftingCapability(
    createArgs({
      context: {
        memory: {
          ...createMemory(),
          activeConstraints: ["keep all lowercase"],
        },
        activeConstraints: ["keep all lowercase", "no listicles"],
        sessionConstraints: [
          { source: "explicit", text: "keep all lowercase" },
          { source: "inferred", text: "no listicles" },
        ],
        refreshRollingSummary: true,
      },
    }),
  );

  assert.equal(result.output.kind, "draft_ready");
  assert.match(result.output.memoryPatch.rollingSummary, /Preferences discovered: keep all lowercase/);
  assert.match(result.output.memoryPatch.rollingSummary, /Inferred turn constraints: no listicles/);
});
