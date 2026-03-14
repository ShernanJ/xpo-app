import type {
  CapabilityName,
  RuntimeValidationResult,
  RuntimeValidationStatus,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
} from "../../orchestrator/workerPlane.ts";
import {
  validateConversationalDelivery,
  type ConversationDeliveryValidationIssue,
  type ConversationDeliveryValidationIssueCode,
} from "../../validators/shared/conversationDeliveryValidators.ts";

export interface ConversationValidationWorkerRequest {
  capability: "replying" | "analysis";
  groupId: string;
  response: string;
  sourceUserMessage?: string | null;
}

export interface ConversationValidationWorkerResult {
  validationStatus: RuntimeValidationStatus;
  hasFailures: boolean;
  correctedResponse: string;
  issues: ConversationDeliveryValidationIssue[];
  retryConstraints: string[];
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

const WORKER_CONFIG: Array<{
  code: ConversationDeliveryValidationIssueCode;
  worker: string;
  validator: string;
}> = [
  {
    code: "truncation",
    worker: "truncation_guard",
    validator: "truncation_guard",
  },
  {
    code: "prompt_echo",
    worker: "prompt_echo_guard",
    validator: "prompt_echo_guard",
  },
];

function resolveIssueStatus(issue?: ConversationDeliveryValidationIssue): RuntimeValidationStatus {
  return issue ? "failed" : "passed";
}

export function runConversationValidationWorkers(
  args: ConversationValidationWorkerRequest,
): ConversationValidationWorkerResult {
  const result = validateConversationalDelivery({
    response: args.response,
    sourceUserMessage: args.sourceUserMessage,
  });
  const issueByCode = new Map(result.issues.map((issue) => [issue.code, issue]));

  const workerExecutions = WORKER_CONFIG.map((config) => {
    const issue = issueByCode.get(config.code);
    return buildRuntimeWorkerExecution({
      worker: config.worker,
      capability: args.capability,
      phase: "validation",
      mode: "sequential",
      status: "completed",
      groupId: args.groupId,
      details: {
        status: resolveIssueStatus(issue),
        issueCount: issue ? 1 : 0,
        corrected: issue?.corrected ?? false,
      },
    });
  });

  const validations = WORKER_CONFIG.map((config) => {
    const issue = issueByCode.get(config.code);
    return buildRuntimeValidationResult({
      validator: config.validator,
      capability: args.capability as CapabilityName,
      status: resolveIssueStatus(issue),
      issues: issue ? [issue.message] : [],
      corrected: issue?.corrected ?? false,
    });
  });

  return {
    validationStatus: result.issues.length > 0 ? "failed" : "passed",
    hasFailures: result.issues.length > 0,
    correctedResponse: result.correctedResponse,
    issues: result.issues,
    retryConstraints: result.retryConstraints,
    workerExecutions,
    validations,
  };
}
