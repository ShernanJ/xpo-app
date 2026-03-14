import type { WriterOutput } from "../../agents/writer.ts";
import type { CriticOutput } from "../../agents/critic.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  DraftFormatPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { GroundingPacket } from "../../orchestrator/groundingPacket.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../orchestrator/draftPipelineHelpers.ts";
import type { DraftingCapabilityRunResult } from "./draftingCapability.ts";
import {
  buildGroundedProductRetryConstraint,
  buildUnsupportedClaimRetryConstraint,
  buildConcreteSceneRetryConstraint,
} from "../../orchestrator/draftGrounding.ts";
import { checkDraftClaimsAgainstGrounding } from "../../orchestrator/claimChecker.ts";
import { runDraftGuardValidationWorkers } from "../../orchestrator/draftGuardValidationWorkers.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
  resolveRuntimeValidationStatus,
} from "../../orchestrator/workerPlane.ts";
import { runDeliveryValidationWorkers } from "../../workers/validation/deliveryValidationWorkers.ts";
import type {
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import type { ThreadFramingStyle } from "../../../onboarding/shared/draftArtifacts.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

export interface DraftingAttemptResult {
  writerOutput: WriterOutput | null;
  criticOutput: CriticOutput | null;
  draftToDeliver: string | null;
  voiceTarget: VoiceTarget;
  retrievalReasons: string[];
  threadFramingStyle: ThreadFramingStyle | null;
}

interface CheckedDraftingAttempt {
  writerOutput: WriterOutput;
  criticOutput: CriticOutput;
  draftToDeliver: string;
  voiceTarget: VoiceTarget;
  retrievalReasons: string[];
  threadFramingStyle: ThreadFramingStyle | null;
  hasUnsupportedClaims: boolean;
  claimNeedsClarification: boolean;
}

interface ClarificationResponseArgs {
  question: string;
  traceReason:
    | "claim_needs_clarification"
    | "concrete_scene_drift"
    | "product_drift";
  topicSummary?: string;
  pendingPlan?: StrategyPlan;
}

export async function runGroundedDraftRetry(
  args: {
    memory: V2ConversationMemory;
    plan: StrategyPlan;
    activeConstraints: string[];
    sourceUserMessage?: string;
    formatPreference: DraftFormatPreference;
    topicSummary?: string;
    pendingPlan?: StrategyPlan;
    draftGroundingPacket: GroundingPacket;
    attemptDraft: (extraConstraints?: string[]) => Promise<DraftingAttemptResult>;
    buildConcreteSceneClarificationQuestion: (sourceUserMessage: string) => string;
    buildGroundedProductClarificationQuestion: (sourceUserMessage: string) => string;
    returnClarificationQuestion: (
      args: ClarificationResponseArgs,
    ) => Promise<RawOrchestratorResponse>;
    returnDeliveryValidationFallback: (args: {
      issues: string[];
    }) => Promise<RawOrchestratorResponse>;
  },
): Promise<DraftingCapabilityRunResult> {
  const localWorkers: RuntimeWorkerExecution[] = [];
  const localValidations: RuntimeValidationResult[] = [];
  let routingTracePatch: RoutingTracePatch | undefined;

  const buildWriteFailure = (): DraftingCapabilityRunResult => ({
    kind: "response",
    response: {
      mode: "error",
      outputShape: "coach_question",
      response: "Failed to write draft.",
      memory: args.memory,
    },
    workers: localWorkers,
    validations: localValidations,
    routingTracePatch,
  });

  const buildCritiqueFailure = (): DraftingCapabilityRunResult => ({
    kind: "response",
    response: {
      mode: "error",
      outputShape: "coach_question",
      response: "Failed to critique draft.",
      memory: args.memory,
    },
    workers: localWorkers,
    validations: localValidations,
    routingTracePatch,
  });

  const applyClaimCheck = (
    attempt: Exclude<DraftingAttemptResult["writerOutput"], null> extends never
      ? never
      : {
          writerOutput: WriterOutput;
          criticOutput: CriticOutput;
          draftToDeliver: string;
          voiceTarget: VoiceTarget;
          retrievalReasons: string[];
          threadFramingStyle: ThreadFramingStyle | null;
        },
  ): CheckedDraftingAttempt => {
    const claimCheck = checkDraftClaimsAgainstGrounding({
      draft: attempt.draftToDeliver,
      groundingPacket: args.draftGroundingPacket,
    });
    const validationStatus = resolveRuntimeValidationStatus({
      needsClarification: claimCheck.needsClarification,
      hasFailure: claimCheck.hasUnsupportedClaims || claimCheck.issues.length > 0,
    });

    localWorkers.push(buildRuntimeWorkerExecution({
      worker: "claim_checker",
      capability: "drafting",
      phase: "validation",
      mode: "sequential",
      status: "completed",
      groupId: null,
      details: {
        status: validationStatus,
        issueCount: claimCheck.issues.length,
      },
    }));
    localValidations.push(buildRuntimeValidationResult({
      validator: "claim_checker",
      capability: "drafting",
      status: validationStatus,
      issues: claimCheck.issues,
      corrected: Boolean(claimCheck.draft && claimCheck.draft !== attempt.draftToDeliver),
    }));

    return {
      ...attempt,
      criticOutput: {
        ...attempt.criticOutput,
        finalDraft: claimCheck.draft || attempt.criticOutput.finalDraft,
        issues: Array.from(new Set([...attempt.criticOutput.issues, ...claimCheck.issues])),
      },
      draftToDeliver: claimCheck.draft || attempt.draftToDeliver,
      hasUnsupportedClaims: claimCheck.hasUnsupportedClaims,
      claimNeedsClarification: claimCheck.needsClarification,
    };
  };

  const buildProductClarification = async (
    traceReason: "claim_needs_clarification" | "product_drift",
  ): Promise<RawOrchestratorResponse> =>
    args.returnClarificationQuestion({
      question: args.buildGroundedProductClarificationQuestion(
        args.sourceUserMessage || args.plan.objective,
      ),
      traceReason,
      ...(args.topicSummary !== undefined
        ? { topicSummary: args.topicSummary }
        : {}),
      ...(args.pendingPlan !== undefined
        ? { pendingPlan: args.pendingPlan }
        : {}),
    });

  const firstAttempt = await args.attemptDraft();
  if (!firstAttempt.writerOutput) {
    return buildWriteFailure();
  }
  if (!firstAttempt.criticOutput || !firstAttempt.draftToDeliver) {
    return buildCritiqueFailure();
  }

  const firstAttemptWithClaimCheck = applyClaimCheck({
    writerOutput: firstAttempt.writerOutput,
    criticOutput: firstAttempt.criticOutput,
    draftToDeliver: firstAttempt.draftToDeliver,
    voiceTarget: firstAttempt.voiceTarget,
    retrievalReasons: firstAttempt.retrievalReasons,
    threadFramingStyle: firstAttempt.threadFramingStyle,
  });

  if (firstAttemptWithClaimCheck.claimNeedsClarification) {
    routingTracePatch = {
      ...routingTracePatch,
      draftGuard: {
        reason: "claim_needs_clarification",
        issues: firstAttemptWithClaimCheck.criticOutput.issues,
      },
    };
    return {
      kind: "response",
      response: await buildProductClarification("claim_needs_clarification"),
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

  const firstDeliveryValidation = runDeliveryValidationWorkers({
    capability: "drafting",
    groupId: "draft_delivery_validation_initial",
    draft: firstAttemptWithClaimCheck.draftToDeliver,
    formatPreference: args.formatPreference,
    sourceUserMessage: args.sourceUserMessage,
  });
  localWorkers.push(...firstDeliveryValidation.workerExecutions);
  localValidations.push(...firstDeliveryValidation.validations);

  let firstAssessment = { hasDrift: false, reason: null as string | null };
  let firstProductAssessment = { hasDrift: false, reason: null as string | null };

  if (!firstDeliveryValidation.hasFailures) {
    const firstValidation = await runDraftGuardValidationWorkers({
      capability: "drafting",
      groupId: "draft_guard_validation_initial",
      activeConstraints: args.activeConstraints,
      sourceUserMessage: args.sourceUserMessage,
      draft: firstAttemptWithClaimCheck.draftToDeliver,
    });
    localWorkers.push(...firstValidation.workerExecutions);
    localValidations.push(...firstValidation.validations);
    firstAssessment = firstValidation.concreteSceneAssessment;
    firstProductAssessment = firstValidation.groundedProductAssessment;
  }

  if (
    !firstDeliveryValidation.hasFailures &&
    !firstAssessment.hasDrift &&
    !firstProductAssessment.hasDrift &&
    !firstAttemptWithClaimCheck.hasUnsupportedClaims
  ) {
    return {
      kind: "success",
      writerOutput: firstAttemptWithClaimCheck.writerOutput,
      criticOutput: firstAttemptWithClaimCheck.criticOutput,
      draftToDeliver: firstAttemptWithClaimCheck.draftToDeliver,
      voiceTarget: firstAttemptWithClaimCheck.voiceTarget,
      retrievalReasons: firstAttemptWithClaimCheck.retrievalReasons,
      threadFramingStyle: firstAttemptWithClaimCheck.threadFramingStyle,
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

  const retryConstraints = [
    ...(firstAttemptWithClaimCheck.hasUnsupportedClaims
      ? [buildUnsupportedClaimRetryConstraint()]
      : []),
    ...firstDeliveryValidation.retryConstraints,
    ...(firstDeliveryValidation.hasFailures
      ? []
      : firstAssessment.hasDrift
      ? [buildConcreteSceneRetryConstraint(args.sourceUserMessage || "")]
      : []),
    ...(firstDeliveryValidation.hasFailures
      ? []
      : firstProductAssessment.hasDrift
      ? [buildGroundedProductRetryConstraint()]
      : []),
  ].filter(Boolean) as string[];

  const secondAttempt = retryConstraints.length > 0
    ? await args.attemptDraft(retryConstraints)
    : firstAttempt;
  if (!secondAttempt.writerOutput) {
    return buildWriteFailure();
  }
  if (!secondAttempt.criticOutput || !secondAttempt.draftToDeliver) {
    return buildCritiqueFailure();
  }

  const secondAttemptWithClaimCheck = applyClaimCheck({
    writerOutput: secondAttempt.writerOutput,
    criticOutput: secondAttempt.criticOutput,
    draftToDeliver: secondAttempt.draftToDeliver,
    voiceTarget: secondAttempt.voiceTarget,
    retrievalReasons: secondAttempt.retrievalReasons,
    threadFramingStyle: secondAttempt.threadFramingStyle,
  });

  if (secondAttemptWithClaimCheck.claimNeedsClarification) {
    routingTracePatch = {
      ...routingTracePatch,
      draftGuard: {
        reason: "claim_needs_clarification",
        issues: secondAttemptWithClaimCheck.criticOutput.issues,
      },
    };
    return {
      kind: "response",
      response: await buildProductClarification("claim_needs_clarification"),
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

  const secondDeliveryValidation = runDeliveryValidationWorkers({
    capability: "drafting",
    groupId: retryConstraints.length > 0
      ? "draft_delivery_validation_retry"
      : "draft_delivery_validation_initial",
    draft: secondAttemptWithClaimCheck.draftToDeliver,
    formatPreference: args.formatPreference,
    sourceUserMessage: args.sourceUserMessage,
  });
  localWorkers.push(...secondDeliveryValidation.workerExecutions);
  localValidations.push(...secondDeliveryValidation.validations);

  if (secondDeliveryValidation.hasFailures) {
    const issues = secondDeliveryValidation.issues.map((issue) => issue.message);
    routingTracePatch = {
      ...routingTracePatch,
      draftGuard: {
        reason: "delivery_validation_failed",
        issues,
      },
    };
    return {
      kind: "response",
      response: await args.returnDeliveryValidationFallback({ issues }),
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

  const secondValidation = await runDraftGuardValidationWorkers({
    capability: "drafting",
    groupId: retryConstraints.length > 0
      ? "draft_guard_validation_retry"
      : "draft_guard_validation_initial",
    activeConstraints: args.activeConstraints,
    sourceUserMessage: args.sourceUserMessage,
    draft: secondAttemptWithClaimCheck.draftToDeliver,
  });
  localWorkers.push(...secondValidation.workerExecutions);
  localValidations.push(...secondValidation.validations);

  const secondAssessment = secondValidation.concreteSceneAssessment;
  const secondProductAssessment = secondValidation.groundedProductAssessment;
  if (secondAssessment.hasDrift || secondProductAssessment.hasDrift) {
    routingTracePatch = {
      ...routingTracePatch,
      draftGuard: secondAssessment.hasDrift
        ? {
            reason: "concrete_scene_drift",
            issues: [secondAssessment.reason || "Concrete scene drift."],
          }
        : {
            reason: "product_drift",
            issues: [secondProductAssessment.reason || "Grounded product drift."],
          },
    };

    return {
      kind: "response",
      response: secondAssessment.hasDrift
        ? await args.returnClarificationQuestion({
            question: args.buildConcreteSceneClarificationQuestion(
              args.sourceUserMessage || args.plan.objective,
            ),
            traceReason: "concrete_scene_drift",
            ...(args.topicSummary !== undefined
              ? { topicSummary: args.topicSummary }
              : {}),
            ...(args.pendingPlan !== undefined
              ? { pendingPlan: args.pendingPlan }
              : {}),
          })
        : await buildProductClarification("product_drift"),
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

  return {
    kind: "success",
    writerOutput: secondAttemptWithClaimCheck.writerOutput,
    criticOutput: secondAttemptWithClaimCheck.criticOutput,
    draftToDeliver: secondAttemptWithClaimCheck.draftToDeliver,
    voiceTarget: secondAttemptWithClaimCheck.voiceTarget,
    retrievalReasons: secondAttemptWithClaimCheck.retrievalReasons,
    threadFramingStyle: secondAttemptWithClaimCheck.threadFramingStyle,
    workers: localWorkers,
    validations: localValidations,
    routingTracePatch,
  };
}
