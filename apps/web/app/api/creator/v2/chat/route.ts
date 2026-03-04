import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import { generateThreadTitle } from "@/lib/agent-v2/agents/threadTitle";
import { createConversationMemory } from "@/lib/agent-v2/memory/memoryStore";
import {
  buildDraftArtifact,
  buildDraftArtifactTitle,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

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

function looksLikeDraftHandoff(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();

  return [
    "here's the draft. take a look.",
    "here's a draft. take a look.",
    "made the edit. take a look.",
    "made the edit and kept it close to your voice. take a look.",
    "made the edit and kept the hook sharper. take a look.",
    "made the edit and tightened it to fit. take a look.",
    "kept it natural and close to your voice. take a look.",
    "leaned into a sharper hook for growth. take a look.",
    "kept it tight enough to post. take a look.",
  ].includes(normalized);
}

function normalizeDraftPayload(args: {
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
      reply = "here's the draft. take a look.";
    } else if (draft) {
      drafts = drafts.length > 0 ? drafts : [draft];

      if (!trimmedReply || trimmedReply === draft || replyLooksLikeDraft) {
        reply = "here's the draft. take a look.";
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

function parseSelectedDraftContext(value: unknown): SelectedDraftContext | null {
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

function resolveDraftArtifactKind(
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

function buildInitialDraftVersionPayload(args: {
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

  // Format recent history for V2 Orchestrator
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const recentHistoryStr = rawHistory
    .filter((entry: Record<string, unknown>) => typeof entry?.content === "string")
    .map((entry: Record<string, unknown>) => `${entry.role}: ${entry.content}`)
    .slice(-10) // Keep last 10 turns for context window management
    .join("\n");

  // Extract the most recent draft from history to support stateful editing
  const lastDraftEntry = rawHistory
    .slice()
    .reverse()
    .find((entry: Record<string, unknown>) => typeof entry?.draft === "string" && entry.draft.length > 0);
  const activeDraft =
    selectedDraftContext?.content ||
    (typeof lastDraftEntry?.draft === "string" ? lastDraftEntry.draft : undefined);
  const effectiveExplicitIntent =
    ["coach", "ideate", "plan", "planner_feedback", "draft", "review", "edit", "answer_question"].includes(intent)
      ? (intent as "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit" | "answer_question")
      : selectedDraftContext
        ? "edit"
        : null;

  try {
    const effectiveUserId = session.user.id;

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
    const draftVersionPayload = buildInitialDraftVersionPayload({
      draft: normalizedDraftPayload.draft,
      outputShape: result.outputShape,
      supportAsset: (resultData?.supportAsset as string) || null,
      selectedDraftContext,
    });
    const mappedData = {
      reply: normalizedDraftPayload.reply,
      angles: resultData?.angles as unknown[] || [],
      quickReplies: resultData?.quickReplies || [],
      plan: resultData?.plan || null,
      draft: normalizedDraftPayload.draft,
      drafts: normalizedDraftPayload.drafts,
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
      model: "v2-orchestrator",
      mode: "full_generation",
      memory: result.memory,
      threadTitle: storedThread?.title || DEFAULT_THREAD_TITLE,
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
    console.error("V2 Orchestrator Error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to process turn." }] },
      { status: 500 },
    );
  }
}
