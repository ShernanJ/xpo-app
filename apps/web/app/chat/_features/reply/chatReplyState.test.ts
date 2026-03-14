import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCreatedThreadPlanToList,
  buildAssistantMessageFromChatResult,
  readChatResponseStream,
  resolveAssistantReplyJsonOutcome,
  resolveAssistantReplyPlan,
  resolveAssistantReplySuccessState,
  resolveCreatedThreadPlan,
  resolveNextDraftEditorSelection,
} from "./chatReplyState.ts";

test("buildAssistantMessageFromChatResult preserves response quick replies when present", () => {
  const message = buildAssistantMessageFromChatResult({
    result: {
      reply: "here's a draft",
      angles: [],
      quickReplies: [{ kind: "example_reply", value: "go", label: "Go" }],
      plan: null,
      draft: "draft body",
      drafts: ["draft body"],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: "short_form_post",
    },
    activeThreadId: "thread-1",
    existingMessageCount: 2,
    trimmedPrompt: "write a post",
    artifactKind: null,
    defaultQuickReplies: [{ kind: "example_reply", value: "fallback", label: "Fallback" }],
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(message.id, "assistant-1773403200001");
  assert.equal(message.threadId, "thread-1");
  assert.equal(message.quickReplies?.[0]?.label, "Go");
});

test("buildAssistantMessageFromChatResult falls back to starter quick replies only on empty threads", () => {
  const fallbackReplies = [
    { kind: "example_reply", value: "idea", label: "Give me ideas" },
  ];
  const message = buildAssistantMessageFromChatResult({
    result: {
      reply: "what should we work on?",
      angles: [],
      plan: null,
      draft: null,
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: "coach_question",
    },
    activeThreadId: null,
    existingMessageCount: 0,
    trimmedPrompt: "",
    artifactKind: null,
    defaultQuickReplies: fallbackReplies,
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.deepEqual(message.quickReplies, fallbackReplies);

  const selectedAngleMessage = buildAssistantMessageFromChatResult({
    result: {
      reply: "picked an angle",
      angles: [],
      plan: null,
      draft: null,
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: "coach_question",
    },
    activeThreadId: null,
    existingMessageCount: 0,
    trimmedPrompt: "",
    artifactKind: "selected_angle",
    defaultQuickReplies: fallbackReplies,
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.equal(selectedAngleMessage.quickReplies, undefined);
});

test("resolveNextDraftEditorSelection keeps json and stream rules distinct", () => {
  const jsonSelection = resolveNextDraftEditorSelection({
    result: {
      messageId: "assistant-msg-1",
      draftVersions: [{ id: "version-2" }],
      revisionChainId: "chain-1",
    },
    selectedDraftContext: {
      messageId: "assistant-msg-0",
      versionId: "version-1",
    },
    mode: "json",
  });

  assert.deepEqual(jsonSelection, {
    messageId: "assistant-msg-1",
    versionId: "version-2",
    revisionChainId: "chain-1",
  });

  const streamSelection = resolveNextDraftEditorSelection({
    result: {
      messageId: "assistant-msg-2",
      activeDraftVersionId: "version-3",
      draft: "revised draft",
      revisionChainId: "chain-2",
    },
    selectedDraftContext: {
      messageId: "assistant-msg-1",
      versionId: "version-2",
    },
    mode: "stream",
  });

  assert.deepEqual(streamSelection, {
    messageId: "assistant-msg-2",
    versionId: "version-3",
    revisionChainId: "chain-2",
  });

  const missingStreamDraft = resolveNextDraftEditorSelection({
    result: {
      messageId: "assistant-msg-3",
      activeDraftVersionId: "version-4",
      draft: null,
    },
    selectedDraftContext: {
      messageId: "assistant-msg-2",
      versionId: "version-3",
    },
    mode: "stream",
  });

  assert.equal(missingStreamDraft, null);
});

test("resolveAssistantReplySuccessState plans assistant message, selection, memory, and thread updates", () => {
  const successState = resolveAssistantReplySuccessState({
    result: {
      reply: "done",
      angles: [],
      plan: null,
      draft: "draft body",
      drafts: ["draft body"],
      draftArtifacts: [],
      draftVersions: [{ id: "version-2" }],
      activeDraftVersionId: "version-2",
      revisionChainId: "chain-1",
      supportAsset: null,
      outputShape: "short_form_post",
      messageId: "assistant-msg-1",
      newThreadId: "thread-9",
      threadTitle: "Fresh thread",
      memory: { conversationState: "active" },
      billing: { plan: "pro" },
    },
    activeThreadId: null,
    existingMessageCount: 2,
    trimmedPrompt: "write a post",
    artifactKind: null,
    defaultQuickReplies: [{ kind: "example_reply", value: "fallback", label: "Fallback" }],
    selectedDraftContext: {
      messageId: "assistant-msg-0",
      versionId: "version-1",
    },
    mode: "json",
    accountName: "stan",
    now: new Date("2026-03-14T12:00:00.000Z"),
  });

  assert.equal(successState.assistantMessage.id, "assistant-msg-1");
  assert.equal(successState.nextDraftEditor?.versionId, "version-2");
  assert.deepEqual(successState.nextConversationMemory, { conversationState: "active" });
  assert.deepEqual(successState.nextBilling, { plan: "pro" });
  assert.deepEqual(successState.createdThreadPlan, {
    threadId: "thread-9",
    title: "Fresh thread",
    xHandle: "stan",
    createdAt: "2026-03-14T12:00:00.000Z",
    updatedAt: "2026-03-14T12:00:00.000Z",
    replaceIds: ["current-workspace"],
  });
  assert.deepEqual(successState.nextThreadTitle, {
    threadId: "thread-9",
    title: "Fresh thread",
  });
});

test("resolveAssistantReplySuccessState preserves stream-specific draft selection rules", () => {
  const successState = resolveAssistantReplySuccessState({
    result: {
      reply: "streamed",
      angles: [],
      plan: null,
      draft: null,
      drafts: [],
      draftArtifacts: [],
      activeDraftVersionId: "version-3",
      revisionChainId: "chain-2",
      supportAsset: null,
      outputShape: "coach_question",
      messageId: "assistant-msg-2",
    },
    activeThreadId: "thread-1",
    existingMessageCount: 1,
    trimmedPrompt: "revise this",
    artifactKind: null,
    defaultQuickReplies: undefined,
    selectedDraftContext: {
      messageId: "assistant-msg-1",
      versionId: "version-2",
    },
    mode: "stream",
    accountName: "stan",
    now: new Date("2026-03-14T12:00:00.000Z"),
  });

  assert.equal(successState.nextDraftEditor, null);
  assert.equal(successState.createdThreadPlan, null);
  assert.equal(successState.nextThreadTitle, null);
});

test("resolveAssistantReplyPlan defers assistant message creation to the current message count", () => {
  const replyPlan = resolveAssistantReplyPlan({
    result: {
      reply: "what should we make next?",
      angles: [],
      plan: null,
      draft: null,
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: "coach_question",
      threadTitle: "Fresh thread",
      newThreadId: "thread-2",
      messageId: "assistant-msg-2",
    },
    activeThreadId: null,
    trimmedPrompt: "",
    artifactKind: null,
    defaultQuickReplies: [
      { kind: "example_reply", value: "idea", label: "Give me ideas" },
    ],
    selectedDraftContext: null,
    mode: "json",
    accountName: "stan",
    now: new Date("2026-03-14T12:00:00.000Z"),
  });

  const emptyThreadMessage = replyPlan.buildAssistantMessage(0);
  const populatedThreadMessage = replyPlan.buildAssistantMessage(2);

  assert.deepEqual(emptyThreadMessage.quickReplies, [
    { kind: "example_reply", value: "idea", label: "Give me ideas" },
  ]);
  assert.equal(populatedThreadMessage.quickReplies, undefined);
  assert.deepEqual(replyPlan.nextThreadTitle, {
    threadId: "thread-2",
    title: "Fresh thread",
  });
});

test("resolveAssistantReplyJsonOutcome returns failure billing and pricing modal hints", () => {
  const outcome = resolveAssistantReplyJsonOutcome({
    responseOk: false,
    responseStatus: 402,
    response: {
      ok: false,
      errors: [{ message: "Need more credits" }],
      data: {
        billing: { creditsRemaining: 0 },
      },
    },
    failureMessage: "Failed to generate a reply.",
    replyPlanArgs: {
      activeThreadId: "thread-1",
      trimmedPrompt: "draft this",
      artifactKind: null,
      defaultQuickReplies: undefined,
      selectedDraftContext: null,
      mode: "json",
      accountName: "stan",
    },
  });

  assert.equal(outcome.kind, "failure");
  if (outcome.kind === "failure") {
    assert.equal(outcome.errorMessage, "Need more credits");
    assert.deepEqual(outcome.nextBillingSnapshot, { creditsRemaining: 0 });
    assert.equal(outcome.shouldOpenPricingModal, true);
  }
});

test("resolveAssistantReplyJsonOutcome returns a reusable success plan", () => {
  const outcome = resolveAssistantReplyJsonOutcome({
    responseOk: true,
    responseStatus: 200,
    response: {
      ok: true,
      data: {
        reply: "done",
        angles: [],
        plan: null,
        draft: "draft body",
        drafts: ["draft body"],
        draftArtifacts: [],
        draftVersions: [{ id: "version-2" }],
        activeDraftVersionId: "version-2",
        revisionChainId: "chain-1",
        supportAsset: null,
        outputShape: "short_form_post",
        messageId: "assistant-msg-1",
        newThreadId: "thread-9",
        threadTitle: "Fresh thread",
        memory: { conversationState: "active" },
        billing: { plan: "pro" },
      },
    },
    failureMessage: "Failed to generate a reply.",
    replyPlanArgs: {
      activeThreadId: null,
      trimmedPrompt: "write a post",
      artifactKind: null,
      defaultQuickReplies: [{ kind: "example_reply", value: "fallback", label: "Fallback" }],
      selectedDraftContext: {
        messageId: "assistant-msg-0",
        versionId: "version-1",
      },
      mode: "json",
      accountName: "stan",
      now: new Date("2026-03-14T12:00:00.000Z"),
    },
  });

  assert.equal(outcome.kind, "success");
  if (outcome.kind === "success") {
    assert.equal(outcome.replyPlan.nextDraftEditor?.versionId, "version-2");
    assert.deepEqual(outcome.replyPlan.nextConversationMemory, {
      conversationState: "active",
    });
    assert.deepEqual(outcome.replyPlan.nextBilling, { plan: "pro" });
    assert.equal(outcome.replyPlan.buildAssistantMessage(2).id, "assistant-msg-1");
  }
});

test("resolveCreatedThreadPlan and applyCreatedThreadPlanToList remap placeholder threads", () => {
  const plan = resolveCreatedThreadPlan({
    newThreadId: "thread-9",
    threadTitle: " Fresh thread ",
    activeThreadId: null,
    accountName: "stan",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.deepEqual(plan, {
    threadId: "thread-9",
    title: "Fresh thread",
    xHandle: "stan",
    createdAt: "2026-03-13T12:00:00.000Z",
    updatedAt: "2026-03-13T12:00:00.000Z",
    replaceIds: ["current-workspace"],
  });

  const remapped = applyCreatedThreadPlanToList(
    [
      { id: "current-workspace", title: "Drafting", updatedAt: "old" },
      { id: "thread-2", title: "Existing", updatedAt: "old-2" },
    ],
    plan!,
  );

  assert.equal(remapped[0]?.id, "thread-9");
  assert.equal(remapped[0]?.title, "Drafting");

  const inserted = applyCreatedThreadPlanToList([], plan!);
  assert.equal(inserted[0]?.id, "thread-9");
  assert.equal(inserted[0]?.title, "Fresh thread");
});

test("readChatResponseStream returns the final result and emits status updates", async () => {
  const statusMessages: string[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ type: "status", message: "planning" }) +
            "\n" +
            JSON.stringify({
              type: "result",
              data: {
                reply: "done",
              },
            }),
        ),
      );
      controller.close();
    },
  });

  const result = await readChatResponseStream<{ reply: string }>({
    body,
    onStatus: (message) => statusMessages.push(message),
  });

  assert.equal(result.reply, "done");
  assert.deepEqual(statusMessages, ["planning"]);
});
