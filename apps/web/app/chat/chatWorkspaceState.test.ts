import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatWorkspaceReset,
  resolveCreatedThreadWorkspaceUpdate,
  resolveWorkspaceHandle,
} from "./chatWorkspaceState.ts";

test("resolveWorkspaceHandle prefers the URL handle over the session handle", () => {
  assert.equal(
    resolveWorkspaceHandle({
      searchHandle: " @StanFromUrl ",
      sessionHandle: "StanFromSession",
    }),
    "stanfromurl",
  );

  assert.equal(
    resolveWorkspaceHandle({
      searchHandle: "   ",
      sessionHandle: " @StanFromSession ",
    }),
    "stanfromsession",
  );

  assert.equal(
    resolveWorkspaceHandle({
      searchHandle: null,
      sessionHandle: null,
    }),
    null,
  );
});

test("buildChatWorkspaceReset returns the current thread reset payload", () => {
  assert.deepEqual(buildChatWorkspaceReset("thread"), {
    activeThreadId: null,
    threadCreatedInSession: false,
    messages: [],
    draftInput: "",
    conversationMemory: null,
    activeDraftEditor: null,
    editorDraftText: "",
    editorDraftPosts: [],
    errorMessage: null,
    isLeavingHero: false,
    typedAssistantLengths: {},
    activeDraftRevealByMessageId: {},
    revealedDraftMessageIds: {},
  });
});

test("buildChatWorkspaceReset returns the current workspace reset payload", () => {
  const defaultToneInputs = {
    toneCasing: "normal" as const,
    toneRisk: "safe" as const,
  };
  const defaultStrategyInputs = {
    goal: "followers" as const,
    postingCadenceCapacity: "1_per_day" as const,
    replyBudgetPerDay: "5_15" as const,
    transformationMode: "optimize" as const,
  };

  assert.deepEqual(
    buildChatWorkspaceReset("workspace", {
      defaultToneInputs,
      defaultStrategyInputs,
    }),
    {
      context: null,
      contract: null,
      messages: [],
      draftInput: "",
      errorMessage: null,
      streamStatus: null,
      isWorkspaceInitializing: false,
      analysisOpen: false,
      backfillNotice: null,
      isAnalysisScrapeRefreshing: false,
      analysisScrapeNotice: null,
      analysisScrapeCooldownUntil: null,
      activeContentFocus: null,
      toneInputs: defaultToneInputs,
      activeToneInputs: null,
      activeStrategyInputs: defaultStrategyInputs,
      activeDraftEditor: null,
      editorDraftText: "",
      editorDraftPosts: [],
      draftQueueItems: [],
      draftQueueError: null,
      editingDraftCandidateId: null,
      editingDraftCandidateText: "",
      typedAssistantLengths: {},
      activeDraftRevealByMessageId: {},
      revealedDraftMessageIds: {},
      isLeavingHero: false,
    },
  );
});

test("resolveCreatedThreadWorkspaceUpdate preserves placeholder replacement behavior", () => {
  const update = resolveCreatedThreadWorkspaceUpdate({
    currentThreads: [
      { id: "current-workspace", title: "Drafting", updatedAt: "old" },
      { id: "thread-2", title: "Existing", updatedAt: "older" },
    ],
    newThreadId: "thread-9",
    threadTitle: "Fresh thread",
    activeThreadId: null,
    accountName: "stan",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.deepEqual(update, {
    nextActiveThreadId: "thread-9",
    nextHistoryThreadId: "thread-9",
    nextChatThreads: [
      { id: "thread-9", title: "Drafting", updatedAt: "old" },
      { id: "thread-2", title: "Existing", updatedAt: "older" },
    ],
    threadCreatedInSession: true,
  });
});

test("resolveCreatedThreadWorkspaceUpdate inserts a new thread when no placeholder exists", () => {
  const update = resolveCreatedThreadWorkspaceUpdate({
    currentThreads: [],
    newThreadId: "thread-10",
    threadTitle: " Fresh thread ",
    activeThreadId: null,
    accountName: "stan",
    now: new Date("2026-03-13T12:00:00.000Z"),
  });

  assert.deepEqual(update, {
    nextActiveThreadId: "thread-10",
    nextHistoryThreadId: "thread-10",
    nextChatThreads: [
      {
        id: "thread-10",
        title: "Fresh thread",
        xHandle: "stan",
        createdAt: "2026-03-13T12:00:00.000Z",
        updatedAt: "2026-03-13T12:00:00.000Z",
      },
    ],
    threadCreatedInSession: true,
  });
});
