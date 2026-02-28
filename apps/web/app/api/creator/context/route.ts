import { NextResponse } from "next/server";

import { buildCreatorAgentContext } from "@/lib/onboarding/agentContext";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface CreatorAgentContextRequest {
  runId?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorAgentContextRequest;

  try {
    body = (await request.json()) as CreatorAgentContextRequest;
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
  if (!runId) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "runId", message: "runId is required." }],
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

  return NextResponse.json(
    {
      ok: true,
      data: buildCreatorAgentContext({
        runId,
        onboarding: storedRun.result,
      }),
    },
    { status: 200 },
  );
}
