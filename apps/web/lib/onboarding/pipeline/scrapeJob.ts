import { randomUUID } from "crypto";

import type { OnboardingInput } from "@/lib/onboarding/contracts/types";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { bootstrapScrapeCaptureWithOptions } from "@/lib/onboarding/sources/scrapeBootstrap";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import {
  claimNextOnboardingScrapeJob,
  enqueueOnboardingScrapeJob,
  heartbeatOnboardingScrapeJob,
  markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed,
  type OnboardingScrapeJobKind,
} from "@/lib/onboarding/store/onboardingScrapeJobStore";

import { finalizeOnboardingRunForUser } from "./finalizeRun";
import { runOnboarding } from "./service";

function getProfileRefreshPages(): number {
  return 2;
}

function getProfileRefreshCount(): number {
  return 40;
}

export async function enqueueOnboardingRunJob(params: {
  account: string;
  input: OnboardingInput;
  userId: string;
}): Promise<{ jobId: string; account: string; deduped: boolean }> {
  const queued = await enqueueOnboardingScrapeJob({
    kind: "onboarding_run",
    userId: params.userId,
    account: params.account,
    requestInput: params.input as unknown as Record<string, unknown>,
  });

  return {
    jobId: queued.job.jobId,
    account: queued.job.account,
    deduped: queued.deduped,
  };
}

export async function enqueueProfileRefreshJobIfNeeded(params: {
  account: string;
  userId: string;
}): Promise<{ queued: boolean; jobId: string | null; deduped: boolean }> {
  const latestCapture = await readLatestScrapeCaptureByAccount(params.account);
  if (latestCapture?.pinnedPost) {
    return {
      queued: false,
      jobId: null,
      deduped: false,
    };
  }

  const queued = await enqueueOnboardingScrapeJob({
    kind: "profile_refresh",
    userId: params.userId,
    account: params.account,
  });

  return {
    queued: true,
    jobId: queued.job.jobId,
    deduped: queued.deduped,
  };
}

async function processOnboardingRunJob(job: {
  jobId: string;
  account: string;
  requestInput: Record<string, unknown> | null;
  userId: string;
  kind: OnboardingScrapeJobKind;
}, workerId: string) {
  const parsedInput = parseOnboardingInput(job.requestInput);
  if (!parsedInput.ok) {
    throw new Error(parsedInput.errors.map((error) => error.message).join(" "));
  }

  const result = await runOnboarding(parsedInput.data);
  await heartbeatOnboardingScrapeJob({
    jobId: job.jobId,
    workerId,
  });

  const finalized = await finalizeOnboardingRunForUser({
    input: parsedInput.data,
    result,
    userAgent: null,
    userId: job.userId,
  });
  await markOnboardingScrapeJobCompleted({
    jobId: job.jobId,
    resultPayload: finalized.payload,
    completedRunId: finalized.payload.runId,
    workerId,
  });

  return {
    status: "completed" as const,
    jobId: job.jobId,
    kind: job.kind,
  };
}

async function processProfileRefreshJob(job: {
  jobId: string;
  account: string;
  kind: OnboardingScrapeJobKind;
}, workerId: string) {
  const latestCapture = await readLatestScrapeCaptureByAccount(job.account);
  if (!latestCapture?.pinnedPost) {
    await bootstrapScrapeCaptureWithOptions(job.account, {
      pages: getProfileRefreshPages(),
      count: getProfileRefreshCount(),
      userAgent: "profile-analysis",
      forceRefresh: true,
      mergeWithExisting: true,
    });
  }

  await markOnboardingScrapeJobCompleted({
    jobId: job.jobId,
    workerId,
  });

  return {
    status: "completed" as const,
    jobId: job.jobId,
    kind: job.kind,
  };
}

export async function processNextOnboardingScrapeJob(): Promise<
  | { status: "idle" }
  | { status: "completed"; jobId: string; kind: OnboardingScrapeJobKind }
  | { status: "failed"; jobId: string; kind: OnboardingScrapeJobKind; error: string }
> {
  const workerId = `onboarding-scrape-worker-${randomUUID().slice(0, 8)}`;
  const job = await claimNextOnboardingScrapeJob({ workerId });
  if (!job) {
    return { status: "idle" };
  }

  try {
    if (job.kind === "onboarding_run") {
      return await processOnboardingRunJob(job, workerId);
    }

    return await processProfileRefreshJob(job, workerId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown onboarding scrape job failure.";

    await markOnboardingScrapeJobFailed({
      jobId: job.jobId,
      error: message,
      workerId,
    });

    return {
      status: "failed",
      jobId: job.jobId,
      kind: job.kind,
      error: message,
    };
  }
}
