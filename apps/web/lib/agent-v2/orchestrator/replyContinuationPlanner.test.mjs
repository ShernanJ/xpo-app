import test from "node:test";
import assert from "node:assert/strict";

import { planReplyContinuation } from "./replyContinuationPlanner.ts";

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
