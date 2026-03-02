import { NextResponse } from "next/server";

import {
  buildDeterministicCreatorChatReply,
  generateCreatorChatReply,
  type ConversationMemory,
  type UiAction,
} from "@/lib/onboarding/chatAgent";
import {
  applyCreatorToneOverrides,
  applyCreatorStrategyOverrides,
  extractCreatorToneOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategyOverrides";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface CreatorChatMessageInput {
  role?: unknown;
  content?: unknown;
}

interface CreatorChatRequest extends Record<string, unknown> {
  runId?: unknown;
  message?: unknown;
  selectedAngle?: unknown;
  pinnedVoicePostIds?: unknown;
  pinnedEvidencePostIds?: unknown;
  history?: unknown;
  provider?: unknown;
  intent?: unknown;
  contentFocus?: unknown;
  stream?: unknown;
  memory?: unknown;
  uiAction?: unknown;
  editTarget?: unknown;
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
  const selectedAngle =
    typeof body.selectedAngle === "string" && body.selectedAngle.trim().length > 0
      ? body.selectedAngle.trim()
      : null;
  const provider =
    body.provider === "openai" || body.provider === "groq"
      ? body.provider
      : "groq";
  const intent =
    body.intent === "coach" ||
      body.intent === "ideate" ||
      body.intent === "draft" ||
      body.intent === "review"
      ? body.intent
      : undefined;
  const contentFocus =
    typeof body.contentFocus === "string" && body.contentFocus.trim().length > 0
      ? body.contentFocus.trim()
      : null;
  const pinnedVoicePostIds = Array.isArray(body.pinnedVoicePostIds)
    ? Array.from(
      new Set(
        body.pinnedVoicePostIds
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          .map((value) => value.trim()),
      ),
    ).slice(0, 2)
    : [];
  const pinnedEvidencePostIds = Array.isArray(body.pinnedEvidencePostIds)
    ? Array.from(
      new Set(
        body.pinnedEvidencePostIds
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          .map((value) => value.trim()),
      ),
    ).slice(0, 2)
    : [];
  const stream = body.stream === true;

  // Parse memory blob (round-tripped from previous response)
  const memory: ConversationMemory | null = (() => {
    if (body.memory && typeof body.memory === "object" && !Array.isArray(body.memory)) {
      const m = body.memory as Record<string, unknown>;
      if (
        typeof m.conversationState === "string" &&
        Array.isArray(m.activeConstraints) &&
        typeof m.concreteAnswerCount === "number"
      ) {
        return m as unknown as ConversationMemory;
      }
    }
    return null;
  })();

  // Parse UI action
  const validUiActions: UiAction[] = ["select_angle", "edit_draft", "pin_voice", "pin_evidence"];
  const uiAction: UiAction | null =
    typeof body.uiAction === "string" && validUiActions.includes(body.uiAction as UiAction)
      ? (body.uiAction as UiAction)
      : null;

  // Parse edit target
  const editTarget = (() => {
    if (body.editTarget && typeof body.editTarget === "object" && !Array.isArray(body.editTarget)) {
      const et = body.editTarget as Record<string, unknown>;
      return {
        artifactId: typeof et.artifactId === "string" ? et.artifactId : undefined,
        artifactText: typeof et.artifactText === "string" ? et.artifactText : undefined,
      };
    }
    return null;
  })();
  const effectiveMessage = (() => {
    if (message) {
      return message;
    }

    if (intent === "draft" && selectedAngle) {
      return "Turn the selected angle into X draft(s) following the render contract.";
    }

    if (intent === "coach" || intent === "ideate") {
      if (contentFocus) {
        return `I want to focus on ${contentFocus}. Help me find one concrete moment worth turning into a post.`;
      }

      if (intent === "coach") {
        return "Help me find one concrete moment worth turning into a post.";
      }

      return "";
    }

    if (selectedAngle) {
      return "Use the selected angle as the primary direction and keep the output aligned to it.";
    }

    return "";
  })();

  if (!runId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "runId is required." }],
      },
      { status: 400 },
    );
  }

  if (!effectiveMessage) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "message",
            message:
              "A message, selectedAngle, or content focus is required.",
          },
        ],
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

  const onboarding = applyCreatorStrategyOverrides({
    onboarding: storedRun.result,
    overrides: extractCreatorStrategyOverrides(body),
  });
  const tonePreference = applyCreatorToneOverrides({
    baseTone: storedRun.input.tone,
    overrides: extractCreatorToneOverrides(body),
  });

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
              onboarding,
              tonePreference,
              userMessage: effectiveMessage,
              history,
              provider,
              intent,
              contentFocus,
              selectedAngle,
              pinnedVoicePostIds,
              pinnedEvidencePostIds,
              memory,
              uiAction,
              editTarget,
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
          } catch {
            const fallback = buildDeterministicCreatorChatReply({
              runId,
              onboarding,
              tonePreference,
              userMessage: effectiveMessage,
              intent,
              contentFocus,
              selectedAngle,
              pinnedVoicePostIds,
              pinnedEvidencePostIds,
              memory,
            });
            push({
              type: "status",
              phase: "finalizing",
              message: formatProgressMessage("finalizing"),
            });
            push({
              type: "result",
              data: fallback,
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
      onboarding,
      tonePreference,
      userMessage: effectiveMessage,
      history,
      provider,
      intent,
      contentFocus,
      selectedAngle,
      pinnedVoicePostIds,
      pinnedEvidencePostIds,
      memory,
      uiAction,
      editTarget,
    });

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      { status: 200 },
    );
  } catch {
    const fallback = buildDeterministicCreatorChatReply({
      runId,
      onboarding,
      tonePreference,
      userMessage: effectiveMessage,
      intent,
      contentFocus,
      selectedAngle,
      pinnedVoicePostIds,
      pinnedEvidencePostIds,
      memory,
    });

    return NextResponse.json(
      {
        ok: true,
        data: fallback,
      },
      { status: 200 },
    );
  }
}
