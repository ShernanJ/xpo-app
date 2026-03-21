import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  manageConversationTurnRaw,
  type RawOrchestratorResponse,
} from "@/lib/agent-v2/runtime/conversationManager";
import {
  saveStyleProfile,
  type UserPreferences,
} from "@/lib/agent-v2/core/styleProfile";
import { syncGhostwriterProfileFromCreatorProfile } from "@/lib/agent-v2/core/ghostwriterProfile";
import type {
  CreatorChatQuickReply,
  V2ConversationMemory,
} from "@/lib/agent-v2/contracts/chat";
import {
  resolveThreadFramingStyle,
} from "@/lib/onboarding/shared/draftArtifacts";
import { getServerSession } from "@/lib/auth/serverSession";
import { ACTION_CREDIT_COST } from "@/lib/billing/config";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import { recordProductEvent } from "@/lib/productEvents";
import type { CreatorChatTransportRequest } from "@/lib/agent-v2/contracts/chatTransport";
import { normalizeClientTurnId } from "@/lib/agent-v2/contracts/chatTransport";
import {
  parseSelectedDraftContext,
  type SelectedDraftContext,
} from "./_lib/request/routeLogic";
import { prepareManagedMainTurn } from "./_lib/request/routePostprocess";
import {
  loadRouteConversationContext,
  resolveRouteProfileContext,
  resolveRouteStoredRun,
  resolveRouteThreadState,
} from "./_lib/request/routePreflight";
import { normalizeChatTurn } from "./_lib/normalization/turnNormalization";
import {
  buildRouteServerErrorResponse,
  chargeRouteTurn,
  maybeReplayDuplicateTurn,
  refundRouteTurnCharge,
} from "./_lib/control/routeControlPlane";
import {
  findActiveTurnForThread,
  heartbeatTurnExecution,
  markTurnFailed,
  markTurnProgress,
  readTurnByIdentity,
  isTurnCancellationRequested,
  markTurnCancelled,
  markTurnCompleted,
  upsertQueuedTurnControl,
  upsertRunningTurnControl,
} from "./_lib/control/routeTurnControl";
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/runtime/diagnostics";
import { isMultiDraftRequest } from "@/lib/agent-v2/core/conversationHeuristics";
import { prepareHandledReplyTurn } from "@/lib/agent-v2/capabilities/reply/handledReplyTurn";
import {
  buildPendingStatusPlan,
  type PendingStatusStepId,
} from "@/lib/chat/agentProgress";
import {
  buildChatStreamErrorEvent,
  buildChatStreamProgressEvent,
  buildChatStreamResultEvent,
  encodeChatStreamEvent,
  type ChatStreamProgressEventData,
} from "@/lib/chat/chatStream";
import { finalizeMainAssistantTurn } from "./_lib/main/routeMainFinalize";
import {
  buildProfileAnalysisArtifact,
  buildInlineProfileAnalysisResponse,
  generateProfileAnalysisNarrative,
  isInlineProfileAnalysisRequest,
} from "./_lib/profile/inlineProfileAnalysis";
import {
  PROFILE_ANALYSIS_FEEDBACK_PROMPT,
  buildProfileAnalysisBioRewriteResponse,
  buildProfileAnalysisQuestionResponse,
  extractPersistedProfileAnalysisArtifact,
  interpretProfileAnalysisFollowUp,
} from "./_lib/profile/profileAnalysisFollowUp";
import { buildProfileAnalysisQuickReplies } from "@/lib/agent-v2/responses/profileAnalysisQuickReplies";
import { finalizeReplyTurn } from "./_lib/reply/routeReplyFinalize";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { isMissingChatTurnControlTableError } from "@/lib/agent-v2/persistence/prismaGuards";
import {
  buildChatMediaAttachmentRef,
  type ChatMediaAttachmentRef,
} from "@/lib/chat/chatMedia";
import { registerChatRouteHandler } from "./_lib/routeHandlerRegistry";
import { buildChatAcceptedResponse } from "./_lib/response/routeResponse";
import { resolveProgressTopic } from "./_lib/response/routeProgressTopic";
import { applyProfileAnalysisConversationPatchToStyleCard } from "../profile-audit/route.logic";

type CreatorChatRequest = CreatorChatTransportRequest & Record<string, unknown>;
type StreamProgressCallback = (
  data: ChatStreamProgressEventData,
) => Promise<void> | void;

const DEFAULT_THREAD_TITLE = "New Chat";
const CHAT_TURN_LEASE_MS = 30_000;
const CHAT_TURN_HEARTBEAT_MS = 5_000;

interface ChatTurnExecutionControl {
  turnId?: string | null;
  existingUserMessageId?: string | null;
  leaseOwner?: string | null;
  leaseMs?: number;
}

type ChatTurnExecutionMode = "inline" | "queued";

type RouteProgressCopy = Pick<ChatStreamProgressEventData, "label" | "explanation">;

function normalizeProgressCopy(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function lowerCaseFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function resolveProgressAccountLabel(activeHandle?: string | null): string {
  const normalizedHandle = activeHandle?.trim().replace(/^@+/, "");
  return normalizedHandle ? `@${normalizedHandle}` : "your account";
}

function resolveRecentPostLead(count?: number | null): string {
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return `${count} recent post${count === 1 ? "" : "s"}`;
  }

  return "recent posts";
}

function buildRouteProgressCopy(args: {
  workflow: ChatStreamProgressEventData["workflow"];
  stepId: PendingStatusStepId;
  activeHandle?: string | null;
  selectedDraftContext?: SelectedDraftContext | null;
  structuredReplyContext?: {
    authorHandle?: string | null;
  } | null;
  creatorProfileHints?: {
    knownFor?: string | null;
    contentPillars?: string[];
  } | null;
  profileReplyContext?: {
    topicInsights?: Array<{ label?: string | null }>;
    topicBullets?: string[];
    recentPostCount?: number;
  } | null;
}): RouteProgressCopy | null {
  const topic = resolveProgressTopic({
    profileReplyContext: args.profileReplyContext ?? null,
    creatorProfileHints: args.creatorProfileHints ?? null,
  });
  const accountLabel = resolveProgressAccountLabel(args.activeHandle);
  const recentPostsLabel = resolveRecentPostLead(args.profileReplyContext?.recentPostCount);
  const replyAuthorHandle = normalizeProgressCopy(args.structuredReplyContext?.authorHandle);

  switch (args.stepId) {
    case "understand_request":
      if (args.workflow === "reply_to_post" && replyAuthorHandle) {
        return {
          label: `Reading the conversation around @${replyAuthorHandle.replace(/^@+/, "")}`,
          explanation: "This helps the reply fit the tone and context of the thread.",
        };
      }

      if (args.selectedDraftContext) {
        return {
          label: "Reviewing the current draft before changing it",
          explanation: "This helps keep the main idea while deciding what should change.",
        };
      }

      if (args.workflow === "ideate") {
        return {
          label: "Getting clear on what kind of idea would help most",
          explanation: "This keeps the next suggestions pointed at the job you actually want done.",
        };
      }

      if (args.workflow === "plan_then_draft") {
        return {
          label: "Getting clear on the post you want to make",
          explanation: "This helps the draft start in the right direction before any writing begins.",
        };
      }

      return null;
    case "gather_context":
      return {
        label: `Looking through ${recentPostsLabel} from ${accountLabel}`,
        explanation: topic
          ? `This helps pull in recurring themes, like ${lowerCaseFirst(topic)}.`
          : "This helps ground the response in what your account has been posting recently.",
      };
    case "plan_response":
      return {
        label: topic
          ? `Leaning into the strongest angle around ${lowerCaseFirst(topic)}`
          : "Leaning into the strongest angle",
        explanation: "This helps narrow the response to the clearest, most usable direction.",
      };
    case "generate_output":
      return {
        label: topic
          ? `Drafting around ${lowerCaseFirst(topic)}`
          : "Turning the direction into a working draft",
        explanation: "This is where the first useful version starts taking shape.",
      };
    case "validate_output":
      return {
        label: "Checking the final wording",
        explanation: topic
          ? `This helps keep the final version clear while still feeling connected to ${lowerCaseFirst(topic)}.`
          : "This helps make sure the output reads cleanly before it lands in the thread.",
      };
    case "persist_response":
      return {
        label: "Saving the result back into the chat",
        explanation: topic
          ? `This helps return the finished version cleanly while staying grounded in ${lowerCaseFirst(topic)}.`
          : "This helps the final version come back clear, clean, and attached to the right turn.",
      };
    default:
      return null;
  }
}

function buildProfileAnalysisFollowUpRawResponse(args: {
  response: string;
  memory: V2ConversationMemory;
  quickReplies?: CreatorChatQuickReply[];
}): RawOrchestratorResponse {
  return {
    mode: "coach",
    outputShape: "coach_question",
    response: args.response,
    data: {
      ...(args.quickReplies && args.quickReplies.length > 0
        ? { quickReplies: args.quickReplies }
        : {}),
      profileAnalysisConversation: {
        preserveActiveRef: true,
      },
    },
    memory: {
      ...args.memory,
      assistantTurnCount: (args.memory.assistantTurnCount ?? 0) + 1,
      unresolvedQuestion: null,
      preferredSurfaceMode: "structured",
    },
    presentationStyle: "plain_paragraph",
  };
}

function resolveChatTurnCreditCost(args: {
  explicitIntent:
    | "coach"
    | "ideate"
    | "plan"
    | "planner_feedback"
    | "draft"
    | "review"
    | "edit"
    | "answer_question"
    | null;
  message: string;
  selectedDraftContext: SelectedDraftContext | null;
}): number {
  if (args.selectedDraftContext) {
    return ACTION_CREDIT_COST.chat_draft_like;
  }

  if (
    args.explicitIntent === "draft" ||
    args.explicitIntent === "edit" ||
    args.explicitIntent === "review" ||
    args.explicitIntent === "planner_feedback"
  ) {
    return ACTION_CREDIT_COST.chat_draft_like;
  }

  const normalized = args.message.trim().toLowerCase();
  if (isMultiDraftRequest(normalized)) {
    return ACTION_CREDIT_COST.chat_draft_like;
  }

  if (
    /\b(draft|rewrite|revise|edit|fix this draft|make this tighter|make it tighter)\b/.test(
      normalized,
    )
  ) {
    return ACTION_CREDIT_COST.chat_draft_like;
  }

  return ACTION_CREDIT_COST.chat_standard;
}

function resolveChatTurnExecutionMode(): ChatTurnExecutionMode {
  const configured = process.env.CHAT_TURN_EXECUTION_MODE?.trim().toLowerCase();
  return configured === "queued" ? "queued" : "inline";
}

function buildQueuedProgressCopy() {
  return {
    label: "Queued for background execution",
    explanation:
      "This keeps the request responsive while the background worker picks up the turn.",
  };
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const monetizationEnabled = isMonetizationEnabled();
  const sessionPromise = getServerSession();
  const bodyResultPromise: Promise<
    | { ok: true; value: CreatorChatRequest }
    | { ok: false; response: Response }
  > = parseJsonBody<CreatorChatRequest>(request, {
    maxBytes: 128 * 1024,
  }).then((result) =>
    result.ok
      ? { ok: true as const, value: result.value }
      : { ok: false as const, response: result.response },
  );

  const [session, bodyResult] = await Promise.all([
    sessionPromise,
    bodyResultPromise,
  ]);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const userRateLimit = await consumeRateLimit({
    key: `creator:v2_chat:user:${session.user.id}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!userRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many chat turns. Please wait a moment before sending another message.",
      extras: {
        retryAfterSeconds: userRateLimit.retryAfterSeconds,
      },
    });
  }

  const ipRateLimit = await consumeRateLimit({
    key: `creator:v2_chat:ip:${getRequestIp(request)}`,
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!ipRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many chat turns from this network. Please wait a moment before sending another message.",
      extras: {
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      },
    });
  }

  const executionMode = resolveChatTurnExecutionMode();
  if (executionMode === "queued") {
    return enqueueChatRouteRequest({
      request,
      body,
      monetizationEnabled,
      userId: session.user.id,
    });
  }

  if (body.stream === true) {
    return streamChatRouteResponse({
      execute: async (onProgress) =>
        handleChatRouteRequest({
          request,
          body,
          monetizationEnabled,
          userId: session.user.id,
          onProgress,
          turnControl: {
            leaseOwner: `route:${randomUUID()}`,
            leaseMs: CHAT_TURN_LEASE_MS,
          },
        }),
    });
  }

  return await handleChatRouteRequest({
    request,
    body,
    monetizationEnabled,
    userId: session.user.id,
    turnControl: {
      leaseOwner: `route:${randomUUID()}`,
      leaseMs: CHAT_TURN_LEASE_MS,
    },
  });
}

async function enqueueChatRouteRequest(args: {
  request: NextRequest;
  body: CreatorChatRequest;
  monetizationEnabled: boolean;
  userId: string;
}): Promise<Response> {
  const loadBillingStateForResponse = () =>
    args.monetizationEnabled
      ? getBillingStateForUser(args.userId)
      : Promise.resolve(null);

  const threadId =
    typeof args.body.threadId === "string" ? args.body.threadId.trim() : "";
  const runId = typeof args.body.runId === "string" ? args.body.runId.trim() : "";
  const clientTurnId = normalizeClientTurnId(args.body.clientTurnId) ?? randomUUID();
  const normalizedTurn = normalizeChatTurn({ body: args.body });
  const formatPreference =
    args.body.formatPreference === "shortform" ||
    args.body.formatPreference === "longform" ||
    args.body.formatPreference === "thread"
      ? args.body.formatPreference
      : null;
  const effectiveFormatPreference =
    formatPreference ??
    (normalizedTurn.artifactContext?.kind === "selected_angle" &&
    normalizedTurn.artifactContext.formatHint === "thread"
      ? "thread"
      : null);
  const threadFramingStyle = resolveThreadFramingStyle(args.body.threadFramingStyle);
  const selectedDraftContext =
    normalizedTurn.selectedDraftContext ??
    parseSelectedDraftContext(args.body.selectedDraftContext);
  const structuredReplyContext =
    args.body.replyContext &&
    typeof args.body.replyContext === "object" &&
    !Array.isArray(args.body.replyContext)
      ? (args.body.replyContext as {
          sourceText?: string | null;
          sourceUrl?: string | null;
          authorHandle?: string | null;
        })
      : null;
  const routeUserMessage =
    normalizedTurn.message ||
    (normalizedTurn.artifactContext?.kind === "selected_angle"
      ? normalizedTurn.artifactContext.angle
      : normalizedTurn.transcriptMessage);
  const effectiveMessage = normalizedTurn.orchestrationMessage;

  if (!effectiveMessage) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "message", message: "A message or intent is required." }] },
      { status: 400 },
    );
  }

  const threadState = await resolveRouteThreadState({
    request: args.request,
    session: { user: { id: args.userId } },
    bodyHandle:
      typeof args.body.workspaceHandle === "string" ? args.body.workspaceHandle : null,
    threadId,
  });
  if (!threadState.ok) {
    return threadState.response;
  }

  const { activeHandle, storedThread } = threadState;

  const duplicateReplayResponse = await maybeReplayDuplicateTurn({
    threadId: storedThread.id,
    clientTurnId,
    loadBilling: loadBillingStateForResponse,
    listThreadMessages: ({ threadId: duplicateThreadId }) =>
      prisma.chatMessage.findMany({
        where: {
          threadId: duplicateThreadId,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 80,
        select: {
          id: true,
          role: true,
          data: true,
          createdAt: true,
        },
      }),
  });

  if (duplicateReplayResponse) {
    return duplicateReplayResponse;
  }

  const storedRunResult = await resolveRouteStoredRun({
    runId,
    userId: args.userId,
    activeHandle,
  });
  if (!storedRunResult.ok) {
    return storedRunResult.response;
  }

  const storedRun = storedRunResult.storedRun;
  const effectiveRunId = storedRun?.id ?? runId;
  if (!effectiveRunId) {
    return buildErrorResponse({
      status: 400,
      field: "runId",
      message: "A valid onboarding run is required before sending chat turns.",
    });
  }

  const existingTurn = await readTurnByIdentity({
    userId: args.userId,
    runId: effectiveRunId,
    clientTurnId,
  });
  if (
    existingTurn &&
    (existingTurn.status === "queued" ||
      existingTurn.status === "running" ||
      existingTurn.status === "cancel_requested")
  ) {
    return buildTurnInProgressResponse({
      code: "TURN_IN_PROGRESS",
      message: "This turn is already being processed.",
      activeTurn: existingTurn,
    });
  }

  const activeTurnForThread = await findActiveTurnForThread({
    userId: args.userId,
    threadId: storedThread.id,
    excludeClientTurnId: clientTurnId,
  });
  if (activeTurnForThread) {
    return buildTurnInProgressResponse({
      code: "ACTIVE_TURN_IN_PROGRESS",
      message: "Wait for the current reply to finish before sending another message in this chat.",
      activeTurn: activeTurnForThread,
    });
  }

  const conversationContext = await loadRouteConversationContext({
    storedThread,
    history: args.body.history,
    selectedDraftContext,
    transcriptMessage: normalizedTurn.transcriptMessage,
    routeUserMessage,
    clientTurnId,
    explicitIntent: normalizedTurn.explicitIntent,
    turnSource: normalizedTurn.source,
    artifactContext: normalizedTurn.artifactContext,
    routingDiagnostics: normalizedTurn.diagnostics,
    formatPreference: effectiveFormatPreference,
    threadFramingStyle,
    structuredReplyContext,
  });

  const queuedBody: CreatorChatRequest = {
    ...args.body,
    threadId: storedThread.id,
    runId: effectiveRunId,
    clientTurnId,
    stream: false,
  };
  const turnCreditCost = resolveChatTurnCreditCost({
    explicitIntent: normalizedTurn.explicitIntent,
    message: effectiveMessage,
    selectedDraftContext: conversationContext.selectedDraftContext,
  });
  const queuedTurn =
    await upsertQueuedTurnControl({
      userId: args.userId,
      runId: effectiveRunId,
      clientTurnId,
      threadId: storedThread.id,
      userMessageId: conversationContext.createdUserMessageId ?? null,
      requestPayload: {
        body: queuedBody,
        activeHandle,
      },
      creditCost: turnCreditCost,
    });

  const queuedTurnWithProgress =
    queuedTurn &&
    (await markTurnProgress({
      turnId: queuedTurn.id,
      stepId: "queued",
      label: buildQueuedProgressCopy().label,
      explanation: buildQueuedProgressCopy().explanation,
    }).catch(() => queuedTurn));

  return buildChatAcceptedResponse({
    executionMode: "queued",
    activeTurn: buildActiveTurnPayload(queuedTurnWithProgress || queuedTurn),
  });
}

function resolveChatResponseErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const errors = record.errors;
    if (Array.isArray(errors)) {
      const firstMessage = errors.find(
        (error) =>
          error &&
          typeof error === "object" &&
          "message" in (error as Record<string, unknown>) &&
          typeof (error as Record<string, unknown>).message === "string",
      ) as { message?: string } | undefined;
      if (firstMessage?.message?.trim()) {
        return firstMessage.message.trim();
      }
    }
  }

  if (status === 401) {
    return "Unauthorized";
  }

  if (status === 400) {
    return "The request could not be processed.";
  }

  return "Failed to generate a reply.";
}

function buildTurnCancelledResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "TURN_CANCELLED",
      errors: [{ field: "chat", message: "The reply was interrupted." }],
    },
    { status: 409 },
  );
}

function buildActiveTurnPayload(
  turn:
    | {
        id: string;
        threadId: string | null;
        status: string;
        progressStepId: string | null;
        progressLabel: string | null;
        progressExplanation: string | null;
        assistantMessageId: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    | null,
) {
  if (!turn) {
    return null;
  }

  return {
    turnId: turn.id,
    threadId: turn.threadId,
    status: turn.status,
    progressStepId: turn.progressStepId,
    progressLabel: turn.progressLabel,
    progressExplanation: turn.progressExplanation,
    assistantMessageId: turn.assistantMessageId,
    errorCode: turn.errorCode,
    errorMessage: turn.errorMessage,
    createdAt: turn.createdAt.toISOString(),
    updatedAt: turn.updatedAt.toISOString(),
  };
}

function buildTurnInProgressResponse(args: {
  code: "TURN_IN_PROGRESS" | "ACTIVE_TURN_IN_PROGRESS";
  message: string;
  activeTurn: Parameters<typeof buildActiveTurnPayload>[0];
}) {
  return NextResponse.json(
    {
      ok: false,
      code: args.code,
      errors: [{ field: "chat", message: args.message }],
      data: {
        activeTurn: buildActiveTurnPayload(args.activeTurn),
      },
    },
    { status: 409 },
  );
}

async function resolveSelectedAngleMediaAttachments(args: {
  userId: string;
  artifactContext: ReturnType<typeof normalizeChatTurn>["artifactContext"];
}): Promise<ChatMediaAttachmentRef[] | null> {
  if (
    args.artifactContext?.kind !== "selected_angle" ||
    !args.artifactContext.imageAssetId
  ) {
    return null;
  }

  const asset = await prisma.chatMediaAsset.findFirst({
    where: {
      id: args.artifactContext.imageAssetId,
      userId: args.userId,
    },
    select: {
      id: true,
      kind: true,
      mimeType: true,
      width: true,
      height: true,
      originalName: true,
    },
  });

  return asset ? [buildChatMediaAttachmentRef(asset)] : null;
}

function streamChatRouteResponse(args: {
  execute: (onProgress: StreamProgressCallback) => Promise<Response>;
}): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writeEvent = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      const writeProgress = (data: ChatStreamProgressEventData) => {
        writeEvent(encodeChatStreamEvent(buildChatStreamProgressEvent(data)));
      };

      const writeError = (message?: string | null) => {
        writeEvent(encodeChatStreamEvent(buildChatStreamErrorEvent(message)));
      };

      void (async () => {
        try {
          const response = await args.execute(writeProgress);
          const payload = (await response.json()) as Record<string, unknown>;

          if (response.ok && payload.ok === true && "data" in payload) {
            writeEvent(
              encodeChatStreamEvent(buildChatStreamResultEvent(payload.data)),
            );
            return;
          }

          writeError(resolveChatResponseErrorMessage(payload, response.status));
        } catch (error) {
          writeError(error instanceof Error ? error.message : null);
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleChatRouteRequest(args: {
  request: NextRequest;
  body: CreatorChatRequest;
  monetizationEnabled: boolean;
  userId: string;
  onProgress?: StreamProgressCallback;
  turnControl?: ChatTurnExecutionControl;
}): Promise<Response> {
  const loadBillingStateForResponse = () =>
    args.monetizationEnabled
      ? getBillingStateForUser(args.userId)
      : Promise.resolve(null);

  const threadId = typeof args.body.threadId === "string" ? args.body.threadId.trim() : "";
  const runId = typeof args.body.runId === "string" ? args.body.runId.trim() : "";
  const clientTurnId = normalizeClientTurnId(args.body.clientTurnId) ?? randomUUID();
  const normalizedTurn = normalizeChatTurn({ body: args.body });
  const formatPreference =
    args.body.formatPreference === "shortform" ||
    args.body.formatPreference === "longform" ||
    args.body.formatPreference === "thread"
      ? args.body.formatPreference
      : null;
  const effectiveFormatPreference =
    formatPreference ??
    (normalizedTurn.artifactContext?.kind === "selected_angle" &&
    normalizedTurn.artifactContext.formatHint === "thread"
      ? "thread"
      : null);
  const threadFramingStyle = resolveThreadFramingStyle(args.body.threadFramingStyle);
  let selectedDraftContext =
    normalizedTurn.selectedDraftContext ??
    parseSelectedDraftContext(args.body.selectedDraftContext);
  const structuredReplyContext =
    args.body.replyContext &&
    typeof args.body.replyContext === "object" &&
    !Array.isArray(args.body.replyContext)
      ? (args.body.replyContext as {
          sourceText?: string | null;
          sourceUrl?: string | null;
          authorHandle?: string | null;
        })
      : null;
  const preferenceConstraints = Array.isArray(args.body.preferenceConstraints)
    ? args.body.preferenceConstraints
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const transientPreferenceSettings =
    args.body.preferenceSettings &&
    typeof args.body.preferenceSettings === "object" &&
    !Array.isArray(args.body.preferenceSettings)
      ? (args.body.preferenceSettings as Partial<UserPreferences>)
      : null;
  const routeUserMessage =
    normalizedTurn.message ||
    (normalizedTurn.artifactContext?.kind === "selected_angle"
      ? normalizedTurn.artifactContext.angle
      : normalizedTurn.transcriptMessage);
  const effectiveMessage = normalizedTurn.orchestrationMessage;

  if (!effectiveMessage) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "message", message: "A message or intent is required." }] },
      { status: 400 },
    );
  }

  const progressPlan = buildPendingStatusPlan({
    message: effectiveMessage,
    turnSource: normalizedTurn.source,
    artifactContext: normalizedTurn.artifactContext ?? null,
    intent: normalizedTurn.explicitIntent ?? null,
    threadFramingStyleOverride: threadFramingStyle,
    hasSelectedDraftContext: Boolean(selectedDraftContext),
  });
  let activeTurnId: string | null = null;
  const turnLeaseOwner = args.turnControl?.leaseOwner ?? null;
  const turnLeaseMs = Math.max(5_000, args.turnControl?.leaseMs ?? CHAT_TURN_LEASE_MS);
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };
  const startHeartbeat = () => {
    if (!turnLeaseOwner || !activeTurnId || heartbeatTimer) {
      return;
    }

    heartbeatTimer = setInterval(() => {
      void heartbeatTurnExecution({
        turnId: activeTurnId!,
        userId: args.userId,
        leaseOwner: turnLeaseOwner,
        leaseMs: turnLeaseMs,
      }).catch(() => null);
    }, CHAT_TURN_HEARTBEAT_MS);
  };
  const emitProgress = async (stepIndex: number, copy?: RouteProgressCopy | null) => {
    const activeStepId = progressPlan.steps[stepIndex]?.id as PendingStatusStepId | undefined;
    if (!activeStepId) {
      return;
    }

    if (activeTurnId) {
      await markTurnProgress({
        turnId: activeTurnId,
        stepId: activeStepId,
        label: copy?.label ?? null,
        explanation: copy?.explanation ?? null,
        leaseOwner: turnLeaseOwner,
        leaseMs: turnLeaseMs,
      }).catch(() => null);
    }

    if (!args.onProgress) {
      return;
    }

    await args.onProgress({
      workflow: progressPlan.workflow,
      activeStepId,
      ...(copy?.label ? { label: copy.label } : {}),
      ...(copy?.explanation ? { explanation: copy.explanation } : {}),
    });
  };
  const routePreflightStartedAt = Date.now();

  const threadState = await resolveRouteThreadState({
    request: args.request,
    session: { user: { id: args.userId } },
    bodyHandle:
      typeof args.body.workspaceHandle === "string" ? args.body.workspaceHandle : null,
    threadId,
  });
  if (!threadState.ok) {
    return threadState.response;
  }

  const { activeHandle, storedThread } = threadState;
  const selectedAngleMediaAttachments = await resolveSelectedAngleMediaAttachments({
    userId: args.userId,
    artifactContext: normalizedTurn.artifactContext,
  });
  const shouldForceFreshProfileScrapeForAnalysis = isInlineProfileAnalysisRequest(
    effectiveMessage,
  );

  await emitProgress(
    0,
    buildRouteProgressCopy({
      workflow: progressPlan.workflow,
      stepId: progressPlan.steps[0]?.id ?? "understand_request",
      activeHandle,
      selectedDraftContext,
      structuredReplyContext,
    }),
  );

  if (clientTurnId) {
    const duplicateReplayResponse = await maybeReplayDuplicateTurn({
      threadId: storedThread.id,
      clientTurnId,
      loadBilling: loadBillingStateForResponse,
      listThreadMessages: ({ threadId: duplicateThreadId }) =>
        prisma.chatMessage.findMany({
          where: {
            threadId: duplicateThreadId,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 80,
          select: {
            id: true,
            role: true,
            data: true,
            createdAt: true,
          },
        }),
    });

    if (duplicateReplayResponse) {
      return duplicateReplayResponse;
    }
  }

  const storedRunResult = await resolveRouteStoredRun({
    runId,
    userId: args.userId,
    activeHandle,
  });
  if (!storedRunResult.ok) {
    return storedRunResult.response;
  }
  const storedRun = storedRunResult.storedRun;
  const effectiveRunId = storedRun?.id ?? runId;
  if (!effectiveRunId) {
    return buildErrorResponse({
      status: 400,
      field: "runId",
      message: "A valid onboarding run is required before sending chat turns.",
    });
  }

  const existingTurn = await readTurnByIdentity({
    userId: args.userId,
    runId: effectiveRunId,
    clientTurnId,
  });
  if (
    existingTurn &&
    existingTurn.id !== args.turnControl?.turnId &&
    (existingTurn.status === "queued" ||
      existingTurn.status === "running" ||
      existingTurn.status === "cancel_requested")
  ) {
    return buildTurnInProgressResponse({
      code: "TURN_IN_PROGRESS",
      message: "This turn is already being processed.",
      activeTurn: existingTurn,
    });
  }

  const activeTurnForThread = await findActiveTurnForThread({
    userId: args.userId,
    threadId: storedThread.id,
    excludeTurnId: args.turnControl?.turnId ?? null,
    excludeClientTurnId: clientTurnId,
  });
  if (activeTurnForThread) {
    return buildTurnInProgressResponse({
      code: "ACTIVE_TURN_IN_PROGRESS",
      message: "Wait for the current reply to finish before sending another message in this chat.",
      activeTurn: activeTurnForThread,
    });
  }

  await emitProgress(
    1,
    buildRouteProgressCopy({
      workflow: progressPlan.workflow,
      stepId: progressPlan.steps[1]?.id ?? "gather_context",
      activeHandle,
      selectedDraftContext,
      structuredReplyContext,
    }),
  );

  const {
    onboardingResult,
    isVerifiedAccount,
    creatorProfileHints,
    userContextString,
    profileReplyContext,
    creatorAgentContext,
    growthOsPayload,
    diagnosticContext,
    styleCard,
    effectiveUserPreferences,
    mergedPreferenceConstraints,
  } = await resolveRouteProfileContext({
    userId: args.userId,
    activeHandle,
    storedRun,
    transientPreferenceSettings,
    preferenceConstraints,
    forcePinnedRefreshForAnalysis: shouldForceFreshProfileScrapeForAnalysis,
    forceFreshScrapeForAnalysis: shouldForceFreshProfileScrapeForAnalysis,
  });

  const effectiveExplicitIntent = normalizedTurn.explicitIntent;
  const effectiveDiagnosticContext = diagnosticContext as ConversationalDiagnosticContext | null;
  const diagnosticContextRecord = effectiveDiagnosticContext as Record<string, unknown> | null;
  const shouldIncludeRoutingTrace = diagnosticContextRecord?.includeRoutingTrace === true;
  const turnCreditCost = resolveChatTurnCreditCost({
    explicitIntent: effectiveExplicitIntent,
    message: effectiveMessage,
    selectedDraftContext,
  });
  let debitedCharge: { cost: number; idempotencyKey: string } | null = null;
  const refundCancelledTurn = async () => {
    await refundRouteTurnCharge({
      userId: args.userId,
      debitedCharge,
    });
    debitedCharge = null;
  };
  const shouldCancelTurn = async () => {
    const cancelled = await isTurnCancellationRequested({
      userId: args.userId,
      runId: effectiveRunId,
      clientTurnId,
      turnId: activeTurnId,
    });
    if (!cancelled) {
      return false;
    }

    await markTurnCancelled({
      userId: args.userId,
      runId: effectiveRunId,
      clientTurnId,
      turnId: activeTurnId,
    });
    await refundCancelledTurn();
    return true;
  };

  try {
    const effectiveUserId = args.userId;
    const chargeResult = await chargeRouteTurn({
      monetizationEnabled: args.monetizationEnabled,
      userId: effectiveUserId,
      threadId: storedThread.id,
      clientTurnId,
      turnCreditCost,
      explicitIntent: effectiveExplicitIntent,
    });
    if (chargeResult.failureResponse) {
      return chargeResult.failureResponse;
    }
    debitedCharge = chargeResult.debitedCharge;

    const runningTurn = await upsertRunningTurnControl({
      userId: args.userId,
      runId: effectiveRunId,
      clientTurnId,
      threadId: storedThread.id,
      requestPayload: {
        body: args.body,
        activeHandle,
      },
      billingIdempotencyKey: debitedCharge?.idempotencyKey ?? null,
      creditCost: debitedCharge?.cost ?? turnCreditCost,
      leaseOwner: turnLeaseOwner,
      leaseMs: turnLeaseMs,
    });
    activeTurnId = runningTurn?.id ?? args.turnControl?.turnId ?? null;
    startHeartbeat();

    const conversationContext = await loadRouteConversationContext({
      storedThread,
      history: args.body.history,
      selectedDraftContext,
      transcriptMessage: normalizedTurn.transcriptMessage,
      routeUserMessage,
      clientTurnId,
      explicitIntent: effectiveExplicitIntent,
      turnSource: normalizedTurn.source,
      artifactContext: normalizedTurn.artifactContext,
      routingDiagnostics: normalizedTurn.diagnostics,
      formatPreference: effectiveFormatPreference,
      threadFramingStyle,
      structuredReplyContext,
      existingUserMessageId: args.turnControl?.existingUserMessageId ?? null,
    });
    const recentHistoryStr = conversationContext.recentHistoryStr;
    const activeDraft = conversationContext.activeDraft;
    const storedMemory = conversationContext.storedMemory;
    selectedDraftContext = conversationContext.selectedDraftContext;

    if (conversationContext.createdUserMessageId) {
      const refreshedTurn = await upsertRunningTurnControl({
        userId: args.userId,
        runId: effectiveRunId,
        clientTurnId,
        threadId: storedThread.id,
        userMessageId: conversationContext.createdUserMessageId,
        leaseOwner: turnLeaseOwner,
        leaseMs: turnLeaseMs,
      });
      activeTurnId = refreshedTurn?.id ?? activeTurnId;
    }

    if (await shouldCancelTurn()) {
      return buildTurnCancelledResponse();
    }

    const hasProfileAnalysisContext = Boolean(
      onboardingResult && growthOsPayload?.profileConversionAudit,
    );
    const isExplicitProfileAnalysisRequest =
      hasProfileAnalysisContext &&
      isInlineProfileAnalysisRequest(effectiveMessage);
    const activeProfileAnalysisRef = storedMemory.activeProfileAnalysisRef;
    const followUp =
      hasProfileAnalysisContext && activeProfileAnalysisRef
        ? interpretProfileAnalysisFollowUp({
            userMessage: effectiveMessage,
            topicSummary:
              profileReplyContext?.knownFor ||
              storedMemory.topicSummary ||
              creatorProfileHints?.knownFor ||
              null,
          })
        : { kind: "none" as const };

    if (hasProfileAnalysisContext && activeProfileAnalysisRef && followUp.kind !== "none") {
      await emitProgress(
        2,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[2]?.id ?? "generate_output",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );

      let rawResponse: RawOrchestratorResponse;
      let profileAnalysisStyleCard = styleCard;
      let profileAnalysisContext = creatorAgentContext;

      if (followUp.kind === "clarify_correction") {
        const artifact = await prisma.chatMessage.findUnique({
          where: { id: activeProfileAnalysisRef.messageId },
          select: {
            threadId: true,
            data: true,
          },
        });
        const persistedArtifact =
          artifact?.threadId === storedThread.id
            ? extractPersistedProfileAnalysisArtifact(artifact.data)
            : null;

        rawResponse = buildProfileAnalysisFollowUpRawResponse({
          response: `${followUp.question} ${PROFILE_ANALYSIS_FEEDBACK_PROMPT}`.trim(),
          memory: storedMemory,
          quickReplies: persistedArtifact
            ? buildProfileAnalysisQuickReplies(persistedArtifact)
            : [],
        });
      } else if (followUp.kind === "answer_question" || followUp.kind === "rewrite_bio") {
        const artifactMessage = await prisma.chatMessage.findUnique({
          where: { id: activeProfileAnalysisRef.messageId },
          select: {
            threadId: true,
            data: true,
          },
        });
        const persistedArtifact =
          artifactMessage?.threadId === storedThread.id
            ? extractPersistedProfileAnalysisArtifact(artifactMessage.data)
            : null;
        const artifact =
          persistedArtifact ||
          (await buildProfileAnalysisArtifact({
            onboarding: onboardingResult!,
            audit: growthOsPayload!.profileConversionAudit,
            creatorAgentContext,
          }));

        rawResponse = buildProfileAnalysisFollowUpRawResponse({
          response:
            followUp.kind === "rewrite_bio"
              ? buildProfileAnalysisBioRewriteResponse({ artifact })
              : buildProfileAnalysisQuestionResponse({
                  userMessage: effectiveMessage,
                  artifact,
                  profileReplyContext,
                }),
          memory: storedMemory,
          ...(followUp.kind === "answer_question"
            ? { quickReplies: buildProfileAnalysisQuickReplies(artifact) }
            : {}),
        });
      } else {
        const patchedStyleCard = applyProfileAnalysisConversationPatchToStyleCard({
          styleCard,
          patch: {
            analysisGoal: followUp.analysisGoal,
            analysisCorrectionDetail: followUp.analysisCorrectionDetail,
          },
        });
        profileAnalysisStyleCard = patchedStyleCard;

        if (args.userId !== "anonymous" && activeHandle) {
          await saveStyleProfile(
            args.userId,
            activeHandle,
            patchedStyleCard,
          ).catch((error) => {
            console.error(
              "Failed to persist profile-analysis goal/correction state:",
              error,
            );
          });
        }

        profileAnalysisContext = profileAnalysisContext
          ? {
              ...profileAnalysisContext,
              profileAuditState: patchedStyleCard.profileAuditState ?? null,
            }
          : profileAnalysisContext;

        rawResponse = await buildInlineProfileAnalysisResponse({
          onboarding: onboardingResult!,
          audit: growthOsPayload!.profileConversionAudit,
          memory: storedMemory,
          creatorAgentContext: profileAnalysisContext,
          profileReplyContext,
          generateNarrative: generateProfileAnalysisNarrative,
          leadIn: followUp.leadIn,
        });

        if (
          args.userId !== "anonymous" &&
          activeHandle &&
          profileAnalysisContext?.creatorProfile
        ) {
          profileAnalysisStyleCard = await syncGhostwriterProfileFromCreatorProfile({
            userId: args.userId,
            xHandle: activeHandle,
            creatorProfile: profileAnalysisContext.creatorProfile,
            styleCard: profileAnalysisStyleCard,
          }).catch((error) => {
            console.error("Failed to persist ghostwriter profile snapshot:", error);
            return profileAnalysisStyleCard;
          });
        }
      }

      const preparedTurn = await prepareManagedMainTurn({
        rawResponse,
        recentHistory: recentHistoryStr || "None",
        selectedDraftContext,
        formatPreference: effectiveFormatPreference,
        isVerifiedAccount,
        userPreferences: effectiveUserPreferences,
        styleCard: profileAnalysisStyleCard,
        creatorProfileHints,
        routingDiagnostics: normalizedTurn.diagnostics,
        clientTurnId,
        currentThreadTitle: storedThread.title,
        shouldClearReplyWorkflow: false,
        mediaAttachments: selectedAngleMediaAttachments,
      });

      await emitProgress(
        3,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[3]?.id ?? "persist_response",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );

      if (await shouldCancelTurn()) {
        return buildTurnCancelledResponse();
      }

      return await finalizeMainAssistantTurn({
        preparedTurn,
        routingTrace: {
          normalizedTurn: {
            turnSource: normalizedTurn.source,
            artifactKind: normalizedTurn.artifactContext?.kind ?? null,
            planSeedSource: normalizedTurn.diagnostics.planSeedSource,
            replyHandlingBypassedReason:
              normalizedTurn.diagnostics.replyHandlingBypassedReason,
            resolvedWorkflow: normalizedTurn.diagnostics.resolvedWorkflow,
          },
          runtimeResolution: null,
          workerExecutions: [],
          workerExecutionSummary: {
            total: 0,
            parallel: 0,
            sequential: 0,
            completed: 0,
            skipped: 0,
            failed: 0,
            groups: [],
          },
          persistedStateChanges: null,
          validations: [],
          turnPlan: null,
          controllerAction:
            followUp.kind === "answer_question"
              ? "profile_analysis_answer"
              : followUp.kind === "clarify_correction"
                ? "profile_analysis_clarify_correction"
                : "profile_analysis_rerun",
          classifiedIntent: effectiveExplicitIntent,
          resolvedMode: "coach",
          routerState: null,
          planInputSource: null,
          clarification:
            followUp.kind === "clarify_correction"
              ? {
                  kind: "question",
                  reason: "profile_analysis_correction_missing_detail",
                  branchKey: "semantic_repair",
                  question: followUp.question,
                }
              : null,
          draftGuard: null,
          planFailure: null,
          timings: {
            preflightMs: Date.now() - routePreflightStartedAt,
          },
        },
          shouldIncludeRoutingTrace,
          storedThreadId: storedThread.id,
          requestedThreadId: threadId,
          userId: args.userId,
          activeHandle,
          runId: storedRun?.id ?? null,
          turnId: activeTurnId,
          sourcePrompt: effectiveMessage,
          explicitIntent: effectiveExplicitIntent,
          loadBilling: loadBillingStateForResponse,
          recordProductEvent,
          onAssistantTurnPersisted: async (assistantMessageId) => {
            await markTurnCompleted({
              userId: args.userId,
              runId: effectiveRunId,
              clientTurnId,
              turnId: activeTurnId,
              assistantMessageId,
            });
          },
        });
    }

    if (
      onboardingResult &&
      growthOsPayload?.profileConversionAudit &&
      isExplicitProfileAnalysisRequest
    ) {
      await emitProgress(
        2,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[2]?.id ?? "generate_output",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );

      const rawResponse = await buildInlineProfileAnalysisResponse({
          onboarding: onboardingResult,
          audit: growthOsPayload.profileConversionAudit,
          memory: storedMemory,
          creatorAgentContext,
          profileReplyContext,
          generateNarrative: generateProfileAnalysisNarrative,
        });
      let profileAnalysisStyleCard = styleCard;

      if (
        args.userId !== "anonymous" &&
        activeHandle &&
        creatorAgentContext?.creatorProfile
      ) {
        profileAnalysisStyleCard = await syncGhostwriterProfileFromCreatorProfile({
          userId: args.userId,
          xHandle: activeHandle,
          creatorProfile: creatorAgentContext.creatorProfile,
          styleCard,
        }).catch((error) => {
          console.error("Failed to persist ghostwriter profile snapshot:", error);
          return styleCard;
        });
      }

      const preparedTurn = await prepareManagedMainTurn({
        rawResponse,
        recentHistory: recentHistoryStr || "None",
        selectedDraftContext,
        formatPreference: effectiveFormatPreference,
        isVerifiedAccount,
        userPreferences: effectiveUserPreferences,
        styleCard: profileAnalysisStyleCard,
        creatorProfileHints,
        routingDiagnostics: normalizedTurn.diagnostics,
        clientTurnId,
        currentThreadTitle: storedThread.title,
        shouldClearReplyWorkflow: false,
        mediaAttachments: selectedAngleMediaAttachments,
      });

      await emitProgress(
        3,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[3]?.id ?? "persist_response",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );

      if (await shouldCancelTurn()) {
        return buildTurnCancelledResponse();
      }

      return await finalizeMainAssistantTurn({
        preparedTurn,
        routingTrace: {
          normalizedTurn: {
            turnSource: normalizedTurn.source,
            artifactKind: normalizedTurn.artifactContext?.kind ?? null,
            planSeedSource: normalizedTurn.diagnostics.planSeedSource,
            replyHandlingBypassedReason:
              normalizedTurn.diagnostics.replyHandlingBypassedReason,
            resolvedWorkflow: normalizedTurn.diagnostics.resolvedWorkflow,
          },
          runtimeResolution: null,
          workerExecutions: [],
          workerExecutionSummary: {
            total: 0,
            parallel: 0,
            sequential: 0,
            completed: 0,
            skipped: 0,
            failed: 0,
            groups: [],
          },
          persistedStateChanges: null,
          validations: [],
          turnPlan: null,
          controllerAction: "inline_profile_analysis",
          classifiedIntent: effectiveExplicitIntent,
          resolvedMode: "coach",
          routerState: null,
          planInputSource: null,
          clarification: null,
          draftGuard: null,
          planFailure: null,
          timings: {
            preflightMs: Date.now() - routePreflightStartedAt,
          },
        },
        shouldIncludeRoutingTrace,
        storedThreadId: storedThread.id,
        requestedThreadId: threadId,
        userId: args.userId,
        activeHandle,
        runId: storedRun?.id ?? null,
        turnId: activeTurnId,
        sourcePrompt: effectiveMessage,
        explicitIntent: effectiveExplicitIntent,
        loadBilling: loadBillingStateForResponse,
        recordProductEvent,
        onAssistantTurnPersisted: async (assistantMessageId) => {
          await markTurnCompleted({
            userId: args.userId,
            runId: effectiveRunId,
            clientTurnId,
            turnId: activeTurnId,
            assistantMessageId,
          });
        },
      });
    }

    const replyInsights = growthOsPayload?.replyInsights ?? null;
    await emitProgress(
      2,
      buildRouteProgressCopy({
        workflow: progressPlan.workflow,
        stepId: progressPlan.steps[2]?.id ?? "generate_output",
        activeHandle,
        selectedDraftContext,
        structuredReplyContext,
        creatorProfileHints,
        profileReplyContext,
      }),
    );
    const replyTurnPreflight = await prepareHandledReplyTurn({
      userId: args.userId,
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: effectiveExplicitIntent,
      turnSource: normalizedTurn.source,
      artifactContext: normalizedTurn.artifactContext,
      resolvedWorkflowHint: normalizedTurn.diagnostics.resolvedWorkflow,
      routingDiagnostics: normalizedTurn.diagnostics,
      activeHandle,
      creatorAgentContext,
      creatorProfileHints,
      profileReplyContext,
      structuredReplyContext,
      shouldBypassReplyHandling: !normalizedTurn.shouldAllowReplyHandling,
      memory: storedMemory,
      toneRisk: args.body.toneRisk,
      goal: args.body.goal,
      replyInsights,
      styleCard,
    });
    const shouldResetReplyWorkflow = replyTurnPreflight.shouldResetReplyWorkflow;
    const handledReplyTurn = replyTurnPreflight.handledTurn;

    if (handledReplyTurn) {
      await emitProgress(
        3,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[3]?.id ?? "persist_response",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );
      if (await shouldCancelTurn()) {
        return buildTurnCancelledResponse();
      }
      return await finalizeReplyTurn({
        preparedTurn: handledReplyTurn,
        storedMemory,
        routingDiagnostics: normalizedTurn.diagnostics,
        clientTurnId,
        defaultThreadTitle: DEFAULT_THREAD_TITLE,
        storedThreadId: storedThread.id,
        storedThreadTitle: storedThread.title ?? null,
        requestedThreadId: threadId,
        shouldIncludeRoutingTrace,
        userId: args.userId,
        activeHandle,
        turnId: activeTurnId,
        userMessageId:
          conversationContext.createdUserMessageId ??
          args.turnControl?.existingUserMessageId ??
          null,
        loadBilling: loadBillingStateForResponse,
        recordProductEvent,
        onAssistantTurnPersisted: async (assistantMessageId) => {
          await markTurnCompleted({
            userId: args.userId,
            runId: effectiveRunId,
            clientTurnId,
            turnId: activeTurnId,
            assistantMessageId,
          });
        },
      });
    }

    const routePreflightMs = Date.now() - routePreflightStartedAt;
    const { rawResponse, routingTrace } = await manageConversationTurnRaw({
      userId: effectiveUserId,
      xHandle: storedThread.xHandle || null,
      threadId: storedThread.id,
      runId: storedRun?.id,
      userMessage: routeUserMessage,
      planSeedMessage:
        effectiveMessage !== routeUserMessage ? effectiveMessage : null,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: effectiveExplicitIntent,
      activeDraft,
      focusedThreadPostIndex: selectedDraftContext?.focusedThreadPostIndex ?? null,
      turnSource: normalizedTurn.source,
      artifactContext: normalizedTurn.artifactContext,
      planSeedSource: normalizedTurn.diagnostics.planSeedSource,
      resolvedWorkflow: normalizedTurn.diagnostics.resolvedWorkflow,
      replyHandlingBypassedReason: normalizedTurn.diagnostics.replyHandlingBypassedReason,
      formatPreference: effectiveFormatPreference,
      threadFramingStyle,
      preferenceConstraints: mergedPreferenceConstraints,
      creatorProfileHints,
      userContextString,
      profileReplyContext,
      diagnosticContext: effectiveDiagnosticContext,
      preloadedRun: storedRun,
      preloadedStyleCard: styleCard,
    });
    routingTrace.timings = {
      ...(routingTrace.timings || {}),
      preflightMs: routePreflightMs,
    };

    await emitProgress(
      3,
      buildRouteProgressCopy({
        workflow: progressPlan.workflow,
        stepId: progressPlan.steps[3]?.id ?? "persist_response",
        activeHandle,
        selectedDraftContext,
        structuredReplyContext,
        creatorProfileHints,
        profileReplyContext,
      }),
    );
    if (await shouldCancelTurn()) {
      return buildTurnCancelledResponse();
    }
    const preparedTurn = await prepareManagedMainTurn({
      rawResponse,
      recentHistory: recentHistoryStr || "None",
      selectedDraftContext,
      formatPreference: effectiveFormatPreference,
      isVerifiedAccount,
      userPreferences: effectiveUserPreferences,
      styleCard,
      creatorProfileHints,
      routingDiagnostics: normalizedTurn.diagnostics,
      clientTurnId,
      currentThreadTitle: storedThread.title,
      shouldClearReplyWorkflow: shouldResetReplyWorkflow,
      mediaAttachments: selectedAngleMediaAttachments,
    });
    return await finalizeMainAssistantTurn({
      preparedTurn,
      routingTrace,
      shouldIncludeRoutingTrace,
      storedThreadId: storedThread.id,
      requestedThreadId: threadId,
      userId: args.userId,
      activeHandle,
      runId: storedRun?.id ?? null,
      turnId: activeTurnId,
      sourcePrompt: effectiveMessage,
      explicitIntent: effectiveExplicitIntent,
      loadBilling: loadBillingStateForResponse,
      recordProductEvent,
      onAssistantTurnPersisted: async (assistantMessageId) => {
        await markTurnCompleted({
          userId: args.userId,
          runId: effectiveRunId,
          clientTurnId,
          turnId: activeTurnId,
          assistantMessageId,
        });
      },
    });
  } catch (error) {
    await refundRouteTurnCharge({
      userId: args.userId,
      debitedCharge,
    });

    await markTurnFailed({
      userId: args.userId,
      runId: effectiveRunId,
      clientTurnId,
      turnId: activeTurnId,
      errorMessage:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "The turn failed before completion.",
    }).catch(() => null);

    if (isMissingChatTurnControlTableError(error)) {
      console.error("Chat turn control table is missing. Run the latest Prisma migrations.", error);
      return buildErrorResponse({
        status: 503,
        field: "server",
        message: "Chat infrastructure is not ready yet. Run the latest database migrations and retry.",
      });
    }

    console.error("V2 Orchestrator Error:", error);
    return buildRouteServerErrorResponse();
  } finally {
    stopHeartbeat();
  }
}

registerChatRouteHandler(handleChatRouteRequest);
