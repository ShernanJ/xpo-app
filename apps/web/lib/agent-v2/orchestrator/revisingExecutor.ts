import {
  buildRollingSummary,
} from "../memory/summaryManager.ts";
import { resolveVoiceTarget } from "../core/voiceTarget.ts";
import { buildDraftReply } from "./draftReply.ts";
import { prependFeedbackMemoryNotice } from "./feedbackMemoryNotice.ts";
import { runRevisionValidationWorkers } from "./revisionValidationWorkers.ts";
import type { ReviserOutput } from "../agents/reviser.ts";
import type { CriticOutput } from "../agents/critic.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  V2ConversationMemory,
} from "../contracts/chat.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../onboarding/draftArtifacts.ts";
import type {
  CapabilityResponseOutput,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../runtime/runtimeContracts.ts";
import {
  resolveDraftOutputShape,
} from "./conversationManagerLogic.ts";
import type {
  ConversationServices,
  OrchestratorResponse,
} from "./draftPipelineHelpers.ts";
import type { GroundingPacket, GroundingPacketSourceMaterial } from "./groundingPacket.ts";
import type { DraftRevisionDirective } from "./draftRevision.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

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
  const reviserOutput = await services.generateRevisionDraft({
    activeDraft: context.activeDraft,
    revision: context.revision,
    styleCard: context.styleCard,
    topicAnchors: context.relevantTopicAnchors,
    activeConstraints: context.revisionActiveConstraints,
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

  const criticOutput = await services.critiqueDrafts(
    {
      angle: "Targeted revision",
      draft: reviserOutput.revisedDraft,
      supportAsset: reviserOutput.supportAsset ?? "",
      whyThisWorks: "",
      watchOutFor: "",
    },
    context.revisionActiveConstraints,
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
            issuesFixedCount: reviserOutput.issuesFixed?.length ?? 0,
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

  const revisionValidation = runRevisionValidationWorkers({
    capability: "revising",
    draft: criticOutput.finalDraft,
    groundingPacket: context.groundingPacket,
  });
  const { claimCheck, validationStatus: revisionValidationStatus } = revisionValidation;

  if (claimCheck.needsClarification) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: await services.buildClarificationResponse(),
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
            issuesFixedCount: reviserOutput.issuesFixed?.length ?? 0,
          },
        },
        {
          ...revisionValidation.workerExecutions[0],
        },
      ],
      validations: revisionValidation.validations,
    };
  }

  const revisionWasRejectedByCritic = !criticOutput.approved;
  const finalizedRevisionDraft =
    claimCheck.draft ||
    (revisionWasRejectedByCritic ? context.activeDraft : criticOutput.finalDraft) ||
    reviserOutput.revisedDraft;
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
        activeConstraints: context.revisionActiveConstraints,
        latestDraftStatus: "Draft revised",
        formatPreference: context.memory.formatPreference || context.turnFormatPreference,
      })
    : context.memory.rollingSummary;

  const issuesFixed = Array.from(
    new Set([
      ...(reviserOutput.issuesFixed || []),
      ...criticOutput.issues,
      ...claimCheck.issues,
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
          supportAsset: reviserOutput.supportAsset,
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
        activeConstraints: context.revisionActiveConstraints,
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
      {
        worker: "reviser",
        capability: "revising",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          issuesFixedCount: reviserOutput.issuesFixed?.length ?? 0,
          revisionChangeKind: context.revision.changeKind,
        },
      },
      {
        ...revisionValidation.workerExecutions[0],
      },
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
    validations: revisionValidation.validations,
  };
}
