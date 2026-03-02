import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";

interface CreatorChatRequest extends Record<string, unknown> {
  runId?: unknown;
  message?: unknown;
  history?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorChatRequest;

  try {
    body = (await request.json()) as CreatorChatRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!runId) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "runId is required." }] },
      { status: 400 },
    );
  }

  if (!message) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "message", message: "message is required." }] },
      { status: 400 },
    );
  }

  const storedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
  if (!storedRun || !storedRun.userId) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "Onboarding run not found or has no user tied to it." }] },
      { status: 404 },
    );
  }

  // Format recent history for V2 Orchestrator
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const recentHistoryStr = rawHistory
    .filter((entry: Record<string, unknown>) => typeof entry?.content === "string")
    .map((entry: Record<string, unknown>) => `${entry.role}: ${entry.content}`)
    .slice(-10) // Keep last 10 turns for context window management
    .join("\\n");

  try {
    const result = await manageConversationTurn({
      userId: storedRun.userId,
      runId: runId,
      userMessage: message,
      recentHistory: recentHistoryStr || "None",
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
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
