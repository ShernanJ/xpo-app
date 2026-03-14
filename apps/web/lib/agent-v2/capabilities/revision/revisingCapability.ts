import {
  buildRollingSummary,
} from "../../memory/summaryManager.ts";
import { resolveVoiceTarget } from "../../core/voiceTarget.ts";
import { buildDraftReply } from "../../responses/draftReply.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import { runRevisionValidationWorkers } from "../../workers/validation/revisionValidationWorkers.ts";
import type { ReviserOutput } from "../../agents/reviser.ts";
import type { CriticOutput } from "../../agents/critic.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type { VoiceStyleCard } from "../../core/styleProfile.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  CapabilityResponseOutput,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeValidationResult,
  RuntimeResponseSeed,
  RuntimeWorkerExecution,
} from "../../runtime/runtimeContracts.ts";
import {
  resolveDraftOutputShape,
} from "../../orchestrator/conversationManagerLogic.ts";
import type { ConversationServices } from "../../runtime/services.ts";
import type { OrchestratorResponse } from "../../runtime/types.ts";
import type {
  GroundingPacket,
  GroundingPacketSourceMaterial,
} from "../../grounding/groundingPacket.ts";
import type { DraftRevisionDirective } from "./draftRevision.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

function buildDeliveryFixSummaries(issueMessages: string[]): string[] {
  return Array.from(
    new Set(
      issueMessages.map((message) => {
        if (/cut off/i.test(message)) {
          return "Finished the revision with a complete ending.";
        }
        if (/echoing the user's prompt/i.test(message)) {
          return "Removed prompt-echo phrasing from the revision.";
        }
        if (/single post was requested/i.test(message)) {
          return "Matched the requested post format.";
        }
        if (/distinct posts/i.test(message)) {
          return "Reshaped the revision into a valid thread.";
        }
        return "Cleaned up malformed revision delivery.";
      }),
    ),
  );
}

export interface RevisingCapabilityContext {
  memory: V2ConversationMemory;
  activeDraft: string;
  revision: DraftRevisionDirective;
  revisionActiveConstraints: string[];
  effectiveContext: string;
  relevantTopicAnchors: string[];
  styleCard: VoiceStyleCard | null;
  maxCharacterLimit: number;
  goal: string;
  antiPatterns: string[];
  turnDraftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  threadPostMaxCharacterLimit?: number;
  turnThreadFramingStyle: ThreadFramingStyle | null;
  userMessage: string;
  groundingPacket: GroundingPacket;
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  refreshRollingSummary: boolean;
  latestRefinementInstruction: string;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
}

export interface RevisingCapabilityMemoryPatch {
  conversationState: "editing";
  activeConstraints: string[];
  pendingPlan: null;
  clarificationState: null;
  rollingSummary: string | null;
  assistantTurnCount: number;
  formatPreference: DraftFormatPreference;
  latestRefinementInstruction: string;
  unresolvedQuestion: null;
}

export interface RevisingCapabilityReadyOutput {
  kind: "revision_ready";
  responseSeed: RawResponseSeed;
  memoryPatch: RevisingCapabilityMemoryPatch;
}

export type RevisingCapabilityOutput =
  | RevisingCapabilityReadyOutput
  | CapabilityResponseOutput<RawOrchestratorResponse>;

export async function executeRevisingCapability(
  args: CapabilityExecutionRequest<RevisingCapabilityContext> & {
    services: Pick<ConversationServices, "generateRevisionDraft" | "critiqueDrafts"> & {
      buildClarificationResponse: () => Promise<RawOrchestratorResponse>;
    };
  },
): Promise<CapabilityExecutionResult<RevisingCapabilityOutput>> {
  const { context, services } = args;

  const buildDeliveryFallbackResponse = (): RawOrchestratorResponse => ({
    mode: "coach",
    outputShape: "coach_question",
    response: prependFeedbackMemoryNotice(
      "that revision came back malformed twice. want me to try again cleanly with the same edit goal?",
      context.feedbackMemoryNotice ?? null,
    ),
    memory: context.memory,
  });

  const runRevisionAttempt = async (attempt: {
    extraConstraints?: string[];
    validationGroupId: string;
  }) => {
    const activeConstraints = Array.from(
      new Set([
        ...context.revisionActiveConstraints,
        ...(attempt.extraConstraints ?? []),
      ]),
    );
    const reviserOutput = await services.generateRevisionDraft({
      activeDraft: context.activeDraft,
      revision: context.revision,
      styleCard: context.styleCard,
      topicAnchors: context.relevantTopicAnchors,
      activeConstraints,
      recentHistory: context.effectiveContext,
      options: {
        conversationState: "editing",
        antiPatterns: context.antiPatterns,
        maxCharacterLimit: context.maxCharacterLimit,
        goal: context.goal,
        draftPreference: context.turnDraftPreference,
        formatPreference: context.turnFormatPreference,
        threadPostMaxCharacterLimit: context.threadPostMaxCharacterLimit,
        threadFramingStyle: context.turnThreadFramingStyle,
        sourceUserMessage: context.userMessage,
        groundingPacket: context.groundingPacket,
      },
    });

    if (!reviserOutput) {
      return {
        activeConstraints,
        reviserOutput: null,
        criticOutput: null,
        validation: null,
      };
    }

    const criticOutput = await services.critiqueDrafts(
      {
        angle: "Targeted revision",
        draft: reviserOutput.revisedDraft,
        supportAsset: reviserOutput.supportAsset ?? "",
        whyThisWorks: "",
        watchOutFor: "",
      },
      activeConstraints,
      context.styleCard,
      {
        maxCharacterLimit: context.maxCharacterLimit,
        draftPreference: context.turnDraftPreference,
        formatPreference: context.turnFormatPreference,
        threadPostMaxCharacterLimit: context.threadPostMaxCharacterLimit,
        threadFramingStyle: context.turnThreadFramingStyle,
        previousDraft: context.activeDraft,
        revisionChangeKind: context.revision.changeKind,
        sourceUserMessage: context.userMessage,
        groundingPacket: context.groundingPacket,
      },
    );

    if (!criticOutput) {
      return {
        activeConstraints,
        reviserOutput,
        criticOutput: null,
        validation: null,
      };
    }

    return {
      activeConstraints,
      reviserOutput,
      criticOutput,
      validation: runRevisionValidationWorkers({
        capability: "revising",
        draft: criticOutput.finalDraft,
        groundingPacket: context.groundingPacket,
        formatPreference: context.turnFormatPreference,
        sourceUserMessage: context.userMessage,
        groupId: attempt.validationGroupId,
      }),
    };
  };

  const accumulatedWorkers: RuntimeWorkerExecution[] = [];
  const accumulatedValidations: RuntimeValidationResult[] = [];
  const firstAttempt = await runRevisionAttempt({
    validationGroupId: "revision_delivery_validation_initial",
  });

  if (!firstAttempt.reviserOutput) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to revise draft.",
          memory: context.memory,
        },
      },
      workers: [
        {
          worker: "reviser",
          capability: "revising",
          phase: "execution",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: "reviser_failed",
          },
        },
      ],
    };
  }

  if (!firstAttempt.criticOutput) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to finalize revised draft.",
          memory: context.memory,
        },
      },
      workers: [
        {
          worker: "reviser",
          capability: "revising",
          phase: "execution",
          mode: "sequential",
          status: "completed",
          groupId: null,
          details: {
            issuesFixedCount: firstAttempt.reviserOutput.issuesFixed?.length ?? 0,
          },
        },
        {
          worker: "revision_delivery",
          capability: "revising",
          phase: "validation",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: "critic_failed",
          },
        },
      ],
    };
  }

  accumulatedWorkers.push(
    {
      worker: "reviser",
      capability: "revising",
      phase: "execution",
      mode: "sequential",
      status: "completed",
      groupId: null,
      details: {
        issuesFixedCount: firstAttempt.reviserOutput.issuesFixed?.length ?? 0,
        revisionChangeKind: context.revision.changeKind,
      },
    },
    ...firstAttempt.validation!.workerExecutions,
  );
  accumulatedValidations.push(...firstAttempt.validation!.validations);

  if (firstAttempt.validation!.claimCheck.needsClarification) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: await services.buildClarificationResponse(),
      },
      workers: accumulatedWorkers,
      validations: accumulatedValidations,
    };
  }

  const retryConstraints = firstAttempt.validation!.retryConstraints;
  const finalAttempt = retryConstraints.length > 0
    ? await runRevisionAttempt({
        extraConstraints: retryConstraints,
        validationGroupId: "revision_delivery_validation_retry",
      })
    : firstAttempt;

  if (finalAttempt !== firstAttempt) {
    if (!finalAttempt.reviserOutput) {
      return {
        workflow: args.workflow,
        capability: args.capability,
        output: {
          kind: "response",
          response: {
            mode: "error",
            outputShape: "coach_question",
            response: "Failed to revise draft.",
            memory: context.memory,
          },
        },
        workers: accumulatedWorkers,
        validations: accumulatedValidations,
      };
    }

    if (!finalAttempt.criticOutput) {
      return {
        workflow: args.workflow,
        capability: args.capability,
        output: {
          kind: "response",
          response: {
            mode: "error",
            outputShape: "coach_question",
            response: "Failed to finalize revised draft.",
            memory: context.memory,
          },
        },
        workers: accumulatedWorkers,
        validations: accumulatedValidations,
      };
    }

    accumulatedWorkers.push(
      {
        worker: "reviser",
        capability: "revising",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          issuesFixedCount: finalAttempt.reviserOutput.issuesFixed?.length ?? 0,
          revisionChangeKind: context.revision.changeKind,
        },
      },
      ...finalAttempt.validation!.workerExecutions,
    );
    accumulatedValidations.push(...finalAttempt.validation!.validations);
  }

  if (!finalAttempt.reviserOutput || !finalAttempt.criticOutput) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to finalize revised draft.",
          memory: context.memory,
        },
      },
      workers: accumulatedWorkers,
      validations: accumulatedValidations,
    };
  }

  if (finalAttempt.validation!.claimCheck.needsClarification) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: await services.buildClarificationResponse(),
      },
      workers: accumulatedWorkers,
      validations: accumulatedValidations,
    };
  }

  if (finalAttempt.validation!.hasDeliveryFailures) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: buildDeliveryFallbackResponse(),
      },
      workers: accumulatedWorkers,
      validations: accumulatedValidations,
    };
  }

  const revisionWasRejectedByCritic = !finalAttempt.criticOutput.approved;
  const finalizedRevisionDraft =
    finalAttempt.validation!.claimCheck.draft ||
    (revisionWasRejectedByCritic
      ? context.activeDraft
      : finalAttempt.criticOutput.finalDraft) ||
    finalAttempt.reviserOutput.revisedDraft;
  const revisionVoiceTarget = resolveVoiceTarget({
    styleCard: context.styleCard,
    userMessage: context.userMessage,
    draftPreference: context.turnDraftPreference,
    formatPreference: context.turnFormatPreference,
  });
  const rollingSummary = context.refreshRollingSummary
    ? buildRollingSummary({
        currentSummary: context.memory.rollingSummary,
        topicSummary: context.memory.topicSummary,
        approvedPlan: context.memory.pendingPlan,
        activeConstraints: finalAttempt.activeConstraints,
        latestDraftStatus: "Draft revised",
        formatPreference: context.memory.formatPreference || context.turnFormatPreference,
      })
    : context.memory.rollingSummary;

  const issuesFixed = Array.from(
    new Set([
      ...(finalAttempt.reviserOutput.issuesFixed || []),
      ...finalAttempt.criticOutput.issues,
      ...finalAttempt.validation!.claimCheck.issues,
      ...(retryConstraints.length > 0
        ? buildDeliveryFixSummaries(
            firstAttempt.validation!.validations.flatMap((validation) => validation.issues),
          )
        : []),
      ...(revisionWasRejectedByCritic
        ? ["Kept the revision closer to the original edit scope."]
        : []),
    ]),
  );

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      kind: "revision_ready",
      responseSeed: {
        mode: "draft",
        outputShape: resolveDraftOutputShape(context.turnFormatPreference),
        response: prependFeedbackMemoryNotice(
          buildDraftReply({
            userMessage: context.userMessage,
            draftPreference: context.turnDraftPreference,
            isEdit: true,
            issuesFixed,
            styleCard: context.styleCard,
            revisionChangeKind: context.revision.changeKind,
          }),
          context.feedbackMemoryNotice ?? null,
        ),
        data: {
          draft: finalizedRevisionDraft,
          supportAsset: finalAttempt.reviserOutput.supportAsset,
          issuesFixed,
          voiceTarget: revisionVoiceTarget,
          noveltyNotes: [],
          threadFramingStyle: context.turnThreadFramingStyle,
          groundingSources: context.groundingSources,
          groundingMode: context.groundingMode,
          groundingExplanation: context.groundingExplanation,
        },
      },
      memoryPatch: {
        conversationState: "editing",
        activeConstraints: finalAttempt.activeConstraints,
        pendingPlan: null,
        clarificationState: null,
        rollingSummary,
        assistantTurnCount: context.nextAssistantTurnCount,
        formatPreference: context.turnFormatPreference,
        latestRefinementInstruction: context.latestRefinementInstruction,
        unresolvedQuestion: null,
      },
    },
    workers: [
      ...accumulatedWorkers,
      {
        worker: "revision_delivery",
        capability: "revising",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          issueCount: issuesFixed.length,
        },
      },
    ],
    validations: accumulatedValidations,
  };
}
