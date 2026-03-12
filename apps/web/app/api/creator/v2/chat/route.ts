import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
import {
  createConversationMemory,
  updateConversationMemory,
} from "@/lib/agent-v2/memory/memoryStore";
import { StyleCardSchema, type UserPreferences } from "@/lib/agent-v2/core/styleProfile";
import type { VoiceTarget } from "@/lib/agent-v2/core/voiceTarget";
import type { GroundingPacketSourceMaterial } from "@/lib/agent-v2/orchestrator/groundingPacket";
import { applyFinalDraftPolicy } from "@/lib/agent-v2/core/finalDraftPolicy";
import {
  getXCharacterLimitForAccount,
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
import { recordProductEvent } from "@/lib/productEvents";
import {
  buildDraftBundleVersionPayload,
  buildInitialDraftVersionPayload,
  buildConversationContextFromHistory,
  normalizeDraftPayload,
  parseSelectedDraftContext,
  resolveEffectiveExplicitIntent,
  type SelectedDraftContext,
} from "./route.logic";
import type { DraftBundleResult } from "@/lib/agent-v2/orchestrator/draftBundles";
import type { ConversationalDiagnosticContext } from "@/lib/agent-v2/orchestrator/conversationalDiagnostics";
import { isMultiDraftRequest } from "@/lib/agent-v2/orchestrator/conversationManagerLogic";
import { isMissingDraftCandidateTableError } from "@/lib/agent-v2/orchestrator/prismaGuards";
import {
  buildRecommendedPlaybookSummaries,
  inferCurrentPlaybookStage,
} from "@/lib/creator/playbooks";
import type { StrategyPlan } from "@/lib/agent-v2/contracts/chat";

interface CreatorChatRequest extends Record<string, unknown> {
  threadId?: unknown;
  runId?: unknown;
  message?: unknown;
  history?: unknown;
  intent?: unknown;
  selectedAngle?: unknown;
  contentFocus?: unknown;
  selectedDraftContext?: unknown;
  formatPreference?: unknown;
  threadFramingStyle?: unknown;
  preferenceConstraints?: unknown;
  preferenceSettings?: unknown;
}

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

function clipContextLine(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildAssistantContextPacket(args: {
  reply: string;
  plan: StrategyPlan | null;
  draft: string | null;
  activeDraftVersionId?: string | null;
  revisionChainId?: string | null;
  outputShape: string;
  surfaceMode: string | null | undefined;
  issuesFixed: string[];
  groundingMode: string | null;
  groundingExplanation: string | null;
  groundingSources: GroundingPacketSourceMaterial[];
  quickReplies: unknown[];
}): {
  version: "assistant_context_v2";
  summary: string;
  planRef: {
    objective: string;
    angle: string;
    targetLane: StrategyPlan["targetLane"];
    formatPreference: StrategyPlan["formatPreference"] | null;
  } | null;
  draftRef: {
    excerpt: string;
    activeDraftVersionId: string | null;
    revisionChainId: string | null;
  } | null;
  grounding: {
    mode: string | null;
    explanation: string | null;
    sourceTitles: string[];
  };
  critique: {
    issuesFixed: string[];
  };
  artifacts: {
    outputShape: string;
    surfaceMode: string | null;
    quickReplyCount: number;
    hasDraft: boolean;
  };
} {
  const summaryLines = [
    args.plan
      ? `plan: ${clipContextLine(args.plan.objective, 100)} | ${clipContextLine(args.plan.angle, 120)}`
      : null,
    args.draft ? `draft: ${clipContextLine(args.draft, 220)}` : null,
    args.groundingExplanation ? `grounding: ${clipContextLine(args.groundingExplanation, 140)}` : null,
    args.issuesFixed[0] ? `critique: ${clipContextLine(args.issuesFixed[0], 120)}` : null,
    !args.plan && !args.draft && args.reply
      ? `reply: ${clipContextLine(args.reply, 180)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    version: "assistant_context_v2",
    summary: summaryLines.join("\n"),
    planRef: args.plan
      ? {
          objective: args.plan.objective,
          angle: args.plan.angle,
          targetLane: args.plan.targetLane,
          formatPreference: args.plan.formatPreference || null,
        }
      : null,
    draftRef: args.draft
      ? {
          excerpt: clipContextLine(args.draft, 220),
          activeDraftVersionId: args.activeDraftVersionId || null,
          revisionChainId: args.revisionChainId || null,
        }
      : null,
    grounding: {
      mode: args.groundingMode,
      explanation: args.groundingExplanation,
      sourceTitles: args.groundingSources.map((source) => source.title).slice(0, 3),
    },
    critique: {
      issuesFixed: args.issuesFixed.slice(0, 5),
    },
    artifacts: {
      outputShape: args.outputShape,
      surfaceMode: args.surfaceMode || null,
      quickReplyCount: args.quickReplies.length,
      hasDraft: Boolean(args.draft),
    },
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
  // If no threadId or runId, we will automatically generate a thread below.

  const message = typeof body.message === "string" ? body.message.trim() : "";

  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const formatPreference =
    body.formatPreference === "shortform" ||
    body.formatPreference === "longform" ||
    body.formatPreference === "thread"
      ? body.formatPreference
      : null;
  const threadFramingStyle = resolveThreadFramingStyle(body.threadFramingStyle);
  const selectedAngle = typeof body.selectedAngle === "string" ? body.selectedAngle.trim() : "";
  const contentFocus = typeof body.contentFocus === "string" ? body.contentFocus.trim() : "";
  const selectedDraftContext = parseSelectedDraftContext(body.selectedDraftContext);
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

  const effectiveMessage = (() => {
    if (message) return message;
    if (intent === "draft" && selectedAngle) {
      return `Turn the following angle into a draft: ${selectedAngle}`;
    }
    if (intent === "coach" || intent === "ideate") {
      if (contentFocus) {
        return `I want to focus on ${contentFocus}. Help me find one concrete moment worth turning into a post.`;
      }
      if (intent === "coach") {
        return "Help me find one concrete moment worth turning into a post.";
      }
    }
    if (selectedAngle) {
      return `Use the selected angle as the primary direction: ${selectedAngle}`;
    }
    return "";
  })();

  if (!effectiveMessage) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "message", message: "A message or intent is required." }] },
      { status: 400 },
    );
  }

  let storedThread = null;
  let storedRun = null;

  if (threadId) {
    storedThread = await prisma.chatThread.findUnique({ where: { id: threadId } });
    if (!storedThread || storedThread.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized." }] },
        { status: 404 },
      );
    }
  } else {
    const xHandle = session.user.activeXHandle || undefined;
    storedThread = await prisma.chatThread.create({
      data: {
        userId: session.user.id,
        ...(xHandle ? { xHandle } : {}),
      }
    });
    console.log("[V2 Chat Checkpoint] New Thread generated:", storedThread.id);

    await createConversationMemory({
      threadId: storedThread.id,
      userId: session.user.id,
    });
  }

  if (runId) {
    storedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
    if (!storedRun) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "runId", message: "Onboarding run not found." }] },
        { status: 404 },
      );
    }
  }

  const onboardingResult = (storedRun?.result || null) as
    | {
        profile?: {
          isVerified?: boolean;
        };
      }
    | null;
  const isVerifiedAccount = onboardingResult?.profile?.isVerified === true;
  const activeHandleRaw = storedThread?.xHandle || session.user.activeXHandle || null;
  const activeHandle =
    typeof activeHandleRaw === "string" && activeHandleRaw.trim()
      ? activeHandleRaw.trim().replace(/^@+/, "").toLowerCase()
      : null;
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

  const effectiveExplicitIntent = resolveEffectiveExplicitIntent({
    intent,
    selectedDraftContext,
  });
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

    if (storedThread) {
      const createdUserMessage = await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "user",
          content: effectiveMessage,
          data: {
            version: "user_context_v1",
            explicitIntent: effectiveExplicitIntent,
            formatPreference,
            threadFramingStyle,
            selectedDraftContext,
          } as Prisma.InputJsonValue,
        }
      });
      const threadMessages = await prisma.chatMessage.findMany({
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
      const context = buildConversationContextFromHistory({
        history: threadMessages.reverse(),
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

    console.log("[V2 Chat Checkpoint] Reached manageConversationTurn with threadId:", storedThread?.id);
    const result = await manageConversationTurn({
      userId: effectiveUserId,
      xHandle: storedThread?.xHandle || null, // Pipeline context isolation
      threadId: storedThread?.id,
      runId: storedRun?.id,
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: effectiveExplicitIntent,
      activeDraft,
      formatPreference,
      threadFramingStyle,
      preferenceConstraints: mergedPreferenceConstraints,
      creatorProfileHints,
      diagnosticContext,
    });

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
    const responseShapePlan = result.responseShapePlan;
    const rawDraftBundle =
      resultData &&
      typeof resultData === "object" &&
      resultData.draftBundle &&
      typeof resultData.draftBundle === "object"
        ? (resultData.draftBundle as DraftBundleResult)
        : null;
    const selectedBundleDraft =
      rawDraftBundle?.options.find((option) => option.id === rawDraftBundle.selectedOptionId)?.draft ??
      null;
    const normalizedDraftPayload = normalizeDraftPayload({
      reply: result.response,
      draft: selectedBundleDraft ?? (resultData?.draft as string) ?? null,
      drafts:
        rawDraftBundle?.options.map((option) => option.draft) ??
        (resultData?.draft ? [resultData.draft as string] : []),
      outputShape: result.outputShape,
      surfaceMode: result.surfaceMode,
      shouldAskFollowUp:
        responseShapePlan.shouldAskFollowUp && responseShapePlan.maxFollowUps > 0,
    });
    const effectiveFormatPreference =
      plan?.formatPreference ||
      formatPreference ||
      result.memory.formatPreference ||
      (result.outputShape === "thread_seed"
        ? "thread"
        : result.outputShape === "long_form_post"
          ? "longform"
          : "shortform");
    const responseThreadFramingStyle =
      resultData && typeof resultData === "object" && "threadFramingStyle" in resultData
        ? resolveThreadFramingStyle(
            (resultData as Record<string, unknown>).threadFramingStyle,
          )
        : null;
    const policyDraft =
      normalizedDraftPayload.draft && (
        result.outputShape === "short_form_post" ||
        result.outputShape === "long_form_post" ||
        result.outputShape === "thread_seed"
      )
        ? applyFinalDraftPolicy({
            draft: normalizedDraftPayload.draft,
            formatPreference: effectiveFormatPreference,
            isVerifiedAccount,
            userPreferences: effectiveUserPreferences,
            styleCard:
              parsedPersistedStyleCard?.success
                ? parsedPersistedStyleCard.data
                : null,
            threadFramingStyle: responseThreadFramingStyle,
          })
        : normalizedDraftPayload.draft;
    const responseVoiceTarget =
      resultData && typeof resultData === "object" && "voiceTarget" in resultData
        ? ((resultData as Record<string, unknown>).voiceTarget as VoiceTarget | null)
        : null;
    const responseNoveltyNotes =
      resultData &&
      typeof resultData === "object" &&
      Array.isArray((resultData as Record<string, unknown>).noveltyNotes)
        ? ((resultData as Record<string, unknown>).noveltyNotes as string[])
        : [];
    const responseGroundingSources =
      resultData &&
      typeof resultData === "object" &&
      Array.isArray((resultData as Record<string, unknown>).groundingSources)
        ? ((resultData as Record<string, unknown>).groundingSources as GroundingPacketSourceMaterial[])
        : [];
    const responseGroundingMode =
      resultData &&
      typeof resultData === "object" &&
      typeof (resultData as Record<string, unknown>).groundingMode === "string"
        ? ((resultData as Record<string, unknown>).groundingMode as
            | "saved_sources"
            | "current_chat"
            | "mixed"
            | "safe_framework")
        : null;
    const responseGroundingExplanation =
      resultData &&
      typeof resultData === "object" &&
      typeof (resultData as Record<string, unknown>).groundingExplanation === "string"
        ? ((resultData as Record<string, unknown>).groundingExplanation as string)
        : null;
    const policyDraftBundle = rawDraftBundle
      ? {
          ...rawDraftBundle,
          options: rawDraftBundle.options.map((option) => ({
            ...option,
            draft: applyFinalDraftPolicy({
              draft: option.draft,
              formatPreference: effectiveFormatPreference,
              isVerifiedAccount,
              userPreferences: effectiveUserPreferences,
              styleCard:
                parsedPersistedStyleCard?.success
                  ? parsedPersistedStyleCard.data
                  : null,
              threadFramingStyle: option.threadFramingStyle ?? responseThreadFramingStyle,
            }),
          })),
        }
      : null;
    const selectedBundleOption =
      policyDraftBundle?.options.find(
        (option) => option.id === policyDraftBundle.selectedOptionId,
      ) ?? policyDraftBundle?.options[0] ?? null;
    const resolvedPolicyDraft = selectedBundleOption?.draft ?? policyDraft;
    const policyDrafts =
      policyDraftBundle?.options.map((option) => option.draft) ??
      (resolvedPolicyDraft ? [resolvedPolicyDraft] : normalizedDraftPayload.drafts);
    const draftBundlePayload = policyDraftBundle
      ? buildDraftBundleVersionPayload({
          draftBundle: policyDraftBundle,
          outputShape: result.outputShape,
          groundingSources: responseGroundingSources,
          groundingMode: responseGroundingMode,
          groundingExplanation: responseGroundingExplanation,
          threadPostMaxCharacterLimit: getXCharacterLimitForAccount(isVerifiedAccount),
        })
      : null;
    const singleDraftVersionPayload = !policyDraftBundle
      ? buildInitialDraftVersionPayload({
          draft: resolvedPolicyDraft,
          outputShape: result.outputShape,
          supportAsset: (resultData?.supportAsset as string) || null,
          selectedDraftContext,
          groundingSources: responseGroundingSources,
          groundingMode: responseGroundingMode,
          groundingExplanation: responseGroundingExplanation,
          voiceTarget: responseVoiceTarget,
          noveltyNotes: responseNoveltyNotes,
          threadPostMaxCharacterLimit: getXCharacterLimitForAccount(isVerifiedAccount),
          threadFramingStyle: responseThreadFramingStyle,
        })
      : null;
    const draftVersionPayload = draftBundlePayload ?? singleDraftVersionPayload ?? {
      draftArtifacts: [],
    };
    const mappedData = {
      reply: normalizedDraftPayload.reply,
      angles: responseShapePlan.shouldShowArtifacts ? resultData?.angles as unknown[] || [] : [],
      quickReplies: responseShapePlan.shouldShowArtifacts ? resultData?.quickReplies || [] : [],
      plan: responseShapePlan.shouldShowArtifacts ? resultData?.plan || null : null,
      draft: resolvedPolicyDraft,
      drafts: policyDrafts,
      draftArtifacts: draftVersionPayload.draftArtifacts,
      draftVersions: draftVersionPayload.draftVersions,
      activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
      previousVersionSnapshot:
        "previousVersionSnapshot" in draftVersionPayload
          ? draftVersionPayload.previousVersionSnapshot
          : undefined,
      revisionChainId: draftVersionPayload.revisionChainId,
      draftBundle: draftBundlePayload?.draftBundle ?? null,
      supportAsset:
        selectedBundleOption?.supportAsset ?? ((resultData?.supportAsset as string) || null),
      groundingSources: responseGroundingSources,
      autoSavedSourceMaterials:
        resultData &&
        typeof resultData === "object" &&
        resultData.autoSavedSourceMaterials &&
        typeof resultData.autoSavedSourceMaterials === "object"
          ? (resultData.autoSavedSourceMaterials as {
              count: number;
              assets: Array<{
                id: string;
                title: string;
                deletable: boolean;
              }>;
            })
          : null,
      outputShape: result.outputShape,
      surfaceMode: result.surfaceMode,
      memory: result.memory,
      threadTitle: storedThread?.title || DEFAULT_THREAD_TITLE,
      billing: null as Awaited<ReturnType<typeof getBillingStateForUser>> | null,
      contextPacket: buildAssistantContextPacket({
        reply: normalizedDraftPayload.reply,
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
        draft: resolvedPolicyDraft,
        activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
        revisionChainId: draftVersionPayload.revisionChainId,
        outputShape: result.outputShape,
        surfaceMode: result.surfaceMode,
        issuesFixed:
          Array.isArray(resultData?.issuesFixed)
            ? (resultData?.issuesFixed as string[]).filter((value) => typeof value === "string")
            : [],
        groundingMode: responseGroundingMode,
        groundingExplanation: responseGroundingExplanation,
        groundingSources: responseGroundingSources,
        quickReplies:
          responseShapePlan.shouldShowArtifacts && Array.isArray(resultData?.quickReplies)
            ? (resultData.quickReplies as unknown[])
            : [],
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
        }
      });
      createdAssistantMessageId = assistantMessage.id;

      await updateConversationMemory({
        threadId: storedThread.id,
        ...(draftVersionPayload.activeDraftVersionId && createdAssistantMessageId
          ? {
              activeDraftRef: {
                messageId: createdAssistantMessageId,
                versionId: draftVersionPayload.activeDraftVersionId,
                revisionChainId: draftVersionPayload.revisionChainId ?? null,
              },
            }
          : {}),
        preferredSurfaceMode: result.memory.preferredSurfaceMode ?? "natural",
      });

      const updateData: { updatedAt: Date; title?: string } = { updatedAt: new Date() };

      if (shouldPromoteThreadTitle && contextualThreadTitle) {
        updateData.title = contextualThreadTitle;
      }

      const updatedThread = await prisma.chatThread.update({
        where: { id: storedThread.id },
        data: updateData
      });

      mappedData.threadTitle = updatedThread.title || DEFAULT_THREAD_TITLE;

      if (draftBundlePayload?.draftBundle?.options.length) {
        try {
          await Promise.all(
            draftBundlePayload.draftBundle.options.map((option) =>
              prisma.draftCandidate.create({
                data: {
                  userId: session.user.id,
                  ...(activeHandle ? { xHandle: activeHandle } : {}),
                  threadId: storedThread.id,
                  runId: storedRun?.id ?? null,
                  title: option.label,
                  sourcePrompt: effectiveMessage,
                  sourcePlaybook: "chat_bundle",
                  outputShape: result.outputShape,
                  artifact: option.artifact as unknown as Prisma.InputJsonValue,
                  voiceTarget: option.artifact.voiceTarget
                    ? (option.artifact.voiceTarget as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                  noveltyNotes: (option.artifact.noveltyNotes ?? []) as unknown as Prisma.InputJsonValue,
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

    const primaryDraftArtifact =
      draftBundlePayload?.draftBundle
        ? (
            draftBundlePayload.draftBundle.options.find(
              (option) => option.id === draftBundlePayload.draftBundle?.selectedOptionId,
            )?.artifact ?? draftVersionPayload.draftArtifacts[0]
          )
        : draftVersionPayload.draftArtifacts[0] ?? null;
    const primaryGroundingMode = primaryDraftArtifact?.groundingMode ?? null;
    const primaryGroundingSourceCount = primaryDraftArtifact?.groundingSources?.length ?? 0;
    const autoSavedSourceMaterialCount = mappedData.autoSavedSourceMaterials?.count ?? 0;

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
          groundingMode: primaryGroundingMode,
          groundingSourceCount: primaryGroundingSourceCount,
          usedSavedSources:
            primaryGroundingMode === "saved_sources" || primaryGroundingMode === "mixed",
          usedSafeFramework: primaryGroundingMode === "safe_framework",
          clarificationQuestionsAsked: mappedData.memory?.clarificationQuestionsAsked ?? 0,
          autoSavedSourceMaterialCount,
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
