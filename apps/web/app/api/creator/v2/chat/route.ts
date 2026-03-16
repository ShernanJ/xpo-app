import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { manageConversationTurnRaw } from "@/lib/agent-v2/runtime/conversationManager";
import type { UserPreferences } from "@/lib/agent-v2/core/styleProfile";
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
  markTurnFailed,
  markTurnProgress,
  readTurnByIdentity,
  isTurnCancellationRequested,
  markTurnCancelled,
  markTurnCompleted,
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
  buildInlineProfileAnalysisResponse,
  generateProfileAnalysisNarrative,
  isInlineProfileAnalysisRequest,
} from "./_lib/profile/inlineProfileAnalysis";
import { finalizeReplyTurn } from "./_lib/reply/routeReplyFinalize";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { isMissingChatTurnControlTableError } from "@/lib/agent-v2/persistence/prismaGuards";

type CreatorChatRequest = CreatorChatTransportRequest & Record<string, unknown>;
type StreamProgressCallback = (
  data: ChatStreamProgressEventData,
) => Promise<void> | void;

const DEFAULT_THREAD_TITLE = "New Chat";

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

function resolveProgressTopic(args: {
  profileReplyContext?: {
    topicBullets?: string[];
  } | null;
  creatorProfileHints?: {
    contentPillars?: string[];
    knownFor?: string | null;
  } | null;
}): string | null {
  const topicBullet = normalizeProgressCopy(args.profileReplyContext?.topicBullets?.[0]);
  if (topicBullet) {
    return topicBullet;
  }

  const pillar = normalizeProgressCopy(args.creatorProfileHints?.contentPillars?.[0]);
  if (pillar) {
    return pillar;
  }

  return normalizeProgressCopy(args.creatorProfileHints?.knownFor);
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
    case "scan_context":
    case "gather_context":
      return {
        label: `Looking through ${recentPostsLabel} from ${accountLabel}`,
        explanation: topic
          ? `This helps pull in recurring themes, like ${lowerCaseFirst(topic)}.`
          : "This helps ground the response in what your account has been posting recently.",
      };
    case "explore_directions":
      return {
        label: topic
          ? `Exploring directions around ${lowerCaseFirst(topic)}`
          : "Exploring a few directions that fit your account",
        explanation: "This helps surface options that already feel natural for your audience.",
      };
    case "pick_direction":
      return {
        label: topic
          ? `Leaning into the strongest angle around ${lowerCaseFirst(topic)}`
          : "Leaning into the strongest angle",
        explanation: "This helps narrow the response to the clearest, most usable direction.",
      };
    case "write_response":
    case "draft_response":
      return {
        label: topic
          ? `Drafting around ${lowerCaseFirst(topic)}`
          : "Turning the direction into a working draft",
        explanation: "This is where the first useful version starts taking shape.",
      };
    case "revise_response":
      return {
        label: topic
          ? `Reworking it with the ${lowerCaseFirst(topic)} angle in mind`
          : "Reworking the draft with the requested change in mind",
        explanation: "This helps make the revision feel intentional instead of just shorter or longer.",
      };
    case "package_ideas":
      return {
        label: topic
          ? `Packaging the best idea around ${lowerCaseFirst(topic)}`
          : "Packaging the best idea into something usable",
        explanation: "This helps turn the strongest direction into a clean response you can act on.",
      };
    case "finalize_response":
    case "polish_response":
      return {
        label: "Tightening the final wording",
        explanation: topic
          ? `This helps the final version stay clear while still feeling connected to ${lowerCaseFirst(topic)}.`
          : "This helps the final version come back clear, clean, and ready to use.",
      };
    default:
      return null;
  }
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

  if (body.stream === true) {
    return streamChatRouteResponse({
      execute: async (onProgress) =>
        handleChatRouteRequest({
          request,
          body,
          monetizationEnabled,
          userId: session.user.id,
          onProgress,
        }),
    });
  }

  return await handleChatRouteRequest({
    request,
    body,
    monetizationEnabled,
    userId: session.user.id,
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
  const shouldForcePinnedRefreshForAnalysis = isInlineProfileAnalysisRequest(
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
    forcePinnedRefreshForAnalysis: shouldForcePinnedRefreshForAnalysis,
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
    });
    activeTurnId = runningTurn?.id ?? null;

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
      });
      activeTurnId = refreshedTurn?.id ?? activeTurnId;
    }

    if (await shouldCancelTurn()) {
      return buildTurnCancelledResponse();
    }

    if (
      onboardingResult &&
      growthOsPayload?.profileConversionAudit &&
      isInlineProfileAnalysisRequest(effectiveMessage)
    ) {
      await emitProgress(
        2,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[2]?.id ?? "write_response",
          activeHandle,
          selectedDraftContext,
          structuredReplyContext,
          creatorProfileHints,
          profileReplyContext,
        }),
      );

      const preparedTurn = await prepareManagedMainTurn({
        rawResponse: await buildInlineProfileAnalysisResponse({
          onboarding: onboardingResult,
          audit: growthOsPayload.profileConversionAudit,
          memory: storedMemory,
          profileReplyContext,
          generateNarrative: generateProfileAnalysisNarrative,
        }),
        recentHistory: recentHistoryStr || "None",
        selectedDraftContext,
        formatPreference: effectiveFormatPreference,
        isVerifiedAccount,
        userPreferences: effectiveUserPreferences,
        styleCard,
        routingDiagnostics: normalizedTurn.diagnostics,
        clientTurnId,
        currentThreadTitle: storedThread.title,
        shouldClearReplyWorkflow: false,
      });

      await emitProgress(
        3,
        buildRouteProgressCopy({
          workflow: progressPlan.workflow,
          stepId: progressPlan.steps[3]?.id ?? "finalize_response",
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
        stepId: progressPlan.steps[2]?.id ?? "write_response",
        activeHandle,
        selectedDraftContext,
        structuredReplyContext,
        creatorProfileHints,
        profileReplyContext,
      }),
    );
    const replyTurnPreflight = await prepareHandledReplyTurn({
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: effectiveExplicitIntent,
      turnSource: normalizedTurn.source,
      artifactContext: normalizedTurn.artifactContext,
      resolvedWorkflowHint: normalizedTurn.diagnostics.resolvedWorkflow,
      routingDiagnostics: normalizedTurn.diagnostics,
      activeHandle,
      creatorAgentContext,
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
          stepId: progressPlan.steps[3]?.id ?? "finalize_response",
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
    });

    await emitProgress(
      3,
      buildRouteProgressCopy({
        workflow: progressPlan.workflow,
        stepId: progressPlan.steps[3]?.id ?? "finalize_response",
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
      routingDiagnostics: normalizedTurn.diagnostics,
      clientTurnId,
      currentThreadTitle: storedThread.title,
      shouldClearReplyWorkflow: shouldResetReplyWorkflow,
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
  }
}
