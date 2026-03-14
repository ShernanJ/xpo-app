import type {
  RuntimePersistedStateChanges,
  RuntimePersistenceTracePatch,
  RuntimeWorkerExecution,
  RuntimeWorkerExecutionSummary,
} from "./runtimeContracts.ts";

export function summarizeRuntimeWorkerExecutions(
  executions: RuntimeWorkerExecution[],
): RuntimeWorkerExecutionSummary {
  const groups = Array.from(
    new Set(
      executions
        .map((execution) => execution.groupId)
        .filter((groupId): groupId is string => typeof groupId === "string" && groupId.length > 0),
    ),
  );

  return {
    total: executions.length,
    parallel: executions.filter((execution) => execution.mode === "parallel").length,
    sequential: executions.filter((execution) => execution.mode === "sequential").length,
    completed: executions.filter((execution) => execution.status === "completed").length,
    skipped: executions.filter((execution) => execution.status === "skipped").length,
    failed: executions.filter((execution) => execution.status === "failed").length,
    groups,
  };
}

export function mergeRuntimeWorkerExecutions(
  existingExecutions: RuntimeWorkerExecution[],
  appendedExecutions: RuntimeWorkerExecution[],
): {
  executions: RuntimeWorkerExecution[];
  summary: RuntimeWorkerExecutionSummary;
} {
  const executions = [...existingExecutions, ...appendedExecutions];
  return {
    executions,
    summary: summarizeRuntimeWorkerExecutions(executions),
  };
}

export function mergeRuntimePersistedStateChanges(
  current: RuntimePersistedStateChanges | null | undefined,
  next: RuntimePersistedStateChanges | null | undefined,
): RuntimePersistedStateChanges | null {
  if (!current) {
    return next ?? null;
  }
  if (!next) {
    return current;
  }

  return {
    assistantMessageId: next.assistantMessageId ?? current.assistantMessageId,
    thread: next.thread ?? current.thread,
    memory: next.memory ?? current.memory,
    draftCandidates: next.draftCandidates ?? current.draftCandidates,
  };
}

export function applyRuntimePersistenceTracePatch<
  TTrace extends {
    workerExecutions: RuntimeWorkerExecution[];
    workerExecutionSummary: RuntimeWorkerExecutionSummary;
    persistedStateChanges: RuntimePersistedStateChanges | null;
  },
>(
  trace: TTrace,
  patch: RuntimePersistenceTracePatch | null | undefined,
): TTrace {
  if (!patch) {
    return trace;
  }

  const mergedWorkers = mergeRuntimeWorkerExecutions(
    trace.workerExecutions,
    patch.workerExecutions,
  );
  trace.workerExecutions = mergedWorkers.executions;
  trace.workerExecutionSummary = mergedWorkers.summary;
  trace.persistedStateChanges = mergeRuntimePersistedStateChanges(
    trace.persistedStateChanges,
    patch.persistedStateChanges,
  );
  return trace;
}
