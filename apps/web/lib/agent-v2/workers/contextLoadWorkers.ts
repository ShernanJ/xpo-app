import type { ConversationServices } from "../runtime/services.ts";
import type { SourceMaterialAssetRecord } from "../grounding/sourceMaterials";
import type { RuntimeWorkerExecution } from "../runtime/runtimeContracts.ts";
import { buildRuntimeWorkerExecution } from "../runtime/workerPlane.ts";

const INITIAL_CONTEXT_LOAD_GROUP_ID = "initial_context_load";

function shouldExtractDurableStyleRules(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized || normalized.length < 8) {
    return false;
  }

  return (
    /\bno\s+(?:emoji|emojis|caps|capitalization)\b/.test(normalized) ||
    /\ball\s+lowercase\b/.test(normalized) ||
    /\b(?:always|never|avoid|stop|keep|use|write|make it|less|more)\b.*\b(?:emoji|emojis|lowercase|uppercase|caps|capitalization|punctuation|bullet|bullets|line break|line breaks|tone|voice|cringe|formal|casual|shorter|longer|salesy|hype)\b/.test(
      normalized,
    ) ||
    /\bi\s+(?:don['’]?t|do not|never|usually|typically)\b.*\b(?:say|sound|write|post|use)\b/.test(
      normalized,
    )
  );
}

function shouldExtractDurableFacts(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized || normalized.length < 8) {
    return false;
  }

  return (
    /\b(?:i['’]?m|i am|i['’]?ve|i have|we['’]?re|we are|i work|i live|i built|i launched|i run|my product|my company|my startup|my app)\b/.test(
      normalized,
    ) ||
    /\bmy x handle is\b/.test(normalized) ||
    /\bis my x handle\b/.test(normalized) ||
    /\b[a-z0-9][a-z0-9'’-]{1,30}\s+(?:is|does|helps|lets)\b/i.test(userMessage)
  );
}

export interface InitialContextLoadRequest {
  userId: string;
  effectiveXHandle: string;
  userMessage: string;
  recentHistory: string;
  services: Pick<
    ConversationServices,
    "extractStyleRules" | "extractCoreFacts" | "getSourceMaterialAssets"
  >;
}

export interface InitialContextLoadResult {
  extractedRules: string[] | null;
  extractedFacts: string[] | null;
  sourceMaterialAssets: SourceMaterialAssetRecord[];
  workerExecutions: RuntimeWorkerExecution[];
}

export async function loadInitialContextWorkers(
  args: InitialContextLoadRequest,
): Promise<InitialContextLoadResult> {
  const shouldRun = args.userId !== "anonymous";
  const shouldExtractRules = shouldRun && shouldExtractDurableStyleRules(args.userMessage);
  const shouldExtractFacts = shouldRun && shouldExtractDurableFacts(args.userMessage);

  const [extractedRules, extractedFacts, sourceMaterialAssets] = await Promise.all([
    shouldExtractRules
      ? args.services.extractStyleRules(args.userMessage, args.recentHistory)
      : Promise.resolve(null),
    shouldExtractFacts
      ? args.services.extractCoreFacts(args.userMessage, args.recentHistory)
      : Promise.resolve(null),
    shouldRun
      ? args.services.getSourceMaterialAssets({
          userId: args.userId,
          xHandle: args.effectiveXHandle,
        })
      : Promise.resolve([]),
  ]);

  return {
    extractedRules,
    extractedFacts,
    sourceMaterialAssets,
    workerExecutions: [
      buildRuntimeWorkerExecution({
        worker: "extract_style_rules",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: shouldExtractRules ? "completed" : "skipped",
        groupId: INITIAL_CONTEXT_LOAD_GROUP_ID,
        details: shouldExtractRules
          ? { hasRules: Array.isArray(extractedRules) && extractedRules.length > 0 }
          : { reason: shouldRun ? "not_durable_style_feedback" : "anonymous_user" },
      }),
      buildRuntimeWorkerExecution({
        worker: "extract_core_facts",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: shouldExtractFacts ? "completed" : "skipped",
        groupId: INITIAL_CONTEXT_LOAD_GROUP_ID,
        details: shouldExtractFacts
          ? { hasFacts: Array.isArray(extractedFacts) && extractedFacts.length > 0 }
          : { reason: shouldRun ? "not_durable_fact_feedback" : "anonymous_user" },
      }),
      buildRuntimeWorkerExecution({
        worker: "load_source_material_assets",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: shouldRun ? "completed" : "skipped",
        groupId: INITIAL_CONTEXT_LOAD_GROUP_ID,
        details: shouldRun
          ? { assetCount: Array.isArray(sourceMaterialAssets) ? sourceMaterialAssets.length : 0 }
          : { reason: "anonymous_user" },
      }),
    ],
  };
}
