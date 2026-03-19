import { applyRuntimePersistenceTracePatch } from "../../../../../../../lib/agent-v2/runtime/runtimeTrace.ts";
import type { RoutingTrace } from "../../../../../../../lib/agent-v2/runtime/conversationManager.ts";
import type { PreparedChatRouteTurn } from "../request/routeLogic.ts";
import { persistAssistantTurn } from "../persistence/routePersistence.ts";
import {
  buildChatSuccessResponse,
  dispatchPlannedProductEvents,
  planMainAssistantTurnProductEvents,
} from "../response/routeResponse.ts";

export interface FinalizeMainAssistantTurnArgs {
  preparedTurn: PreparedChatRouteTurn;
  routingTrace: RoutingTrace;
  shouldIncludeRoutingTrace?: boolean;
  storedThreadId: string | null;
  requestedThreadId: string;
  userId: string;
  activeHandle: string | null;
  runId: string | null;
  turnId?: string | null;
  sourcePrompt: string;
  explicitIntent: string | null;
  loadBilling: () => Promise<unknown>;
  recordProductEvent: (args: {
    userId: string;
    xHandle: string | null;
    threadId: string | null;
    messageId: string | null;
    eventType: string;
    properties: Record<string, unknown>;
  }) => Promise<unknown>;
  onAssistantTurnPersisted?: (assistantMessageId: string | null) => Promise<void>;
}

export interface MainAssistantFinalizationDeps {
  persistAssistantTurn: typeof persistAssistantTurn;
  planMainAssistantTurnProductEvents: typeof planMainAssistantTurnProductEvents;
  dispatchPlannedProductEvents: typeof dispatchPlannedProductEvents;
  buildChatSuccessResponse: typeof buildChatSuccessResponse;
}

const DEFAULT_MAIN_ASSISTANT_FINALIZATION_DEPS: MainAssistantFinalizationDeps = {
  persistAssistantTurn,
  planMainAssistantTurnProductEvents,
  dispatchPlannedProductEvents,
  buildChatSuccessResponse,
};

export async function finalizeMainAssistantTurn(
  args: FinalizeMainAssistantTurnArgs,
): Promise<Response> {
  return finalizeMainAssistantTurnWithDeps(
    args,
    DEFAULT_MAIN_ASSISTANT_FINALIZATION_DEPS,
  );
}

export async function finalizeMainAssistantTurnWithDeps(
  args: FinalizeMainAssistantTurnArgs,
  deps: MainAssistantFinalizationDeps,
): Promise<Response> {
  let mappedData = {
    ...args.preparedTurn.persistencePlan.assistantMessageData,
  };
  let createdAssistantMessageId: string | undefined;
  const persistenceStartedAt = Date.now();

  if (args.storedThreadId) {
    const persistenceResult = await deps.persistAssistantTurn({
      threadId: args.storedThreadId,
      assistantMessageData: mappedData,
      threadUpdate: args.preparedTurn.persistencePlan.threadUpdate,
      buildMemoryUpdate: (assistantMessageId) => ({
        ...(args.preparedTurn.persistencePlan.memoryUpdate.activeDraftVersionId
          ? {
              activeDraftRef: {
                messageId: assistantMessageId,
                versionId:
                  args.preparedTurn.persistencePlan.memoryUpdate
                    .activeDraftVersionId,
                revisionChainId:
                  args.preparedTurn.persistencePlan.memoryUpdate
                    .revisionChainId ?? null,
              },
            }
          : {}),
        preferredSurfaceMode:
          args.preparedTurn.persistencePlan.memoryUpdate.preferredSurfaceMode,
        ...(args.preparedTurn.persistencePlan.memoryUpdate.shouldClearReplyWorkflow
          ? {
              activeReplyContext: null,
              activeReplyArtifactRef: null,
              selectedReplyOptionId: null,
            }
          : {}),
      }),
      contentTitleSyncContext: {
        userId: args.userId,
        xHandle: args.activeHandle,
      },
      draftCandidateCreates: args.preparedTurn.persistencePlan.draftCandidateCreates,
      draftCandidateContext: {
        userId: args.userId,
        xHandle: args.activeHandle,
        runId: args.runId,
        sourcePrompt: args.sourcePrompt,
        sourcePlaybook: "chat_bundle",
        outputShape: args.preparedTurn.rawResponse.outputShape,
      },
    });
    applyRuntimePersistenceTracePatch(args.routingTrace, persistenceResult.tracePatch);
    createdAssistantMessageId = persistenceResult.assistantMessageId;
    mappedData = {
      ...mappedData,
      threadTitle: persistenceResult.updatedThreadTitle || mappedData.threadTitle,
    };
  }
  args.routingTrace.timings = {
    ...(args.routingTrace.timings || {}),
    persistenceMs: Date.now() - persistenceStartedAt,
  };

  if (args.onAssistantTurnPersisted) {
    try {
      await args.onAssistantTurnPersisted(createdAssistantMessageId ?? null);
    } catch (error) {
      console.error("Failed to record assistant turn completion:", error);
    }
  }

  deps.dispatchPlannedProductEvents({
    events: deps.planMainAssistantTurnProductEvents({
      mappedData,
      analytics: args.preparedTurn.persistencePlan.analytics,
      explicitIntent: args.explicitIntent,
    }),
    userId: args.userId,
    xHandle: args.activeHandle,
    threadId: args.storedThreadId,
    messageId: createdAssistantMessageId ?? null,
    recordProductEvent: args.recordProductEvent,
  });
  args.routingTrace.timings = {
    ...(args.routingTrace.timings || {}),
    totalMs:
      (args.routingTrace.timings?.preflightMs || 0) +
      (args.routingTrace.timings?.runtimeContextLoadMs || 0) +
      (args.routingTrace.timings?.draftingMs || 0) +
      (args.routingTrace.timings?.validationMs || 0) +
      (args.routingTrace.timings?.persistenceMs || 0),
  };

  return await deps.buildChatSuccessResponse({
    mappedData,
    createdAssistantMessageId,
    turnId: args.turnId ?? null,
    newThreadId:
      !args.requestedThreadId && args.storedThreadId
        ? args.storedThreadId
        : undefined,
    routingTrace: args.shouldIncludeRoutingTrace
      ? args.routingTrace
      : undefined,
    loadBilling: args.loadBilling,
  });
}
