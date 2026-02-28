import { NextResponse } from "next/server";

import { generateCreatorChatReply } from "@/lib/onboarding/chatAgent";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface CreatorChatMessageInput {
  role?: unknown;
  content?: unknown;
}

interface CreatorChatRequest {
  runId?: unknown;
  message?: unknown;
  history?: unknown;
  provider?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorChatRequest;

  try {
    body = (await request.json()) as CreatorChatRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const provider =
    body.provider === "openai" || body.provider === "groq"
      ? body.provider
      : "openai";

  if (!runId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "runId is required." }],
      },
      { status: 400 },
    );
  }

  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "message", message: "message is required." }],
      },
      { status: 400 },
    );
  }

  const storedRun = await readOnboardingRunById(runId);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "Onboarding run not found." }],
      },
      { status: 404 },
    );
  }

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .map((entry) => entry as CreatorChatMessageInput)
    .filter(
      (entry) =>
        (entry.role === "assistant" || entry.role === "user") &&
        typeof entry.content === "string",
    )
    .map((entry) => ({
      role: entry.role as "assistant" | "user",
      content: (entry.content as string).trim(),
    }))
    .filter((entry) => entry.content.length > 0);

  try {
    const result = await generateCreatorChatReply({
      runId,
      onboarding: storedRun.result,
      userMessage: message,
      history,
      provider,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "message",
            message:
              error instanceof Error
                ? error.message
                : "Failed to generate a chat reply.",
          },
        ],
      },
      { status: 500 },
    );
  }
}
