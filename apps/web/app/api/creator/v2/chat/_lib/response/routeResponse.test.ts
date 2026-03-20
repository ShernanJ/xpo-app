import test from "node:test";
import assert from "node:assert/strict";

import { buildReplyAssistantMessageData } from "./routeResponse.ts";
import { parseSelectedDraftContext } from "../request/routeLogic.ts";

const baseMemory = {
  conversationState: "needs_more_context",
  topicSummary: null,
  lastIdeationAngles: [],
  concreteAnswerCount: 0,
  currentDraftArtifactId: null,
  activeDraftRef: null,
  rollingSummary: null,
  pendingPlan: null,
  clarificationState: null,
  assistantTurnCount: 0,
  latestRefinementInstruction: null,
  unresolvedQuestion: null,
  clarificationQuestionsAsked: 0,
  preferredSurfaceMode: "structured",
  formatPreference: "shortform",
  activeConstraints: [],
  activeReplyContext: null,
  activeReplyArtifactRef: null,
  selectedReplyOptionId: null,
  voiceFidelity: "balanced",
};

test("buildReplyAssistantMessageData versions revised reply drafts against the selected version", () => {
  const mapped = buildReplyAssistantMessageData({
    reply: "tightened the reply without changing the core point.",
    outputShape: "reply_candidate",
    surfaceMode: "generate_full_output",
    quickReplies: [],
    memory: baseMemory,
    routingDiagnostics: {
      turnSource: "reply_action",
      artifactKind: null,
      planSeedSource: "message",
      replyHandlingBypassedReason: null,
      resolvedWorkflow: "reply_to_post",
    },
    clientTurnId: "turn_reply_revision_1",
    threadTitle: "Reply thread",
    selectedDraftContext: parseSelectedDraftContext({
      messageId: "assistant-reply-1",
      versionId: "version-prev",
      content: "older reply draft",
      source: "assistant_generated",
      createdAt: "2026-03-20T14:00:00.000Z",
      maxCharacterLimit: 280,
      revisionChainId: "revision-chain-reply-1",
    }),
    replyArtifacts: {
      kind: "reply_draft",
      sourceText: "original post body",
      sourceUrl: "https://x.com/example/status/1",
      authorHandle: "example",
      options: [{ id: "draft_1", label: "Draft 1", text: "newer reply draft" }],
      notes: [],
      selectedOptionId: "draft_1",
    },
    replyParse: {
      detected: true,
      confidence: "high",
      needsConfirmation: false,
      parseReason: "reply_draft_revised",
    },
  });

  assert.equal(mapped.draftVersions?.[0]?.source, "assistant_revision");
  assert.equal(mapped.draftVersions?.[0]?.basedOnVersionId, "version-prev");
  assert.equal(mapped.previousVersionSnapshot?.versionId, "version-prev");
  assert.equal(mapped.revisionChainId, "revision-chain-reply-1");
});
