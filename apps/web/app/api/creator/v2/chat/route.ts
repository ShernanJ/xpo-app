import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { manageConversationTurn } from "@/lib/agent-v2/orchestrator/conversationManager";
import type { CreatorChatReplyResult } from "@/lib/onboarding/chatAgent";

interface CreatorChatRequest extends Record<string, unknown> {
  runId?: unknown;
  message?: unknown;
  history?: unknown;
  intent?: unknown;
  selectedAngle?: unknown;
  contentFocus?: unknown;
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

  const storedRun = await prisma.onboardingRun.findUnique({ where: { id: runId } });
  if (!storedRun) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "runId", message: "Onboarding run not found." }] },
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
      userId: storedRun.userId || "anonymous",
      runId: runId,
      userMessage: effectiveMessage,
      recentHistory: recentHistoryStr || "None",
      explicitIntent: ["coach", "ideate", "draft", "review", "edit", "answer_question"].includes(intent) ? intent as "coach" | "ideate" | "draft" | "review" | "edit" | "answer_question" : null,
    });

    const isCoach = result.mode === "coach";
    const isIdeate = result.mode === "ideate";

    const mappedData: CreatorChatReplyResult = {
      reply: result.response,
      angles: (result.data as Record<string, unknown>)?.angles as string[] || [],
      drafts: (result.data as Record<string, unknown>)?.drafts as string[] || [],
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
