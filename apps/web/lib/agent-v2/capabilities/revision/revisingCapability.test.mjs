import test from "node:test";
import assert from "node:assert/strict";

import { executeRevisingCapability } from "./revisingCapability.ts";

function createMemory() {
  return {
    activeConstraints: [],
    pendingPlan: null,
    clarificationState: null,
    rollingSummary: null,
    assistantTurnCount: 1,
    formatPreference: "shortform",
    latestRefinementInstruction: null,
    unresolvedQuestion: null,
    topicSummary: null,
    preferredSurfaceMode: null,
  };
}

function createGroundingPacket() {
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

function createArgs(overrides = {}) {
  return {
    workflow: "revise_draft",
    capability: "revising",
    activeContextRefs: [],
    context: {
      memory: createMemory(),
      activeDraft: "original draft text",
      revision: {
        instruction: "make it punchier",
        changeKind: "length_trim",
        targetText: null,
      },
      revisionActiveConstraints: [],
      effectiveContext: "",
      relevantTopicAnchors: [],
      styleCard: null,
      maxCharacterLimit: 280,
      goal: "growth",
      antiPatterns: [],
      turnDraftPreference: "balanced",
      turnFormatPreference: "shortform",
      threadPostMaxCharacterLimit: 280,
      turnThreadFramingStyle: null,
      userMessage: "make it punchier",
      groundingPacket: createGroundingPacket(),
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 2,
      refreshRollingSummary: false,
      latestRefinementInstruction: "make it punchier",
      groundingSources: [],
      groundingMode: null,
      groundingExplanation: null,
      ...overrides.context,
    },
    services: {
      generateRevisionDraft: async () => ({
        revisedDraft: "changed draft text",
        supportAsset: null,
        issuesFixed: ["tightened wording"],
      }),
      critiqueDrafts: async () => ({
        approved: true,
        finalAngle: "same angle",
        finalDraft: "changed draft text",
        issues: [],
      }),
      buildClarificationResponse: async () => ({
        mode: "coach",
        outputShape: "coach_question",
        response: "clarify",
        memory: createMemory(),
      }),
      ...overrides.services,
    },
  };
}

test("critic rejection returns an honest fallback instead of a revision-ready result", async () => {
  const result = await executeRevisingCapability(
    createArgs({
      services: {
        critiqueDrafts: async () => ({
          approved: false,
          finalAngle: "same angle",
          finalDraft: "changed draft text",
          issues: ["revision drifted farther than the requested edit scope"],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /left the current draft as-is/i);
});

test("no-op revisions return the same fallback instead of claiming the edit landed", async () => {
  const result = await executeRevisingCapability(
    createArgs({
      services: {
        generateRevisionDraft: async () => ({
          revisedDraft: "original draft text",
          supportAsset: null,
          issuesFixed: ["tightened wording"],
        }),
        critiqueDrafts: async () => ({
          approved: true,
          finalAngle: "same angle",
          finalDraft: "original draft text",
          issues: [],
        }),
      },
    }),
  );

  assert.equal(result.output.kind, "response");
  assert.match(result.output.response.response, /left the current draft as-is/i);
});
