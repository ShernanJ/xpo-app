import { checkDraftClaimsAgainstGrounding } from "./claimChecker.ts";
import type { GroundingPacket } from "./groundingPacket.ts";
import type {
  RuntimeValidationResult,
  RuntimeValidationStatus,
  RuntimeWorkerExecution,
} from "../runtime/runtimeContracts.ts";

export interface RevisionValidationWorkerRequest {
  capability: "revising";
  draft: string;
  groundingPacket: GroundingPacket;
}

export interface RevisionValidationWorkerResult {
  claimCheck: ReturnType<typeof checkDraftClaimsAgainstGrounding>;
  validationStatus: RuntimeValidationStatus;
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

const REVISION_VALIDATION_GROUP_ID = "revision_validation";

export function runRevisionValidationWorkers(
  args: RevisionValidationWorkerRequest,
): RevisionValidationWorkerResult {
  const claimCheck = checkDraftClaimsAgainstGrounding({
    draft: args.draft,
    groundingPacket: args.groundingPacket,
  });
  const validationStatus = claimCheck.needsClarification
    ? "clarification_required"
    : claimCheck.hasUnsupportedClaims || claimCheck.issues.length > 0
      ? "failed"
      : "passed";

  return {
    claimCheck,
    validationStatus,
    workerExecutions: [
      {
        worker: "claim_checker",
        capability: args.capability,
        phase: "validation",
        mode: "sequential",
        status: "completed",
        groupId: REVISION_VALIDATION_GROUP_ID,
        details: {
          status: validationStatus,
          issueCount: claimCheck.issues.length,
        },
      },
    ],
    validations: [
      {
        validator: "claim_checker",
        capability: args.capability,
        status: validationStatus,
        issues: claimCheck.issues,
        corrected: Boolean(claimCheck.draft && claimCheck.draft !== args.draft),
      },
    ],
  };
}
