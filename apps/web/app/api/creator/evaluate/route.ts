import { NextResponse } from "next/server";

import { evaluateCreatorProfile } from "@/lib/onboarding/analysis/evaluation";
import {
  readOnboardingRunById,
  readRecentOnboardingRuns,
} from "@/lib/onboarding/store";

interface CreatorEvaluationRequest {
  runId?: unknown;
  recent?: unknown;
}

function toRecentLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

export async function POST(request: Request) {
  let body: CreatorEvaluationRequest;

  try {
    body = (await request.json()) as CreatorEvaluationRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "body",
            message: "Request body must be valid JSON.",
          },
        ],
      },
      { status: 400 },
    );
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const recent = toRecentLimit(body.recent);

  if (runId) {
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
        data: evaluateCreatorProfile({
          runId,
          onboarding: storedRun.result,
        }),
      },
      { status: 200 },
    );
  }

  if (recent > 0) {
    const storedRuns = await readRecentOnboardingRuns(recent);
    return NextResponse.json(
      {
        ok: true,
        data: storedRuns.map((storedRun) =>
          evaluateCreatorProfile({
            runId: storedRun.runId,
            onboarding: storedRun.result,
          }),
        ),
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      errors: [
        {
          field: "runId",
          message: "Provide runId or recent in the request body.",
        },
      ],
    },
    { status: 400 },
  );
}
