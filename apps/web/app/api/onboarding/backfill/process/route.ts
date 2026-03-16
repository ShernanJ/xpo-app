import { NextResponse } from "next/server";

import { processNextOnboardingBackfillJob } from "@/lib/onboarding/pipeline/backfill";
import { requireWorkerAuth } from "@/lib/security/workerAuth";

export async function POST(request: Request) {
  const workerAuthError = requireWorkerAuth(request);
  if (workerAuthError) {
    return workerAuthError;
  }

  const result = await processNextOnboardingBackfillJob();

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { status: 200 },
  );
}
