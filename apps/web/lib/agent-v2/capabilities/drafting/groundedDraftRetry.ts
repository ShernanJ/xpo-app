import type { WriterOutput } from "../../agents/writer.ts";
import type { CriticOutput } from "../../agents/critic.ts";
import type { VoiceTarget } from "../../core/voiceTarget.ts";
import type {
  ContinuationState,
  DraftFormatPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { GroundingPacket } from "../../grounding/groundingPacket.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../runtime/types.ts";
import type { DraftingCapabilityRunResult } from "./draftingCapability.ts";
import {
  buildGroundedProductRetryConstraint,
  buildUnsupportedClaimRetryConstraint,
  buildConcreteSceneRetryConstraint,
} from "../../grounding/draftGrounding.ts";
import { checkDraftClaimsAgainstGrounding } from "../../grounding/claimChecker.ts";
import {
  buildDraftRequestPolicy,
  type DraftRequestPolicy,
} from "../../grounding/requestPolicy.ts";
import { runDraftGuardValidationWorkers } from "../../workers/draftGuardValidationWorkers.ts";
import {
  buildRuntimeValidationResult,
  buildRuntimeWorkerExecution,
  resolveRuntimeValidationStatus,
} from "../../runtime/workerPlane.ts";
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

const MAX_INTERNAL_ATTEMPTS = 2;

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
  continuationState?: ContinuationState | null;
}

export async function runGroundedDraftRetry(
  args: {
    memory: V2ConversationMemory;
    plan: StrategyPlan;
    activeConstraints: string[];
    sourceUserMessage?: string;
    formatPreference: DraftFormatPreference;
    threadFramingStyle?: ThreadFramingStyle | null;
    topicSummary?: string;
    pendingPlan?: StrategyPlan;
    draftGroundingPacket: GroundingPacket;
    requestPolicy?: DraftRequestPolicy;
    storyClarificationQuestion?: string | null;
    storyClarificationAsked?: boolean;
    attemptDraft: (extraConstraints?: string[]) => Promise<DraftingAttemptResult>;
    buildConcreteSceneClarificationQuestion: (sourceUserMessage: string) => string;
    buildGroundedProductClarificationQuestion: (sourceUserMessage: string) => string;
    returnClarificationQuestion: (
      args: ClarificationResponseArgs,
    ) => Promise<RawOrchestratorResponse>;
    returnDeliveryValidationFallback: (args: {
      issues: string[];
      plan: StrategyPlan;
      activeConstraints: string[];
      sourceUserMessage?: string | null;
      sourcePrompt?: string | null;
      formatPreference: DraftFormatPreference;
      threadFramingStyle?: ThreadFramingStyle | null;
    }) => Promise<RawOrchestratorResponse>;
  },
): Promise<DraftingCapabilityRunResult> {
  const requestPolicy =
    args.requestPolicy ||
    buildDraftRequestPolicy({
      userMessage: args.sourceUserMessage || args.plan.objective,
      formatIntent: args.plan.formatIntent,
    });
  const localWorkers: RuntimeWorkerExecution[] = [];
  const localValidations: RuntimeValidationResult[] = [];
  let routingTracePatch: RoutingTracePatch | undefined;
  const decorateAttemptWorkers = (
    executions: RuntimeWorkerExecution[],
    attemptCount: number,
    fallbackReason: "delivery_validation_failed" | "clarification_required" | null,
  ): RuntimeWorkerExecution[] =>
    executions.map((execution) => ({
      ...execution,
      details: {
        ...(execution.details || {}),
        attemptCount,
        maxAttempts: MAX_INTERNAL_ATTEMPTS,
        fallbackReason,
      },
    }));

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
    attemptMeta: {
      attemptCount: number;
      fallbackReason: "delivery_validation_failed" | "clarification_required" | null;
    },
  ): CheckedDraftingAttempt => {
    const claimCheck = checkDraftClaimsAgainstGrounding({
      draft: attempt.draftToDeliver,
      groundingPacket: args.draftGroundingPacket,
      requestPolicy,
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
        attemptCount: attemptMeta.attemptCount,
        maxAttempts: MAX_INTERNAL_ATTEMPTS,
        fallbackReason: attemptMeta.fallbackReason,
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
      continuationState: {
        capability: "drafting",
        pendingAction: "awaiting_grounding_answer",
        formatPreference: args.formatPreference,
        formatIntent: args.plan.formatIntent || requestPolicy.formatIntent,
        threadFramingStyle: args.threadFramingStyle ?? null,
        sourceUserMessage: args.sourceUserMessage || null,
        sourcePrompt: args.sourceUserMessage || args.plan.objective,
        activeConstraints: args.activeConstraints,
        plan: args.plan,
        storyClarificationAsked: args.storyClarificationAsked === true,
      },
    });

  if (
    args.storyClarificationQuestion &&
    !args.storyClarificationAsked
  ) {
    routingTracePatch = {
      ...routingTracePatch,
      draftGuard: {
        reason: "claim_needs_clarification",
        issues: ["Story needs one concrete anchor before drafting."],
      },
    };
    return {
      kind: "response",
      response: await args.returnClarificationQuestion({
        question: args.storyClarificationQuestion,
        traceReason: "claim_needs_clarification",
        ...(args.topicSummary !== undefined
          ? { topicSummary: args.topicSummary }
          : {}),
        ...(args.pendingPlan !== undefined
          ? { pendingPlan: args.pendingPlan }
          : {}),
        continuationState: {
          capability: "drafting",
          pendingAction: "awaiting_grounding_answer",
          formatPreference: args.formatPreference,
          formatIntent: args.plan.formatIntent || requestPolicy.formatIntent,
          threadFramingStyle: args.threadFramingStyle ?? null,
          sourceUserMessage: args.sourceUserMessage || null,
          sourcePrompt: args.sourceUserMessage || args.plan.objective,
          activeConstraints: args.activeConstraints,
          plan: args.plan,
          storyClarificationAsked: true,
        },
      }),
      workers: localWorkers,
      validations: localValidations,
      routingTracePatch,
    };
  }

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
  }, {
    attemptCount: 1,
    fallbackReason: null,
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
  localWorkers.push(
    ...decorateAttemptWorkers(firstDeliveryValidation.workerExecutions, 1, null),
  );
  localValidations.push(...firstDeliveryValidation.validations);
  const firstDraftAfterDeliveryValidation = firstDeliveryValidation.correctedDraft;

  let firstAssessment = { hasDrift: false, reason: null as string | null };
  let firstProductAssessment = { hasDrift: false, reason: null as string | null };

  if (!firstDeliveryValidation.hasFailures) {
    const firstValidation = await runDraftGuardValidationWorkers({
      capability: "drafting",
      groupId: "draft_guard_validation_initial",
      activeConstraints: args.activeConstraints,
      sourceUserMessage: args.sourceUserMessage,
      draft: firstDraftAfterDeliveryValidation,
    });
    localWorkers.push(...decorateAttemptWorkers(firstValidation.workerExecutions, 1, null));
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
      draftToDeliver: firstDraftAfterDeliveryValidation,
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
  }, {
    attemptCount: 2,
    fallbackReason: firstDeliveryValidation.hasFailures
      ? "delivery_validation_failed"
      : "clarification_required",
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
  localWorkers.push(
    ...decorateAttemptWorkers(
      secondDeliveryValidation.workerExecutions,
      2,
      firstDeliveryValidation.hasFailures
        ? "delivery_validation_failed"
        : "clarification_required",
    ),
  );
  localValidations.push(...secondDeliveryValidation.validations);
  const secondDraftAfterDeliveryValidation = secondDeliveryValidation.correctedDraft;

  if (secondDeliveryValidation.hasBlockingFailures) {
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
      response: await args.returnDeliveryValidationFallback({
        issues,
        plan: args.plan,
        activeConstraints: args.activeConstraints,
        sourceUserMessage: args.sourceUserMessage,
        sourcePrompt: args.sourceUserMessage || args.plan.objective,
        formatPreference: args.formatPreference,
        threadFramingStyle: secondAttemptWithClaimCheck.threadFramingStyle,
      }),
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
    draft: secondDraftAfterDeliveryValidation,
  });
  localWorkers.push(
    ...decorateAttemptWorkers(secondValidation.workerExecutions, 2, "clarification_required"),
  );
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
            continuationState: {
              capability: "drafting",
              pendingAction: "awaiting_grounding_answer",
              formatPreference: args.formatPreference,
              threadFramingStyle: args.threadFramingStyle ?? null,
              sourceUserMessage: args.sourceUserMessage || null,
              sourcePrompt: args.sourceUserMessage || args.plan.objective,
              activeConstraints: args.activeConstraints,
              plan: args.plan,
            },
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
    draftToDeliver: secondDraftAfterDeliveryValidation,
    voiceTarget: secondAttemptWithClaimCheck.voiceTarget,
    retrievalReasons: secondAttemptWithClaimCheck.retrievalReasons,
    threadFramingStyle: secondAttemptWithClaimCheck.threadFramingStyle,
    workers: localWorkers,
    validations: localValidations,
    routingTracePatch,
  };
}
