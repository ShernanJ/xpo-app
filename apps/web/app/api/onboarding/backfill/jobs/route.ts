import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  readOnboardingBackfillJobById,
  readOnboardingBackfillJobSummary,
  readRecentOnboardingBackfillJobs,
} from "@/lib/onboarding/store/backfillJobStore";
import { readOnboardingScrapeJobById } from "@/lib/onboarding/store/onboardingScrapeJobStore";
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
    const scrapeJob = await readOnboardingScrapeJobById(jobId);
    if (
      scrapeJob &&
      (scrapeJob.kind === "context_primer" ||
        scrapeJob.kind === "historical_backfill_year")
    ) {
      return NextResponse.json(
        {
          ok: true,
          job: {
            jobId: scrapeJob.jobId,
            status: scrapeJob.status,
            lastError: scrapeJob.lastError,
            nextJobId:
              typeof scrapeJob.progressPayload?.nextJobId === "string"
                ? scrapeJob.progressPayload.nextJobId
                : null,
            phase:
              scrapeJob.kind === "historical_backfill_year" ? "archive" : "primer",
          },
        },
        { status: 200 },
      );
    }

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
