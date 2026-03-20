import test from "node:test";
import assert from "node:assert/strict";

import { prepareHandledReplyTurn } from "./handledReplyTurn.ts";

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
  continuationState: null,
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

test("prepareHandledReplyTurn keeps selected reply draft regenerations in reply workflow", async () => {
  const prepared = await prepareHandledReplyTurn({
    userMessage: "regenerate",
    recentHistory: "assistant: drafted one grounded reply from that post.",
    explicitIntent: "edit",
    turnSource: "draft_action",
    artifactContext: {
      kind: "draft_selection",
      action: "edit",
      selectedDraftContext: {
        messageId: "reply-msg-1",
        versionId: "reply-ver-1",
        content: "nice, love how a quick voice dump can turn into a clean notion deck in minutes.",
      },
    },
    resolvedWorkflowHint: "revise_draft",
    routingDiagnostics: {
      turnSource: "draft_action",
      artifactKind: "draft_selection",
      planSeedSource: "message",
      replyHandlingBypassedReason: "turn_source_draft_action",
      resolvedWorkflow: "revise_draft",
    },
    activeHandle: "stan",
    creatorAgentContext: null,
    structuredReplyContext: null,
    shouldBypassReplyHandling: true,
    memory: {
      ...baseMemory,
      activeReplyArtifactRef: {
        messageId: "reply-msg-1",
        kind: "reply_draft",
      },
      activeReplyContext: {
        sourceText:
          "just hooked sierra, my @OpenClaw ai, up to @NotionHQ. working on a project proposal.",
        sourceUrl: "https://x.com/vitddnv/status/1",
        authorHandle: "vitddnv",
        quotedUserAsk: null,
        confidence: "high",
        parseReason: "reply_request_with_embedded_post",
        awaitingConfirmation: false,
        stage: "1k_to_10k",
        tone: "builder",
        goal: "followers",
        opportunityId: "opp_1",
        latestReplyOptions: [],
        latestReplyDraftOptions: [
          {
            id: "reply-draft-1",
            label: "Draft 1",
            text: "nice, love how a quick voice dump can turn into a clean notion deck in minutes.",
          },
        ],
        selectedReplyOptionId: null,
      },
      continuationState: {
        capability: "replying",
        pendingAction: "reply_regenerate",
        formatPreference: "shortform",
        sourceUserMessage:
          "just hooked sierra, my @OpenClaw ai, up to @NotionHQ. working on a project proposal.",
      },
    },
    toneRisk: "builder",
    goal: "followers",
    replyInsights: {
      bestSignals: ["adds one useful layer"],
      cautionSignals: [],
      recommendedTones: ["builder"],
      profileLevel: "emerging",
    },
    styleCard: null,
  });

  assert.ok(prepared.handledTurn);
  assert.equal(prepared.shouldResetReplyWorkflow, false);
  assert.equal(prepared.handledTurn.routingTrace.runtimeResolution?.workflow, "reply_to_post");
  assert.equal(prepared.handledTurn.plannedTurn.outputShape, "reply_candidate");
  assert.equal(
    prepared.handledTurn.plannedTurn.replyParse?.parseReason,
    "reply_draft_revised",
  );
});
