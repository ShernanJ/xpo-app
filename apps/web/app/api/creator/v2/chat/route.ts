import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import { createConversationMemory } from "@/lib/agent-v2/memory/memoryStore";

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
  // If no threadId or runId, we will automatically generate a thread below.

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

    console.log("[V2 Chat Checkpoint] Reached manageConversationTurn with threadId:", storedThread?.id);
    const result = await manageConversationTurn({
      userId: effectiveUserId,
      xHandle: storedThread?.xHandle || null, // Pipeline context isolation
      threadId: storedThread?.id,
      runId: storedRun?.id,
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: ["coach", "ideate", "plan", "planner_feedback", "draft", "review", "edit", "answer_question"].includes(intent)
        ? intent as "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit" | "answer_question"
        : null,
      activeDraft,
    });

    console.log("[V2 Chat Checkpoint] Survived manageConversationTurn. Mode:", result.mode);
    const resultData = result.data as Record<string, unknown> | undefined;
    const mappedData = {
      reply: result.response,
      angles: resultData?.angles as unknown[] || [],
      quickReplies: resultData?.quickReplies || [],
      plan: resultData?.plan || null,
      draft: resultData?.draft as string || null,
      drafts: resultData?.draft
        ? [resultData.draft as string]
        : [],
      draftArtifacts: [],
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
    };

    if (storedThread) {
      await prisma.chatMessage.create({
        data: {
          threadId: storedThread.id,
          role: "assistant",
          content: mappedData.reply,
          data: mappedData as unknown as Prisma.InputJsonValue,
        }
      });

      const updateData: { updatedAt: Date; title?: string } = { updatedAt: new Date() };

      // Auto-generate title from the first user message if the thread is currently unnamed
      if (!storedThread.title && effectiveMessage) {
        const cleanMessage = effectiveMessage.replace(/\n/g, " ").trim();
        updateData.title = cleanMessage.length > 40
          ? cleanMessage.slice(0, 40) + "..."
          : cleanMessage;
      }

      await prisma.chatThread.update({
        where: { id: storedThread.id },
        data: updateData
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...mappedData,
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
