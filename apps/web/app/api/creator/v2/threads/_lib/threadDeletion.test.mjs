import test from "node:test";
import assert from "node:assert/strict";

import { deleteThreadWithDraftCandidates } from "./threadDeletion.ts";

test("deleteThreadWithDraftCandidates removes linked draft candidates before deleting the thread", async () => {
  const calls = [];

  const result = await deleteThreadWithDraftCandidates("thread_123", {
    deleteDraftCandidates: async ({ threadId }) => {
      calls.push(["deleteDraftCandidates", threadId]);
      return { count: 3 };
    },
    deleteThread: async ({ threadId }) => {
      calls.push(["deleteThread", threadId]);
    },
  });

  assert.deepEqual(calls, [
    ["deleteDraftCandidates", "thread_123"],
    ["deleteThread", "thread_123"],
  ]);
  assert.deepEqual(result, { deletedDraftCandidateCount: 3 });
});
