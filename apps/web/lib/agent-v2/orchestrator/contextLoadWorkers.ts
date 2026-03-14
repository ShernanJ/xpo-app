import type { ConversationServices } from "../runtime/services.ts";
import type { SourceMaterialAssetRecord } from "./sourceMaterials";
import type { RuntimeWorkerExecution } from "../runtime/runtimeContracts.ts";
import { buildRuntimeWorkerExecution } from "./workerPlane.ts";

const INITIAL_CONTEXT_LOAD_GROUP_ID = "initial_context_load";

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

  const [extractedRules, extractedFacts, sourceMaterialAssets] = await Promise.all([
    shouldRun
      ? args.services.extractStyleRules(args.userMessage, args.recentHistory)
      : Promise.resolve(null),
    shouldRun
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
        status: shouldRun ? "completed" : "skipped",
        groupId: INITIAL_CONTEXT_LOAD_GROUP_ID,
        details: shouldRun
          ? { hasRules: Array.isArray(extractedRules) && extractedRules.length > 0 }
          : { reason: "anonymous_user" },
      }),
      buildRuntimeWorkerExecution({
        worker: "extract_core_facts",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: shouldRun ? "completed" : "skipped",
        groupId: INITIAL_CONTEXT_LOAD_GROUP_ID,
        details: shouldRun
          ? { hasFacts: Array.isArray(extractedFacts) && extractedFacts.length > 0 }
          : { reason: "anonymous_user" },
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
