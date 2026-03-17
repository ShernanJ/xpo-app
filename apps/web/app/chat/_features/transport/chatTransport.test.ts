import test from "node:test";
import assert from "node:assert/strict";

import { prepareAssistantReplyTransport } from "./chatTransport.ts";

const baseStrategyInputs = {
  goal: "followers" as const,
  postingCadenceCapacity: "1_per_day" as const,
  replyBudgetPerDay: "5_15" as const,
  transformationMode: "optimize" as const,
};

const baseToneInputs = {
  toneCasing: "normal" as const,
  toneRisk: "safe" as const,
};

test("prepareAssistantReplyTransport skips empty free-text requests", () => {
  const prepared = prepareAssistantReplyTransport({
    prompt: "   ",
    history: [],
    runId: "run-1",
    threadId: null,
    workspaceHandle: "stan",
    selectedDraftContext: null,
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.shouldSkip, true);
  assert.equal(prepared.transportRequest, undefined);
  assert.equal(prepared.pendingStatusPlan, null);
});

test("prepareAssistantReplyTransport resolves ideation picks into structured transport", () => {
  const prepared = prepareAssistantReplyTransport({
    prompt: "",
    history: [{ id: "user-1", role: "user", content: "help me write" }],
    runId: "run-1",
    threadId: "thread-1",
    workspaceHandle: "stan",
    artifactContext: {
      kind: "selected_angle",
      angle: "build in public lessons",
      formatHint: "post",
    },
    selectedDraftContext: null,
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.shouldSkip, false);
  assert.equal(prepared.effectiveTurnSource, "ideation_pick");
  assert.equal(prepared.transportRequest?.turnSource, "ideation_pick");
  assert.equal(prepared.transportRequest?.threadId, "thread-1");
  assert.equal(prepared.transportRequest?.workspaceHandle, "stan");
  assert.equal(prepared.transportRequest?.artifactContext?.kind, "selected_angle");
  assert.equal(prepared.clientTurnId?.startsWith("turn_"), true);
});

test("prepareAssistantReplyTransport preserves support assets on image-backed ideation picks", () => {
  const prepared = prepareAssistantReplyTransport({
    prompt: "",
    history: [{ id: "user-1", role: "user", content: "write from this image" }],
    runId: "run-1",
    threadId: "thread-1",
    workspaceHandle: "stan",
    artifactContext: {
      kind: "selected_angle",
      angle: "why screenshots like this outperform polished launch art",
      formatHint: "post",
      supportAsset: "Image anchor: analytics dashboard on a laptop.",
    },
    selectedDraftContext: null,
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.transportRequest?.artifactContext?.kind, "selected_angle");
  assert.equal(
    prepared.transportRequest?.artifactContext?.kind === "selected_angle"
      ? prepared.transportRequest.artifactContext.supportAsset
      : null,
    "Image anchor: analytics dashboard on a laptop.",
  );
});

test("prepareAssistantReplyTransport preserves thread intent for thread angle picks", () => {
  const prepared = prepareAssistantReplyTransport({
    prompt: "",
    history: [{ id: "user-1", role: "user", content: "write a thread" }],
    runId: "run-1",
    threadId: "thread-1",
    workspaceHandle: "stan",
    artifactContext: {
      kind: "selected_angle",
      angle: "the hiring filter that kept our team lean",
      formatHint: "thread",
    },
    formatPreferenceOverride: "thread",
    selectedDraftContext: null,
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.shouldSkip, false);
  assert.equal(prepared.transportRequest?.artifactContext?.kind, "selected_angle");
  assert.equal(prepared.transportRequest?.formatPreference, "thread");
  assert.equal(prepared.pendingStatusPlan?.workflow, "plan_then_draft");
});

test("prepareAssistantReplyTransport carries selected draft context for revision requests", () => {
  const prepared = prepareAssistantReplyTransport({
    prompt: "make it shorter and sharper",
    history: [],
    runId: "run-1",
    threadId: "thread-1",
    workspaceHandle: "stan",
    selectedDraftContext: {
      messageId: "msg-1",
      versionId: "ver-1",
      content: "draft body",
      source: "assistant_generated",
      createdAt: "2026-03-13T12:00:00.000Z",
      revisionChainId: "revision-chain-1",
      focusedThreadPostIndex: 4,
    },
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.shouldSkip, false);
  assert.equal(prepared.effectiveIntent, "edit");
  assert.equal(prepared.transportRequest?.intent, "edit");
  assert.equal(prepared.transportRequest?.selectedDraftContext?.versionId, "ver-1");
  assert.equal(prepared.transportRequest?.selectedDraftContext?.focusedThreadPostIndex, 4);
  assert.equal(prepared.pendingStatusPlan?.workflow, "revise_draft");
});

test("prepareAssistantReplyTransport preserves thread format overrides on selected-draft revisions", () => {
  const selectedDraftContext = {
    messageId: "msg-2",
    versionId: "ver-2",
    content: "single post draft",
    source: "assistant_generated" as const,
    createdAt: "2026-03-13T12:00:00.000Z",
  };
  const prepared = prepareAssistantReplyTransport({
    prompt: "turn into thread",
    history: [],
    runId: "run-2",
    threadId: "thread-2",
    workspaceHandle: "stan",
    turnSource: "draft_action",
    intent: "edit",
    artifactContext: {
      kind: "draft_selection",
      action: "edit",
      selectedDraftContext,
    },
    formatPreferenceOverride: "thread",
    threadFramingStyleOverride: "soft_signal",
    selectedDraftContext,
    strategyInputs: baseStrategyInputs,
    toneInputs: baseToneInputs,
  });

  assert.equal(prepared.shouldSkip, false);
  assert.equal(prepared.transportRequest?.formatPreference, "thread");
  assert.equal(prepared.transportRequest?.threadFramingStyle, "soft_signal");
  assert.equal(prepared.pendingStatusPlan?.workflow, "revise_draft");
});
