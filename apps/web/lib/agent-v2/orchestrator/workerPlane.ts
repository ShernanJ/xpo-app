import type {
  CapabilityName,
  RuntimeValidationResult,
  RuntimeValidationStatus,
  RuntimeWorkerExecution,
  RuntimeWorkerMode,
  RuntimeWorkerPhase,
  RuntimeWorkerStatus,
} from "../runtime/runtimeContracts.ts";

export interface RuntimeExecutionMeta {
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

export function buildRuntimeWorkerExecution(args: {
  worker: string;
  capability: CapabilityName;
  phase: RuntimeWorkerPhase;
  mode: RuntimeWorkerMode;
  status: RuntimeWorkerStatus;
  groupId: string | null;
  details?: Record<string, unknown> | null;
}): RuntimeWorkerExecution {
  return {
    worker: args.worker,
    capability: args.capability,
    phase: args.phase,
    mode: args.mode,
    status: args.status,
    groupId: args.groupId,
    details: args.details ?? undefined,
  };
}

export function buildRuntimeValidationResult(args: {
  validator: string;
  capability: CapabilityName;
  status: RuntimeValidationStatus;
  issues: string[];
  corrected: boolean;
}): RuntimeValidationResult {
  return {
    validator: args.validator,
    capability: args.capability,
    status: args.status,
    issues: args.issues,
    corrected: args.corrected,
  };
}

export function resolveRuntimeValidationStatus(args: {
  needsClarification?: boolean;
  hasFailure?: boolean;
}): RuntimeValidationStatus {
  if (args.needsClarification) {
    return "clarification_required";
  }

  return args.hasFailure ? "failed" : "passed";
}

export function mergeRuntimeExecutionMeta(
  ...parts: Array<Partial<RuntimeExecutionMeta> | null | undefined>
): RuntimeExecutionMeta {
  return {
    workerExecutions: parts.flatMap((part) => part?.workerExecutions ?? []),
    validations: parts.flatMap((part) => part?.validations ?? []),
  };
}
