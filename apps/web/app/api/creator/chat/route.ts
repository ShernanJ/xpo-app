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
  stream?: unknown;
}

type ChatProgressPhase = "planning" | "writing" | "critic" | "finalizing";

function formatProgressMessage(phase: ChatProgressPhase): string {
  switch (phase) {
    case "planning":
      return "Planning the next move.";
    case "writing":
      return "Writing draft options.";
    case "critic":
      return "Tightening the response.";
    case "finalizing":
      return "Finalizing the reply.";
    default:
      return "Working.";
  }
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
  const stream = body.stream === true;

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
    if (stream) {
      const encoder = new TextEncoder();

      const responseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const push = (payload: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };
          let lastPhase: ChatProgressPhase | null = null;

          try {
            push({
              type: "status",
              phase: "planning",
              message: formatProgressMessage("planning"),
            });
            lastPhase = "planning";

            const result = await generateCreatorChatReply({
              runId,
              onboarding: storedRun.result,
              userMessage: message,
              history,
              provider,
              onProgress: (phase) => {
                if (phase === lastPhase) {
                  return;
                }
                lastPhase = phase;
                push({
                  type: "status",
                  phase,
                  message: formatProgressMessage(phase),
                });
              },
            });

            push({
              type: "result",
              data: result,
            });
          } catch (error) {
            push({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to generate a chat reply.",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(responseStream, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

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
