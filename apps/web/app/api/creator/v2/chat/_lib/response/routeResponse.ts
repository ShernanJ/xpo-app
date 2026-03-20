import type {
  SurfaceMode,
  V2ConversationMemory,
} from "../../../../../../../lib/agent-v2/contracts/chat.ts";
import type { ImageTurnContext } from "../../../../../../../lib/chat/chatMedia.ts";
import {
  buildAssistantContextPacket,
  buildInitialDraftVersionPayload,
  type ChatRouteResponseData,
} from "../request/routeLogic.ts";
import type {
  ChatReplyArtifacts,
  ChatReplyParseEnvelope,
} from "../../../../../../../lib/agent-v2/capabilities/reply/replyTurnLogic.ts";
import type { RoutingTrace } from "../../../../../../../lib/agent-v2/runtime/conversationManager.ts";
import type { ReplySourcePreview } from "../../../../../../../lib/reply-engine/replySourcePreview.ts";

type ReplySurfaceMode = Extract<
  SurfaceMode,
  "answer_directly" | "ask_one_question" | "offer_options" | "generate_full_output"
>;

export interface PlannedChatRouteProductEvent {
  eventType: string;
  properties: Record<string, unknown>;
}

export function buildReplyAssistantMessageData(args: {
  reply: string;
  outputShape: "coach_question" | "reply_candidate";
  surfaceMode: ReplySurfaceMode;
  quickReplies: unknown[];
  memory: V2ConversationMemory;
  routingDiagnostics: ChatRouteResponseData["routingDiagnostics"];
  clientTurnId: string | null;
  threadTitle: string;
  replyArtifacts?: ChatReplyArtifacts | null;
  replyParse?: ChatReplyParseEnvelope | null;
  replySourcePreview?: ReplySourcePreview | null;
}): ChatRouteResponseData {
  const primaryReplyDraft =
    args.replyArtifacts?.kind === "reply_draft"
      ? args.replyArtifacts.options[0]?.text?.trim() || null
      : null;
  const draftVersionPayload =
    args.outputShape === "reply_candidate" && primaryReplyDraft
      ? buildInitialDraftVersionPayload({
          draft: primaryReplyDraft,
          outputShape: "reply_candidate",
          supportAsset: null,
          selectedDraftContext: null,
          replySourcePreview: args.replySourcePreview ?? null,
        })
      : {
          draftArtifacts: [],
          draftVersions: undefined,
          activeDraftVersionId: undefined,
          previousVersionSnapshot: undefined,
          revisionChainId: undefined,
        };

  return {
    reply: args.reply,
    angles: [],
    quickReplies: args.quickReplies,
    plan: null,
    draft: primaryReplyDraft,
    drafts: primaryReplyDraft ? [primaryReplyDraft] : [],
    draftArtifacts: draftVersionPayload.draftArtifacts,
    draftVersions: draftVersionPayload.draftVersions,
    activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
    previousVersionSnapshot: draftVersionPayload.previousVersionSnapshot ?? undefined,
    revisionChainId: draftVersionPayload.revisionChainId,
    draftBundle: null,
    supportAsset: null,
    mediaAttachments: [],
    groundingSources: [],
    autoSavedSourceMaterials: null,
    outputShape: args.outputShape,
    surfaceMode: args.surfaceMode,
    memory: args.memory,
    routingDiagnostics: args.routingDiagnostics,
    requestTrace: {
      clientTurnId: args.clientTurnId,
    },
    threadTitle: args.threadTitle,
    billing: null,
    replyArtifacts: args.replyArtifacts || null,
    replyParse: args.replyParse || null,
    imageTurnContext: null as ImageTurnContext | null,
    contextPacket: buildAssistantContextPacket({
      reply: args.reply,
      plan: null,
      draft: primaryReplyDraft,
      activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
      revisionChainId: draftVersionPayload.revisionChainId,
      outputShape: args.outputShape,
      surfaceMode: args.surfaceMode,
      issuesFixed: [],
      groundingMode: null,
      groundingExplanation: null,
      groundingSources: [],
      quickReplies: args.quickReplies,
      replyArtifacts: args.replyArtifacts || null,
      replyParse: args.replyParse || null,
    }),
  };
}

export function planReplyAssistantTurnProductEvents(args: {
  eventType?: string;
  outputShape: "coach_question" | "reply_candidate";
  surfaceMode: ReplySurfaceMode;
  replyArtifacts?: ChatReplyArtifacts | null;
  replyParse?: ChatReplyParseEnvelope | null;
}): PlannedChatRouteProductEvent[] {
  if (!args.eventType) {
    return [];
  }

  return [
    {
      eventType: args.eventType,
      properties: {
        outputShape: args.outputShape,
        surfaceMode: args.surfaceMode,
        replyArtifactKind: args.replyArtifacts?.kind ?? null,
        replyParseConfidence: args.replyParse?.confidence ?? null,
      },
    },
  ];
}

export function planMainAssistantTurnProductEvents(args: {
  mappedData: Pick<
    ChatRouteResponseData,
    "outputShape" | "draft" | "surfaceMode" | "memory"
  >;
  analytics: {
    primaryGroundingMode: string | null;
    primaryGroundingSourceCount: number;
    autoSavedSourceMaterialCount: number;
  };
  explicitIntent: string | null;
}): PlannedChatRouteProductEvent[] {
  const events: PlannedChatRouteProductEvent[] = [];

  if (
    (args.mappedData.outputShape === "short_form_post" ||
      args.mappedData.outputShape === "long_form_post" ||
      args.mappedData.outputShape === "thread_seed") &&
    args.mappedData.draft
  ) {
    events.push({
      eventType: "draft_generated",
      properties: {
        outputShape: args.mappedData.outputShape,
        surfaceMode: args.mappedData.surfaceMode ?? null,
        groundingMode: args.analytics.primaryGroundingMode,
        groundingSourceCount: args.analytics.primaryGroundingSourceCount,
        usedSavedSources:
          args.analytics.primaryGroundingMode === "saved_sources" ||
          args.analytics.primaryGroundingMode === "mixed",
        usedSafeFramework: args.analytics.primaryGroundingMode === "safe_framework",
        clarificationQuestionsAsked:
          args.mappedData.memory?.clarificationQuestionsAsked ?? 0,
        autoSavedSourceMaterialCount:
          args.analytics.autoSavedSourceMaterialCount,
      },
    });
  }

  if (
    args.mappedData.outputShape === "coach_question" &&
    args.mappedData.surfaceMode === "ask_one_question"
  ) {
    events.push({
      eventType: "clarification_prompted",
      properties: {
        conversationState: args.mappedData.memory?.conversationState ?? null,
        clarificationQuestionsAsked:
          args.mappedData.memory?.clarificationQuestionsAsked ?? 0,
        hasTopicSummary: Boolean(args.mappedData.memory?.topicSummary),
        explicitIntent: args.explicitIntent || "auto",
      },
    });
  }

  if (args.mappedData.outputShape === "profile_analysis") {
    events.push({
      eventType: "profile_analysis_generated",
      properties: {
        surfaceMode: args.mappedData.surfaceMode ?? null,
      },
    });
  }

  return events;
}

export function dispatchPlannedProductEvents(args: {
  events: PlannedChatRouteProductEvent[];
  userId: string;
  xHandle: string | null;
  threadId: string | null;
  messageId: string | null;
  recordProductEvent: (args: {
    userId: string;
    xHandle: string | null;
    threadId: string | null;
    messageId: string | null;
    eventType: string;
    properties: Record<string, unknown>;
  }) => Promise<unknown>;
}): void {
  for (const event of args.events) {
    void args
      .recordProductEvent({
        userId: args.userId,
        xHandle: args.xHandle,
        threadId: args.threadId,
        messageId: args.messageId,
        eventType: event.eventType,
        properties: event.properties,
      })
      .catch((error) =>
        console.error(`Failed to record ${event.eventType} event:`, error),
      );
  }
}

export async function buildChatSuccessResponse(args: {
  mappedData: ChatRouteResponseData;
  createdAssistantMessageId?: string;
  newThreadId?: string;
  turnId?: string | null;
  userMessage?: {
    id: string;
    replySourcePreview?: ReplySourcePreview | null;
  } | null;
  routingTrace?: RoutingTrace;
  loadBilling: () => Promise<unknown>;
}): Promise<Response> {
  const billing = await args.loadBilling();

  return Response.json(
    {
      ok: true,
      data: {
        ...args.mappedData,
        billing,
        ...(args.routingTrace ? { routingTrace: args.routingTrace } : {}),
        ...(args.createdAssistantMessageId
          ? { messageId: args.createdAssistantMessageId }
          : {}),
        ...(args.userMessage ? { userMessage: args.userMessage } : {}),
        ...(args.newThreadId ? { newThreadId: args.newThreadId } : {}),
        ...(args.turnId ? { turnId: args.turnId } : {}),
      },
    },
    { status: 200 },
  );
}

export function buildChatAcceptedResponse(args: {
  executionMode: "queued";
  activeTurn: {
    turnId: string;
    threadId: string | null;
    status: string;
    progressStepId: string | null;
    progressLabel: string | null;
    progressExplanation: string | null;
    assistantMessageId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}): Response {
  return Response.json(
    {
      ok: true,
      data: {
        accepted: true,
        executionMode: args.executionMode,
        activeTurn: args.activeTurn,
      },
    },
    { status: 202 },
  );
}
