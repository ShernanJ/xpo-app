import type {
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat.ts";
import type {
  CapabilityName,
  RuntimeValidationResult,
  RuntimeWorkerExecution,
} from "../runtime/runtimeContracts.ts";
import type { DraftBundleBrief } from "./draftBundles.ts";
import type { DraftingCapabilityRunResult } from "./draftingExecutor.ts";
import type { GroundingPacket } from "./groundingPacket.ts";

export interface DraftBundleCandidateWorkerRequest {
  capability: CapabilityName;
  basePlan: StrategyPlan;
  bundleBriefs: DraftBundleBrief[];
  activeConstraints: string[];
  draftPreference: DraftPreference;
  topicSummary?: string | null;
  groundingPacket?: GroundingPacket;
  turnFormatPreference: DraftFormatPreference;
  services: {
    runSingleDraft: (args: {
      plan: StrategyPlan;
      activeConstraints: string[];
      sourceUserMessage: string;
      draftPreference: DraftPreference;
      topicSummary?: string | null;
      groundingPacket?: GroundingPacket;
    }) => Promise<DraftingCapabilityRunResult>;
  };
}

export interface DraftBundleCandidateWorkerItem {
  brief: DraftBundleBrief;
  plan: StrategyPlan;
  draftResult: DraftingCapabilityRunResult;
}

export interface DraftBundleCandidateWorkerResult {
  candidates: DraftBundleCandidateWorkerItem[];
  workerExecutions: RuntimeWorkerExecution[];
  validations: RuntimeValidationResult[];
}

const DRAFT_BUNDLE_CANDIDATE_GROUP_ID = "draft_bundle_initial_candidates";

export async function runDraftBundleCandidateWorkers(
  args: DraftBundleCandidateWorkerRequest,
): Promise<DraftBundleCandidateWorkerResult> {
  const candidates = await Promise.all(
    args.bundleBriefs.map(async (brief) => {
      const plan: StrategyPlan = {
        ...args.basePlan,
        objective: brief.objective,
        angle: brief.angle,
        hookType: brief.hookType,
        mustInclude: Array.from(new Set([...args.basePlan.mustInclude, ...brief.mustInclude])),
        mustAvoid: Array.from(new Set([...args.basePlan.mustAvoid, ...brief.mustAvoid])),
        formatPreference: "shortform",
      };

      const draftResult = await args.services.runSingleDraft({
        plan,
        activeConstraints: args.activeConstraints,
        sourceUserMessage: brief.prompt,
        draftPreference: args.draftPreference,
        topicSummary: args.topicSummary,
        groundingPacket: args.groundingPacket,
      });

      return {
        brief,
        plan,
        draftResult,
      };
    }),
  );

  return {
    candidates,
    workerExecutions: candidates.flatMap((candidate) => [
      {
        worker: "generate_bundle_candidate",
        capability: args.capability,
        phase: "execution",
        mode: "parallel",
        status:
          candidate.draftResult.kind === "response" &&
          candidate.draftResult.response.mode === "error"
            ? "failed"
            : "completed",
        groupId: DRAFT_BUNDLE_CANDIDATE_GROUP_ID,
        details: {
          briefId: candidate.brief.id,
          label: candidate.brief.label,
          formatPreference: candidate.plan.formatPreference || args.turnFormatPreference,
          responseMode:
            candidate.draftResult.kind === "response"
              ? candidate.draftResult.response.mode
              : null,
        },
      },
      ...(candidate.draftResult.workers ?? []),
    ]),
    validations: candidates.flatMap((candidate) => candidate.draftResult.validations ?? []),
  };
}
