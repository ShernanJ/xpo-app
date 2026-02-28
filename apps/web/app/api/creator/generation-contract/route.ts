import { NextResponse } from "next/server";

import { buildCreatorGenerationContract } from "@/lib/onboarding/generationContract";
import {
  applyCreatorStrategyOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategyOverrides";
import { readOnboardingRunById } from "@/lib/onboarding/store";

interface CreatorGenerationContractRequest extends Record<string, unknown> {
  runId?: unknown;
}

export async function POST(request: Request) {
  let body: CreatorGenerationContractRequest;

  try {
    body = (await request.json()) as CreatorGenerationContractRequest;
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

  const onboarding = applyCreatorStrategyOverrides({
    onboarding: storedRun.result,
    overrides: extractCreatorStrategyOverrides(body),
  });

  return NextResponse.json(
    {
      ok: true,
      data: buildCreatorGenerationContract({
        runId,
        onboarding,
      }),
    },
    { status: 200 },
  );
}
