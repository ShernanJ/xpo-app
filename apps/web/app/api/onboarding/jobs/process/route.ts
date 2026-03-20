import { NextResponse } from "next/server";

import { processNextOnboardingScrapeJob } from "@/lib/onboarding/pipeline/scrapeJob";
import { requireWorkerAuth } from "@/lib/security/workerAuth";

export async function POST(request: Request) {
  const workerAuthError = requireWorkerAuth(request);
  if (workerAuthError) {
    return workerAuthError;
  }

  const result = await processNextOnboardingScrapeJob();

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { status: 200 },
  );
}
