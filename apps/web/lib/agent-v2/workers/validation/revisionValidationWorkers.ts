import { checkDraftClaimsAgainstGrounding } from "../../orchestrator/claimChecker.ts";
import type { GroundingPacket } from "../../orchestrator/groundingPacket.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
  mergeRuntimeExecutionMeta,
  resolveRuntimeValidationStatus,
} from "../../orchestrator/workerPlane.ts";
import type { DraftFormatPreference } from "../../contracts/chat.ts";
import type {
  RuntimeValidationResult,
  RuntimeValidationStatus,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import { runDeliveryValidationWorkers } from "./deliveryValidationWorkers.ts";

export interface RevisionValidationWorkerRequest {
  capability: "revising";
  draft: string;
  groundingPacket: GroundingPacket;
  formatPreference: DraftFormatPreference;
  sourceUserMessage?: string | null;
  groupId?: string;
}

export interface RevisionValidationWorkerResult {
  claimCheck: ReturnType<typeof checkDraftClaimsAgainstGrounding>;
  validationStatus: RuntimeValidationStatus;
  hasDeliveryFailures: boolean;
  retryConstraints: string[];
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

const REVISION_VALIDATION_GROUP_ID = "revision_delivery_validation_initial";

export function runRevisionValidationWorkers(
  args: RevisionValidationWorkerRequest,
): RevisionValidationWorkerResult {
  const groupId = args.groupId ?? REVISION_VALIDATION_GROUP_ID;
  const claimCheck = checkDraftClaimsAgainstGrounding({
    draft: args.draft,
    groundingPacket: args.groundingPacket,
  });
  const claimValidationStatus = resolveRuntimeValidationStatus({
    needsClarification: claimCheck.needsClarification,
    hasFailure: claimCheck.hasUnsupportedClaims || claimCheck.issues.length > 0,
  });
  const claimWorker = buildRuntimeWorkerExecution({
    worker: "claim_checker",
    capability: args.capability,
    phase: "validation",
    mode: "sequential",
    status: "completed",
    groupId,
    details: {
      status: claimValidationStatus,
      issueCount: claimCheck.issues.length,
    },
  });
  const claimValidation = buildRuntimeValidationResult({
    validator: "claim_checker",
    capability: args.capability,
    status: claimValidationStatus,
    issues: claimCheck.issues,
    corrected: Boolean(claimCheck.draft && claimCheck.draft !== args.draft),
  });

  if (claimCheck.needsClarification) {
    return {
      claimCheck,
      validationStatus: claimValidationStatus,
      hasDeliveryFailures: false,
      retryConstraints: [],
      workerExecutions: [claimWorker],
      validations: [claimValidation],
    };
  }

  const draftForDeliveryValidation = claimCheck.draft || args.draft;
  const deliveryValidation = runDeliveryValidationWorkers({
    capability: args.capability,
    groupId,
    draft: draftForDeliveryValidation,
    formatPreference: args.formatPreference,
    sourceUserMessage: args.sourceUserMessage,
  });
  const validationStatus = resolveRuntimeValidationStatus({
    hasFailure:
      claimCheck.hasUnsupportedClaims ||
      claimCheck.issues.length > 0 ||
      deliveryValidation.hasFailures,
  });
  const mergedMeta = mergeRuntimeExecutionMeta(
    {
      workerExecutions: [claimWorker],
      validations: [claimValidation],
    },
    deliveryValidation,
  );

  return {
    claimCheck,
    validationStatus,
    hasDeliveryFailures: deliveryValidation.hasFailures,
    retryConstraints: deliveryValidation.retryConstraints,
    workerExecutions: mergedMeta.workerExecutions,
    validations: mergedMeta.validations,
  };
}
