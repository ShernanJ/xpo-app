import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCreatedThreadPlanToList,
  buildAssistantMessageFromChatResult,
  readChatResponseStream,
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
