import { buildCreatorProfileHintsFromOnboarding } from "../grounding/creatorProfileHints";
import { planTurn } from "./turnPlanner";
import { hydrateTurnContextWorkers } from "../workers/turnContextHydrationWorkers.ts";
import { createConversationMemorySnapshot } from "../memory/memoryStore";
import { scopeMemoryForCurrentTurn } from "../memory/turnScopedMemory";
import {
  normalizeHandleForContext,
  type ConversationServices,
} from "../runtime/services.ts";
import type { OrchestratorInput } from "../runtime/types.ts";
import type { V2ConversationMemory } from "../contracts/chat";
import type { CreatorProfileHints } from "../grounding/groundingPacket";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { RetrievalResult } from "../core/retrieval";
import type { RuntimeWorkerExecution } from "../runtime/runtimeContracts.ts";

export interface TurnContext {
  userId: string;
  xHandle: string | null;
  effectiveXHandle: string;
  runId: string | undefined;
  threadId: string | undefined;
  userMessage: string;
  planSeedMessage: string | null;
  recentHistory: string;
  activeDraft: string | undefined;
  turnSource: OrchestratorInput["turnSource"];
  artifactContext: OrchestratorInput["artifactContext"];
  planSeedSource: OrchestratorInput["planSeedSource"];
  resolvedWorkflow: OrchestratorInput["resolvedWorkflow"];
  replyHandlingBypassedReason: OrchestratorInput["replyHandlingBypassedReason"];
  formatPreference: OrchestratorInput["formatPreference"];
  threadFramingStyle: OrchestratorInput["threadFramingStyle"];
  explicitIntent: OrchestratorInput["explicitIntent"];
  diagnosticContext: OrchestratorInput["diagnosticContext"];
  
  creatorProfileHints: CreatorProfileHints | null;
  memory: V2ConversationMemory;
  effectiveActiveConstraints: string[];
  turnPlan: ReturnType<typeof planTurn>;
  
  styleCard: VoiceStyleCard | null;
  anchors: RetrievalResult;
  initialWorkerExecutions: RuntimeWorkerExecution[];
}

export async function buildTurnContext(
  input: OrchestratorInput,
  services: ConversationServices,
): Promise<TurnContext> {
  const {
    userId,
    xHandle,
    runId,
    threadId,
    userMessage,
    planSeedMessage,
    recentHistory,
    explicitIntent,
    activeDraft,
    turnSource,
    artifactContext,
    planSeedSource,
    resolvedWorkflow,
    replyHandlingBypassedReason,
    formatPreference,
    threadFramingStyle,
    creatorProfileHints: inputCreatorProfileHints,
    diagnosticContext,
    preferenceConstraints,
  } = input;

  const preloadedRun = runId ? await services.getOnboardingRun(runId) : null;
  const runInputRecord = preloadedRun?.input as Record<string, unknown> | undefined;
  const runInputHandle =
    typeof runInputRecord?.account === "string" ? runInputRecord.account : null;
  
  const effectiveXHandle =
    normalizeHandleForContext(xHandle) ??
    normalizeHandleForContext(runInputHandle) ??
    "default";

  const creatorProfileHints =
    inputCreatorProfileHints ||
    (() => {
      const onboarding = preloadedRun?.result;
      if (!runId || !onboarding) {
        return null;
      }

      try {
        return buildCreatorProfileHintsFromOnboarding({
          runId,
          onboarding: onboarding as Parameters<typeof buildCreatorProfileHintsFromOnboarding>[0]["onboarding"],
        });
      } catch {
        return null;
      }
    })();

  let memoryRecord = await services.getConversationMemory({ runId, threadId });
  if (!memoryRecord) {
    memoryRecord = await services.createConversationMemory({
      runId,
      threadId,
      userId: userId === "anonymous" ? null : userId,
    });
  }

  const persistedMemory = createConversationMemorySnapshot(
    memoryRecord as unknown as Record<string, unknown>,
  );
  const memory = scopeMemoryForCurrentTurn({
    userMessage,
    activeDraft,
    memory: persistedMemory,
    resolvedWorkflow,
  });
  
  const effectiveActiveConstraints = Array.from(
    new Set([
      ...memory.activeConstraints,
      ...((preferenceConstraints || []).filter((value) => value.trim().length > 0)),
    ]),
  );

  const turnPlan = planTurn({
    userMessage,
    recentHistory,
    activeDraft,
    memory,
    explicitIntent,
  });

  const {
    styleCard,
    anchors,
    workerExecutions: initialWorkerExecutions,
  } = await hydrateTurnContextWorkers({
    userId,
    effectiveXHandle,
    userMessage,
    topicSummary: memory.topicSummary,
    services,
  });

  return {
    userId,
    xHandle: xHandle ?? null,
    effectiveXHandle,
    runId,
    threadId,
    userMessage,
    planSeedMessage: planSeedMessage ?? null,
    recentHistory,
    activeDraft,
    turnSource,
    artifactContext,
    planSeedSource,
    resolvedWorkflow,
    replyHandlingBypassedReason,
    formatPreference,
    threadFramingStyle,
    explicitIntent,
    diagnosticContext,
    creatorProfileHints,
    memory,
    effectiveActiveConstraints,
    turnPlan,
    styleCard,
    anchors,
    initialWorkerExecutions,
  };
}
