import type { NextResponse } from "next/server.js";
import type { V2ConversationMemory } from "../../../../../lib/agent-v2/contracts/chat.ts";
import type { NormalizedChatTurnDiagnostics } from "../../../../../lib/agent-v2/contracts/turnContract.ts";
import type { PlannedReplyTurn } from "../../../../../lib/agent-v2/orchestrator/replyTurnPlanner.ts";
import { buildReplyMemorySnapshot } from "../../../../../lib/agent-v2/orchestrator/replyTurnPlanner.ts";
import { persistAssistantTurn } from "./route.persistence.ts";
import {
  buildChatSuccessResponse,
  buildReplyAssistantMessageData,
  dispatchPlannedProductEvents,
  planReplyAssistantTurnProductEvents,
} from "./route.response.ts";

export interface FinalizeReplyTurnArgs {
  plannedTurn: PlannedReplyTurn;
  storedMemory: V2ConversationMemory;
  routingDiagnostics: NormalizedChatTurnDiagnostics;
  clientTurnId: string | null;
  defaultThreadTitle: string;
  storedThreadId: string | null;
  storedThreadTitle: string | null;
  requestedThreadId: string;
  userId: string;
  activeHandle: string | null;
  loadBilling: () => Promise<unknown>;
  recordProductEvent: (args: {
    userId: string;
    xHandle: string | null;
    threadId: string | null;
    messageId: string | null;
    eventType: string;
    properties: Record<string, unknown>;
  }) => Promise<unknown>;
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
): Promise<NextResponse> {
  return finalizeReplyTurnWithDeps(args, DEFAULT_REPLY_FINALIZATION_DEPS);
}

export async function finalizeReplyTurnWithDeps(
  args: FinalizeReplyTurnArgs,
  deps: ReplyFinalizationDeps,
): Promise<NextResponse> {
  const nextMemory = buildReplyMemorySnapshot({
    storedMemory: args.storedMemory,
    activeReplyContext: args.plannedTurn.activeReplyContext,
    selectedReplyOptionId: args.plannedTurn.selectedReplyOptionId,
  });
  let mappedData = deps.buildReplyAssistantMessageData({
    reply: args.plannedTurn.reply,
    outputShape: args.plannedTurn.outputShape,
    surfaceMode: args.plannedTurn.surfaceMode,
    quickReplies: args.plannedTurn.quickReplies,
    memory: nextMemory,
    routingDiagnostics: args.routingDiagnostics,
    clientTurnId: args.clientTurnId,
    threadTitle: args.storedThreadTitle || args.defaultThreadTitle,
    replyArtifacts: args.plannedTurn.replyArtifacts || null,
    replyParse: args.plannedTurn.replyParse || null,
  });

  let createdAssistantMessageId: string | undefined;
  if (args.storedThreadId) {
    const persistenceResult = await deps.persistAssistantTurn({
      threadId: args.storedThreadId,
      assistantMessageData: mappedData,
      threadUpdate: { updatedAt: new Date() },
      buildMemoryUpdate: (assistantMessageId) => ({
        preferredSurfaceMode: "structured",
        activeReplyContext: args.plannedTurn.activeReplyContext,
        activeReplyArtifactRef: args.plannedTurn.replyArtifacts
          ? {
              messageId: assistantMessageId,
              kind: args.plannedTurn.replyArtifacts.kind,
            }
          : null,
        selectedReplyOptionId:
          args.plannedTurn.selectedReplyOptionId === undefined
            ? null
            : args.plannedTurn.selectedReplyOptionId,
      }),
    });
    createdAssistantMessageId = persistenceResult.assistantMessageId;
    mappedData = {
      ...mappedData,
      threadTitle: persistenceResult.updatedThreadTitle || args.defaultThreadTitle,
    };
  }

  deps.dispatchPlannedProductEvents({
    events: deps.planReplyAssistantTurnProductEvents({
      eventType: args.plannedTurn.eventType,
      outputShape: args.plannedTurn.outputShape,
      surfaceMode: args.plannedTurn.surfaceMode,
      replyArtifacts: args.plannedTurn.replyArtifacts || null,
      replyParse: args.plannedTurn.replyParse || null,
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
    newThreadId: !args.requestedThreadId && args.storedThreadId ? args.storedThreadId : undefined,
    loadBilling: args.loadBilling,
  });
}
