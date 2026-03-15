import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { executeReplyingCapability } from "./reply/replyingCapability.ts";
import { executeAnalysisCapability } from "./analysis/analysisCapability.ts";

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

test("executeReplyingCapability retries malformed delivery once and keeps validation metadata", async () => {
  let calls = 0;

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
      generateReplyGuidance: async (_userMessage, _recentHistory, _topicSummary, _styleCard, _topicAnchors, _userContextString, options) => {
        calls += 1;
        if (calls === 1) {
          return {
            response: "lead with the disagreement and",
            probingQuestion: null,
          };
        }

        assert.equal(
          options?.retryConstraints?.some((entry) => entry.includes("complete ending")),
          true,
        );
        return {
          response: "lead with the disagreement, then add one concrete proof point from the post.",
          probingQuestion: null,
        };
      },
    },
  });

  assert.equal(calls, 2);
  assert.equal(
    execution.output.responseSeed.response,
    "lead with the disagreement, then add one concrete proof point from the post.",
  );
  assert.equal(
    execution.workers.some((worker) => worker.groupId === "reply_delivery_validation_initial"),
    true,
  );
  assert.equal(
    execution.workers.some((worker) => worker.groupId === "reply_delivery_validation_retry"),
    true,
  );
  assert.equal(
    execution.validations.some(
      (validation) =>
        validation.validator === "truncation_guard" && validation.status === "failed",
    ),
    true,
  );
});

test("executeAnalysisCapability falls back safely when delivery validation fails twice", async () => {
  let calls = 0;

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
      generatePostAnalysis: async (_userMessage, _recentHistory, _topicSummary, _styleCard, _topicAnchors, _userContextString, options) => {
        calls += 1;
        if (calls === 2) {
          assert.equal(
            options?.retryConstraints?.some((entry) => entry.includes("complete ending")),
            true,
          );
        }
        return {
          response: "the post works because it frames the tension and",
          probingQuestion: null,
        };
      },
    },
  });

  assert.equal(calls, 2);
  assert.equal(execution.output.responseSeed.outputShape, "coach_question");
  assert.equal(
    execution.output.responseSeed.response.includes("came back malformed twice"),
    true,
  );
  assert.equal(
    execution.workers.some(
      (worker) => worker.groupId === "analysis_delivery_validation_retry",
    ),
    true,
  );
  assert.equal(
    execution.validations.some(
      (validation) =>
        validation.validator === "truncation_guard" && validation.status === "failed",
    ),
    true,
  );
});

test("executor shims stay deleted once capability slices own execution directly", () => {
  assert.equal(existsSync(new URL("../orchestrator/analysisExecutor.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../orchestrator/replyingExecutor.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../orchestrator/ideationExecutor.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../orchestrator/planningExecutor.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../orchestrator/draftingExecutor.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../orchestrator/revisingExecutor.ts", import.meta.url)), false);
});
