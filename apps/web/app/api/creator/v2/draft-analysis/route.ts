import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { inspectDraft, type DraftInspectorMode } from "@/lib/agent-v2/agents/draftInspector";
import { prisma } from "@/lib/db";

interface DraftAnalysisRequest extends Record<string, unknown> {
  mode?: unknown;
  draft?: unknown;
  currentDraft?: unknown;
  threadId?: unknown;
}

function parseMode(value: unknown): DraftInspectorMode | null {
  return value === "analyze" || value === "compare" ? value : null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: DraftAnalysisRequest;

  try {
    body = (await request.json()) as DraftAnalysisRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const mode = parseMode(body.mode);
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  const currentDraft =
    typeof body.currentDraft === "string" ? body.currentDraft.trim() : "";
  const threadId =
    typeof body.threadId === "string" && body.threadId.trim()
      ? body.threadId.trim()
      : "";

  if (!mode || !draft || !threadId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "A valid mode, draft, and thread are required." }],
      },
      { status: 400 },
    );
  }

  if (mode === "compare" && !currentDraft) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "currentDraft", message: "Current draft is required for compare mode." }],
      },
      { status: 400 },
    );
  }

  try {
    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized." }] },
        { status: 404 },
      );
    }

    const summary = await inspectDraft({
      mode,
      draft,
      currentDraft: currentDraft || null,
    });

    const prompt =
      mode === "compare"
        ? "compare this to the current version"
        : "what do you think about this post?";

    const [userMessage, assistantMessage] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "user",
          content: prompt,
        },
      }),
      prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content: summary,
        },
      }),
    ]);

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        summary,
        prompt,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      },
    });
  } catch (error) {
    console.error("POST /api/creator/v2/draft-analysis failed", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to analyze the draft." }] },
      { status: 500 },
    );
  }
}
