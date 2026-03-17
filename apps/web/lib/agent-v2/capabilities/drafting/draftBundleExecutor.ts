import {
  buildRollingSummary,
} from "../../memory/summaryManager.ts";
import {
  buildDraftBundleBriefs,
  type DraftBundleResult,
} from "./draftBundles.ts";
import { buildDraftResultQuickReplies } from "../../responses/draftResultQuickReplies.ts";
import { buildDirectionHandoffCopy } from "../../responses/ideationShellCopy.ts";
import { runDraftBundleCandidateWorkers } from "../../workers/draftBundleCandidateWorkers.ts";
import { prependFeedbackMemoryNotice } from "../../responses/feedbackMemoryNotice.ts";
import { buildRuntimeWorkerExecution } from "../../runtime/workerPlane.ts";
import type {
  OrchestratorResponse,
  RoutingTracePatch,
} from "../../runtime/types.ts";
import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
  V2ConversationMemory,
} from "../../contracts/chat.ts";
import type {
  DraftGroundingMode,
} from "../../../onboarding/draftArtifacts.ts";
import type {
  CapabilityPatchedResponseOutput,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  RuntimeResponseSeed,
} from "../../runtime/runtimeContracts.ts";
import type { GroundingPacket, GroundingPacketSourceMaterial } from "../../grounding/groundingPacket.ts";
import type { SourceMaterialAssetRecord } from "../../grounding/sourceMaterials.ts";
import type { DraftingCapabilityRunResult } from "./draftingCapability.ts";

type RawOrchestratorResponse = Omit<
  OrchestratorResponse,
  "surfaceMode" | "responseShapePlan"
>;

type RawResponseSeed = RuntimeResponseSeed<RawOrchestratorResponse>;

export interface DraftBundleCapabilityContext {
  userMessage: string;
  memory: V2ConversationMemory;
  plan: StrategyPlan;
  activeConstraints: string[];
  sourceMaterials: SourceMaterialAssetRecord[];
  draftPreference: DraftPreference;
  topicSummary?: string | null;
  groundingPacket?: GroundingPacket;
  historicalTexts: string[];
  turnFormatPreference: DraftFormatPreference;
  nextAssistantTurnCount: number;
  refreshRollingSummary: boolean;
  feedbackMemoryNotice?: string | null;
  groundingSources: GroundingPacketSourceMaterial[];
  groundingMode: DraftGroundingMode | null;
  groundingExplanation: string | null;
}

export interface DraftBundleCapabilityMemoryPatch {
  topicSummary: string;
  activeConstraints: string[];
  conversationState: "draft_ready";
  pendingPlan: null;
  clarificationState: null;
  assistantTurnCount: number;
  rollingSummary: string | null;
  formatPreference: DraftFormatPreference;
  latestRefinementInstruction: null;
  unresolvedQuestion: null;
}

export interface DraftBundleCapabilityReadyOutput {
  kind: "draft_bundle_ready";
  responseSeed: RawResponseSeed;
  memoryPatch: DraftBundleCapabilityMemoryPatch;
}

export type DraftBundleCapabilityOutput =
  | DraftBundleCapabilityReadyOutput
  | CapabilityPatchedResponseOutput<RawOrchestratorResponse, RoutingTracePatch>;

export async function executeDraftBundleCapability(
  args: CapabilityExecutionRequest<DraftBundleCapabilityContext> & {
    services: {
      runSingleDraft: (args: {
        plan: StrategyPlan;
        activeConstraints: string[];
        sourceUserMessage: string;
        draftPreference: DraftPreference;
        topicSummary?: string | null;
        groundingPacket?: GroundingPacket;
      }) => Promise<DraftingCapabilityRunResult>;
      checkDeterministicNovelty: (
        draft: string,
        historicalTexts: string[],
      ) => { isNovel: boolean; reason: string | null; maxSimilarity: number };
      buildNoveltyNotes: (args: {
        noveltyCheck?: { isNovel: boolean; reason: string | null; maxSimilarity: number };
        retrievalReasons?: string[];
      }) => string[];
    };
  },
): Promise<CapabilityExecutionResult<DraftBundleCapabilityOutput>> {
  const { context, services } = args;
  const bundleBriefs = buildDraftBundleBriefs({
    userMessage: context.userMessage,
    basePlan: context.plan,
    sourceMaterials: context.sourceMaterials,
  });

  if (bundleBriefs.length === 0) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to build draft options.",
          memory: context.memory,
        },
      },
      workers: [
        {
          worker: "draft_bundle_builder",
          capability: args.capability,
          phase: "execution",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: "no_bundle_briefs",
          },
        },
      ],
    };
  }

  const options: DraftBundleResult["options"] = [];
  const initialCandidates = await runDraftBundleCandidateWorkers({
    capability: args.capability,
    basePlan: context.plan,
    bundleBriefs,
    activeConstraints: context.activeConstraints,
    draftPreference: context.draftPreference,
    topicSummary: context.topicSummary,
    groundingPacket: context.groundingPacket,
    turnFormatPreference: context.turnFormatPreference,
    services: {
      runSingleDraft: services.runSingleDraft,
    },
  });
  const workers = [...initialCandidates.workerExecutions];
  const validations = [...initialCandidates.validations];

  for (const candidate of initialCandidates.candidates) {
    const { brief } = candidate;
    const bundlePlan = candidate.plan;
    let bundleDraftResult = candidate.draftResult;

    if (bundleDraftResult.kind === "response") {
      return {
        workflow: args.workflow,
        capability: args.capability,
        output: {
          kind: "response",
          response: bundleDraftResult.response,
          routingTracePatch: bundleDraftResult.routingTracePatch,
        },
        workers,
        validations,
      };
    }

    const earlierDrafts = options.map((option) => option.draft);
    let noveltyCheck = services.checkDeterministicNovelty(
      bundleDraftResult.draftToDeliver,
      [...context.historicalTexts, ...earlierDrafts],
    );

    if (!noveltyCheck.isNovel && earlierDrafts.length > 0) {
      workers.push(
        buildRuntimeWorkerExecution({
          worker: "retry_bundle_candidate_for_sibling_novelty",
          capability: args.capability,
          phase: "execution",
          mode: "sequential",
          status: "completed",
          groupId: "draft_bundle_sibling_retry",
          details: {
            briefId: brief.id,
            label: brief.label,
            reason: noveltyCheck.reason,
            dependsOnEarlierOptions: true,
            earlierOptionCount: earlierDrafts.length,
          },
        }),
      );

      bundleDraftResult = await services.runSingleDraft({
        plan: {
          ...bundlePlan,
          mustAvoid: Array.from(
            new Set([
              ...bundlePlan.mustAvoid,
              "Do not mirror the opener, structure, or payoff from the earlier bundle options.",
            ]),
          ),
        },
        activeConstraints: Array.from(
          new Set([
            ...context.activeConstraints,
            `Sibling novelty: make "${brief.label}" clearly distinct from the earlier bundle options.`,
          ]),
        ),
        sourceUserMessage: `${brief.prompt} Keep it clearly distinct from the earlier bundle options.`,
        draftPreference: context.draftPreference,
        topicSummary: context.topicSummary,
        groundingPacket: context.groundingPacket,
      });

      if (bundleDraftResult.kind === "response") {
        return {
          workflow: args.workflow,
          capability: args.capability,
          output: {
            kind: "response",
            response: bundleDraftResult.response,
            routingTracePatch: bundleDraftResult.routingTracePatch,
          },
          workers: [...workers, ...(bundleDraftResult.workers ?? [])],
          validations: [...validations, ...(bundleDraftResult.validations ?? [])],
        };
      }

      workers.push(...(bundleDraftResult.workers ?? []));
      validations.push(...(bundleDraftResult.validations ?? []));

      noveltyCheck = services.checkDeterministicNovelty(
        bundleDraftResult.draftToDeliver,
        [...context.historicalTexts, ...earlierDrafts],
      );
    }

    options.push({
      id: `bundle-${brief.id}`,
      label: brief.label,
      framing: brief.id,
      draft: bundleDraftResult.draftToDeliver,
      supportAsset: bundleDraftResult.writerOutput.supportAsset ?? null,
      issuesFixed: bundleDraftResult.criticOutput.issues,
      voiceTarget: bundleDraftResult.voiceTarget,
      noveltyNotes: services.buildNoveltyNotes({
        noveltyCheck,
        retrievalReasons: bundleDraftResult.retrievalReasons,
      }),
      threadFramingStyle: bundleDraftResult.threadFramingStyle,
      groundingSources: context.groundingSources,
      groundingMode: context.groundingMode,
      groundingExplanation: context.groundingExplanation,
    });
  }

  if (options.length === 0) {
    return {
      workflow: args.workflow,
      capability: args.capability,
      output: {
        kind: "response",
        response: {
          mode: "error",
          outputShape: "coach_question",
          response: "Failed to write draft options.",
          memory: context.memory,
        },
      },
      workers: [
        {
          worker: "draft_bundle_builder",
          capability: args.capability,
          phase: "execution",
          mode: "sequential",
          status: "failed",
          groupId: null,
          details: {
            reason: "no_bundle_options",
          },
        },
      ],
    };
  }

  const draftBundle: DraftBundleResult = {
    kind: "sibling_options",
    selectedOptionId: options[0].id,
    options,
  };
  const rollingSummary = context.refreshRollingSummary
    ? buildRollingSummary({
        currentSummary: context.memory.rollingSummary,
        topicSummary: context.plan.objective,
        approvedPlan: context.plan,
        activeConstraints: context.activeConstraints,
        latestDraftStatus: "Draft bundle generated",
        formatPreference: context.plan.formatPreference || context.turnFormatPreference,
      })
    : context.memory.rollingSummary;

  return {
    workflow: args.workflow,
    capability: args.capability,
    output: {
      kind: "draft_bundle_ready",
      responseSeed: {
        mode: "draft",
        outputShape: "short_form_post",
        response: prependFeedbackMemoryNotice(
          buildDirectionHandoffCopy({
            source: "draft_bundle",
            artifact: "post",
            seed: context.plan.objective,
          }),
          context.feedbackMemoryNotice ?? null,
        ),
        data: {
          draft: options[0].draft,
          drafts: options.map((option) => option.draft),
          draftBundle,
          supportAsset: options[0].supportAsset,
          plan: context.plan,
          issuesFixed: Array.from(new Set(options.flatMap((option) => option.issuesFixed))),
          quickReplies: buildDraftResultQuickReplies({
            outputShape: "short_form_post",
            styleCard: null,
            seedTopic: context.plan.objective,
          }),
          groundingSources: context.groundingSources,
          groundingMode: context.groundingMode,
          groundingExplanation: context.groundingExplanation,
        },
      },
      memoryPatch: {
        topicSummary: context.plan.objective,
        activeConstraints: context.activeConstraints,
        conversationState: "draft_ready",
        pendingPlan: null,
        clarificationState: null,
        assistantTurnCount: context.nextAssistantTurnCount,
        rollingSummary,
        formatPreference: context.plan.formatPreference || context.turnFormatPreference,
        latestRefinementInstruction: null,
        unresolvedQuestion: null,
      },
    },
    workers: [
      ...workers,
      {
        worker: "draft_bundle_builder",
        capability: args.capability,
        phase: "execution",
        mode: "sequential",
        status: "completed",
        groupId: null,
        details: {
          optionCount: options.length,
        },
      },
    ],
    validations,
  };
}
