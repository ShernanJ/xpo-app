import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimOnboardingScrapeJobById: vi.fn(),
  enqueueHistoricalBackfillYearJob: vi.fn(),
  extractSemanticProfileIfNeeded: vi.fn(),
  fetchSearchTimelinePage: vi.fn(),
  getOldestObservedPostYear: vi.fn(),
  importUserTweetsPayload: vi.fn(),
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
  buildCaptureSyncState: vi.fn(() => ({ phase: "archive" })),
  buildSearchTimelineQuery: vi.fn(() => "from:stan until:2026-12-31 since:2026-01-01"),
  fetchSearchTimelinePage: mocks.fetchSearchTimelinePage,
  lockSearchTimelineSession: vi.fn(),
  resolveSearchTimelineMetadata: mocks.resolveSearchTimelineMetadata,
}));

vi.mock("./searchTimelineSyncShared", () => ({
  getOldestObservedPostYear: mocks.getOldestObservedPostYear,
  normalizeBackgroundSyncProgress: mocks.normalizeBackgroundSyncProgress,
  refreshOnboardingRunFromCapture: mocks.refreshOnboardingRunFromCapture,
  shouldTreatEmptyPageAsSoftLimit: mocks.shouldTreatEmptyPageAsSoftLimit,
}));

import { processHistoricalBackfillYearHandler } from "./processHistoricalBackfillYear";

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
  mocks.fetchSearchTimelinePage.mockResolvedValue({
    payload: { page: 1 },
    nextCursor: null,
    originalPostCount: 5,
    quotePostCount: 0,
    totalPostCount: 5,
    rateLimitRemaining: null,
    responseHeaders: {},
    sessionId: null,
  });
  mocks.getOldestObservedPostYear.mockReturnValue(null);
  mocks.importUserTweetsPayload.mockResolvedValue(undefined);
  mocks.markOnboardingScrapeJobCompleted.mockResolvedValue(undefined);
  mocks.normalizeBackgroundSyncProgress.mockReturnValue({
    currentYear: 2006,
    cursor: null,
    previousCursor: null,
    consecutiveEmptyPages: 0,
    yearSeenPostCount: 0,
    exhaustedYears: [],
    oldestObservedPostYear: null,
    routeClass: "heavyweight",
    searchYearFloor: 2006,
    statusesCount: null,
    targetYear: 2006,
    phase: "archive",
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
    jobId: "archive_job_2",
  });
});

describe("processHistoricalBackfillYearHandler", () => {
  test("runs semantic extraction when the archive finishes the final year", async () => {
    const step = createStepTools();

    const result = await processHistoricalBackfillYearHandler({
      event: {
        data: {
          account: "stan",
          jobId: "job_1",
          sourceRunId: "or_1",
          targetYear: 2006,
          userId: "user_1",
        },
      },
      runId: "run_1",
      step,
    } as never);

    expect(result).toMatchObject({
      finalPhase: "complete",
      skipped: false,
      targetYear: 2006,
    });
    expect(mocks.extractSemanticProfileIfNeeded).toHaveBeenCalledWith({
      userId: "user_1",
      xHandle: "stan",
    });
    expect(step.run).toHaveBeenCalledWith("extract-semantic-profile", expect.any(Function));
  });

  test("does not run semantic extraction when another archive year is queued", async () => {
    const step = createStepTools();
    mocks.normalizeBackgroundSyncProgress.mockReturnValue({
      currentYear: 2006,
      cursor: null,
      previousCursor: null,
      consecutiveEmptyPages: 0,
      yearSeenPostCount: 0,
      exhaustedYears: [],
      oldestObservedPostYear: null,
      routeClass: "heavyweight",
      searchYearFloor: 2004,
      statusesCount: null,
      targetYear: 2006,
      phase: "archive",
      nextJobId: null,
    });

    const result = await processHistoricalBackfillYearHandler({
      event: {
        data: {
          account: "stan",
          jobId: "job_1",
          sourceRunId: "or_1",
          targetYear: 2006,
          userId: "user_1",
        },
      },
      runId: "run_1",
      step,
    } as never);

    expect(result).toMatchObject({
      finalPhase: "archive",
      nextJobId: "archive_job_2",
    });
    expect(mocks.extractSemanticProfileIfNeeded).not.toHaveBeenCalled();
  });
});
