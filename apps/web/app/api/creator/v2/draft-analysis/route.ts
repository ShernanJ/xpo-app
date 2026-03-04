import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { inspectDraft, type DraftInspectorMode } from "@/lib/agent-v2/agents/draftInspector";

interface DraftAnalysisRequest extends Record<string, unknown> {
  mode?: unknown;
  draft?: unknown;
  currentDraft?: unknown;
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

  if (!mode || !draft) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "A valid mode and draft are required." }],
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
    const summary = await inspectDraft({
      mode,
      draft,
      currentDraft: currentDraft || null,
    });

    return NextResponse.json({
      ok: true,
      data: {
        summary,
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
