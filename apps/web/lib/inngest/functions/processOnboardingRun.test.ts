import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capturePostHogServerEvent: vi.fn(),
  capturePostHogServerException: vi.fn(),
  claimOnboardingScrapeJobById: vi.fn(),
  finalizeOnboardingRunForUser: vi.fn(),
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
  mocks.claimOnboardingScrapeJobById.mockResolvedValue(createClaimedJob());
  mocks.runOnboarding.mockResolvedValue(createOnboardingResult());
  mocks.finalizeOnboardingRunForUser.mockResolvedValue(createFinalizedResult());
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
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenCalledWith({
      input: createEventData().effectiveInput,
      result: createOnboardingResult(),
      runId: buildQueuedOnboardingRunId("job_123"),
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
      userAgent: "vitest",
      userId: "user_1",
    });
    expect(mocks.finalizeOnboardingRunForUser).toHaveBeenNthCalledWith(2, {
      input: createEventData().effectiveInput,
      result: createOnboardingResult(),
      runId: "or_job_123",
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
});
