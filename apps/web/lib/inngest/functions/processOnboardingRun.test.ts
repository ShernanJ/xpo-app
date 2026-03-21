import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrapScrapeCaptureWithOptions: vi.fn(),
  capturePostHogServerEvent: vi.fn(),
  capturePostHogServerException: vi.fn(),
  claimOnboardingScrapeJobById: vi.fn(),
  finalizeOnboardingRunForUser: vi.fn(),
  getConfiguredOnboardingMode: vi.fn(),
  hasXApiSourceCredentials: vi.fn(),
  markOnboardingScrapeJobCompleted: vi.fn(),
  markOnboardingScrapeJobFailed: vi.fn(),
  runOnboarding: vi.fn(),
}));

vi.mock("@/lib/posthog/server", () => ({
  capturePostHogServerEvent: mocks.capturePostHogServerEvent,
  capturePostHogServerException: mocks.capturePostHogServerException,
}));

vi.mock("@/lib/onboarding/pipeline/finalizeRun", () => ({
  finalizeOnboardingRunForUser: mocks.finalizeOnboardingRunForUser,
}));

vi.mock("@/lib/onboarding/pipeline/service", () => ({
  runOnboarding: mocks.runOnboarding,
}));

vi.mock("@/lib/onboarding/sources/scrapeBootstrap", () => ({
  bootstrapScrapeCaptureWithOptions: mocks.bootstrapScrapeCaptureWithOptions,
}));

vi.mock("@/lib/onboarding/sources/resolveOnboardingSource", () => ({
  getConfiguredOnboardingMode: mocks.getConfiguredOnboardingMode,
}));

vi.mock("@/lib/onboarding/sources/xApiSource", () => ({
  hasXApiSourceCredentials: mocks.hasXApiSourceCredentials,
}));

vi.mock("@/lib/onboarding/store/onboardingScrapeJobStore", () => ({
  claimOnboardingScrapeJobById: mocks.claimOnboardingScrapeJobById,
  markOnboardingScrapeJobCompleted: mocks.markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed: mocks.markOnboardingScrapeJobFailed,
}));

import {
  buildQueuedOnboardingRunId,
  processOnboardingRunHandler,
} from "./processOnboardingRun";

function createEventData() {
  return {
    effectiveInput: {
      account: "stan",
      goal: "followers",
      timeBudgetMinutes: 30,
      tone: {
        casing: "lowercase",
        risk: "safe",
      },
    },
    jobId: "job_123",
    userAgent: "vitest",
    userId: "user_1",
  };
}

function createClaimedJob(overrides?: Partial<Record<string, unknown>>) {
  return {
    jobId: "job_123",
    kind: "onboarding_run",
    userId: "user_1",
    account: "stan",
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    status: "processing",
    requestInput: createEventData().effectiveInput,
    attempts: 1,
    lastError: null,
    resultPayload: null,
    completedRunId: null,
    leaseOwner: "run_1",
    leaseExpiresAt: "2026-03-20T00:05:00.000Z",
    heartbeatAt: "2026-03-20T00:00:00.000Z",
    completedAt: null,
    failedAt: null,
    ...overrides,
  };
}

function createOnboardingResult() {
  return {
    source: "scrape",
    warnings: [],
  };
}

function createFinalizedResult() {
  return {
    normalizedHandle: "stan",
    payload: {
      ok: true,
      runId: "or_job_123",
      persistedAt: "2026-03-20T00:00:00.000Z",
      backfill: {
        queued: false,
        jobId: null,
        deduped: false,
      },
      data: createOnboardingResult(),
    },
  };
}

function createStepTools() {
  const cache = new Map<string, unknown>();

  return {
    sendEvent: vi.fn(async (_stepId: string, payload: unknown) => payload),
    run: vi.fn(async (stepId: string, fn: () => unknown) => {
      if (cache.has(stepId)) {
        return cache.get(stepId);
      }

      const result = await fn();
      cache.set(stepId, result);
      return result;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrapScrapeCaptureWithOptions.mockResolvedValue({
    nextCursor: null,
    usedExistingCapture: true,
  });
  mocks.claimOnboardingScrapeJobById.mockResolvedValue(createClaimedJob());
  mocks.runOnboarding.mockResolvedValue(createOnboardingResult());
  mocks.finalizeOnboardingRunForUser.mockResolvedValue(createFinalizedResult());
  mocks.getConfiguredOnboardingMode.mockReturnValue("scrape");
  mocks.hasXApiSourceCredentials.mockReturnValue(false);
  mocks.markOnboardingScrapeJobCompleted.mockResolvedValue(undefined);
  mocks.markOnboardingScrapeJobFailed.mockResolvedValue(undefined);
  mocks.capturePostHogServerEvent.mockResolvedValue(undefined);
  mocks.capturePostHogServerException.mockResolvedValue(undefined);
});

describe("processOnboardingRunHandler", () => {
  test("claims, runs, finalizes, and completes a queued onboarding job", async () => {
    const step = createStepTools();

    const result = await processOnboardingRunHandler({
      attempt: 0,
      event: { data: createEventData() },
      maxAttempts: 3,
      runId: "run_1",
      step,
    } as never);

    expect(result).toEqual({
      jobId: "job_123",
      runId: "or_job_123",
      success: true,
    });
    expect(mocks.claimOnboardingScrapeJobById).toHaveBeenCalledWith({
      jobId: "job_123",
      kind: "onboarding_run",
      workerId: "run_1",
    });
    expect(mocks.runOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrapScrapeCaptureWithOptions).toHaveBeenCalledWith("stan", {
      pages: 2,
      count: 40,
      targetOriginalPostCount: 40,
      userAgent: "onboarding-shallow-sync",
      mergeWithExisting: true,
    });
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenCalledWith({
      input: createEventData().effectiveInput,
      result: createOnboardingResult(),
      runId: buildQueuedOnboardingRunId("job_123"),
      suppressLegacyBackfill: true,
      userAgent: "vitest",
      userId: "user_1",
    });
    expect(mocks.markOnboardingScrapeJobCompleted).toHaveBeenCalledWith({
      jobId: "job_123",
      completedRunId: "or_job_123",
      resultPayload: createFinalizedResult().payload,
      workerId: "run_1",
    });
  });

  test("reuses the memoized onboarding step output when finalize retries", async () => {
    const step = createStepTools();
    mocks.finalizeOnboardingRunForUser
      .mockRejectedValueOnce(new Error("temporary db issue"))
      .mockResolvedValueOnce(createFinalizedResult());

    await expect(
      processOnboardingRunHandler({
        attempt: 0,
        event: { data: createEventData() },
        maxAttempts: 3,
        runId: "run_1",
        step,
      } as never),
    ).rejects.toThrow("temporary db issue");

    await processOnboardingRunHandler({
      attempt: 1,
      event: { data: createEventData() },
      maxAttempts: 3,
      runId: "run_1",
      step,
    } as never);

    expect(mocks.runOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenCalledTimes(2);
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenNthCalledWith(1, {
      input: createEventData().effectiveInput,
      result: createOnboardingResult(),
      runId: "or_job_123",
      suppressLegacyBackfill: true,
      userAgent: "vitest",
      userId: "user_1",
    });
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenNthCalledWith(2, {
      input: createEventData().effectiveInput,
      result: createOnboardingResult(),
      runId: "or_job_123",
      suppressLegacyBackfill: true,
      userAgent: "vitest",
      userId: "user_1",
    });
  });

  test("marks the job failed only on the final retry attempt", async () => {
    const step = createStepTools();
    mocks.runOnboarding.mockRejectedValue(new Error("scrape timed out"));

    await expect(
      processOnboardingRunHandler({
        attempt: 0,
        event: { data: createEventData() },
        maxAttempts: 3,
        runId: "run_1",
        step,
      } as never),
    ).rejects.toThrow("scrape timed out");

    expect(mocks.markOnboardingScrapeJobFailed).not.toHaveBeenCalled();
    expect(mocks.capturePostHogServerException).not.toHaveBeenCalled();

    await expect(
      processOnboardingRunHandler({
        attempt: 2,
        event: { data: createEventData() },
        maxAttempts: 3,
        runId: "run_1",
        step,
      } as never),
    ).rejects.toThrow("scrape timed out");

    expect(mocks.markOnboardingScrapeJobFailed).toHaveBeenCalledWith({
      jobId: "job_123",
      error: "scrape timed out",
      workerId: "run_1",
    });
    expect(mocks.capturePostHogServerException).toHaveBeenCalledTimes(1);
  });

  test("no-ops when the job already completed", async () => {
    const step = createStepTools();
    mocks.claimOnboardingScrapeJobById.mockResolvedValue(
      createClaimedJob({
        completedRunId: "or_job_123",
        leaseOwner: null,
        resultPayload: createFinalizedResult().payload,
        status: "completed",
      }),
    );

    const result = await processOnboardingRunHandler({
      attempt: 0,
      event: { data: createEventData() },
      maxAttempts: 3,
      runId: "run_1",
      step,
    } as never);

    expect(result).toEqual({
      jobId: "job_123",
      runId: "or_job_123",
      skipped: true,
      success: true,
    });
    expect(mocks.runOnboarding).not.toHaveBeenCalled();
    expect(mocks.finalizeOnboardingRunForUser).not.toHaveBeenCalled();
    expect(mocks.markOnboardingScrapeJobCompleted).not.toHaveBeenCalled();
  });

  test("queues deep backfill after a live shallow sync returns a next cursor", async () => {
    const step = createStepTools();
    mocks.bootstrapScrapeCaptureWithOptions.mockResolvedValue({
      nextCursor: "cursor_2",
      usedExistingCapture: false,
    });

    await processOnboardingRunHandler({
      attempt: 0,
      event: { data: createEventData() },
      maxAttempts: 3,
      runId: "run_1",
      step,
    } as never);

    expect(step.sendEvent).toHaveBeenCalledWith("queue-deep-backfill", {
      name: "onboarding/deep.backfill.started",
      data: {
        account: "stan",
        cursor: "cursor_2",
        userId: "user_1",
      },
    });
  });

  test("does not queue deep backfill when shallow sync reuses an existing capture", async () => {
    const step = createStepTools();
    mocks.bootstrapScrapeCaptureWithOptions.mockResolvedValue({
      nextCursor: null,
      usedExistingCapture: true,
    });

    await processOnboardingRunHandler({
      attempt: 0,
      event: { data: createEventData() },
      maxAttempts: 3,
      runId: "run_1",
      step,
    } as never);

    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  test("continues to onboarding when shallow prep fails in auto mode with x api fallback", async () => {
    const step = createStepTools();
    mocks.getConfiguredOnboardingMode.mockReturnValue("auto");
    mocks.hasXApiSourceCredentials.mockReturnValue(true);
    mocks.bootstrapScrapeCaptureWithOptions.mockRejectedValue(new Error("proxy timeout"));

    await expect(
      processOnboardingRunHandler({
        attempt: 0,
        event: { data: createEventData() },
        maxAttempts: 3,
        runId: "run_1",
        step,
      } as never),
    ).resolves.toMatchObject({
      success: true,
    });

    expect(mocks.runOnboarding).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});
