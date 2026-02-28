import { NextResponse } from "next/server";

import {
  readOnboardingBackfillJobSummary,
  readRecentOnboardingBackfillJobs,
} from "@/lib/onboarding/backfillStore";

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  const [summary, jobs] = await Promise.all([
    readOnboardingBackfillJobSummary(),
    readRecentOnboardingBackfillJobs(limit),
  ]);

  return NextResponse.json(
    {
      ok: true,
      limit,
      summary,
      jobs,
    },
    { status: 200 },
  );
}
