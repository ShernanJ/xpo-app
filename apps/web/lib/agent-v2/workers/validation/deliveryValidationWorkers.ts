import type { DraftFormatPreference } from "../../contracts/chat.ts";
import type {
  CapabilityName,
  RuntimeValidationResult,
  RuntimeValidationStatus,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
} from "../../runtime/workerPlane.ts";
import {
  validateDelivery,
  type DeliveryValidationIssue,
  type DeliveryValidationIssueCode,
} from "../../validators/shared/deliveryValidators.ts";

export interface DeliveryValidationWorkerRequest {
  capability: "drafting" | "revising";
  groupId: string;
  draft: string;
  formatPreference: DraftFormatPreference;
  sourceUserMessage?: string | null;
}

export interface DeliveryValidationWorkerResult {
  validationStatus: RuntimeValidationStatus;
  hasFailures: boolean;
  hasBlockingFailures: boolean;
  correctedDraft: string;
  issues: DeliveryValidationIssue[];
  retryConstraints: string[];
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

const WORKER_CONFIG: Array<{
  code: DeliveryValidationIssueCode;
  worker: string;
  validator: string;
  appliesTo: (formatPreference: DraftFormatPreference) => boolean;
}> = [
  {
    code: "truncation",
    worker: "truncation_guard",
    validator: "truncation_guard",
    appliesTo: () => true,
  },
  {
    code: "prompt_echo",
    worker: "prompt_echo_guard",
    validator: "prompt_echo_guard",
    appliesTo: () => true,
  },
  {
    code: "artifact_mismatch",
    worker: "artifact_shape_guard",
    validator: "artifact_shape_guard",
    appliesTo: () => true,
  },
  {
    code: "thread_separator_cleanup",
    worker: "thread_separator_guard",
    validator: "thread_separator_guard",
    appliesTo: (formatPreference) => formatPreference === "thread",
  },
  {
    code: "thread_post_shape_mismatch",
    worker: "thread_shape_guard",
    validator: "thread_shape_guard",
    appliesTo: (formatPreference) => formatPreference === "thread",
  },
  {
    code: "thread_hook_summary",
    worker: "thread_hook_guard",
    validator: "thread_hook_guard",
    appliesTo: (formatPreference) => formatPreference === "thread",
  },
  {
    code: "autobiographical_perspective_drift",
    worker: "autobiographical_perspective_guard",
    validator: "autobiographical_perspective_guard",
    appliesTo: () => true,
  },
];

function resolveIssueStatus(issue?: DeliveryValidationIssue): RuntimeValidationStatus {
  return issue ? "failed" : "passed";
}

export function runDeliveryValidationWorkers(
  args: DeliveryValidationWorkerRequest,
): DeliveryValidationWorkerResult {
  const result = validateDelivery({
    draft: args.draft,
    formatPreference: args.formatPreference,
    sourceUserMessage: args.sourceUserMessage,
  });
  const blockingIssues = result.issues.filter((issue) => !issue.corrected);
  const issueByCode = new Map(result.issues.map((issue) => [issue.code, issue]));

  const workerExecutions = WORKER_CONFIG.map((config) => {
    const applicable = config.appliesTo(args.formatPreference);
    const issue = issueByCode.get(config.code);

    return buildRuntimeWorkerExecution({
      worker: config.worker,
      capability: args.capability,
      phase: "validation",
      mode: "sequential",
      status: applicable ? "completed" : "skipped",
      groupId: args.groupId,
      details: {
        status: applicable ? resolveIssueStatus(issue) : "skipped",
        issueCount: issue ? 1 : 0,
        corrected: issue?.corrected ?? false,
      },
    });
  });

  const validations = WORKER_CONFIG.flatMap((config) => {
    if (!config.appliesTo(args.formatPreference)) {
      return [];
    }

    const issue = issueByCode.get(config.code);
    return [
      buildRuntimeValidationResult({
        validator: config.validator,
        capability: args.capability as CapabilityName,
        status: resolveIssueStatus(issue),
        issues: issue ? [issue.message] : [],
        corrected: issue?.corrected ?? false,
      }),
    ];
  });

  return {
    validationStatus: result.issues.length > 0 ? "failed" : "passed",
    hasFailures: result.issues.length > 0,
    hasBlockingFailures: blockingIssues.length > 0,
    correctedDraft: result.correctedDraft,
    issues: result.issues,
    retryConstraints: result.retryConstraints,
    workerExecutions,
    validations,
  };
}
