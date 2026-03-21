import test from "node:test";
import assert from "node:assert/strict";

import { runGroundedDraftRetry } from "./groundedDraftRetry.ts";
import { buildDraftRequestPolicy } from "../../grounding/requestPolicy.ts";

function createMemory() {
  return {
    continuationState: null,
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

function createAttemptResult() {
  return {
    writerOutput: {
      angle: "angle",
      draft: "draft text",
      supportAsset: null,
      whyThisWorks: "why",
      watchOutFor: "watch",
    },
    criticOutput: {
      approved: true,
      finalAngle: "angle",
      finalDraft: "draft text",
      issues: [],
    },
    draftToDeliver: "draft text",
    voiceTarget: {
      tone: "balanced",
      hookStyle: "story",
      compression: "tight",
    },
    retrievalReasons: [],
    threadFramingStyle: null,
  };
}

function createArgs(overrides = {}) {
  return {
    memory: createMemory(),
    plan: {
      objective: "my journey",
      angle: "tell the story in first person",
      targetLane: "original",
      mustInclude: [],
      mustAvoid: [],
      hookType: "story",
      pitchResponse: "tell the journey",
      formatPreference: "shortform",
      formatIntent: "story",
    },
    activeConstraints: [],
    sourceUserMessage: "write a story about my journey",
    formatPreference: "shortform",
    threadFramingStyle: null,
    topicSummary: "my journey",
    pendingPlan: null,
    draftGroundingPacket: createGroundingPacket(),
    requestPolicy: buildDraftRequestPolicy({
      userMessage: "write a story about my journey",
      formatIntent: "story",
    }),
    storyClarificationQuestion:
      "love the angle. what's the specific project, tool, or moment you want this story anchored to?",
    storyClarificationAsked: false,
    attemptDraft: async () => createAttemptResult(),
    buildConcreteSceneClarificationQuestion: () => "scene question",
    buildGroundedProductClarificationQuestion: () => "product question",
    returnClarificationQuestion: async ({ question, continuationState }) => ({
      mode: "coach",
      outputShape: "coach_question",
      response: question,
      data: continuationState ? { continuationState } : undefined,
      memory: createMemory(),
    }),
    returnDeliveryValidationFallback: async () => ({
      mode: "coach",
      outputShape: "coach_question",
      response: "retry",
      memory: createMemory(),
    }),
    ...overrides,
  };
}

test("grounded draft retry asks exactly one story clarification question before drafting", async () => {
  let attemptCalls = 0;
  const result = await runGroundedDraftRetry(
    createArgs({
      attemptDraft: async () => {
        attemptCalls += 1;
        return createAttemptResult();
      },
    }),
  );

  assert.equal(result.kind, "response");
  assert.equal(result.response.response.includes("what's the specific"), true);
  assert.equal(attemptCalls, 0);
  assert.equal(
    result.response.data.continuationState.storyClarificationAsked,
    true,
  );
});

test("grounded draft retry resumes normally after the single story clarification has already been asked", async () => {
  let attemptCalls = 0;
  const result = await runGroundedDraftRetry(
    createArgs({
      storyClarificationAsked: true,
      attemptDraft: async () => {
        attemptCalls += 1;
        return createAttemptResult();
      },
    }),
  );

  assert.equal(result.kind, "success");
  assert.equal(attemptCalls > 0, true);
});
