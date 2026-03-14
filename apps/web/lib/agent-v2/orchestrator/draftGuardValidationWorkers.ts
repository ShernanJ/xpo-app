import {
  assessConcreteSceneDrift,
  assessGroundedProductDrift,
} from "./draftGrounding.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../runtime/runtimeContracts.ts";

export interface DraftGuardValidationRequest {
  capability: "drafting";
  groupId: string;
  sourceUserMessage?: string | null;
  draft: string;
  activeConstraints: string[];
}

export interface DraftGuardValidationResult {
  concreteSceneAssessment: ReturnType<typeof assessConcreteSceneDrift>;
  groundedProductAssessment: ReturnType<typeof assessGroundedProductDrift>;
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

export async function runDraftGuardValidationWorkers(
  args: DraftGuardValidationRequest,
): Promise<DraftGuardValidationResult> {
  const [concreteSceneAssessment, groundedProductAssessment] = await Promise.all([
    Promise.resolve(
      assessConcreteSceneDrift({
        sourceUserMessage: args.sourceUserMessage,
        draft: args.draft,
      }),
    ),
    Promise.resolve(
      assessGroundedProductDrift({
        activeConstraints: args.activeConstraints,
        sourceUserMessage: args.sourceUserMessage,
        draft: args.draft,
      }),
    ),
  ]);

  return {
    concreteSceneAssessment,
    groundedProductAssessment,
    workerExecutions: [
      {
        worker: "concrete_scene_guard",
        capability: args.capability,
        phase: "validation",
        mode: "parallel",
        status: "completed",
        groupId: args.groupId,
        details: {
          hasDrift: concreteSceneAssessment.hasDrift,
          reason: concreteSceneAssessment.reason || null,
        },
      },
      {
        worker: "grounded_product_guard",
        capability: args.capability,
        phase: "validation",
        mode: "parallel",
        status: "completed",
        groupId: args.groupId,
        details: {
          hasDrift: groundedProductAssessment.hasDrift,
          reason: groundedProductAssessment.reason || null,
        },
      },
    ],
    validations: [
      {
        validator: "concrete_scene_guard",
        capability: args.capability,
        status: concreteSceneAssessment.hasDrift ? "failed" : "passed",
        issues: concreteSceneAssessment.hasDrift
          ? [concreteSceneAssessment.reason || "Concrete scene drift."]
          : [],
        corrected: false,
      },
      {
        validator: "grounded_product_guard",
        capability: args.capability,
        status: groundedProductAssessment.hasDrift ? "failed" : "passed",
        issues: groundedProductAssessment.hasDrift
          ? [groundedProductAssessment.reason || "Grounded product drift."]
          : [],
        corrected: false,
      },
    ],
  };
}
