import type { OnboardingInput, OnboardingResult } from "../contracts/types";
import {
  claimNextOnboardingBackfillJob,
  enqueueOnboardingBackfillJob,
  markOnboardingBackfillJobCompleted,
  markOnboardingBackfillJobFailed,
  type StoredOnboardingBackfillJob,
} from "../store/backfillJobStore";
import { bootstrapScrapeCaptureWithOptions } from "../sources/scrapeBootstrap";

function getBackfillPages(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_PAGES);
  if (!Number.isFinite(raw)) {
    return 10;
  }

  return Math.max(1, Math.min(12, Math.floor(raw)));
}

function getBackfillCount(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_COUNT);
  if (!Number.isFinite(raw)) {
    return 40;
  }

  return Math.max(20, Math.min(100, Math.floor(raw)));
}

export async function maybeEnqueueOnboardingBackfillJob(params: {
  runId: string;
  input: OnboardingInput;
  result: OnboardingResult;
}): Promise<{ queued: boolean; jobId: string | null; deduped: boolean }> {
  if (params.input.scrapeFreshness === "cache_only") {
    return { queued: false, jobId: null, deduped: false };
  }

  if (params.result.source !== "scrape") {
    return { queued: false, jobId: null, deduped: false };
  }

  if (!params.result.analysisConfidence.backgroundBackfillRecommended) {
    return { queued: false, jobId: null, deduped: false };
  }

  const queued = await enqueueOnboardingBackfillJob({
    account: params.input.account,
    sourceRunId: params.runId,
    targetPostCount: params.result.analysisConfidence.targetPostCount,
  });

  return {
    queued: true,
    jobId: queued.job.jobId,
    deduped: queued.deduped,
  };
}

export async function processNextOnboardingBackfillJob(): Promise<
  | { status: "idle" }
  | {
      status: "completed";
      job: StoredOnboardingBackfillJob;
      captureId: string | null;
      postsImported: number;
      replyPostsImported: number;
      quotePostsImported: number;
    }
  | {
      status: "failed";
      job: StoredOnboardingBackfillJob;
      error: string;
    }
> {
  const job = await claimNextOnboardingBackfillJob();
  if (!job) {
    return { status: "idle" };
  }

  try {
    const imported = await bootstrapScrapeCaptureWithOptions(job.account, {
      pages: getBackfillPages(),
      count: getBackfillCount(),
      userAgent: "onboarding-backfill-worker",
    });

    await markOnboardingBackfillJobCompleted({
      jobId: job.jobId,
      captureId: imported.captureId,
    });

    return {
      status: "completed",
      job,
      captureId: imported.captureId,
      postsImported: imported.postsImported,
      replyPostsImported: imported.replyPostsImported,
      quotePostsImported: imported.quotePostsImported,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown onboarding backfill failure.";

    await markOnboardingBackfillJobFailed({
      jobId: job.jobId,
      error: message,
    });

    return {
      status: "failed",
      job,
      error: message,
    };
  }
}
