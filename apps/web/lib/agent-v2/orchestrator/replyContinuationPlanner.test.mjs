import test from "node:test";
import assert from "node:assert/strict";

import {
  planReplyContinuation,
  planReplyTurn,
} from "./replyContinuationPlanner.ts";

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

test("planReplyContinuation builds grounded reply options for a high-confidence post", () => {
  const planned = planReplyContinuation({
    activeReplyContext: null,
    replyContinuation: null,
    highConfidenceReplyContext: {
      sourceText: "Founders should write every day even if nobody reads it yet.",
      sourceUrl: "https://x.com/example/status/1",
      authorHandle: "example",
      quotedUserAsk: "how should i reply?",
      confidence: "high",
      parseReason: "reply_request_with_embedded_post",
    },
    defaultReplyStage: "1k_to_10k",
    defaultReplyTone: "builder",
    defaultReplyGoal: "followers",
    replyStrategy: baseStrategy,
    replyInsights: null,
    styleCard: null,
  });

  assert.ok(planned);
  assert.equal(planned.kind, "reply_options");
  assert.ok(planned.nextReplyContext.latestReplyOptions.length >= 1);
  assert.equal(planned.eventType, "chat_reply_options_generated");
});

test("planReplyContinuation turns a selected option into a reply draft", () => {
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

  const planned = planReplyContinuation({
    activeReplyContext,
    replyContinuation: { type: "select_option", optionIndex: 0 },
    highConfidenceReplyContext: null,
    defaultReplyStage: "1k_to_10k",
    defaultReplyTone: "builder",
    defaultReplyGoal: "followers",
    replyStrategy: baseStrategy,
    replyInsights: null,
    styleCard: null,
  });

  assert.ok(planned);
  assert.equal(planned.kind, "reply_draft");
  assert.equal(planned.selectedReplyOptionId, "option_1");
  assert.equal(planned.nextReplyContext.selectedReplyOptionId, "option_1");
  assert.equal(planned.eventType, "chat_reply_draft_generated");
});

test("planReplyTurn builds reply options with artifacts and quick replies for a high-confidence post", () => {
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
  assert.equal(
    planned.quickReplies.length,
    Math.min(3, planned.replyArtifacts?.options.length || 0),
  );
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

test("planReplyTurn asks for confirmation on medium-confidence embedded posts", () => {
  const planned = planReplyTurn({
    activeReplyContext: null,
    replyContinuation: null,
    replyParseResult: {
      classification: "reply_request_with_embedded_post",
      context: {
        sourceText: "Founders should write every day even if nobody reads it yet.",
        sourceUrl: null,
        authorHandle: null,
        quotedUserAsk: "how should i reply?",
        confidence: "medium",
        parseReason: "reply_ask_with_multiline_post_block",
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
  assert.equal(planned.outputShape, "coach_question");
  assert.equal(planned.surfaceMode, "ask_one_question");
  assert.equal(planned.replyParse?.needsConfirmation, true);
  assert.equal(planned.activeReplyContext?.awaitingConfirmation, true);
  assert.equal(planned.quickReplies.length, 2);
});

test("planReplyTurn asks for the post when the reply request is missing source material", () => {
  const planned = planReplyTurn({
    activeReplyContext: null,
    replyContinuation: null,
    replyParseResult: {
      classification: "reply_request_missing_post",
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
  assert.equal(planned.outputShape, "coach_question");
  assert.equal(planned.replyArtifacts, undefined);
  assert.equal(planned.activeReplyContext, null);
  assert.match(planned.reply, /paste the post text or x url/i);
});

test("planReplyTurn offers guidance instead of forcing a reply when no reply ask is present", () => {
  const planned = planReplyTurn({
    activeReplyContext: null,
    replyContinuation: null,
    replyParseResult: {
      classification: "embedded_post_without_reply_request",
      context: {
        sourceText: "Founders should write every day even if nobody reads it yet.",
        sourceUrl: "https://x.com/example/status/1",
        authorHandle: "example",
        quotedUserAsk: "this should be ignored",
        confidence: "high",
        parseReason: "embedded_post_without_reply_instruction",
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
  assert.equal(planned.outputShape, "coach_question");
  assert.equal(planned.surfaceMode, "ask_one_question");
  assert.equal(planned.activeReplyContext?.awaitingConfirmation, true);
  assert.equal(planned.activeReplyContext?.quotedUserAsk, null);
  assert.match(planned.reply, /help you reply to it, analyze it, or turn it into a quote reply/i);
});
