import type { V2ConversationMemory } from "../../../../../lib/agent-v2/contracts/chat.ts";
import {
  planReplyTurn,
  resolveReplyTurnState as resolveReplyTurnStateInPlanner,
  type PlannedReplyTurn,
  type ReplyContinuationAction,
  type ResolvedReplyTurnState,
} from "../../../../../lib/agent-v2/orchestrator/replyContinuationPlanner.ts";
import type {
  ChatArtifactContext,
  NormalizedChatTurnDiagnostics,
  ChatTurnSource,
} from "../../../../../lib/agent-v2/contracts/turnContract.ts";
import { type ActiveReplyContext } from "./reply.logic.ts";
import { persistAssistantTurn } from "./route.persistence.ts";
import {
  buildChatSuccessResponse,
  buildReplyAssistantMessageData,
  dispatchPlannedProductEvents,
  planReplyAssistantTurnProductEvents,
} from "./route.response.ts";

export { planReplyTurn };

export function buildReplyMemorySnapshot(args: {
  storedMemory: V2ConversationMemory;
  activeReplyContext: ActiveReplyContext | null;
  selectedReplyOptionId?: string | null;
}): V2ConversationMemory {
  return {
    ...args.storedMemory,
    activeReplyContext: args.activeReplyContext,
    activeReplyArtifactRef: args.storedMemory.activeReplyArtifactRef,
    selectedReplyOptionId:
      args.selectedReplyOptionId === undefined
        ? args.storedMemory.selectedReplyOptionId
        : args.selectedReplyOptionId,
    preferredSurfaceMode: "structured",
  };
}

interface StructuredReplyContextInput {
  sourceText?: string | null;
  sourceUrl?: string | null;
  authorHandle?: string | null;
}

function resolveStructuredReplyContinuation(
  artifactContext: ChatArtifactContext | null,
): ReplyContinuationAction | null {
  if (artifactContext?.kind === "reply_option_select") {
    return {
      type: "select_option",
      optionIndex: artifactContext.optionIndex,
    };
  }

  if (artifactContext?.kind === "reply_confirmation") {
    return artifactContext.decision === "confirm"
      ? { type: "confirm" }
      : { type: "decline" };
  }

  return null;
}

export function resolveReplyTurnState(args: {
  activeHandle: string | null;
  creatorAgentContext: Parameters<typeof resolveReplyTurnStateInPlanner>[0]["creatorAgentContext"];
  effectiveMessage: string;
  structuredReplyContext: StructuredReplyContextInput | null;
  artifactContext: ChatArtifactContext | null;
  turnSource: ChatTurnSource;
  shouldBypassReplyHandling: boolean;
  activeReplyContext: ActiveReplyContext | null;
  toneRisk: unknown;
  goal: unknown;
}): ResolvedReplyTurnState {
  return resolveReplyTurnStateInPlanner({
    activeHandle: args.activeHandle,
    creatorAgentContext: args.creatorAgentContext,
    effectiveMessage: args.effectiveMessage,
    structuredReplyContext: args.structuredReplyContext,
    turnSource: args.turnSource,
    shouldBypassReplyHandling: args.shouldBypassReplyHandling,
    activeReplyContext: args.activeReplyContext,
    structuredReplyContinuation: resolveStructuredReplyContinuation(args.artifactContext),
    toneRisk: args.toneRisk,
    goal: args.goal,
  });
}

export async function finalizeReplyTurn(args: {
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
}): Promise<Response> {
  const nextMemory = buildReplyMemorySnapshot({
    storedMemory: args.storedMemory,
    activeReplyContext: args.plannedTurn.activeReplyContext,
    selectedReplyOptionId: args.plannedTurn.selectedReplyOptionId,
  });
  let mappedData = buildReplyAssistantMessageData({
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
    const persistenceResult = await persistAssistantTurn({
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

  dispatchPlannedProductEvents({
    events: planReplyAssistantTurnProductEvents({
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

  return await buildChatSuccessResponse({
    mappedData,
    createdAssistantMessageId,
    newThreadId: !args.requestedThreadId && args.storedThreadId ? args.storedThreadId : undefined,
    loadBilling: args.loadBilling,
  });
}
