import { RetryAfterError, type GetFunctionInput, type GetStepTools } from "inngest";

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
  type SearchTimelineMetadata,
} from "@/lib/x-scrape/searchTimelineCapture";

import { inngest, type OnboardingContextPrimerRequestedEventData } from "../client";
import {
  getOldestObservedPostYear,
  normalizeBackgroundSyncProgress,
  refreshOnboardingRunFromCapture,
} from "./searchTimelineSyncShared";

const CONTEXT_PRIMER_TARGET_POSTS = 200;
const PROXY_LOCK_MS = 6 * 60 * 60 * 1000;

type ProcessContextPrimerContext = Omit<GetFunctionInput<typeof inngest>, "event"> & {
  event: {
    data: OnboardingContextPrimerRequestedEventData;
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

async function resolveMetadata(account: string) {
  const latestCapture = await readLatestScrapeCaptureByAccount(account);
  const oldestObservedPostYear = getOldestObservedPostYear([
    ...(latestCapture?.posts ?? []),
    ...(latestCapture?.quotePosts ?? []),
  ]);

  return {
    latestCapture,
    metadata: await resolveSearchTimelineMetadata({
      account,
      oldestObservedPostYear,
    }),
  };
}

function resolveFinalPhase(args: {
  currentYear: number;
  metadata: SearchTimelineMetadata;
  searchYearFloor: number;
  currentOriginalCount: number;
}) {
  const searchComplete = args.currentYear < args.searchYearFloor;
  if (searchComplete || args.metadata.routeClass === "lightweight") {
    return "complete" as const;
  }

  if (args.currentOriginalCount >= CONTEXT_PRIMER_TARGET_POSTS) {
    return "archive" as const;
  }

  return "complete" as const;
}

export async function processContextPrimerHandler({
  event,
  runId,
  step,
}: ProcessContextPrimerContext) {
  const claimedJob = await step.run("claim-job", async () =>
    claimOnboardingScrapeJobById({
      jobId: event.data.jobId,
      kind: "context_primer",
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
    const { latestCapture, metadata } = await step.run("resolve-metadata", async () =>
      resolveMetadata(event.data.account),
    );
    let currentOriginalCount = latestCapture?.posts.length ?? 0;
    let progress = normalizeBackgroundSyncProgress({
      progressPayload: claimedJob.progressPayload,
      currentYear: new Date().getUTCFullYear(),
      metadata,
    });

    while (
      (progress.routeClass === "lightweight" || currentOriginalCount < CONTEXT_PRIMER_TARGET_POSTS) &&
      progress.currentYear >= progress.searchYearFloor
    ) {
      const rawQuery = buildSearchTimelineQuery({
        account: event.data.account,
        year: progress.currentYear,
      });
      const pageStepKey = `fetch-primer-${progress.currentYear}-${progress.cursor ?? "start"}`;
      const page = await step.run(pageStepKey, async () => {
        try {
          return await fetchSearchTimelinePage({
            account: event.data.account,
            count: 40,
            cursor: progress.cursor,
            fleet: "onboarding",
            rawQuery,
            userAgent: "onboarding-context-primer",
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

      if (page.originalPostCount === 0 && progress.yearSeenPostCount > 0) {
        await lockSearchTimelineSession(page.sessionId, PROXY_LOCK_MS);
        throw new RetryAfterError("SEARCH_TIMELINE_SOFT_LIMIT", "6h");
      }

      const captureState = buildCaptureSyncState({
        metadata,
        phase: "primer",
        oldestObservedPostYear: progress.oldestObservedPostYear,
      });
      await step.run(`import-primer-${progress.currentYear}-${progress.cursor ?? "start"}`, async () =>
        importUserTweetsPayload({
          account: event.data.account,
          payload: page.payload,
          captureState,
          mergeWithExisting: true,
          profileOverride: metadata.profile,
          source: "agent",
          userAgent: "onboarding-context-primer",
        }),
      );

      const latestCaptureAfterPage = await step.run(
        `read-capture-primer-${progress.currentYear}-${progress.cursor ?? "start"}`,
        async () => readLatestScrapeCaptureByAccount(event.data.account),
      );
      currentOriginalCount = latestCaptureAfterPage?.posts.length ?? currentOriginalCount;
      progress.oldestObservedPostYear = getOldestObservedPostYear([
        ...(latestCaptureAfterPage?.posts ?? []),
        ...(latestCaptureAfterPage?.quotePosts ?? []),
      ]);

      const nextConsecutiveEmptyPages =
        page.originalPostCount === 0 ? progress.consecutiveEmptyPages + 1 : 0;
      const nextYearSeenPostCount = progress.yearSeenPostCount + page.originalPostCount;
      const yearComplete =
        !page.nextCursor ||
        page.nextCursor === progress.cursor ||
        page.nextCursor === progress.previousCursor ||
        nextConsecutiveEmptyPages >= 2;

      if (yearComplete) {
        progress = {
          ...progress,
          currentYear: progress.currentYear - 1,
          cursor: null,
          previousCursor: null,
          consecutiveEmptyPages: 0,
          yearSeenPostCount: 0,
          exhaustedYears: Array.from(new Set([...progress.exhaustedYears, progress.currentYear])),
        };
      } else {
        progress = {
          ...progress,
          cursor: page.nextCursor,
          previousCursor: progress.cursor,
          consecutiveEmptyPages: nextConsecutiveEmptyPages,
          yearSeenPostCount: nextYearSeenPostCount,
        };
      }

      await step.run(`save-progress-primer-${progress.currentYear}`, async () =>
        updateOnboardingScrapeJobProgress({
          jobId: claimedJob.jobId,
          progressPayload: progress,
          workerId: runId,
        }),
      );

      if (
        progress.routeClass === "heavyweight" &&
        currentOriginalCount >= CONTEXT_PRIMER_TARGET_POSTS
      ) {
        break;
      }

      await step.sleep(`pace-primer-${progress.currentYear}-${progress.cursor ?? "start"}`, "6s");
    }

    const finalPhase = resolveFinalPhase({
      currentOriginalCount,
      currentYear: progress.currentYear,
      metadata,
      searchYearFloor: progress.searchYearFloor,
    });

    await step.run("refresh-run-primer", async () =>
      refreshOnboardingRunFromCapture({
        account: event.data.account,
        phase: finalPhase,
        sourceRunId: event.data.sourceRunId,
        userAgent: "onboarding-context-primer",
      }),
    );

    let nextJobId: string | null = null;
    if (finalPhase === "archive" && progress.currentYear >= progress.searchYearFloor) {
      const archiveJob = await step.run("queue-archive-year", async () =>
        enqueueHistoricalBackfillYearJob({
          account: event.data.account,
          userId: event.data.userId,
          sourceRunId: event.data.sourceRunId,
          targetYear: progress.currentYear,
          progressPayload: {
            ...progress,
            targetYear: progress.currentYear,
            phase: "archive",
          },
        }),
      );
      nextJobId = archiveJob.jobId;
      await step.sendEvent("dispatch-archive-year", {
        name: "onboarding/historical.backfill.year.requested",
        data: {
          account: event.data.account,
          jobId: archiveJob.jobId,
          sourceRunId: event.data.sourceRunId,
          targetYear: progress.currentYear,
          userId: event.data.userId,
        },
      });
    }

    await step.run("complete-primer-job", async () =>
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
      currentOriginalCount,
      finalPhase,
      nextJobId,
      skipped: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown context primer failure.";
    await step.run("mark-primer-failed", async () =>
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

export const processContextPrimer = inngest.createFunction(
  {
    id: "process-context-primer",
    retries: 5,
    concurrency: [
      {
        limit: 2,
        key: '"context-primer"',
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
    triggers: [{ event: "onboarding/context.primer.requested" }],
    timeouts: {
      finish: "2h",
    },
  },
  processContextPrimerHandler,
);
