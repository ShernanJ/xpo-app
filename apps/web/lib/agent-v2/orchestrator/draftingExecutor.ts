import {
  buildRollingSummary,
} from "../memory/summaryManager.ts";
import { buildDraftReply } from "./draftReply.ts";
import { prependFeedbackMemoryNotice } from "./feedbackMemoryNotice.ts";
import type { WriterOutput } from "../agents/writer.ts";
import type { CriticOutput } from "../agents/critic.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../contracts/chat.ts";
import type { VoiceStyleCard } from "../core/styleProfile.ts";
import type { VoiceTarget } from "../core/voiceTarget.ts";
import type {
  DraftGroundingMode,
  ThreadFramingStyle,
} from "../../onboarding/draftArtifacts.ts";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
} from "../runtime/runtimeContracts.ts";
import {
  resolveDraftOutputShape,
} from "./conversationManagerLogic.ts";
import type {
  ConversationServices,
  OrchestratorResponse,
} from "./draftPipelineHelpers.ts";
import type { GroundingPacketSourceMaterial } from "./groundingPacket.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = Omit<RawOrchestratorResponse, "memory">;

export interface DraftingCapabilityRunSuccess {
  kind: "success";
  writerOutput: WriterOutput;
  criticOutput: CriticOutput;
  draftToDeliver: string;
  voiceTarget: VoiceTarget;
  retrievalReasons: string[];
  threadFramingStyle: ThreadFramingStyle | null;
}

export type DraftingCapabilityRunResult =
  | DraftingCapabilityRunSuccess
  | {
      kind: "response";
      response: RawOrchestratorResponse;
    };

export interface DraftingCapabilityContext {
  memory: V2ConversationMemory;
  plan: StrategyPlan;
  activeConstraints: string[];
  historicalTexts: string[];
  userMessage: string;
  draftPreference: DraftPreference;
  turnFormatPreference: DraftFormatPreference;
  styleCard: VoiceStyleCard | null;
  feedbackMemoryNotice?: string | null;
  nextAssistantTurnCount: number;
  latestDraftStatus: string;
  refreshRollingSummary: boolean;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
}

export interface DraftingCapabilityMemoryPatch {
  topicSummary: string;
  conversationState: "draft_ready";
  pendingPlan: null;
  clarificationState: null;
  rollingSummary: string | null;
  assistantTurnCount: number;
  formatPreference: DraftFormatPreference;
  latestRefinementInstruction: null;
  unresolvedQuestion: null;
}

export interface DraftingCapabilityReadyOutput {
  kind: "draft_ready";
  responseSeed: RawResponseSeed;
  memoryPatch: DraftingCapabilityMemoryPatch;
}

export interface DraftingCapabilityResponseOutput {
  kind: "response";
  response: RawOrchestratorResponse;
}

export type DraftingCapabilityOutput =
  | DraftingCapabilityReadyOutput
  | DraftingCapabilityResponseOutput;

export async function executeDraftingCapability(
  args: CapabilityExecutionRequest<DraftingCapabilityContext> & {
    services: Pick<ConversationServices, "checkDeterministicNovelty"> & {
      runDraft: () => Promise<DraftingCapabilityRunResult>;
      handleNoveltyConflict?: () => Promise<RawOrchestratorResponse>;
      buildNoveltyNotes: (args: {
        noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
        retrievalReasons?: string[];
      }) => string[];
    };
  },
): Promise<CapabilityExecutionResult<DraftingCapabilityOutput>> {
  const { context, services } = args;
  const draftResult = await services.runDraft();

  if (draftResult.kind === "response") {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: draftResult,
    };
  }

  const noveltyCheck = services.checkDeterministicNovelty(
    draftResult.draftToDeliver,
    context.historicalTexts,
  );
  if (!noveltyCheck.isNovel && services.handleNoveltyConflict) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: await services.handleNoveltyConflict(),
      },
      workers: [
        {
          worker: "draft_delivery",
          capability: "drafting",
          phase: "execution",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: "novelty_conflict",
            similarityReason: noveltyCheck.reason,
          },
        },
      ],
    };
  }

  const rollingSummary = context.refreshRollingSummary
    ? buildRollingSummary({
        currentSummary: context.memory.rollingSummary,
        topicSummary: context.plan.objective,
        approvedPlan: context.plan,
        activeConstraints: context.activeConstraints,
        latestDraftStatus: context.latestDraftStatus,
        formatPreference: context.plan.formatPreference || context.turnFormatPreference,
      })
    : context.memory.rollingSummary;

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      kind: "draft_ready",
      responseSeed: {
        mode: "draft",
        outputShape: resolveDraftOutputShape(
          context.plan.formatPreference || context.turnFormatPreference,
        ),
        response: prependFeedbackMemoryNotice(
          buildDraftReply({
            userMessage: context.userMessage,
            draftPreference: context.draftPreference,
            isEdit: false,
            issuesFixed: draftResult.criticOutput.issues,
            styleCard: context.styleCard,
          }),
          context.feedbackMemoryNotice ?? null,
        ),
        data: {
          draft: draftResult.draftToDeliver,
          supportAsset: draftResult.writerOutput.supportAsset,
          issuesFixed: draftResult.criticOutput.issues,
          voiceTarget: draftResult.voiceTarget,
          noveltyNotes: services.buildNoveltyNotes({
            noveltyCheck,
            retrievalReasons: draftResult.retrievalReasons,
          }),
          threadFramingStyle: draftResult.threadFramingStyle,
          groundingSources: context.groundingSources,
          groundingMode: context.groundingMode,
          groundingExplanation: context.groundingExplanation,
        },
      },
      memoryPatch: {
        topicSummary: context.plan.objective,
        conversationState: "draft_ready",
        pendingPlan: null,
        clarificationState: null,
        rollingSummary,
        assistantTurnCount: context.nextAssistantTurnCount,
        formatPreference: context.plan.formatPreference || context.turnFormatPreference,
        latestRefinementInstruction: null,
        unresolvedQuestion: null,
      },
    },
    workers: [
      {
        worker: "draft_delivery",
        capability: "drafting",
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          formatPreference: context.plan.formatPreference || context.turnFormatPreference,
          issueCount: draftResult.criticOutput.issues.length,
          latestDraftStatus: context.latestDraftStatus,
        },
      },
    ],
  };
}
