import { NextResponse } from "next/server";

import { buildCreatorProfile } from "@/lib/onboarding/profile/creatorProfile";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface CreatorProfileRequest {
  runId?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorProfileRequest;

  try {
    body = (await request.json()) as CreatorProfileRequest;
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

  const profile = buildCreatorProfile({
    sourceRunId: runId,
    onboarding: storedRun.result,
  });

  return NextResponse.json(
    {
      ok: true,
      data: profile,
    },
    { status: 200 },
  );
}
