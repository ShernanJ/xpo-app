import type {
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
