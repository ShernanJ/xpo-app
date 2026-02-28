import { NextResponse } from "next/server";

import { processNextOnboardingBackfillJob } from "@/lib/onboarding/backfill";

export async function POST() {
  const result = await processNextOnboardingBackfillJob();

  return NextResponse.json(
    {
      ok: true,
      ...result,
    },
    { status: 200 },
  );
}
