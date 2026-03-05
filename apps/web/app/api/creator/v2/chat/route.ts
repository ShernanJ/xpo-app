import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
import { createConversationMemory } from "@/lib/agent-v2/memory/memoryStore";
import { StyleCardSchema, type UserPreferences } from "@/lib/agent-v2/core/styleProfile";
import { applyFinalDraftPolicy } from "@/lib/agent-v2/core/finalDraftPolicy";
import {
  buildPreferenceConstraintsFromPreferences,
  mergeUserPreferences,
  normalizeUserPreferences,
} from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import {
  buildDraftArtifact,
  buildDraftArtifactTitle,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { ACTION_CREDIT_COST } from "@/lib/billing/config";
import { consumeCredits, refundCredits } from "@/lib/billing/credits";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { buildConversationContextFromHistory } from "./route.logic";

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

type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

interface DraftVersionEntry {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
}

interface PreviousVersionSnapshot {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

interface SelectedDraftContext {
  messageId: string;
  versionId: string;
  content: string;
  source?: DraftVersionSource;
  createdAt?: string;
  maxCharacterLimit?: number;
  revisionChainId?: string;
}

const DEFAULT_THREAD_TITLE = "New Chat";
const DRAFT_HANDOFF_REPLIES = new Set([
  "here's the draft. take a look.",
  "here's a draft. take a look.",
  "draft's ready. take a look.",
  "put together the draft. take a look.",
  "draft is up. tell me what to tweak.",
  "draft's ready. want any tweaks?",
  "put together a draft. thoughts?",
  "put together a draft. take a look.",
  "made the edit. take a look.",
  "updated it. give it a read.",
  "made the edit. kept your voice tight.",
  "updated it and kept your tone.",
  "edited and stayed in your voice.",
  "made the edit. sharpened the hook.",
  "updated it with a punchier hook.",
  "edited it for a stronger hook.",
  "made the edit and tightened it.",
  "updated and trimmed it down.",
  "kept it natural and in your voice.",
  "drafted it to sound like you.",
  "kept your voice front and center.",
  "leaned into a sharper hook.",
  "drafted this with a growth hook.",
  "optimized the hook for reach.",
  "kept it tight enough to post.",
  "tightened it so it's post-ready.",
  "made the edit and kept it close to your voice. take a look.",
  "made the edit and kept the hook sharper. take a look.",
  "made the edit and tightened it to fit. take a look.",
  "kept it natural and close to your voice. take a look.",
  "leaned into a sharper hook for growth. take a look.",
  "updated it and kept your voice intact. does this feel closer to how you'd post it?",
  "made that edit in your tone. want another pass or is this good?",
  "reworked it in your voice. does this version land better?",
  "updated it with a sharper hook. want it punchier or does this hit?",
  "tightened the framing for reach. do you want another tweak?",
  "reworked the opening to hit faster. should i refine it more?",
  "trimmed it down and kept the point tight. want me to tighten it one more step?",
  "shortened it and cleaned the flow. does this feel post-ready?",
  "made the edit. does this version work better for you?",
  "updated it based on your note. want any tweaks before posting?",
  "ran with your angle and kept it in your voice. want to tweak anything?",
  "drafted this to sound like you. does it feel right, or should i adjust it?",
  "put together a version that stays natural to your tone. want any edits?",
  "ran with a stronger hook for reach. do you want a softer or punchier version?",
  "drafted it with a growth-first opening. should i tune the tone?",
  "leaned into a sharper framing. want me to push it further or keep it balanced?",
  "kept it tight and post-ready. want to trim it even more?",
  "tightened it up so it reads fast. does this feel good to post?",
  "ran with that idea and drafted this. want any tweaks before you post?",
  "put together the draft from that angle. does this feel right?",
  "drafted it as-is. want to adjust tone, hook, or length?",
  "drafted a version for you. what do you want to tweak?",
  "here's one take. should we tune tone, hook, or length?",
  "put together a draft you can use. does this feel on-brand for you?",
]);

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

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function buildDefaultDraftHandoffReply(seed: string): string {
  const options = [
    "drafted a version for you. what do you want to tweak?",
    "ran with that angle and drafted this. want any tweaks before you post?",
    "here's one take. should we tune tone, hook, or length?",
  ];
  return options[deterministicIndex(seed, options.length)];
}

function looksLikeDraftHandoff(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();

  if (DRAFT_HANDOFF_REPLIES.has(normalized)) {
    return true;
  }

  const followUpCues = [
    "tweak",
    "tone",
    "hook",
    "post-ready",
    "post ready",
    "before you post",
    "does this feel",
    "should i",
    "want any",
    "want to",
    "another pass",
  ];
  const draftingActionCues = [
    "drafted",
    "put together",
    "ran with",
    "updated it",
    "made the edit",
    "reworked",
    "tightened",
    "shortened",
  ];
  const hasFollowUpCue = followUpCues.some((cue) => normalized.includes(cue));
  const hasDraftingAction = draftingActionCues.some((cue) => normalized.includes(cue));
  const isQuestion = normalized.includes("?");

  return hasFollowUpCue && hasDraftingAction && isQuestion && normalized.length <= 180;
}

export function normalizeDraftPayload(args: {
  reply: string;
  draft: string | null;
  drafts: string[];
  outputShape: string;
}): {
  reply: string;
  draft: string | null;
  drafts: string[];
} {
  let reply = args.reply;
  let draft = args.draft;
  let drafts = args.drafts;

  if (!draft && drafts.length > 0) {
    draft = drafts[0] || null;
  }

  if (args.outputShape === "short_form_post" || args.outputShape === "long_form_post") {
    const trimmedReply = reply.trim();
    const replyLooksLikeDraft =
      trimmedReply.length > 40 && !looksLikeDraftHandoff(trimmedReply);

    if (!draft && replyLooksLikeDraft) {
      draft = trimmedReply;
      drafts = [trimmedReply];
      reply = buildDefaultDraftHandoffReply(trimmedReply);
    } else if (draft) {
      drafts = drafts.length > 0 ? drafts : [draft];

      if (!trimmedReply || trimmedReply === draft || replyLooksLikeDraft) {
        reply = buildDefaultDraftHandoffReply(draft || trimmedReply || "draft");
      }
    }
  }

  return { reply, draft, drafts };
}

function buildRevisionChainId(seed?: string): string {
  const normalizedSeed = typeof seed === "string" ? seed.trim() : "";
  if (normalizedSeed) {
    return `revision-chain-${normalizedSeed}`;
  }

  return `revision-chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseSelectedDraftContext(value: unknown): SelectedDraftContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const messageId = typeof candidate.messageId === "string" ? candidate.messageId.trim() : "";
  const versionId = typeof candidate.versionId === "string" ? candidate.versionId.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";

  if (!messageId || !versionId || !content) {
    return null;
  }

  const source = (() => {
    switch (candidate.source) {
      case "assistant_generated":
      case "assistant_revision":
      case "manual_save":
        return candidate.source;
      default:
        return undefined;
    }
  })();
  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt.trim()
      ? candidate.createdAt.trim()
      : undefined;
  const maxCharacterLimit =
    typeof candidate.maxCharacterLimit === "number" && candidate.maxCharacterLimit > 0
      ? candidate.maxCharacterLimit
      : undefined;
  const revisionChainId =
    typeof candidate.revisionChainId === "string" && candidate.revisionChainId.trim()
      ? candidate.revisionChainId.trim()
      : undefined;

  return {
    messageId,
    versionId,
    content,
    ...(source ? { source } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(maxCharacterLimit ? { maxCharacterLimit } : {}),
    ...(revisionChainId ? { revisionChainId } : {}),
  };
}

export function resolveDraftArtifactKind(
  outputShape: string,
): DraftArtifactDetails["kind"] | null {
  switch (outputShape) {
    case "short_form_post":
    case "long_form_post":
    case "thread_seed":
    case "reply_candidate":
    case "quote_candidate":
      return outputShape;
    default:
      return null;
  }
}

export function buildInitialDraftVersionPayload(args: {
  draft: string | null;
  outputShape: string;
  supportAsset: string | null;
  selectedDraftContext: SelectedDraftContext | null;
}): {
  draftArtifacts: DraftArtifactDetails[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  previousVersionSnapshot?: PreviousVersionSnapshot | null;
  revisionChainId?: string;
} {
  if (!args.draft) {
    return {
      draftArtifacts: [],
    };
  }

  const artifactKind = resolveDraftArtifactKind(args.outputShape);
  if (!artifactKind) {
    return {
      draftArtifacts: [],
    };
  }

  const createdAt = new Date().toISOString();
  const versionId = `version-${Date.now()}`;
  const revisionChainId =
    args.selectedDraftContext?.revisionChainId ||
    buildRevisionChainId(args.selectedDraftContext?.messageId);
  const primaryArtifact = buildDraftArtifact({
    id: `${artifactKind}-1`,
    title: buildDraftArtifactTitle(artifactKind, 0),
    kind: artifactKind,
    content: args.draft,
    supportAsset: args.supportAsset,
  });
  const maxCharacterLimit =
    args.selectedDraftContext?.maxCharacterLimit ?? primaryArtifact.maxCharacterLimit;
  const adjustedPrimaryArtifact =
    maxCharacterLimit === primaryArtifact.maxCharacterLimit
      ? primaryArtifact
      : {
          ...primaryArtifact,
          maxCharacterLimit,
          isWithinXLimit: primaryArtifact.weightedCharacterCount <= maxCharacterLimit,
        };

  const draftVersion: DraftVersionEntry = {
    id: versionId,
    content: args.draft,
    source: args.selectedDraftContext ? "assistant_revision" : "assistant_generated",
    createdAt,
    basedOnVersionId: args.selectedDraftContext?.versionId ?? null,
    weightedCharacterCount:
      adjustedPrimaryArtifact.weightedCharacterCount ?? computeXWeightedCharacterCount(args.draft),
    maxCharacterLimit,
    supportAsset: args.supportAsset,
  };

  const previousVersionSnapshot = args.selectedDraftContext
    ? {
        messageId: args.selectedDraftContext.messageId,
        versionId: args.selectedDraftContext.versionId,
        content: args.selectedDraftContext.content,
        source: args.selectedDraftContext.source ?? "assistant_generated",
        createdAt: args.selectedDraftContext.createdAt ?? createdAt,
        ...(args.selectedDraftContext.maxCharacterLimit
          ? { maxCharacterLimit: args.selectedDraftContext.maxCharacterLimit }
          : {}),
        ...(args.selectedDraftContext.revisionChainId
          ? { revisionChainId: args.selectedDraftContext.revisionChainId }
          : {}),
      }
    : undefined;

  return {
    draftArtifacts: [adjustedPrimaryArtifact],
    draftVersions: [draftVersion],
    activeDraftVersionId: versionId,
    revisionChainId,
    ...(previousVersionSnapshot ? { previousVersionSnapshot } : {}),
  };
}

export function resolveEffectiveExplicitIntent(args: {
  intent: string;
  selectedDraftContext: SelectedDraftContext | null;
}):
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit"
  | "answer_question"
  | null {
  return [
    "coach",
    "ideate",
    "plan",
    "planner_feedback",
    "draft",
    "review",
    "edit",
    "answer_question",
  ].includes(args.intent)
    ? (args.intent as
        | "coach"
        | "ideate"
        | "plan"
        | "planner_feedback"
        | "draft"
        | "review"
        | "edit"
        | "answer_question")
    : args.selectedDraftContext
      ? "edit"
      : null;
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
  const session = await getServerSession(authOptions);
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
  const activeHandle = storedThread?.xHandle || session.user.activeXHandle || null;
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
    const normalizedDraftPayload = normalizeDraftPayload({
      reply: result.response,
      draft: resultData?.draft as string || null,
      drafts: resultData?.draft
        ? [resultData.draft as string]
        : [],
      outputShape: result.outputShape,
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
    const activeModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const mappedData = {
      reply: normalizedDraftPayload.reply,
      angles: resultData?.angles as unknown[] || [],
      quickReplies: resultData?.quickReplies || [],
      plan: resultData?.plan || null,
      draft: policyDraft,
      drafts: policyDrafts,
      draftArtifacts: draftVersionPayload.draftArtifacts,
      draftVersions: draftVersionPayload.draftVersions,
      activeDraftVersionId: draftVersionPayload.activeDraftVersionId,
      previousVersionSnapshot: draftVersionPayload.previousVersionSnapshot,
      revisionChainId: draftVersionPayload.revisionChainId,
      supportAsset: resultData?.supportAsset as string || null,
      outputShape: result.outputShape,
      whyThisWorks: [],
      watchOutFor: [],
      debug: {
        formatExemplar: null,
        topicAnchors: [],
        pinnedVoiceReferences: [],
        pinnedEvidenceReferences: [],
        evidencePack: {
          sourcePostIds: [],
          entities: [],
          metrics: [],
          proofPoints: [],
          storyBeats: [],
          constraints: [],
          requiredEvidenceCount: 0,
        },
        formatBlueprint: "",
        formatSkeleton: "",
        outputShapeRationale: "",
        draftDiagnostics: [],
      },
      source: "deterministic",
      model: activeModel,
      mode: "full_generation",
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
