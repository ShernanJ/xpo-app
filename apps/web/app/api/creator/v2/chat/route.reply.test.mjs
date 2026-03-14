import test from "node:test";
import assert from "node:assert/strict";

import {
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

test("resolveReplyTurnState prefers structured artifact continuations at the route boundary", () => {
  const activeReplyContext = createReplyContext();
  activeReplyContext.latestReplyOptions = [
    {
      id: "option_1",
      label: "Option 1",
      text: "Agree and add one useful layer.",
      intent: null,
    },
  ];

  const state = resolveReplyTurnState({
    activeHandle: "example",
    creatorAgentContext: {
      growthStrategySnapshot: baseStrategy,
      creatorProfile: null,
    },
    effectiveMessage: "ignore this free text and use the structured action",
    structuredReplyContext: null,
    artifactContext: {
      kind: "reply_option_select",
      optionIndex: 0,
    },
    turnSource: "reply_action",
    shouldBypassReplyHandling: false,
    activeReplyContext,
    toneRisk: "builder",
    goal: "followers",
  });

  assert.equal(state.replyContinuation?.type, "select_option");
  assert.equal(state.replyContinuation?.optionIndex, 0);
  assert.equal(state.shouldResetReplyWorkflow, true);
});
