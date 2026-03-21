import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimOnboardingScrapeJobById: vi.fn(),
  enqueueHistoricalBackfillYearJob: vi.fn(),
  extractSemanticProfileIfNeeded: vi.fn(),
  getOldestObservedPostYear: vi.fn(),
  importUserTweetsPayload: vi.fn(),
  lockSearchTimelineSession: vi.fn(),
  markOnboardingScrapeJobCompleted: vi.fn(),
  markOnboardingScrapeJobFailed: vi.fn(),
  normalizeBackgroundSyncProgress: vi.fn(),
  readLatestScrapeCaptureByAccount: vi.fn(),
  refreshOnboardingRunFromCapture: vi.fn(),
  resolveSearchTimelineMetadata: vi.fn(),
  shouldTreatEmptyPageAsSoftLimit: vi.fn(),
  updateOnboardingScrapeJobProgress: vi.fn(),
}));

vi.mock("@/lib/onboarding/analysis/ghostwriterExtractor", () => ({
  extractSemanticProfileIfNeeded: mocks.extractSemanticProfileIfNeeded,
}));

vi.mock("@/lib/onboarding/pipeline/scrapeJob", () => ({
  enqueueHistoricalBackfillYearJob: mocks.enqueueHistoricalBackfillYearJob,
}));

vi.mock("@/lib/onboarding/sources/importScrapePayload", () => ({
  importUserTweetsPayload: mocks.importUserTweetsPayload,
}));

vi.mock("@/lib/onboarding/store/scrapeCaptureStore", () => ({
  readLatestScrapeCaptureByAccount: mocks.readLatestScrapeCaptureByAccount,
}));

vi.mock("@/lib/onboarding/store/onboardingScrapeJobStore", () => ({
  claimOnboardingScrapeJobById: mocks.claimOnboardingScrapeJobById,
  markOnboardingScrapeJobCompleted: mocks.markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed: mocks.markOnboardingScrapeJobFailed,
  updateOnboardingScrapeJobProgress: mocks.updateOnboardingScrapeJobProgress,
}));

vi.mock("@/lib/x-scrape/searchTimelineCapture", () => ({
  buildCaptureSyncState: vi.fn(),
  buildSearchTimelineQuery: vi.fn(),
  fetchSearchTimelinePage: vi.fn(),
  lockSearchTimelineSession: mocks.lockSearchTimelineSession,
  resolveSearchTimelineMetadata: mocks.resolveSearchTimelineMetadata,
}));

vi.mock("./searchTimelineSyncShared", () => ({
  getOldestObservedPostYear: mocks.getOldestObservedPostYear,
  normalizeBackgroundSyncProgress: mocks.normalizeBackgroundSyncProgress,
  refreshOnboardingRunFromCapture: mocks.refreshOnboardingRunFromCapture,
  shouldTreatEmptyPageAsSoftLimit: mocks.shouldTreatEmptyPageAsSoftLimit,
}));

import { processContextPrimerHandler } from "./processContextPrimer";

function createStepTools() {
  const cache = new Map<string, unknown>();

  return {
    run: vi.fn(async (stepId: string, fn: () => unknown) => {
      if (cache.has(stepId)) {
        return cache.get(stepId);
      }

      const result = await fn();
      cache.set(stepId, result);
      return result;
    }),
    sendEvent: vi.fn(async () => undefined),
    sleep: vi.fn(async () => undefined),
  };
}

function processingJob() {
  return {
    jobId: "job_1",
    status: "processing",
    leaseOwner: "run_1",
    progressPayload: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimOnboardingScrapeJobById.mockResolvedValue(processingJob());
  mocks.getOldestObservedPostYear.mockReturnValue(null);
  mocks.markOnboardingScrapeJobCompleted.mockResolvedValue(undefined);
  mocks.normalizeBackgroundSyncProgress.mockReturnValue({
    currentYear: 2005,
    cursor: null,
    previousCursor: null,
    consecutiveEmptyPages: 0,
    yearSeenPostCount: 0,
    exhaustedYears: [],
    oldestObservedPostYear: null,
    routeClass: "heavyweight",
    searchYearFloor: 2006,
    statusesCount: null,
    targetYear: null,
    phase: null,
    nextJobId: null,
  });
  mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
    posts: [],
    quotePosts: [],
  });
  mocks.refreshOnboardingRunFromCapture.mockResolvedValue(undefined);
  mocks.resolveSearchTimelineMetadata.mockResolvedValue({
    profile: {
      username: "stan",
      name: "Stan",
      bio: "",
      followersCount: 0,
      followingCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    routeClass: "heavyweight",
    statusesCount: null,
    createdYear: 2020,
    searchYearFloor: 2006,
  });
  mocks.shouldTreatEmptyPageAsSoftLimit.mockReturnValue(false);
  mocks.updateOnboardingScrapeJobProgress.mockResolvedValue(undefined);
  mocks.enqueueHistoricalBackfillYearJob.mockResolvedValue({
    jobId: "archive_job_1",
  });
});

describe("processContextPrimerHandler", () => {
  test("runs semantic extraction only when the backfill reaches complete", async () => {
    const step = createStepTools();

    const result = await processContextPrimerHandler({
      event: {
        data: {
          account: "stan",
          jobId: "job_1",
          sourceRunId: "or_1",
          userId: "user_1",
        },
      },
      runId: "run_1",
      step,
    } as never);

    expect(result).toMatchObject({
      account: "stan",
      finalPhase: "complete",
      skipped: false,
    });
    expect(mocks.extractSemanticProfileIfNeeded).toHaveBeenCalledWith({
      userId: "user_1",
      xHandle: "stan",
    });
    expect(step.run).toHaveBeenCalledWith("extract-semantic-profile", expect.any(Function));
  });

  test("does not run semantic extraction for archive handoff", async () => {
    const step = createStepTools();
    mocks.normalizeBackgroundSyncProgress.mockReturnValue({
      currentYear: 2026,
      cursor: null,
      previousCursor: null,
      consecutiveEmptyPages: 0,
      yearSeenPostCount: 0,
      exhaustedYears: [],
      oldestObservedPostYear: null,
      routeClass: "heavyweight",
      searchYearFloor: 2006,
      statusesCount: null,
      targetYear: null,
      phase: null,
      nextJobId: null,
    });
    mocks.readLatestScrapeCaptureByAccount.mockResolvedValue({
      posts: Array.from({ length: 250 }, (_, index) => ({ id: `post_${index + 1}` })),
      quotePosts: [],
    });

    const result = await processContextPrimerHandler({
      event: {
        data: {
          account: "stan",
          jobId: "job_1",
          sourceRunId: "or_1",
          userId: "user_1",
        },
      },
      runId: "run_1",
      step,
    } as never);

    expect(result).toMatchObject({
      finalPhase: "archive",
      nextJobId: "archive_job_1",
    });
    expect(mocks.extractSemanticProfileIfNeeded).not.toHaveBeenCalled();
  });
});
