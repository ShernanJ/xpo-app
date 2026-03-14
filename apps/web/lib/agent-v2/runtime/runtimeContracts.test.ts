import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRuntimePersistenceTracePatch,
  summarizeRuntimeWorkerExecutions,
} from "./runtimeTrace.ts";

test("summarizeRuntimeWorkerExecutions counts parallel groups and statuses", () => {
  const summary = summarizeRuntimeWorkerExecutions([
    {
      worker: "extract_style_rules",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: "completed",
      groupId: "initial_context_load",
    },
    {
      worker: "extract_core_facts",
      capability: "shared",
      phase: "context_load",
      mode: "parallel",
      status: "completed",
      groupId: "initial_context_load",
    },
    {
      worker: "claim_checker",
      capability: "drafting",
      phase: "validation",
      mode: "sequential",
      status: "failed",
      groupId: null,
    },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    parallel: 2,
    sequential: 1,
    completed: 2,
    skipped: 0,
    failed: 1,
    groups: ["initial_context_load"],
  });
});

test("applyRuntimePersistenceTracePatch appends persistence workers and merges persisted state changes", () => {
  const trace = {
    workerExecutions: [
      {
        worker: "initial_context_load",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "initial_context_load",
      },
    ],
    workerExecutionSummary: summarizeRuntimeWorkerExecutions([
      {
        worker: "initial_context_load",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: "initial_context_load",
      },
    ]),
    persistedStateChanges: null,
  };

  applyRuntimePersistenceTracePatch(trace, {
    workerExecutions: [
      {
        worker: "persist_assistant_message",
        capability: "shared",
        phase: "persistence",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          threadId: "thread-1",
        },
      },
      {
        worker: "create_draft_candidate",
        capability: "shared",
        phase: "persistence",
        mode: "parallel",
        status: "completed",
        groupId: "chat_route_persistence_draft_candidates",
        details: {
          title: "Option one",
        },
      },
    ],
    persistedStateChanges: {
      assistantMessageId: "assistant-msg-1",
      thread: {
        threadId: "thread-1",
        updatedTitle: "Updated title",
        titleChanged: true,
      },
      memory: {
        updated: true,
        preferredSurfaceMode: "structured",
        activeDraftVersionId: "version-1",
        clearedReplyWorkflow: false,
        selectedReplyOptionId: null,
      },
      draftCandidates: {
        attempted: 1,
        created: 1,
        skipped: 0,
      },
    },
  });

  assert.equal(trace.workerExecutions.length, 3);
  assert.equal(trace.workerExecutions[2]?.phase, "persistence");
  assert.deepEqual(trace.workerExecutionSummary, {
    total: 3,
    parallel: 2,
    sequential: 1,
    completed: 3,
    skipped: 0,
    failed: 0,
    groups: [
      "initial_context_load",
      "chat_route_persistence_draft_candidates",
    ],
  });
  assert.deepEqual(trace.persistedStateChanges, {
    assistantMessageId: "assistant-msg-1",
    thread: {
      threadId: "thread-1",
      updatedTitle: "Updated title",
      titleChanged: true,
    },
    memory: {
      updated: true,
      preferredSurfaceMode: "structured",
      activeDraftVersionId: "version-1",
      clearedReplyWorkflow: false,
      selectedReplyOptionId: null,
    },
    draftCandidates: {
      attempted: 1,
      created: 1,
      skipped: 0,
    },
  });
});
