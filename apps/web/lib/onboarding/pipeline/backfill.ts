import { randomUUID } from "crypto";

import type { OnboardingInput, OnboardingResult } from "../contracts/types";
import { generateStyleProfile } from "../../agent-v2/core/styleProfile";
import {
  claimNextOnboardingBackfillJob,
  enqueueOnboardingBackfillJob,
  heartbeatOnboardingBackfillJob,
  markOnboardingBackfillJobCompleted,
  markOnboardingBackfillJobFailed,
  type StoredOnboardingBackfillJob,
} from "../store/backfillJobStore";
import { bootstrapScrapeCaptureWithOptions } from "../sources/scrapeBootstrap";
import { buildRefreshOnboardingInput } from "./refreshInput";
import {
  persistOnboardingRun,
  readOnboardingRunById,
  syncOnboardingPostsToDb,
} from "../store/onboardingRunStore";
import { runOnboarding } from "./service";

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

function getBackfillTargetPostCount(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_TARGET);
  if (!Number.isFinite(raw)) {
    return 80;
  }

  return Math.max(40, Math.min(120, Math.floor(raw)));
}

function getBackfillTimeoutMs(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_TIMEOUT_MS);
  if (!Number.isFinite(raw)) {
    return 25_000;
  }

  return Math.max(4_000, Math.min(45_000, Math.floor(raw)));
}

export async function maybeEnqueueOnboardingBackfillJob(params: {
  runId: string;
  input: OnboardingInput;
  result: OnboardingResult;
}): Promise<{ queued: boolean; jobId: string | null; deduped: boolean }> {
  if (params.result.source !== "scrape") {
    return { queued: false, jobId: null, deduped: false };
  }

  if (!params.result.analysisConfidence.backgroundBackfillRecommended) {
    return { queued: false, jobId: null, deduped: false };
  }

  const queued = await enqueueOnboardingBackfillJob({
    account: params.input.account,
    sourceRunId: params.runId,
    targetPostCount: Math.max(
      params.result.analysisConfidence.targetPostCount,
      getBackfillTargetPostCount(),
    ),
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
  const workerId = `backfill-worker-${randomUUID().slice(0, 8)}`;
  const job = await claimNextOnboardingBackfillJob({ workerId });
  if (!job) {
    return { status: "idle" };
  }

  try {
    const imported = await bootstrapScrapeCaptureWithOptions(job.account, {
      pages: getBackfillPages(),
      count: getBackfillCount(),
      targetOriginalPostCount: Math.max(job.targetPostCount, getBackfillTargetPostCount()),
      maxDurationMs: getBackfillTimeoutMs(),
      userAgent: "onboarding-backfill-worker",
      forceRefresh: true,
      mergeWithExisting: true,
    });
    await heartbeatOnboardingBackfillJob({
      jobId: job.jobId,
      workerId,
    });

    const sourceRun = await readOnboardingRunById(job.sourceRunId);
    if (!sourceRun?.userId) {
      throw new Error(`Backfill source run ${job.sourceRunId} could not be loaded.`);
    }

    const refreshInput = buildRefreshOnboardingInput(
      sourceRun.input,
      job.account,
      "cache_only",
    );
    const refreshedResult = await runOnboarding(refreshInput);
    await persistOnboardingRun({
      input: refreshInput,
      result: refreshedResult,
      userAgent: "onboarding-backfill-worker",
      userId: sourceRun.userId,
    });
    await syncOnboardingPostsToDb(sourceRun.userId, job.account, refreshedResult);
    await generateStyleProfile(sourceRun.userId, job.account, job.targetPostCount, {
      forceRegenerate: true,
    }).catch((error) =>
      console.error("Failed to refresh style profile after onboarding backfill:", error),
    );

    await markOnboardingBackfillJobCompleted({
      jobId: job.jobId,
      captureId: imported.captureId,
      workerId,
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
      workerId,
    });

    return {
      status: "failed",
      job,
      error: message,
    };
  }
}
