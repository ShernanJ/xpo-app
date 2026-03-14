import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { executeReplyingCapability } from "../capabilities/reply/replyingCapability.ts";
import { executeAnalysisCapability } from "../capabilities/analysis/analysisCapability.ts";

const baseMemory = {
  conversationState: "needs_more_context",
  topicSummary: "growth on x",
  lastIdeationAngles: [],
  concreteAnswerCount: 0,
  currentDraftArtifactId: null,
  activeDraftRef: null,
  rollingSummary: null,
  pendingPlan: null,
  clarificationState: null,
  assistantTurnCount: 1,
  latestRefinementInstruction: null,
  unresolvedQuestion: null,
  clarificationQuestionsAsked: 0,
  preferredSurfaceMode: "natural",
  formatPreference: "shortform",
  activeConstraints: [],
  activeReplyContext: null,
  activeReplyArtifactRef: null,
  selectedReplyOptionId: null,
  voiceFidelity: "balanced",
};

test("executeReplyingCapability uses the reply guidance service and emits reply-specific worker metadata", async () => {
  let called = false;

  const execution = await executeReplyingCapability({
    workflow: "reply_to_post",
    capability: "replying",
    activeContextRefs: [],
    context: {
      userMessage: "help me decide how to reply",
      effectiveContext: "recent context",
      topicSummary: "x replies",
      styleCard: null,
      relevantTopicAnchors: [],
      userContextString: "builder account",
      goal: "followers",
      memory: baseMemory,
      antiPatterns: [],
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 2,
      turnFormatPreference: "shortform",
      refreshRollingSummary: false,
    },
    services: {
      generateReplyGuidance: async () => {
        called = true;
        return {
          response: "lead with the disagreement, then add one concrete example.",
          probingQuestion: null,
        };
      },
    },
  });

  assert.equal(called, true);
  assert.equal(
    execution.output.responseSeed.response,
    "lead with the disagreement, then add one concrete example.",
  );
  assert.equal(execution.workers[0]?.worker, "reply_guidance");
});

test("executeAnalysisCapability uses the analysis service and emits analysis-specific worker metadata", async () => {
  let called = false;

  const execution = await executeAnalysisCapability({
    workflow: "analyze_post",
    capability: "analysis",
    activeContextRefs: [],
    context: {
      userMessage: "analyze this post",
      effectiveContext: "recent context",
      topicSummary: "x replies",
      styleCard: null,
      relevantTopicAnchors: [],
      userContextString: "builder account",
      goal: "authority",
      memory: baseMemory,
      antiPatterns: [],
      feedbackMemoryNotice: null,
      nextAssistantTurnCount: 2,
      turnFormatPreference: "shortform",
      refreshRollingSummary: false,
    },
    services: {
      generatePostAnalysis: async () => {
        called = true;
        return {
          response: "the post works because it frames a clear tension before the claim.",
          probingQuestion: null,
        };
      },
    },
  });

  assert.equal(called, true);
  assert.equal(
    execution.output.responseSeed.response,
    "the post works because it frames a clear tension before the claim.",
  );
  assert.equal(execution.workers[0]?.worker, "analysis_guidance");
});

test("executor shims stay thin and point at capability slices", () => {
  const analysisShim = readFileSync(new URL("./analysisExecutor.ts", import.meta.url), "utf8");
  const replyingShim = readFileSync(new URL("./replyingExecutor.ts", import.meta.url), "utf8");
  const ideationShim = readFileSync(new URL("./ideationExecutor.ts", import.meta.url), "utf8");
  const planningShim = readFileSync(new URL("./planningExecutor.ts", import.meta.url), "utf8");
  const draftingShim = readFileSync(new URL("./draftingExecutor.ts", import.meta.url), "utf8");
  const revisingShim = readFileSync(new URL("./revisingExecutor.ts", import.meta.url), "utf8");

  assert.match(analysisShim, /from "\.\.\/capabilities\/analysis\/analysisCapability\.ts";/);
  assert.match(replyingShim, /from "\.\.\/capabilities\/reply\/replyingCapability\.ts";/);
  assert.match(ideationShim, /from "\.\.\/capabilities\/ideation\/ideationCapability\.ts";/);
  assert.match(planningShim, /from "\.\.\/capabilities\/planning\/planningCapability\.ts";/);
  assert.match(draftingShim, /from "\.\.\/capabilities\/drafting\/draftingCapability\.ts";/);
  assert.match(revisingShim, /from "\.\.\/capabilities\/revision\/revisingCapability\.ts";/);

  assert.equal(/async function executeAnalysisCapability/.test(analysisShim), false);
  assert.equal(/async function executeReplyingCapability/.test(replyingShim), false);
  assert.equal(/async function executeIdeationCapability/.test(ideationShim), false);
  assert.equal(/async function executePlanningCapability/.test(planningShim), false);
  assert.equal(/async function executeDraftingCapability/.test(draftingShim), false);
  assert.equal(/async function executeRevisingCapability/.test(revisingShim), false);
});
