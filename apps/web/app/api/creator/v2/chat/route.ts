import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import type { CreatorChatReplyResult } from "@/lib/onboarding/chatAgent";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

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
  const identifier = threadId || runId;

  if (!identifier) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "threadId", message: "threadId is required." }] },
      { status: 400 },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";

  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const selectedAngle = typeof body.selectedAngle === "string" ? body.selectedAngle.trim() : "";
  const contentFocus = typeof body.contentFocus === "string" ? body.contentFocus.trim() : "";

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
  } else if (runId) {
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
    .join("\\n");

  // Extract the most recent draft from history to support stateful editing
  const lastDraftEntry = rawHistory
    .slice()
    .reverse()
    .find((entry: Record<string, unknown>) => typeof entry?.draft === "string" && entry.draft.length > 0);
  const activeDraft = typeof lastDraftEntry?.draft === "string" ? lastDraftEntry.draft : undefined;

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

    const result = await manageConversationTurn({
      userId: effectiveUserId,
      xHandle: storedThread?.xHandle || null, // Pipeline context isolation
      threadId: storedThread?.id,
      runId: storedRun?.id,
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: ["coach", "ideate", "draft", "review", "edit", "answer_question"].includes(intent) ? intent as "coach" | "ideate" | "draft" | "review" | "edit" | "answer_question" : null,
      activeDraft,
    });

    const isCoach = result.mode === "coach";
    const isIdeate = result.mode === "ideate";

    const mappedData: CreatorChatReplyResult = {
      reply: result.response,
      angles: (result.data as Record<string, unknown>)?.angles as string[] || [],
      draft: (result.data as Record<string, unknown>)?.draft as string || null,
      drafts: (result.data as Record<string, unknown>)?.draft
        ? [(result.data as Record<string, unknown>).draft as string]
        : [],
      draftArtifacts: [],
      supportAsset: (result.data as Record<string, unknown>)?.supportAsset as string || null,
      outputShape: isCoach ? "coach_question" : isIdeate ? "ideation_angles" : "short_form_post",
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
      memory: {
        conversationState: isCoach || isIdeate ? "ready_to_ideate" : "editing",
        activeConstraints: [],
        topicSummary: null,
        concreteAnswerCount: 0,
        currentDraftArtifactId: null,
        voiceFidelity: "balanced",
      }
    };

    if (storedThread) {
      await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "assistant",
          content: mappedData.reply,
          data: mappedData as any,
        }
      });

      await prisma.chatThread.update({
        where: { id: storedThread.id },
        data: { updatedAt: new Date() }
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: mappedData,
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
