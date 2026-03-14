import type {
  CapabilityName,
  RuntimeWorkerExecution,
} from "../runtime/runtimeContracts.ts";
import { buildRuntimeWorkerExecution } from "../orchestrator/workerPlane.ts";

const HISTORICAL_TEXT_LOAD_GROUP_ID = "historical_text_load";

export interface HistoricalTextLoadRequest {
  userId: string;
  xHandle?: string | null;
  capability: CapabilityName;
  loadPosts: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<Array<{ text: string }>>;
  loadDraftCandidates: (args: {
    userId: string;
    xHandle?: string | null;
  }) => Promise<Array<{ artifact: unknown }>>;
}

export interface HistoricalTextLoadResult {
  texts: string[];
  workerExecutions: RuntimeWorkerExecution[];
}

export async function loadHistoricalTextWorkers(
  args: HistoricalTextLoadRequest,
): Promise<HistoricalTextLoadResult> {
  const [posts, queuedCandidates] = await Promise.all([
    args.loadPosts({
      userId: args.userId,
      xHandle: args.xHandle,
    }),
    args.loadDraftCandidates({
      userId: args.userId,
      xHandle: args.xHandle,
    }),
  ]);

  const queuedDrafts = queuedCandidates
    .map((candidate) => {
      const artifact =
        candidate.artifact && typeof candidate.artifact === "object" && !Array.isArray(candidate.artifact)
          ? (candidate.artifact as Record<string, unknown>)
          : null;
      return typeof artifact?.content === "string" ? artifact.content : null;
    })
    .filter((value): value is string => Boolean(value));

  return {
    texts: [...posts.map((post) => post.text), ...queuedDrafts],
    workerExecutions: [
      buildRuntimeWorkerExecution({
        worker: "load_historical_posts",
        capability: args.capability,
        phase: "execution",
        mode: "parallel",
        status: "completed",
        groupId: HISTORICAL_TEXT_LOAD_GROUP_ID,
        details: {
          postCount: posts.length,
        },
      }),
      buildRuntimeWorkerExecution({
        worker: "load_queued_draft_candidates",
        capability: args.capability,
        phase: "execution",
        mode: "parallel",
        status: "completed",
        groupId: HISTORICAL_TEXT_LOAD_GROUP_ID,
        details: {
          candidateCount: queuedCandidates.length,
          extractedDraftCount: queuedDrafts.length,
        },
      }),
    ],
  };
}
