import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurnRaw } from "@/lib/agent-v2/orchestrator/conversationManager";
import { finalizeResponseEnvelope } from "@/lib/agent-v2/orchestrator/responseEnvelope";
import { applyRuntimePersistenceTracePatch } from "@/lib/agent-v2/runtime/runtimeTrace";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
import {
  createConversationMemorySnapshot,
  createConversationMemory,
  getConversationMemory,
} from "@/lib/agent-v2/memory/memoryStore";
import { StyleCardSchema, type UserPreferences } from "@/lib/agent-v2/core/styleProfile";
import {
  resolveThreadFramingStyle,
} from "@/lib/onboarding/draftArtifacts";
import {
  applyGrowthStrategyToCreatorProfileHints,
  buildCreatorProfileHintsFromOnboarding,
} from "@/lib/agent-v2/orchestrator/creatorProfileHints";
import {
  buildPreferenceConstraintsFromPreferences,
  mergeUserPreferences,
  normalizeUserPreferences,
} from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import { getServerSession } from "@/lib/auth/serverSession";
import { ACTION_CREDIT_COST } from "@/lib/billing/config";
import { consumeCredits, refundCredits } from "@/lib/billing/credits";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { buildCreatorAgentContext } from "@/lib/onboarding/agentContext";
import { buildGrowthOperatingSystemPayload } from "@/lib/onboarding/contextEnrichment";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store";
import { recordProductEvent } from "@/lib/productEvents";
import type { GrowthStrategySnapshot } from "@/lib/onboarding/growthStrategy";
import type { VoiceStyleCard } from "@/lib/agent-v2/core/styleProfile";
import type { CreatorChatTransportRequest } from "@/lib/agent-v2/contracts/chatTransport";
import { normalizeClientTurnId } from "@/lib/agent-v2/contracts/chatTransport";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import {
  buildChatRouteMappedData,
  buildChatRoutePersistencePlan,
  buildConversationContextFromHistory,
  parseSelectedDraftContext,
  resolveSelectedDraftContextFromHistory,
  type SelectedDraftContext,
} from "./route.logic";
import { persistAssistantTurn } from "./_lib/persistence/routePersistence";
import {
  buildChatSuccessResponse,
  dispatchPlannedProductEvents,
  planMainAssistantTurnProductEvents,
} from "./_lib/response/routeResponse";
import { normalizeChatTurn } from "./_lib/normalization/turnNormalization";
import { findDuplicateTurnReplay } from "./route.idempotency";
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/orchestrator/conversationalDiagnostics";
import { isMultiDraftRequest } from "@/lib/agent-v2/orchestrator/conversationManagerLogic";
import {
  buildRecommendedPlaybookSummaries,
  inferCurrentPlaybookStage,
} from "@/lib/creator/playbooks";
import type { StrategyPlan } from "@/lib/agent-v2/contracts/chat";
import {
  planReplyTurn,
  resolveReplyTurnState,
} from "@/lib/agent-v2/orchestrator/replyTurnPlanner";
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

function buildConversationalDiagnosticContext(args: {
  agentContext: ReturnType<typeof buildCreatorAgentContext>;
  growthOs: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>>;
}): ConversationalDiagnosticContext {
  const reasons = [
    args.growthOs.profileConversionAudit.gaps[0],
    args.growthOs.contentInsights.cautionSignals[0],
    args.growthOs.strategyAdjustments.notes[0],
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const nextActions = [
    args.growthOs.profileConversionAudit.recommendedBioEdits[0],
    args.growthOs.strategyAdjustments.experiments[0] || args.growthOs.strategyAdjustments.reinforce[0],
    args.growthOs.contentAdjustments.experiments[0] || args.growthOs.contentAdjustments.reinforce[0],
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return {
    stage: inferCurrentPlaybookStage(args.agentContext),
    knownFor: args.agentContext.growthStrategySnapshot.knownFor,
    reasons,
    nextActions,
    recommendedPlaybooks: buildRecommendedPlaybookSummaries(args.agentContext, 2),
  };
}

export async function POST(request: NextRequest) {
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

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
    bodyHandle:
      typeof body.workspaceHandle === "string" ? body.workspaceHandle : null,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const activeHandle = workspaceHandle.xHandle;
  let storedThread = null;
  let storedRun: {
    id: string;
    input: unknown;
    result: unknown;
  } | null = null;

  if (threadId) {
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: activeHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
    storedThread = ownedThread.thread;
  } else {
    storedThread = await prisma.chatThread.create({
      data: {
        userId: session.user.id,
        xHandle: activeHandle,
      }
    });
    console.log("[V2 Chat Checkpoint] New Thread generated:", storedThread.id);

    await createConversationMemory({
      threadId: storedThread.id,
      userId: session.user.id,
    });
  }

  if (threadId && storedThread && clientTurnId) {
    const duplicateTurnReplay = await findDuplicateTurnReplay(
      {
        threadId: storedThread.id,
        clientTurnId,
      },
      {
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
      },
    );

    if (duplicateTurnReplay) {
      return await buildChatSuccessResponse({
        mappedData: duplicateTurnReplay.mappedData,
        createdAssistantMessageId: duplicateTurnReplay.assistantMessageId,
        loadBilling: () => getBillingStateForUser(session.user.id),
      });
    }
  }

  if (runId) {
    const matchedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
    const matchedRunHandle =
      matchedRun?.input &&
      typeof matchedRun.input === "object" &&
      !Array.isArray(matchedRun.input)
        ? ((matchedRun.input as { account?: string }).account?.trim().replace(/^@+/, "").toLowerCase() ||
          null)
        : null;
    if (!matchedRun || matchedRun.userId !== session.user.id || matchedRunHandle !== activeHandle) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "runId", message: "Onboarding run not found for this handle." }],
        },
        { status: 404 },
      );
    }
    storedRun = {
      id: matchedRun.id,
      input: matchedRun.input,
      result: matchedRun.result,
    };
  } else {
    const latestRun = await readLatestOnboardingRunByHandle(session.user.id, activeHandle);
    storedRun = latestRun
      ? {
          id: latestRun.runId,
          input: latestRun.input,
          result: latestRun.result,
        }
      : null;
  }

  const onboardingResult = (storedRun?.result || null) as
    | {
        profile?: {
          isVerified?: boolean;
        };
      }
    | null;
  const isVerifiedAccount = onboardingResult?.profile?.isVerified === true;
  let creatorAgentContext: ReturnType<typeof buildCreatorAgentContext> | null = null;
  let growthOsPayload: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>> | null = null;
  let diagnosticContext: ConversationalDiagnosticContext | null = null;
  const creatorProfileHintsPromise =
    storedRun?.id && storedRun?.result
      ? (async () => {
          try {
            const onboarding = storedRun.result as unknown as Parameters<
              typeof buildCreatorProfileHintsFromOnboarding
            >[0]["onboarding"];
            const baseHints = buildCreatorProfileHintsFromOnboarding({
              runId: storedRun.id,
              onboarding,
            });
            creatorAgentContext = buildCreatorAgentContext({
              runId: storedRun.id,
              onboarding,
            });
            growthOsPayload = await buildGrowthOperatingSystemPayload({
              userId: session.user.id,
              xHandle: activeHandle,
              onboarding,
              context: creatorAgentContext,
            });
            diagnosticContext = buildConversationalDiagnosticContext({
              agentContext: creatorAgentContext,
              growthOs: growthOsPayload,
            });

            return applyGrowthStrategyToCreatorProfileHints({
              hints: baseHints,
              growthStrategySnapshot: creatorAgentContext.growthStrategySnapshot,
              learningSignals: [
                ...growthOsPayload.replyInsights.bestSignals,
                ...growthOsPayload.replyInsights.cautionSignals,
                ...growthOsPayload.strategyAdjustments.experiments,
                ...growthOsPayload.contentInsights.bestSignals,
                ...growthOsPayload.contentInsights.cautionSignals,
                ...growthOsPayload.contentAdjustments.experiments,
              ],
            });
          } catch {
            creatorAgentContext = null;
            growthOsPayload = null;
            diagnosticContext = null;
            return null;
          }
        })()
      : Promise.resolve(null);
  const persistedVoiceProfilePromise = activeHandle
    ? prisma.voiceProfile.findFirst({
        where: {
          userId: session.user.id,
          xHandle: activeHandle,
        },
      })
    : Promise.resolve(null);
  const [creatorProfileHints, persistedVoiceProfile] = await Promise.all([
    creatorProfileHintsPromise,
    persistedVoiceProfilePromise,
  ]);
  const parsedPersistedStyleCard = persistedVoiceProfile?.styleCard
    ? StyleCardSchema.safeParse(persistedVoiceProfile.styleCard)
    : null;
  const storedUserPreferences = normalizeUserPreferences(
    parsedPersistedStyleCard?.success
      ? parsedPersistedStyleCard.data.userPreferences
      : null,
  );
  const effectiveUserPreferences = mergeUserPreferences(
    storedUserPreferences,
    transientPreferenceSettings,
  );
  const mergedPreferenceConstraints = Array.from(
    new Set([
      ...buildPreferenceConstraintsFromPreferences(effectiveUserPreferences, {
        isVerifiedAccount,
      }),
      ...preferenceConstraints,
    ]),
  );

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
    const debitIdempotencyKey = `chat:${effectiveUserId}:${storedThread?.id || "new"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const creditResult = await consumeCredits({
      userId: effectiveUserId,
      cost: turnCreditCost,
      idempotencyKey: debitIdempotencyKey,
      source: "creator_v2_chat",
      metadata: {
        intent: effectiveExplicitIntent || "auto",
        threadId: storedThread?.id || null,
      },
    });

    if (!creditResult.ok) {
      if (creditResult.reason === "RATE_LIMITED") {
        return NextResponse.json(
          {
            ok: false,
            code: "RATE_LIMITED",
            errors: [{ field: "rate", message: "Too many requests. Please wait a minute." }],
            data: {
              billing: creditResult.snapshot,
            },
          },
          {
            status: 429,
            headers: creditResult.retryAfterSeconds
              ? { "Retry-After": String(creditResult.retryAfterSeconds) }
              : undefined,
          },
        );
      }

      if (creditResult.reason === "ENTITLEMENT_INACTIVE") {
        return NextResponse.json(
          {
            ok: false,
            code: "PLAN_REQUIRED",
            errors: [{ field: "billing", message: "Billing is not active. Update payment to continue." }],
            data: {
              billing: creditResult.snapshot,
            },
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          errors: [{ field: "billing", message: "You've reached your credit limit. Upgrade to continue." }],
          data: {
            billing: creditResult.snapshot,
          },
        },
        { status: 402 },
      );
    }
    debitedCharge = {
      cost: creditResult.cost,
      idempotencyKey: creditResult.idempotencyKey,
    };

    let recentHistoryStr = "None";
    let activeDraft: string | undefined;
    let storedMemory = createConversationMemorySnapshot(null);
    let threadMessages: Array<{
      id: string;
      role: string;
      content: string;
      data: Prisma.JsonValue;
      createdAt: Date;
    }> = [];

    if (storedThread) {
      const createdUserMessage = await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "user",
          content: normalizedTurn.transcriptMessage || routeUserMessage,
          data: {
            version: "user_context_v2",
            clientTurnId,
            explicitIntent: effectiveExplicitIntent,
            turnSource: normalizedTurn.source,
            artifactContext: normalizedTurn.artifactContext,
            routingDiagnostics: normalizedTurn.diagnostics,
            formatPreference,
            threadFramingStyle,
            selectedDraftContext,
            replyContext: structuredReplyContext,
          } as unknown as Prisma.InputJsonValue,
        }
      });
      const [loadedThreadMessages, conversationMemory] = await Promise.all([
        prisma.chatMessage.findMany({
          where: { threadId: storedThread.id },
          orderBy: { createdAt: "desc" },
          take: 24,
          select: {
            id: true,
            role: true,
            content: true,
            data: true,
            createdAt: true,
          },
        }),
        getConversationMemory({ threadId: storedThread.id }),
      ]);
      threadMessages = loadedThreadMessages;
      storedMemory = createConversationMemorySnapshot(conversationMemory);
      selectedDraftContext = resolveSelectedDraftContextFromHistory({
        history: threadMessages.reverse(),
        selectedDraftContext,
        activeDraftRef: storedMemory.activeDraftRef,
      });
      const context = buildConversationContextFromHistory({
        history: threadMessages,
        selectedDraftContext,
        excludeMessageId: createdUserMessage.id,
      });
      recentHistoryStr = context.recentHistory;
      activeDraft = context.activeDraft;
    } else {
      const context = buildConversationContextFromHistory({
        history: body.history,
        selectedDraftContext,
      });
      recentHistoryStr = context.recentHistory;
      activeDraft = context.activeDraft;
    }

    const styleCard: VoiceStyleCard | null =
      parsedPersistedStyleCard?.success ? parsedPersistedStyleCard.data : null;
    const creatorContextForReply =
      (creatorAgentContext as { growthStrategySnapshot: GrowthStrategySnapshot } | null) ?? null;
    const growthPayloadForReply =
      (growthOsPayload as { replyInsights: Awaited<ReturnType<typeof buildGrowthOperatingSystemPayload>>["replyInsights"] } | null) ?? null;
    const replyInsights =
      growthPayloadForReply
        ? growthPayloadForReply.replyInsights
        : null;
    const {
      replyStrategy,
      replyParseResult,
      replyContinuation,
      shouldResetReplyWorkflow,
      defaultReplyStage,
      defaultReplyTone,
      defaultReplyGoal,
    } = resolveReplyTurnState({
      activeHandle,
      creatorAgentContext: creatorContextForReply,
      effectiveMessage,
      structuredReplyContext,
      artifactContext: normalizedTurn.artifactContext,
      turnSource: normalizedTurn.source,
      shouldBypassReplyHandling: !normalizedTurn.shouldAllowReplyHandling,
      activeReplyContext: storedMemory.activeReplyContext,
      toneRisk: body.toneRisk,
      goal: body.goal,
    });

    const handledReplyTurn = planReplyTurn({
      activeReplyContext: storedMemory.activeReplyContext,
      replyContinuation,
      replyParseResult,
      defaultReplyStage,
      defaultReplyTone,
      defaultReplyGoal,
      replyStrategy,
      replyInsights,
      styleCard,
    });

    if (handledReplyTurn) {
      return await finalizeReplyTurn({
        plannedTurn: handledReplyTurn,
        storedMemory,
        routingDiagnostics: normalizedTurn.diagnostics,
        clientTurnId,
        defaultThreadTitle: DEFAULT_THREAD_TITLE,
        storedThreadId: storedThread?.id ?? null,
        storedThreadTitle: storedThread?.title ?? null,
        requestedThreadId: threadId,
        shouldIncludeRoutingTrace,
        userId: session.user.id,
        activeHandle,
        loadBilling: () => getBillingStateForUser(effectiveUserId),
        recordProductEvent,
      });
    }

    console.log("[V2 Chat Checkpoint] Reached manageConversationTurn with threadId:", storedThread?.id);
    const { rawResponse, routingTrace } = await manageConversationTurnRaw({
      userId: effectiveUserId,
      xHandle: storedThread?.xHandle || null, // Pipeline context isolation
      threadId: storedThread?.id,
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
    const result = finalizeResponseEnvelope(rawResponse);

    console.log("[V2 Chat Checkpoint] Survived manageConversationTurn. Mode:", result.mode);
    const resultData = result.data as Record<string, unknown> | undefined;
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
      currentTitle: storedThread?.title,
      topicSummary: result.memory.topicSummary,
      conversationState: result.memory.conversationState,
    });
    const contextualThreadTitle = shouldPromoteThreadTitle
      ? await generateThreadTitle({
          topicSummary: result.memory.topicSummary,
          recentHistory: recentHistoryStr || "None",
          plan:
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
              : null,
        })
      : null;
    const {
      mappedData: mappedDataSeed,
      responseGroundingMode,
      responseGroundingExplanation,
    } = buildChatRouteMappedData({
      result,
      plan:
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
          : null,
      selectedDraftContext,
      formatPreference,
      isVerifiedAccount,
      userPreferences: effectiveUserPreferences,
      styleCard:
        parsedPersistedStyleCard?.success
          ? parsedPersistedStyleCard.data
          : null,
      routingDiagnostics: normalizedTurn.diagnostics,
      clientTurnId,
    });
    const persistencePlan = buildChatRoutePersistencePlan({
      mappedDataSeed,
      issuesFixed:
        Array.isArray(resultData?.issuesFixed)
          ? (resultData?.issuesFixed as string[]).filter((value) => typeof value === "string")
          : [],
      responseGroundingMode,
      responseGroundingExplanation,
      defaultThreadTitle: DEFAULT_THREAD_TITLE,
      currentThreadTitle: storedThread?.title,
      nextThreadTitle: shouldPromoteThreadTitle ? contextualThreadTitle : null,
      preferredSurfaceMode: result.memory.preferredSurfaceMode ?? "natural",
      shouldClearReplyWorkflow: shouldResetReplyWorkflow,
    });
    let mappedData = {
      ...persistencePlan.assistantMessageData,
    };
    let createdAssistantMessageId: string | undefined;

    if (storedThread) {
      const persistenceResult = await persistAssistantTurn({
        threadId: storedThread.id,
        assistantMessageData: mappedData,
        threadUpdate: persistencePlan.threadUpdate,
        buildMemoryUpdate: (assistantMessageId) => ({
          ...(persistencePlan.memoryUpdate.activeDraftVersionId
            ? {
                activeDraftRef: {
                  messageId: assistantMessageId,
                  versionId: persistencePlan.memoryUpdate.activeDraftVersionId,
                  revisionChainId: persistencePlan.memoryUpdate.revisionChainId ?? null,
                },
              }
            : {}),
          preferredSurfaceMode: persistencePlan.memoryUpdate.preferredSurfaceMode,
          ...(persistencePlan.memoryUpdate.shouldClearReplyWorkflow
            ? {
                activeReplyContext: null,
                activeReplyArtifactRef: null,
                selectedReplyOptionId: null,
              }
            : {}),
        }),
        draftCandidateCreates: persistencePlan.draftCandidateCreates,
        draftCandidateContext: {
          userId: session.user.id,
          xHandle: activeHandle,
          runId: storedRun?.id ?? null,
          sourcePrompt: effectiveMessage,
          sourcePlaybook: "chat_bundle",
          outputShape: result.outputShape,
        },
      });
      applyRuntimePersistenceTracePatch(routingTrace, persistenceResult.tracePatch);
      createdAssistantMessageId = persistenceResult.assistantMessageId;
      mappedData = {
        ...mappedData,
        threadTitle: persistenceResult.updatedThreadTitle || DEFAULT_THREAD_TITLE,
      };
    }

    dispatchPlannedProductEvents({
      events: planMainAssistantTurnProductEvents({
        mappedData,
        analytics: persistencePlan.analytics,
        explicitIntent: effectiveExplicitIntent,
      }),
      userId: session.user.id,
      xHandle: activeHandle,
      threadId: storedThread?.id ?? null,
      messageId: createdAssistantMessageId ?? null,
      recordProductEvent,
    });

    return await buildChatSuccessResponse({
      mappedData,
      createdAssistantMessageId,
      newThreadId: !threadId && storedThread ? storedThread.id : undefined,
      routingTrace: shouldIncludeRoutingTrace ? routingTrace : undefined,
      loadBilling: () => getBillingStateForUser(effectiveUserId),
    });
  } catch (error) {
    if (debitedCharge) {
      await refundCredits({
        userId: session.user.id,
        amount: debitedCharge.cost,
        idempotencyKey: `refund:${debitedCharge.idempotencyKey}`,
        source: "creator_v2_chat_error_refund",
        metadata: {
          reason: "route_error",
        },
      }).catch((refundError) =>
        console.error("Failed to refund chat credits after route error:", refundError),
      );
    }

    console.error("V2 Orchestrator Error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to process turn." }] },
      { status: 500 },
    );
  }
}
