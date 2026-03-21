import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { readOnboardingScrapeJobByIdForUser } from "@/lib/onboarding/store/onboardingScrapeJobStore";

interface RouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

function hasExpiredLease(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "Unauthorized." }],
      },
      { status: 401 },
    );
  }

  const { jobId } = await context.params;
  const job = await readOnboardingScrapeJobByIdForUser({
    jobId,
    userId: session.user.id,
  });

  if (!job || job.kind !== "onboarding_run") {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "jobId", message: "Onboarding job not found." }],
      },
      { status: 404 },
    );
  }

  if (job.status === "pending") {
    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        jobId: job.jobId,
        account: job.account,
      },
      { status: 200 },
    );
  }

  if (job.status === "processing") {
    if (hasExpiredLease(job.leaseExpiresAt)) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          jobId: job.jobId,
          account: job.account,
          errors: [
            {
              field: "account",
              message:
                job.lastError ??
                "This onboarding job stopped responding before completion. Please try again.",
            },
          ],
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        status: "running",
        jobId: job.jobId,
        account: job.account,
      },
      { status: 200 },
    );
  }

  if (job.status === "completed") {
    if (!job.resultPayload) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "jobId", message: "Onboarding job completed without a result payload." }],
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ...job.resultPayload,
        status: "completed",
        jobId: job.jobId,
        account: job.account,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      status: "failed",
      jobId: job.jobId,
      account: job.account,
      errors: [
        {
          field: "account",
          message: job.lastError ?? "Onboarding scrape job failed.",
        },
      ],
    },
    { status: 200 },
  );
}
