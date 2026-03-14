import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurnRaw } from "@/lib/agent-v2/orchestrator/conversationManager";
import { finalizeResponseEnvelope } from "@/lib/agent-v2/orchestrator/responseEnvelope";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
import {
  createConversationMemorySnapshot,
  createConversationMemory,
  getConversationMemory,
  updateConversationMemory,
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
  buildAssistantContextPacket,
  buildChatRouteMappedData,
  buildChatRoutePersistencePlan,
  buildConversationContextFromHistory,
  parseSelectedDraftContext,
  resolveSelectedDraftContextFromHistory,
  type SelectedDraftContext,
} from "./route.logic";
import { normalizeChatTurn } from "./turnNormalization";
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/orchestrator/conversationalDiagnostics";
import { isMultiDraftRequest } from "@/lib/agent-v2/orchestrator/conversationManagerLogic";
import { isMissingDraftCandidateTableError } from "@/lib/agent-v2/orchestrator/prismaGuards";
import {
  buildRecommendedPlaybookSummaries,
  inferCurrentPlaybookStage,
} from "@/lib/creator/playbooks";
import type { StrategyPlan } from "@/lib/agent-v2/contracts/chat";
import { buildChatReplyDraft, buildChatReplyOptions } from "@/lib/extension/chatReplyAdapter";
import type { ExtensionReplyIntentMetadata } from "@/lib/extension/types";
import {
  buildEmbeddedPostWithoutReplyPrompt,
  buildMissingReplyPostPrompt,
  buildReplyArtifactsFromDraft,
  buildReplyArtifactsFromOptions,
  buildReplyConfirmationPrompt,
  buildReplyDraftQuickReplies,
  buildReplyOptionsQuickReplies,
  buildReplyParseEnvelope,
  buildReplyConfirmationQuickReplies,
  createEmptyActiveReplyContext,
  parseEmbeddedReplyRequest,
  resolveReplyContinuation,
  shouldClearReplyWorkflow,
  type ActiveReplyContext,
  type ChatReplyArtifacts,
  type ChatReplyParseEnvelope,
} from "./reply.logic";

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

function buildFallbackGrowthStrategySnapshot(activeHandle: string | null): GrowthStrategySnapshot {
  return {
    knownFor: activeHandle ? `${activeHandle}'s niche` : "a clearer niche",
    targetAudience: "the right people in your niche on X",
    contentPillars: ["clear positioning", "useful nuance", "proof-first writing"],
    replyGoals: ["Add one useful layer instead of generic agreement."],
    profileConversionCues: ["Replies should reinforce the niche the account wants to be known for."],
    offBrandThemes: ["generic agreement with no point of view"],
    ambiguities: ["Profile context is thin, so keep reply guidance conservative and grounded to the pasted post."],
    confidence: {
      overall: 40,
      positioning: 35,
      replySignal: 30,
      readiness: "caution",
    },
    truthBoundary: {
      verifiedFacts: activeHandle ? [`Active handle: @${activeHandle}`] : [],
      inferredThemes: ["useful nuance"],
      unknowns: ["Profile context is thin, so reply recommendations should avoid overclaiming voice patterns."],
    },
  };
}

function resolveChatReplyStage(
  creatorAgentContext: ReturnType<typeof buildCreatorAgentContext> | null,
): ActiveReplyContext["stage"] {
  const followerBand = creatorAgentContext?.creatorProfile.identity.followerBand;
  if (followerBand === "1k-10k") {
    return "1k_to_10k";
  }
  if (followerBand === "10k+") {
    return "10k_to_50k";
  }
  return "0_to_1k";
}

function resolveChatReplyTone(rawValue: unknown): ActiveReplyContext["tone"] {
  if (rawValue === "bold") {
    return "bold";
  }

  return "builder";
}

function resolveChatReplyGoal(rawValue: unknown): string {
  return rawValue === "followers" || rawValue === "leads" || rawValue === "authority"
    ? rawValue
    : "followers";
}

function toExtensionReplyIntentMetadata(
  value:
    | {
        label: string;
        strategyPillar: string;
        anchor: string;
        rationale: string;
      }
    | null
    | undefined,
): ExtensionReplyIntentMetadata | null {
  if (!value) {
    return null;
  }

  if (
    value.label !== "nuance" &&
    value.label !== "sharpen" &&
    value.label !== "disagree" &&
    value.label !== "example" &&
    value.label !== "translate" &&
    value.label !== "known_for"
  ) {
    return null;
  }

  return {
    label: value.label,
    strategyPillar: value.strategyPillar,
    anchor: value.anchor,
    rationale: value.rationale,
  };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  let body: CreatorChatRequest;

  try {
    body = (await request.json()) as CreatorChatRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

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
  const creatorProfileHints =
    storedRun?.id && storedRun?.result
      ? await (async () => {
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
      : null;
  const persistedVoiceProfile = activeHandle
    ? await prisma.voiceProfile.findFirst({
        where: {
          userId: session.user.id,
          xHandle: activeHandle,
        },
      })
    : null;
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
      threadMessages = await prisma.chatMessage.findMany({
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
      });
      storedMemory = createConversationMemorySnapshot(
        await getConversationMemory({ threadId: storedThread.id }),
      );
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
    const replyStrategy: GrowthStrategySnapshot =
      creatorContextForReply
        ? creatorContextForReply.growthStrategySnapshot
        : buildFallbackGrowthStrategySnapshot(activeHandle);
    const replyInsights =
      growthPayloadForReply
        ? growthPayloadForReply.replyInsights
        : null;
    const shouldBypassReplyHandling = !normalizedTurn.shouldAllowReplyHandling;
    const replyParseResult = shouldBypassReplyHandling
      ? { classification: "plain_chat" as const, context: null }
      : parseEmbeddedReplyRequest({
          message: effectiveMessage,
          replyContext: structuredReplyContext,
        });
    const structuredReplyContinuation =
      normalizedTurn.artifactContext?.kind === "reply_option_select"
        ? {
            type: "select_option" as const,
            optionIndex: normalizedTurn.artifactContext.optionIndex,
          }
        : normalizedTurn.artifactContext?.kind === "reply_confirmation"
          ? normalizedTurn.artifactContext.decision === "confirm"
            ? ({ type: "confirm" as const })
            : ({ type: "decline" as const })
          : null;
    const replyContinuation =
      structuredReplyContinuation ||
      (shouldBypassReplyHandling
        ? null
        : resolveReplyContinuation({
            userMessage: effectiveMessage,
            activeReplyContext: storedMemory.activeReplyContext,
          }));
    const shouldResetReplyWorkflow = shouldClearReplyWorkflow({
      activeReplyContext: storedMemory.activeReplyContext,
      turnSource: normalizedTurn.source,
      replyParseResult,
      replyContinuation,
    });
    const defaultReplyStage = resolveChatReplyStage(creatorAgentContext);
    const defaultReplyTone = resolveChatReplyTone(body.toneRisk);
    const defaultReplyGoal = resolveChatReplyGoal(body.goal);

    const buildNextReplyMemory = (args: {
      activeReplyContext: ActiveReplyContext | null;
      selectedReplyOptionId?: string | null;
    }) => ({
      ...storedMemory,
      activeReplyContext: args.activeReplyContext,
      activeReplyArtifactRef: storedMemory.activeReplyArtifactRef,
      selectedReplyOptionId:
        args.selectedReplyOptionId === undefined
          ? storedMemory.selectedReplyOptionId
          : args.selectedReplyOptionId,
      preferredSurfaceMode: "structured" as const,
    });

    const finalizeReplyAssistantTurn = async (args: {
      reply: string;
      outputShape: "coach_question" | "reply_candidate";
      surfaceMode:
        | "answer_directly"
        | "ask_one_question"
        | "offer_options"
        | "generate_full_output";
      quickReplies: unknown[];
      activeReplyContext: ActiveReplyContext | null;
      selectedReplyOptionId?: string | null;
      replyArtifacts?: ChatReplyArtifacts | null;
      replyParse?: ChatReplyParseEnvelope | null;
      eventType?: string;
    }) => {
      const nextMemory = buildNextReplyMemory({
        activeReplyContext: args.activeReplyContext,
        selectedReplyOptionId: args.selectedReplyOptionId,
      });
      const mappedData = {
        reply: args.reply,
        angles: [],
        quickReplies: args.quickReplies,
        plan: null,
        draft: null,
        drafts: [],
        draftArtifacts: [],
        supportAsset: null,
        outputShape: args.outputShape,
        surfaceMode: args.surfaceMode,
        memory: nextMemory,
        routingDiagnostics: normalizedTurn.diagnostics,
        requestTrace: {
          clientTurnId,
        },
        threadTitle: storedThread?.title || DEFAULT_THREAD_TITLE,
        billing: null as Awaited<ReturnType<typeof getBillingStateForUser>> | null,
        replyArtifacts: args.replyArtifacts || null,
        replyParse: args.replyParse || null,
        contextPacket: buildAssistantContextPacket({
          reply: args.reply,
          plan: null,
          draft: null,
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

      let createdAssistantMessageId: string | undefined;
      if (storedThread) {
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            threadId: storedThread.id,
            role: "assistant",
            content: mappedData.reply,
            data: mappedData as unknown as Prisma.InputJsonValue,
          },
        });
        createdAssistantMessageId = assistantMessage.id;
        await updateConversationMemory({
          threadId: storedThread.id,
          preferredSurfaceMode: "structured",
          activeReplyContext: args.activeReplyContext,
          activeReplyArtifactRef: args.replyArtifacts
            ? {
                messageId: assistantMessage.id,
                kind: args.replyArtifacts.kind,
              }
            : null,
          selectedReplyOptionId:
            args.selectedReplyOptionId === undefined ? null : args.selectedReplyOptionId,
        });
        await prisma.chatThread.update({
          where: { id: storedThread.id },
          data: { updatedAt: new Date() },
        });
      }

      if (args.eventType) {
        void recordProductEvent({
          userId: session.user.id,
          xHandle: activeHandle,
          threadId: storedThread?.id ?? null,
          messageId: createdAssistantMessageId ?? null,
          eventType: args.eventType,
          properties: {
            outputShape: args.outputShape,
            surfaceMode: args.surfaceMode,
            replyArtifactKind: args.replyArtifacts?.kind ?? null,
            replyParseConfidence: args.replyParse?.confidence ?? null,
          },
        }).catch((error) =>
          console.error(`Failed to record ${args.eventType} event:`, error),
        );
      }

      mappedData.billing = await getBillingStateForUser(effectiveUserId);

      return NextResponse.json(
        {
          ok: true,
          data: {
            ...mappedData,
            ...(createdAssistantMessageId ? { messageId: createdAssistantMessageId } : {}),
            newThreadId: !threadId && storedThread ? storedThread.id : undefined,
          },
        },
        { status: 200 },
      );
    };

    const activeReplyContext = storedMemory.activeReplyContext;
    const selectedReplyIntent = toExtensionReplyIntentMetadata(
      activeReplyContext?.latestReplyOptions.find(
        (option) => option.id === activeReplyContext.selectedReplyOptionId,
      )?.intent || activeReplyContext?.latestReplyOptions[0]?.intent,
    );

    if (replyContinuation?.type === "decline" && activeReplyContext) {
      return await finalizeReplyAssistantTurn({
        reply: "ok. paste the exact post text or x url you want help with when you're ready.",
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: [],
        activeReplyContext: null,
        selectedReplyOptionId: null,
        replyParse: {
          detected: true,
          confidence: activeReplyContext.confidence,
          needsConfirmation: false,
          parseReason: "reply_confirmation_declined",
        },
      });
    }

    if (
      (replyContinuation?.type === "confirm" && activeReplyContext) ||
      (replyParseResult.classification === "reply_request_with_embedded_post" &&
        replyParseResult.context?.confidence === "high")
    ) {
      const sourceContext =
        activeReplyContext ||
        createEmptyActiveReplyContext({
          sourceText: replyParseResult.context?.sourceText || "",
          sourceUrl: replyParseResult.context?.sourceUrl || null,
          authorHandle: replyParseResult.context?.authorHandle || null,
          quotedUserAsk: replyParseResult.context?.quotedUserAsk || null,
          confidence: replyParseResult.context?.confidence || "high",
          parseReason: replyParseResult.context?.parseReason || "reply_request_with_embedded_post",
          awaitingConfirmation: false,
          stage: defaultReplyStage,
          tone: defaultReplyTone,
          goal: defaultReplyGoal,
        });
      const strategyPillar =
        selectedReplyIntent?.strategyPillar ||
        replyStrategy.contentPillars[0] ||
        replyStrategy.knownFor;
      const generated = buildChatReplyOptions({
        source: {
          opportunityId: sourceContext.opportunityId,
          sourceText: sourceContext.sourceText,
          sourceUrl: sourceContext.sourceUrl,
          authorHandle: sourceContext.authorHandle,
        },
        strategy: replyStrategy,
        strategyPillar,
        styleCard,
        replyInsights,
        stage: sourceContext.stage,
        tone: sourceContext.tone,
        goal: sourceContext.goal,
      });
      const nextReplyContext: ActiveReplyContext = {
        ...sourceContext,
        awaitingConfirmation: false,
        latestReplyOptions: generated.response.options,
        latestReplyDraftOptions: [],
        selectedReplyOptionId: null,
      };
      return await finalizeReplyAssistantTurn({
        reply: "pulled 3 grounded reply directions from that post.",
        outputShape: "reply_candidate",
        surfaceMode: "offer_options",
        quickReplies: buildReplyOptionsQuickReplies(generated.response.options.length),
        activeReplyContext: nextReplyContext,
        selectedReplyOptionId: null,
        replyArtifacts: buildReplyArtifactsFromOptions({
          context: nextReplyContext,
          response: generated.response,
        }),
        replyParse: buildReplyParseEnvelope(replyParseResult) || {
          detected: true,
          confidence: sourceContext.confidence,
          needsConfirmation: false,
          parseReason: sourceContext.parseReason,
        },
        eventType: "chat_reply_options_generated",
      });
    }

    if (replyContinuation?.type === "select_option" && activeReplyContext) {
      const selectedOption = activeReplyContext.latestReplyOptions[replyContinuation.optionIndex];
      if (selectedOption) {
        const generated = buildChatReplyDraft({
          source: {
            opportunityId: activeReplyContext.opportunityId,
            sourceText: activeReplyContext.sourceText,
            sourceUrl: activeReplyContext.sourceUrl,
            authorHandle: activeReplyContext.authorHandle,
          },
          strategy: replyStrategy,
          replyInsights,
          stage: activeReplyContext.stage,
          tone: activeReplyContext.tone,
          goal: activeReplyContext.goal,
          selectedIntent: toExtensionReplyIntentMetadata(selectedOption.intent) || undefined,
        });
        const nextReplyContext: ActiveReplyContext = {
          ...activeReplyContext,
          latestReplyDraftOptions: generated.response.options,
          selectedReplyOptionId: selectedOption.id,
        };
        return await finalizeReplyAssistantTurn({
          reply: `ran with option ${replyContinuation.optionIndex + 1} and turned it into a reply draft.`,
          outputShape: "reply_candidate",
          surfaceMode: "generate_full_output",
          quickReplies: buildReplyDraftQuickReplies(),
          activeReplyContext: nextReplyContext,
          selectedReplyOptionId: selectedOption.id,
          replyArtifacts: buildReplyArtifactsFromDraft({
            context: nextReplyContext,
            response: generated.response,
          }),
          replyParse: {
            detected: true,
            confidence: activeReplyContext.confidence,
            needsConfirmation: false,
            parseReason: "reply_option_selected",
          },
          eventType: "chat_reply_draft_generated",
        });
      }
    }

    if (replyContinuation?.type === "revise_draft" && activeReplyContext) {
      const generated = buildChatReplyDraft({
        source: {
          opportunityId: activeReplyContext.opportunityId,
          sourceText: activeReplyContext.sourceText,
          sourceUrl: activeReplyContext.sourceUrl,
          authorHandle: activeReplyContext.authorHandle,
        },
        strategy: replyStrategy,
        replyInsights,
        stage: activeReplyContext.stage,
        tone: replyContinuation.tone,
        goal: activeReplyContext.goal,
        selectedIntent: selectedReplyIntent || undefined,
        length: replyContinuation.length,
      });
      const nextReplyContext: ActiveReplyContext = {
        ...activeReplyContext,
        tone: replyContinuation.tone,
        latestReplyDraftOptions: generated.response.options,
      };
      return await finalizeReplyAssistantTurn({
        reply:
          replyContinuation.length === "shorter"
            ? "tightened the reply while keeping the same grounded angle."
            : replyContinuation.tone === "bold"
              ? "pushed the reply bolder without inventing anything."
              : replyContinuation.tone === "warm"
                ? "softened the reply without losing the point."
                : "updated the reply and kept it grounded to the same post.",
        outputShape: "reply_candidate",
        surfaceMode: "generate_full_output",
        quickReplies: buildReplyDraftQuickReplies(),
        activeReplyContext: nextReplyContext,
        selectedReplyOptionId: activeReplyContext.selectedReplyOptionId,
        replyArtifacts: buildReplyArtifactsFromDraft({
          context: nextReplyContext,
          response: generated.response,
        }),
        replyParse: {
          detected: true,
          confidence: activeReplyContext.confidence,
          needsConfirmation: false,
          parseReason: "reply_draft_revised",
        },
        eventType: "chat_reply_draft_revised",
      });
    }

    if (
      replyParseResult.classification === "reply_request_with_embedded_post" &&
      replyParseResult.context?.confidence === "medium"
    ) {
      const nextReplyContext = createEmptyActiveReplyContext({
        sourceText: replyParseResult.context.sourceText,
        sourceUrl: replyParseResult.context.sourceUrl,
        authorHandle: replyParseResult.context.authorHandle,
        quotedUserAsk: replyParseResult.context.quotedUserAsk,
        confidence: replyParseResult.context.confidence,
        parseReason: replyParseResult.context.parseReason,
        awaitingConfirmation: true,
        stage: defaultReplyStage,
        tone: defaultReplyTone,
        goal: defaultReplyGoal,
      });
      return await finalizeReplyAssistantTurn({
        reply: buildReplyConfirmationPrompt(replyParseResult.context),
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: buildReplyConfirmationQuickReplies(),
        activeReplyContext: nextReplyContext,
        replyParse: buildReplyParseEnvelope(replyParseResult),
      });
    }

    if (replyParseResult.classification === "reply_request_missing_post") {
      return await finalizeReplyAssistantTurn({
        reply: buildMissingReplyPostPrompt(),
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: [],
        activeReplyContext: null,
        selectedReplyOptionId: null,
        replyParse: buildReplyParseEnvelope(replyParseResult),
      });
    }

    if (
      replyParseResult.classification === "embedded_post_without_reply_request" &&
      replyParseResult.context
    ) {
      const nextReplyContext = createEmptyActiveReplyContext({
        sourceText: replyParseResult.context.sourceText,
        sourceUrl: replyParseResult.context.sourceUrl,
        authorHandle: replyParseResult.context.authorHandle,
        quotedUserAsk: null,
        confidence: replyParseResult.context.confidence,
        parseReason: replyParseResult.context.parseReason,
        awaitingConfirmation: true,
        stage: defaultReplyStage,
        tone: defaultReplyTone,
        goal: defaultReplyGoal,
      });
      return await finalizeReplyAssistantTurn({
        reply: buildEmbeddedPostWithoutReplyPrompt(replyParseResult.context),
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: [],
        activeReplyContext: nextReplyContext,
        replyParse: buildReplyParseEnvelope(replyParseResult),
      });
    }

    console.log("[V2 Chat Checkpoint] Reached manageConversationTurn with threadId:", storedThread?.id);
    const rawResult = await manageConversationTurnRaw({
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
      diagnosticContext,
    });
    const result = finalizeResponseEnvelope(rawResult);

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
      responseVoiceTarget,
      responseNoveltyNotes,
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
    const mappedData = {
      ...persistencePlan.assistantMessageData,
      billing: null as Awaited<ReturnType<typeof getBillingStateForUser>> | null,
    };
    let createdAssistantMessageId: string | undefined;

    if (storedThread) {
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "assistant",
          content: mappedData.reply,
          data: mappedData as unknown as Prisma.InputJsonValue,
        }
      });
      createdAssistantMessageId = assistantMessage.id;

      await updateConversationMemory({
        threadId: storedThread.id,
        ...(persistencePlan.memoryUpdate.activeDraftVersionId && createdAssistantMessageId
          ? {
              activeDraftRef: {
                messageId: createdAssistantMessageId,
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
      });

      const updatedThread = await prisma.chatThread.update({
        where: { id: storedThread.id },
        data: persistencePlan.threadUpdate,
      });

      mappedData.threadTitle = updatedThread.title || DEFAULT_THREAD_TITLE;

      if (persistencePlan.draftCandidateCreates.length > 0) {
        try {
          await Promise.all(
            persistencePlan.draftCandidateCreates.map((candidate) =>
              prisma.draftCandidate.create({
                data: {
                  userId: session.user.id,
                  ...(activeHandle ? { xHandle: activeHandle } : {}),
                  threadId: storedThread.id,
                  runId: storedRun?.id ?? null,
                  title: candidate.title,
                  sourcePrompt: effectiveMessage,
                  sourcePlaybook: "chat_bundle",
                  outputShape: result.outputShape,
                  artifact: candidate.artifact as unknown as Prisma.InputJsonValue,
                  voiceTarget: candidate.voiceTarget
                    ? (candidate.voiceTarget as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                  noveltyNotes: candidate.noveltyNotes as unknown as Prisma.InputJsonValue,
                },
              }),
            ),
          );
        } catch (error) {
          if (!isMissingDraftCandidateTableError(error)) {
            throw error;
          }
        }
      }
    }

    if (
      (mappedData.outputShape === "short_form_post" ||
        mappedData.outputShape === "long_form_post" ||
        mappedData.outputShape === "thread_seed") &&
      mappedData.draft
    ) {
      void recordProductEvent({
        userId: session.user.id,
        xHandle: activeHandle,
        threadId: storedThread?.id ?? null,
        messageId: createdAssistantMessageId ?? null,
        eventType: "draft_generated",
        properties: {
          outputShape: mappedData.outputShape,
          surfaceMode: mappedData.surfaceMode ?? null,
          groundingMode: persistencePlan.analytics.primaryGroundingMode,
          groundingSourceCount: persistencePlan.analytics.primaryGroundingSourceCount,
          usedSavedSources:
            persistencePlan.analytics.primaryGroundingMode === "saved_sources" ||
            persistencePlan.analytics.primaryGroundingMode === "mixed",
          usedSafeFramework:
            persistencePlan.analytics.primaryGroundingMode === "safe_framework",
          clarificationQuestionsAsked: mappedData.memory?.clarificationQuestionsAsked ?? 0,
          autoSavedSourceMaterialCount: persistencePlan.analytics.autoSavedSourceMaterialCount,
        },
      }).catch((error) => console.error("Failed to record draft_generated event:", error));
    }

    if (
      mappedData.outputShape === "coach_question" &&
      mappedData.surfaceMode === "ask_one_question"
    ) {
      void recordProductEvent({
        userId: session.user.id,
        xHandle: activeHandle,
        threadId: storedThread?.id ?? null,
        messageId: createdAssistantMessageId ?? null,
        eventType: "clarification_prompted",
        properties: {
          conversationState: mappedData.memory?.conversationState ?? null,
          clarificationQuestionsAsked: mappedData.memory?.clarificationQuestionsAsked ?? 0,
          hasTopicSummary: Boolean(mappedData.memory?.topicSummary),
          explicitIntent: effectiveExplicitIntent || "auto",
        },
      }).catch((error) =>
        console.error("Failed to record clarification_prompted event:", error),
      );
    }

    mappedData.billing = await getBillingStateForUser(effectiveUserId);

    return NextResponse.json(
        {
          ok: true,
          data: {
          ...mappedData,
          ...(createdAssistantMessageId ? { messageId: createdAssistantMessageId } : {}),
          newThreadId: !threadId && storedThread ? storedThread.id : undefined
        }
      },
      { status: 200 },
    );
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
