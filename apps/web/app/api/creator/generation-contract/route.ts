import { NextResponse } from "next/server";

import { buildCreatorGenerationContract } from "@/lib/onboarding/generationContract";
import {
  applyCreatorToneOverrides,
  applyCreatorStrategyOverrides,
  extractCreatorToneOverrides,
  extractCreatorStrategyOverrides,
} from "@/lib/onboarding/strategyOverrides";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store";
import { getServerSession } from "@/lib/auth/serverSession";

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

  const session = await getServerSession();
  if (!session?.user?.id || !session?.user?.activeXHandle) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "Unauthorized or no active handle selected." }],
      },
      { status: 401 },
    );
  }

  const storedRun = await readLatestOnboardingRunByHandle(session.user.id, session.user.activeXHandle);
  if (!storedRun) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_ONBOARDING_RUN",
        errors: [{ field: "auth", message: "No onboarding run found for this handle." }],
      },
      { status: 404 },
    );
  }

  const allowMockFallback =
    process.env.ONBOARDING_ALLOW_MOCK_FALLBACK?.trim() === "1" ||
    process.env.NODE_ENV !== "production";
  if (!allowMockFallback && storedRun.result.source === "mock") {
    return NextResponse.json(
      {
        ok: false,
        code: "ONBOARDING_SOURCE_INVALID",
        errors: [
          {
            field: "auth",
            message:
              "This account was set up with fallback data. Re-run onboarding after configuring scrape credentials.",
          },
        ],
      },
      { status: 409 },
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

  return NextResponse.json(
    {
      ok: true,
      data: buildCreatorGenerationContract({
        runId: storedRun.runId,
        onboarding,
        tonePreference,
      }),
    },
    { status: 200 },
  );
}
