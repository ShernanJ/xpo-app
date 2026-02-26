import { NextResponse } from "next/server";

import { buildPerformanceModel } from "@/lib/onboarding/performanceModel";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface PerformanceModelRequest {
  runId?: unknown;
}

export async function POST(request: Request) {
  let body: PerformanceModelRequest;

  try {
    body = (await request.json()) as PerformanceModelRequest;
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

  const model = buildPerformanceModel({
    sourceRunId: runId,
    onboarding: storedRun.result,
  });

  return NextResponse.json(
    {
      ok: true,
      data: model,
    },
    { status: 200 },
  );
}
