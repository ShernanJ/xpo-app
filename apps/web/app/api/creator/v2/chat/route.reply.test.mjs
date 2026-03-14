import test from "node:test";
import assert from "node:assert/strict";

import {
  planReplyTurn,
  resolveReplyTurnState,
} from "./route.reply.ts";

const baseStrategy = {
  knownFor: "useful nuance",
  targetAudience: "founders",
  contentPillars: ["useful nuance", "proof-first writing"],
  replyGoals: ["Add one useful layer instead of generic agreement."],
  profileConversionCues: ["Keep replies aligned with the niche."],
  offBrandThemes: ["generic agreement"],
  ambiguities: ["Profile context is thin."],
  confidence: {
    overall: 40,
    positioning: 35,
    replySignal: 30,
    readiness: "caution",
  },
  truthBoundary: {
    verifiedFacts: [],
    inferredThemes: ["useful nuance"],
    unknowns: ["Avoid overclaiming voice patterns."],
  },
};

function createReplyContext() {
  return {
    sourceText: "Founders should write every day even if nobody reads it yet.",
    sourceUrl: "https://x.com/example/status/1",
    authorHandle: "example",
    quotedUserAsk: "how should i reply?",
    confidence: "high",
    parseReason: "reply_request_with_embedded_post",
    awaitingConfirmation: false,
    stage: "1k_to_10k",
    tone: "builder",
    goal: "followers",
    opportunityId: "chat-reply-1",
    latestReplyOptions: [],
    latestReplyDraftOptions: [],
    selectedReplyOptionId: null,
  };
}

test("planReplyTurn builds reply options for high-confidence embedded reply requests", () => {
  const planned = planReplyTurn({
    activeReplyContext: null,
    replyContinuation: null,
    replyParseResult: {
      classification: "reply_request_with_embedded_post",
      context: {
        sourceText: "Founders should write every day even if nobody reads it yet.",
        sourceUrl: "https://x.com/example/status/1",
        authorHandle: "example",
        quotedUserAsk: "how should i reply?",
        confidence: "high",
        parseReason: "reply_request_with_embedded_post",
      },
    },
    defaultReplyStage: "1k_to_10k",
    defaultReplyTone: "builder",
    defaultReplyGoal: "followers",
    replyStrategy: baseStrategy,
    replyInsights: null,
    styleCard: null,
  });

  assert.ok(planned);
  assert.equal(planned.outputShape, "reply_candidate");
  assert.equal(planned.surfaceMode, "offer_options");
  assert.equal(planned.replyArtifacts?.kind, "reply_options");
  assert.ok((planned.activeReplyContext?.latestReplyOptions.length || 0) >= 1);
});

test("planReplyTurn converts a selected reply option into a reply draft artifact", () => {
  const activeReplyContext = createReplyContext();
  activeReplyContext.latestReplyOptions = [
    {
      id: "option_1",
      label: "Option 1",
      text: "Agree and add one useful layer.",
      intent: {
        label: "nuance",
        strategyPillar: "useful nuance",
        anchor: "disagree gently",
        rationale: "Adds a useful layer.",
      },
    },
  ];

  const planned = planReplyTurn({
    activeReplyContext,
    replyContinuation: { type: "select_option", optionIndex: 0 },
    replyParseResult: {
      classification: "plain_chat",
      context: null,
    },
    defaultReplyStage: "1k_to_10k",
    defaultReplyTone: "builder",
    defaultReplyGoal: "followers",
    replyStrategy: baseStrategy,
    replyInsights: null,
    styleCard: null,
  });

  assert.ok(planned);
  assert.equal(planned.outputShape, "reply_candidate");
  assert.equal(planned.surfaceMode, "generate_full_output");
  assert.equal(planned.replyArtifacts?.kind, "reply_draft");
  assert.equal(planned.selectedReplyOptionId, "option_1");
  assert.equal(planned.activeReplyContext?.selectedReplyOptionId, "option_1");
});

test("resolveReplyTurnState derives continuation and reset behavior from route inputs", () => {
  const activeReplyContext = createReplyContext();
  activeReplyContext.awaitingConfirmation = true;

  const state = resolveReplyTurnState({
    activeHandle: "example",
    creatorAgentContext: {
      growthStrategySnapshot: baseStrategy,
      creatorProfile: {
        identity: {
          followerBand: "1k-10k",
        },
      },
    },
    effectiveMessage: "yes, that's the post",
    structuredReplyContext: null,
    artifactContext: null,
    turnSource: "free_text",
    shouldBypassReplyHandling: false,
    activeReplyContext,
    toneRisk: "bold",
    goal: "authority",
  });

  assert.equal(state.replyContinuation?.type, "confirm");
  assert.equal(state.shouldResetReplyWorkflow, false);
  assert.equal(state.defaultReplyStage, "1k_to_10k");
  assert.equal(state.defaultReplyTone, "bold");
  assert.equal(state.defaultReplyGoal, "authority");
  assert.equal(state.replyStrategy.knownFor, "useful nuance");
});
