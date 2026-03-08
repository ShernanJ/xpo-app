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
import { applyFinalDraftPolicy } from "@/lib/agent-v2/core/finalDraftPolicy";
import {
  buildPreferenceConstraintsFromPreferences,
  mergeUserPreferences,
  normalizeUserPreferences,
} from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import { getServerSession } from "@/lib/auth/serverSession";
import { ACTION_CREDIT_COST } from "@/lib/billing/config";
import { consumeCredits, refundCredits } from "@/lib/billing/credits";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import {
  buildInitialDraftVersionPayload,
  buildConversationContextFromHistory,
  normalizeDraftPayload,
  parseSelectedDraftContext,
  resolveEffectiveExplicitIntent,
  type SelectedDraftContext,
} from "./route.logic";

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
  preferenceConstraints?: unknown;
  preferenceSettings?: unknown;
}

const DEFAULT_THREAD_TITLE = "New Chat";

function isPlaceholderThreadTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim() || "";
  return !normalized || normalized === DEFAULT_THREAD_TITLE;
}

function isGenericThreadPrompt(message: string): boolean {
  const normalized = message.trim().toLowerCase();
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
    "what do i post",
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
    body.formatPreference === "shortform" || body.formatPreference === "longform"
      ? body.formatPreference
      : null;
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

  const { recentHistory: recentHistoryStr, activeDraft } =
    buildConversationContextFromHistory({
      history: body.history,
      selectedDraftContext,
    });
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

    if (storedThread) {
      await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "user",
          content: effectiveMessage,
        }
      });
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
      preferenceConstraints: mergedPreferenceConstraints,
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
      formatPreference?: "shortform" | "longform";
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
    const normalizedDraftPayload = normalizeDraftPayload({
      reply: result.response,
      draft: resultData?.draft as string || null,
      drafts: resultData?.draft
        ? [resultData.draft as string]
        : [],
      outputShape: result.outputShape,
      surfaceMode: result.surfaceMode,
      shouldAskFollowUp:
        responseShapePlan.shouldAskFollowUp && responseShapePlan.maxFollowUps > 0,
    });
    const effectiveFormatPreference =
      plan?.formatPreference ||
      formatPreference ||
      result.memory.formatPreference ||
      (result.outputShape === "long_form_post" ? "longform" : "shortform");
    const policyDraft =
      normalizedDraftPayload.draft && (
        result.outputShape === "short_form_post" || result.outputShape === "long_form_post"
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
          })
        : normalizedDraftPayload.draft;
    const policyDrafts = policyDraft ? [policyDraft] : normalizedDraftPayload.drafts;
    const draftVersionPayload = buildInitialDraftVersionPayload({
      draft: policyDraft,
      outputShape: result.outputShape,
      supportAsset: (resultData?.supportAsset as string) || null,
      selectedDraftContext,
    });
    const mappedData = {
      reply: normalizedDraftPayload.reply,
      angles: responseShapePlan.shouldShowArtifacts ? resultData?.angles as unknown[] || [] : [],
      quickReplies: responseShapePlan.shouldShowArtifacts ? resultData?.quickReplies || [] : [],
      plan: responseShapePlan.shouldShowArtifacts ? resultData?.plan || null : null,
      draft: policyDraft,
      drafts: policyDrafts,
      draftArtifacts: draftVersionPayload.draftArtifacts,
      draftVersions: draftVersionPayload.draftVersions,
      activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
      previousVersionSnapshot: draftVersionPayload.previousVersionSnapshot,
      revisionChainId: draftVersionPayload.revisionChainId,
      supportAsset: resultData?.supportAsset as string || null,
      outputShape: result.outputShape,
      surfaceMode: result.surfaceMode,
      memory: result.memory,
      threadTitle: storedThread?.title || DEFAULT_THREAD_TITLE,
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
        ...(draftVersionPayload.activeDraftVersionId && createdAssistantMessageId
          ? {
              activeDraftRef: {
                messageId: createdAssistantMessageId,
                versionId: draftVersionPayload.activeDraftVersionId,
                revisionChainId: draftVersionPayload.revisionChainId ?? null,
              },
            }
          : {}),
        preferredSurfaceMode:
          responseShapePlan.mode === "structured_generation" ? "structured" : "natural",
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
