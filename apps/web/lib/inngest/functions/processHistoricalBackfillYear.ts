import { RetryAfterError, type GetFunctionInput, type GetStepTools } from "inngest";

import { extractSemanticProfileIfNeeded } from "@/lib/onboarding/analysis/ghostwriterExtractor";
import { enqueueHistoricalBackfillYearJob } from "@/lib/onboarding/pipeline/scrapeJob";
import { importUserTweetsPayload } from "@/lib/onboarding/sources/importScrapePayload";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import {
  claimOnboardingScrapeJobById,
  markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed,
  updateOnboardingScrapeJobProgress,
} from "@/lib/onboarding/store/onboardingScrapeJobStore";
import {
  buildCaptureSyncState,
  buildSearchTimelineQuery,
  fetchSearchTimelinePage,
  lockSearchTimelineSession,
  resolveSearchTimelineMetadata,
} from "@/lib/x-scrape/searchTimelineCapture";

import { inngest, type OnboardingHistoricalBackfillYearRequestedEventData } from "../client";
import {
  getOldestObservedPostYear,
  normalizeBackgroundSyncProgress,
  refreshOnboardingRunFromCapture,
  shouldTreatEmptyPageAsSoftLimit,
} from "./searchTimelineSyncShared";

const PROXY_LOCK_MS = 6 * 60 * 60 * 1000;

type ProcessHistoricalBackfillYearContext = Omit<GetFunctionInput<typeof inngest>, "event"> & {
  event: {
    data: OnboardingHistoricalBackfillYearRequestedEventData;
  };
  step: GetStepTools<typeof inngest>;
};

function isSearchRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/.test(message) || /rate limit/i.test(message);
}

function isInternalScraperBudgetExceededError(error: unknown) {
  return error instanceof Error && error.message.includes("Scrape hourly budget exceeded");
}

export async function processHistoricalBackfillYearHandler({
  event,
  runId,
  step,
}: ProcessHistoricalBackfillYearContext) {
  const claimedJob = await step.run("claim-job", async () =>
    claimOnboardingScrapeJobById({
      jobId: event.data.jobId,
      kind: "historical_backfill_year",
      workerId: runId,
    }),
  );
  if (!claimedJob) {
    return {
      account: event.data.account,
      skipped: true,
    };
  }

  if (claimedJob.status === "completed" || claimedJob.status === "failed") {
    return {
      account: event.data.account,
      skipped: true,
    };
  }

  if (claimedJob.status !== "processing" || claimedJob.leaseOwner !== runId) {
    return {
      account: event.data.account,
      skipped: true,
    };
  }

  try {
    const latestCapture = await step.run("read-latest-capture", async () =>
      readLatestScrapeCaptureByAccount(event.data.account),
    );
    const metadata = await step.run("resolve-metadata", async () =>
      resolveSearchTimelineMetadata({
        account: event.data.account,
        oldestObservedPostYear: getOldestObservedPostYear([
          ...(latestCapture?.posts ?? []),
          ...(latestCapture?.quotePosts ?? []),
        ]),
      }),
    );
    let progress = normalizeBackgroundSyncProgress({
      progressPayload: claimedJob.progressPayload,
      currentYear: event.data.targetYear,
      metadata,
    });
    const targetYear = progress.targetYear ?? event.data.targetYear;
    progress.currentYear = targetYear;

    while (progress.currentYear === targetYear) {
      const rawQuery = buildSearchTimelineQuery({
        account: event.data.account,
        year: targetYear,
      });
      const pageStepKey = `fetch-archive-${targetYear}-${progress.cursor ?? "start"}`;
      const page = await step.run(pageStepKey, async () => {
        try {
          return await fetchSearchTimelinePage({
            account: event.data.account,
            count: 40,
            cursor: progress.cursor,
            fleet: "archive",
            rawQuery,
            userAgent: "onboarding-archive-backfill",
          });
        } catch (error) {
          if (isSearchRateLimitError(error)) {
            throw new RetryAfterError("SEARCH_TIMELINE_RATE_LIMITED", "6h", {
              cause: error,
            });
          }

          if (isInternalScraperBudgetExceededError(error)) {
            throw new RetryAfterError("INTERNAL_SCRAPER_BUDGET_EXCEEDED", "1h", {
              cause: error,
            });
          }

          throw error;
        }
      });

      if (
        shouldTreatEmptyPageAsSoftLimit({
          originalPostCount: page.originalPostCount,
          nextCursor: page.nextCursor,
          currentCursor: progress.cursor,
          previousCursor: progress.previousCursor,
          yearSeenPostCount: progress.yearSeenPostCount,
        })
      ) {
        await lockSearchTimelineSession(page.sessionId, PROXY_LOCK_MS);
        throw new RetryAfterError("SEARCH_TIMELINE_SOFT_LIMIT", "6h");
      }

      const captureState = buildCaptureSyncState({
        metadata,
        phase: "archive",
        oldestObservedPostYear: progress.oldestObservedPostYear,
      });
      await step.run(`import-archive-${targetYear}-${progress.cursor ?? "start"}`, async () =>
        importUserTweetsPayload({
          account: event.data.account,
          payload: page.payload,
          captureState,
          mergeWithExisting: true,
          profileOverride: metadata.profile,
          source: "agent",
          userAgent: "onboarding-archive-backfill",
        }),
      );

      const latestCaptureAfterPage = await step.run(
        `read-capture-archive-${targetYear}-${progress.cursor ?? "start"}`,
        async () => readLatestScrapeCaptureByAccount(event.data.account),
      );
      progress.oldestObservedPostYear = getOldestObservedPostYear([
        ...(latestCaptureAfterPage?.posts ?? []),
        ...(latestCaptureAfterPage?.quotePosts ?? []),
      ]);

      const nextConsecutiveEmptyPages =
        page.originalPostCount === 0 ? progress.consecutiveEmptyPages + 1 : 0;
      const yearComplete =
        !page.nextCursor ||
        page.nextCursor === progress.cursor ||
        page.nextCursor === progress.previousCursor ||
        nextConsecutiveEmptyPages >= 2;

      if (yearComplete) {
        progress = {
          ...progress,
          currentYear: targetYear - 1,
          cursor: null,
          previousCursor: null,
          consecutiveEmptyPages: 0,
          yearSeenPostCount: 0,
          exhaustedYears: Array.from(new Set([...progress.exhaustedYears, targetYear])),
        };
      } else {
        progress = {
          ...progress,
          cursor: page.nextCursor,
          previousCursor: progress.cursor,
          consecutiveEmptyPages: nextConsecutiveEmptyPages,
          yearSeenPostCount: progress.yearSeenPostCount + page.originalPostCount,
        };
      }

      await step.run(`save-progress-archive-${targetYear}-${progress.cursor ?? "end"}`, async () =>
        updateOnboardingScrapeJobProgress({
          jobId: claimedJob.jobId,
          progressPayload: progress,
          workerId: runId,
        }),
      );

      if (progress.currentYear === targetYear) {
        await step.sleep(`pace-archive-${targetYear}-${progress.cursor ?? "start"}`, "15s");
      }
    }

    const nextYear = targetYear - 1;
    const finalPhase = nextYear < progress.searchYearFloor ? "complete" : "archive";
    await step.run("refresh-run-archive", async () =>
      refreshOnboardingRunFromCapture({
        account: event.data.account,
        phase: finalPhase,
        sourceRunId: event.data.sourceRunId,
        userAgent: "onboarding-archive-backfill",
      }),
    );

    if (finalPhase === "complete") {
      await step.run("extract-semantic-profile", async () =>
        extractSemanticProfileIfNeeded({
          userId: event.data.userId,
          xHandle: event.data.account,
        }),
      );
    }

    let nextJobId: string | null = null;
    if (finalPhase === "archive") {
      const nextJob = await step.run(`queue-next-archive-${nextYear}`, async () =>
        enqueueHistoricalBackfillYearJob({
          account: event.data.account,
          userId: event.data.userId,
          sourceRunId: event.data.sourceRunId,
          targetYear: nextYear,
          progressPayload: {
            ...progress,
            currentYear: nextYear,
            targetYear: nextYear,
            phase: "archive",
          },
        }),
      );
      nextJobId = nextJob.jobId;
      await step.sendEvent(`dispatch-next-archive-${nextYear}`, {
        name: "onboarding/historical.backfill.year.requested",
        data: {
          account: event.data.account,
          jobId: nextJob.jobId,
          sourceRunId: event.data.sourceRunId,
          targetYear: nextYear,
          userId: event.data.userId,
        },
      });
    }

    await step.run("complete-archive-job", async () =>
      markOnboardingScrapeJobCompleted({
        jobId: claimedJob.jobId,
        progressPayload: {
          ...progress,
          nextJobId,
          phase: finalPhase,
        },
        workerId: runId,
      }),
    );

    return {
      account: event.data.account,
      finalPhase,
      nextJobId,
      skipped: false,
      targetYear,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown historical backfill failure.";
    await step.run("mark-archive-failed", async () =>
      markOnboardingScrapeJobFailed({
        jobId: event.data.jobId,
        error: message,
        progressPayload: claimedJob.progressPayload,
        workerId: runId,
      }),
    );
    throw error;
  }
}

export const processHistoricalBackfillYear = inngest.createFunction(
  {
    id: "process-historical-backfill-year",
    retries: 5,
    concurrency: [
      {
        limit: 5,
        key: '"historical-backfill-year"',
        scope: "env",
      },
      {
        limit: 1,
        key: "event.data.account",
      },
    ],
    singleton: {
      key: "event.data.jobId",
      mode: "skip",
    },
    triggers: [{ event: "onboarding/historical.backfill.year.requested" }],
    timeouts: {
      finish: "4h",
    },
  },
  processHistoricalBackfillYearHandler,
);
