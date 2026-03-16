import type { V2ConversationMemory } from "../../../../../../../lib/agent-v2/contracts/chat.ts";
import type { NormalizedChatTurnDiagnostics } from "../../../../../../../lib/agent-v2/contracts/turnContract.ts";
import { buildReplyMemorySnapshot } from "../../../../../../../lib/agent-v2/capabilities/reply/replyTurnPlanner.ts";
import type { PreparedHandledReplyTurn } from "../../../../../../../lib/agent-v2/capabilities/reply/handledReplyTurn.ts";
import { applyRuntimePersistenceTracePatch } from "../../../../../../../lib/agent-v2/runtime/runtimeTrace.ts";
import { persistAssistantTurn } from "../persistence/routePersistence.ts";
import {
  buildChatSuccessResponse,
  buildReplyAssistantMessageData,
  dispatchPlannedProductEvents,
  planReplyAssistantTurnProductEvents,
} from "../response/routeResponse.ts";

export interface FinalizeReplyTurnArgs {
  preparedTurn: PreparedHandledReplyTurn;
  storedMemory: V2ConversationMemory;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
  defaultThreadTitle: string;
  storedThreadId: string | null;
  storedThreadTitle: string | null;
  requestedThreadId: string;
  shouldIncludeRoutingTrace?: boolean;
  userId: string;
  activeHandle: string | null;
  turnId?: string | null;
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

export interface ReplyFinalizationDeps {
  persistAssistantTurn: typeof persistAssistantTurn;
  buildReplyAssistantMessageData: typeof buildReplyAssistantMessageData;
  planReplyAssistantTurnProductEvents: typeof planReplyAssistantTurnProductEvents;
  dispatchPlannedProductEvents: typeof dispatchPlannedProductEvents;
  buildChatSuccessResponse: typeof buildChatSuccessResponse;
}

const DEFAULT_REPLY_FINALIZATION_DEPS: ReplyFinalizationDeps = {
  persistAssistantTurn,
  buildReplyAssistantMessageData,
  planReplyAssistantTurnProductEvents,
  dispatchPlannedProductEvents,
  buildChatSuccessResponse,
};

export async function finalizeReplyTurn(
  args: FinalizeReplyTurnArgs,
): Promise<Response> {
  return finalizeReplyTurnWithDeps(args, DEFAULT_REPLY_FINALIZATION_DEPS);
}

export async function finalizeReplyTurnWithDeps(
  args: FinalizeReplyTurnArgs,
  deps: ReplyFinalizationDeps,
): Promise<Response> {
  const nextMemory = buildReplyMemorySnapshot({
    storedMemory: args.storedMemory,
    activeReplyContext: args.preparedTurn.plannedTurn.activeReplyContext,
    selectedReplyOptionId: args.preparedTurn.plannedTurn.selectedReplyOptionId,
  });
  let mappedData = deps.buildReplyAssistantMessageData({
    reply: args.preparedTurn.plannedTurn.reply,
    outputShape: args.preparedTurn.plannedTurn.outputShape,
    surfaceMode: args.preparedTurn.plannedTurn.surfaceMode,
    quickReplies: args.preparedTurn.plannedTurn.quickReplies,
    memory: nextMemory,
    routingDiagnostics: args.routingDiagnostics,
    clientTurnId: args.clientTurnId,
    threadTitle: args.storedThreadTitle || args.defaultThreadTitle,
    replyArtifacts: args.preparedTurn.plannedTurn.replyArtifacts || null,
    replyParse: args.preparedTurn.plannedTurn.replyParse || null,
  });

  let createdAssistantMessageId: string | undefined;
  if (args.storedThreadId) {
    const persistenceResult = await deps.persistAssistantTurn({
      threadId: args.storedThreadId,
      assistantMessageData: mappedData,
      threadUpdate: { updatedAt: new Date() },
      buildMemoryUpdate: (assistantMessageId) => ({
        preferredSurfaceMode: "structured",
        activeReplyContext: args.preparedTurn.plannedTurn.activeReplyContext,
        activeReplyArtifactRef: args.preparedTurn.plannedTurn.replyArtifacts
          ? {
              messageId: assistantMessageId,
              kind: args.preparedTurn.plannedTurn.replyArtifacts.kind,
            }
          : null,
        selectedReplyOptionId:
          args.preparedTurn.plannedTurn.selectedReplyOptionId === undefined
            ? null
            : args.preparedTurn.plannedTurn.selectedReplyOptionId,
      }),
    });
    createdAssistantMessageId = persistenceResult.assistantMessageId;
    applyRuntimePersistenceTracePatch(args.preparedTurn.routingTrace, persistenceResult.tracePatch);
    mappedData = {
      ...mappedData,
      threadTitle: persistenceResult.updatedThreadTitle || args.defaultThreadTitle,
    };
  }

  if (args.onAssistantTurnPersisted) {
    try {
      await args.onAssistantTurnPersisted(createdAssistantMessageId ?? null);
    } catch (error) {
      console.error("Failed to record reply turn completion:", error);
    }
  }

  deps.dispatchPlannedProductEvents({
    events: deps.planReplyAssistantTurnProductEvents({
      eventType: args.preparedTurn.plannedTurn.eventType,
      outputShape: args.preparedTurn.plannedTurn.outputShape,
      surfaceMode: args.preparedTurn.plannedTurn.surfaceMode,
      replyArtifacts: args.preparedTurn.plannedTurn.replyArtifacts || null,
      replyParse: args.preparedTurn.plannedTurn.replyParse || null,
    }),
    userId: args.userId,
    xHandle: args.activeHandle,
    threadId: args.storedThreadId,
    messageId: createdAssistantMessageId ?? null,
    recordProductEvent: args.recordProductEvent,
  });

  return await deps.buildChatSuccessResponse({
    mappedData,
    createdAssistantMessageId,
    turnId: args.turnId ?? null,
    newThreadId: !args.requestedThreadId && args.storedThreadId ? args.storedThreadId : undefined,
    routingTrace: args.shouldIncludeRoutingTrace
      ? args.preparedTurn.routingTrace
      : undefined,
    loadBilling: args.loadBilling,
  });
}
