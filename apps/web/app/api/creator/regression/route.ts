import { NextResponse } from "next/server";

import { runCreatorRegressionSuite } from "@/lib/onboarding/regression";
import { readOnboardingRunById } from "@/lib/onboarding/store";
import type { OnboardingResult } from "@/lib/onboarding/types";

interface CreatorRegressionRequestCase {
  runId?: unknown;
  minOverallScore?: unknown;
  allowedModes?: unknown;
}

interface CreatorRegressionRequest {
  cases?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorRegressionRequest;

  try {
    body = (await request.json()) as CreatorRegressionRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "cases", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const cases = Array.isArray(body.cases) ? body.cases : [];
  if (cases.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "cases", message: "At least one regression case is required." }],
      },
      { status: 400 },
    );
  }

  const preparedCases: Array<{
    runId: string;
    onboarding: OnboardingResult;
    minOverallScore?: number;
    allowedModes?: Array<"full_generation" | "conservative_generation" | "analysis_only">;
  }> = [];

  for (const rawCase of cases as CreatorRegressionRequestCase[]) {
    const runId = typeof rawCase.runId === "string" ? rawCase.runId.trim() : "";
    if (!runId) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "runId", message: "Each regression case requires a runId." }],
        },
        { status: 400 },
      );
    }

    const storedRun = await readOnboardingRunById(runId);
    if (!storedRun) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "runId", message: `Onboarding run not found: ${runId}` }],
        },
        { status: 404 },
      );
    }

    const minOverallScore =
      typeof rawCase.minOverallScore === "number" &&
      Number.isFinite(rawCase.minOverallScore)
        ? rawCase.minOverallScore
        : undefined;

    const allowedModes = Array.isArray(rawCase.allowedModes)
      ? rawCase.allowedModes.filter(
          (value): value is "full_generation" | "conservative_generation" | "analysis_only" =>
            value === "full_generation" ||
            value === "conservative_generation" ||
            value === "analysis_only",
        )
      : undefined;

    preparedCases.push({
      runId,
      onboarding: storedRun.result,
      minOverallScore,
      allowedModes: allowedModes && allowedModes.length > 0 ? allowedModes : undefined,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      data: runCreatorRegressionSuite({
        cases: preparedCases,
      }),
    },
    { status: 200 },
  );
}
