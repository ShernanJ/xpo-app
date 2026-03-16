import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  readOnboardingBackfillJobById,
  readOnboardingBackfillJobSummary,
  readRecentOnboardingBackfillJobs,
} from "@/lib/onboarding/store/backfillJobStore";
import { requireWorkerAuth } from "@/lib/security/workerAuth";

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    const workerAuthError = requireWorkerAuth(request);
    if (workerAuthError) {
      return workerAuthError;
    }
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() ?? "";

  if (jobId) {
    const job = await readOnboardingBackfillJobById(jobId);

    return NextResponse.json(
      {
        ok: true,
        job,
      },
      { status: 200 },
    );
  }

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
