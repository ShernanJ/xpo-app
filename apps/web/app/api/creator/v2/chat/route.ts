import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { manageConversationTurnRaw } from "@/lib/agent-v2/orchestrator/conversationManager";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
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
  prepareChatRouteTurn,
  type SelectedDraftContext,
} from "./_lib/request/routeLogic";
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
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/orchestrator/conversationalDiagnostics";
import { isMultiDraftRequest } from "@/lib/agent-v2/orchestrator/conversationManagerLogic";
import type { StrategyPlan } from "@/lib/agent-v2/contracts/chat";
import { prepareHandledReplyTurn } from "@/lib/agent-v2/capabilities/reply/handledReplyTurn";
import { finalizeMainAssistantTurn } from "./_lib/main/routeMainFinalize";
import { finalizeReplyTurn } from "./_lib/reply/routeReplyFinalize";

type CreatorChatRequest = CreatorChatTransportRequest & Record<string, unknown>;

const DEFAULT_THREAD_TITLE = "New Chat";

function isPlaceholderThreadTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim() || "";
  return !normalized || normalized === DEFAULT_THREAD_TITLE;
}

function isGenericThreadPrompt(message: string): boolean {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ");
  return [
    "give me some ideas",
    "i need some ideas",
    "brainstorm with me",
    "brainstorm",
    "ideas",
    "write me a post",
    "write a post",
    "write me something",
    "write something",
    "help me write",
    "help me figure out what to post",
    "what should i post",
    "what should i post today",
    "what should i post this week",
    "what should i post right now",
    "what should i post on x",
    "what should i post on twitter",
    "what should i tweet",
    "what should i tweet today",
    "what should i tweet this week",
    "what do i post",
    "what do i post today",
    "what do i post this week",
    "what do i post on x",
    "what do i post on twitter",
    "what do i tweet",
    "what do i tweet today",
    "what do i tweet this week",
    "write it",
    "looks good",
    "sounds good",
    "ok",
    "okay",
  ].some((candidate) => normalized === candidate);
}

function canPromoteThreadTitle(args: {
  currentTitle: string | null | undefined;
  conversationState: string | null | undefined;
  topicSummary: string | null | undefined;
}): boolean {
  const canPromote =
    args.conversationState === "ready_to_ideate" ||
    args.conversationState === "plan_pending_approval" ||
    args.conversationState === "draft_ready";

  if (!canPromote) {
    return false;
  }

  if (!args.topicSummary?.trim()) {
    return false;
  }

  if (isGenericThreadPrompt(args.topicSummary)) {
    return false;
  }

  return isPlaceholderThreadTitle(args.currentTitle) || isGenericThreadPrompt(args.currentTitle || "");
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
  const monetizationEnabled = isMonetizationEnabled();
  const sessionPromise = getServerSession();
  const bodyResultPromise: Promise<
    | { ok: true; value: CreatorChatRequest }
    | { ok: false }
  > = request
    .json()
    .then((value) => ({ ok: true as const, value: value as CreatorChatRequest }))
    .catch(() => ({ ok: false as const }));

  const [session, bodyResult] = await Promise.all([
    sessionPromise,
    bodyResultPromise,
  ]);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  if (!bodyResult.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }
  const body = bodyResult.value;
  const loadBillingStateForResponse = () =>
    monetizationEnabled
      ? getBillingStateForUser(session.user.id)
      : Promise.resolve(null);

  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const clientTurnId = normalizeClientTurnId(body.clientTurnId);
  // If no threadId or runId, we will automatically generate a thread below.

  const normalizedTurn = normalizeChatTurn({ body });
  const formatPreference =
    body.formatPreference === "shortform" ||
    body.formatPreference === "longform" ||
    body.formatPreference === "thread"
      ? body.formatPreference
      : null;
  const threadFramingStyle = resolveThreadFramingStyle(body.threadFramingStyle);
  let selectedDraftContext =
    normalizedTurn.selectedDraftContext ?? parseSelectedDraftContext(body.selectedDraftContext);
  const structuredReplyContext =
    body.replyContext && typeof body.replyContext === "object" && !Array.isArray(body.replyContext)
      ? (body.replyContext as {
          sourceText?: string | null;
          sourceUrl?: string | null;
          authorHandle?: string | null;
        })
      : null;
  const preferenceConstraints = Array.isArray(body.preferenceConstraints)
    ? body.preferenceConstraints
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const transientPreferenceSettings =
    body.preferenceSettings && typeof body.preferenceSettings === "object" && !Array.isArray(body.preferenceSettings)
      ? (body.preferenceSettings as Partial<UserPreferences>)
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
    request,
    session: { user: { id: session.user.id } },
    bodyHandle:
      typeof body.workspaceHandle === "string" ? body.workspaceHandle : null,
    threadId,
  });
  if (!threadState.ok) {
    return threadState.response;
  }

  const { activeHandle, storedThread } = threadState;

  if (threadId) {
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
    userId: session.user.id,
    activeHandle,
  });
  if (!storedRunResult.ok) {
    return storedRunResult.response;
  }
  const storedRun = storedRunResult.storedRun;

  const {
    isVerifiedAccount,
    creatorProfileHints,
    creatorAgentContext,
    growthOsPayload,
    diagnosticContext,
    styleCard,
    effectiveUserPreferences,
    mergedPreferenceConstraints,
  } = await resolveRouteProfileContext({
    userId: session.user.id,
    activeHandle,
    storedRun,
    transientPreferenceSettings,
    preferenceConstraints,
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

  try {
    const effectiveUserId = session.user.id;
    const chargeResult = await chargeRouteTurn({
      monetizationEnabled,
      userId: effectiveUserId,
      threadId: storedThread.id,
      turnCreditCost,
      explicitIntent: effectiveExplicitIntent,
    });
    if (chargeResult.failureResponse) {
      return chargeResult.failureResponse;
    }
    debitedCharge = chargeResult.debitedCharge;

    const conversationContext = await loadRouteConversationContext({
      storedThread,
      history: body.history,
      selectedDraftContext,
      transcriptMessage: normalizedTurn.transcriptMessage,
      routeUserMessage,
      clientTurnId,
      explicitIntent: effectiveExplicitIntent,
      turnSource: normalizedTurn.source,
      artifactContext: normalizedTurn.artifactContext,
      routingDiagnostics: normalizedTurn.diagnostics,
      formatPreference,
      threadFramingStyle,
      structuredReplyContext,
    });
    const recentHistoryStr = conversationContext.recentHistoryStr;
    const activeDraft = conversationContext.activeDraft;
    const storedMemory = conversationContext.storedMemory;
    selectedDraftContext = conversationContext.selectedDraftContext;

    const replyInsights = growthOsPayload?.replyInsights ?? null;
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
      toneRisk: body.toneRisk,
      goal: body.goal,
      replyInsights,
      styleCard,
    });
    const shouldResetReplyWorkflow = replyTurnPreflight.shouldResetReplyWorkflow;
    const handledReplyTurn = replyTurnPreflight.handledTurn;

    if (handledReplyTurn) {
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
        userId: session.user.id,
        activeHandle,
        loadBilling: loadBillingStateForResponse,
        recordProductEvent,
      });
    }

    console.log("[V2 Chat Checkpoint] Reached manageConversationTurn with threadId:", storedThread.id);
    const { rawResponse, routingTrace } = await manageConversationTurnRaw({
      userId: effectiveUserId,
      xHandle: storedThread.xHandle || null, // Pipeline context isolation
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
      formatPreference,
      threadFramingStyle,
      preferenceConstraints: mergedPreferenceConstraints,
      creatorProfileHints,
      diagnosticContext: effectiveDiagnosticContext,
    });

    console.log("[V2 Chat Checkpoint] Survived manageConversationTurn. Mode:", rawResponse.mode);
    const resultData = rawResponse.data as Record<string, unknown> | undefined;
    const plan = (resultData?.plan || null) as {
      objective?: string;
      angle?: string;
      targetLane?: "original" | "reply" | "quote";
      mustInclude?: string[];
      mustAvoid?: string[];
      hookType?: string;
      pitchResponse?: string;
      formatPreference?: "shortform" | "longform" | "thread";
    } | null;
    const shouldPromoteThreadTitle = canPromoteThreadTitle({
      currentTitle: storedThread.title,
      topicSummary: rawResponse.memory.topicSummary,
      conversationState: rawResponse.memory.conversationState,
    });
    const validatedPlan =
      plan &&
      typeof plan.objective === "string" &&
      typeof plan.angle === "string" &&
      (plan.targetLane === "original" || plan.targetLane === "reply" || plan.targetLane === "quote") &&
      Array.isArray(plan.mustInclude) &&
      Array.isArray(plan.mustAvoid) &&
      typeof plan.hookType === "string" &&
      typeof plan.pitchResponse === "string"
        ? {
            objective: plan.objective,
            angle: plan.angle,
            targetLane: plan.targetLane,
            mustInclude: plan.mustInclude.filter((value): value is string => typeof value === "string"),
            mustAvoid: plan.mustAvoid.filter((value): value is string => typeof value === "string"),
            hookType: plan.hookType,
            pitchResponse: plan.pitchResponse,
            ...(plan.formatPreference ? { formatPreference: plan.formatPreference } : {}),
          }
        : null;
    const contextualThreadTitle = shouldPromoteThreadTitle
      ? await generateThreadTitle({
          topicSummary: rawResponse.memory.topicSummary,
          recentHistory: recentHistoryStr || "None",
          plan: validatedPlan,
        })
      : null;
    const preparedTurn = prepareChatRouteTurn({
      rawResponse,
      plan: validatedPlan,
      selectedDraftContext,
      formatPreference,
      isVerifiedAccount,
      userPreferences: effectiveUserPreferences,
      styleCard,
      routingDiagnostics: normalizedTurn.diagnostics,
      clientTurnId,
      issuesFixed:
        Array.isArray(resultData?.issuesFixed)
          ? (resultData?.issuesFixed as string[]).filter((value) => typeof value === "string")
          : [],
      defaultThreadTitle: DEFAULT_THREAD_TITLE,
      currentThreadTitle: storedThread.title,
      nextThreadTitle: shouldPromoteThreadTitle ? contextualThreadTitle : null,
      preferredSurfaceMode: rawResponse.memory.preferredSurfaceMode ?? "natural",
      shouldClearReplyWorkflow: shouldResetReplyWorkflow,
    });
    return await finalizeMainAssistantTurn({
      preparedTurn,
      routingTrace,
      shouldIncludeRoutingTrace,
      storedThreadId: storedThread.id,
      requestedThreadId: threadId,
      userId: session.user.id,
      activeHandle,
      runId: storedRun?.id ?? null,
      sourcePrompt: effectiveMessage,
      explicitIntent: effectiveExplicitIntent,
      loadBilling: loadBillingStateForResponse,
      recordProductEvent,
    });
  } catch (error) {
    await refundRouteTurnCharge({
      userId: session.user.id,
      debitedCharge,
    });

    console.error("V2 Orchestrator Error:", error);
    return buildRouteServerErrorResponse();
  }
}
