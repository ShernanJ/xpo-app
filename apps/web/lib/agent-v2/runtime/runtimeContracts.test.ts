import test from "node:test";
import assert from "node:assert/strict";

import { summarizeRuntimeWorkerExecutions } from "./runtimeTrace.ts";

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
