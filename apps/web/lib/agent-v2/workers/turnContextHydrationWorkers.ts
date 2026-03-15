import type { ConversationServices } from "../runtime/services.ts";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { RetrievalResult } from "../core/retrieval";
import type { RuntimeWorkerExecution } from "../runtime/runtimeContracts.ts";
import { buildRuntimeWorkerExecution } from "../runtime/workerPlane.ts";

const TURN_CONTEXT_HYDRATION_GROUP_ID = "turn_context_hydration";

export interface TurnContextHydrationRequest {
  userId: string;
  effectiveXHandle: string;
  userMessage: string;
  topicSummary: string | null;
  services: Pick<ConversationServices, "generateStyleProfile" | "retrieveAnchors">;
}

export interface TurnContextHydrationResult {
  styleCard: VoiceStyleCard | null;
  anchors: RetrievalResult;
  workerExecutions: RuntimeWorkerExecution[];
}

export async function hydrateTurnContextWorkers(
  args: TurnContextHydrationRequest,
): Promise<TurnContextHydrationResult> {
  const focusTopic = args.userMessage || args.topicSummary || "growth";

  const [styleCard, anchors] = await Promise.all([
    args.services.generateStyleProfile(args.userId, args.effectiveXHandle, 20),
    args.services.retrieveAnchors(args.userId, args.effectiveXHandle, focusTopic),
  ]);

  return {
    styleCard,
    anchors,
    workerExecutions: [
      buildRuntimeWorkerExecution({
        worker: "load_style_profile",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: TURN_CONTEXT_HYDRATION_GROUP_ID,
        details: {
          hasStyleCard: Boolean(styleCard),
        },
      }),
      buildRuntimeWorkerExecution({
        worker: "retrieve_anchors",
        capability: "shared",
        phase: "context_load",
        mode: "parallel",
        status: "completed",
        groupId: TURN_CONTEXT_HYDRATION_GROUP_ID,
        details: {
          topicAnchorCount: anchors.topicAnchors.length,
          focusTopic,
        },
      }),
    ],
  };
}
