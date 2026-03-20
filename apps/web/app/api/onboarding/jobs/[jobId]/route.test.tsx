import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireAllowedOrigin: vi.fn(),
  readOnboardingScrapeJobByIdForUser: vi.fn(),
}));

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/security/requestValidation", () => ({
  requireAllowedOrigin: mocks.requireAllowedOrigin,
}));

vi.mock("@/lib/onboarding/store/onboardingScrapeJobStore", () => ({
  readOnboardingScrapeJobByIdForUser: mocks.readOnboardingScrapeJobByIdForUser,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAllowedOrigin.mockReturnValue(null);
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: "user_1",
    },
  });
});

describe("GET /api/onboarding/jobs/[jobId]", () => {
  test("returns queued status for a pending onboarding run job", async () => {
    mocks.readOnboardingScrapeJobByIdForUser.mockResolvedValue({
      jobId: "job_123",
      kind: "onboarding_run",
      userId: "user_1",
      account: "stan",
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
      status: "pending",
      requestInput: null,
      attempts: 0,
      lastError: null,
      resultPayload: null,
      completedRunId: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      completedAt: null,
      failedAt: null,
    });

    const response = await GET(
      new Request("http://localhost/api/onboarding/jobs/job_123"),
      {
        params: Promise.resolve({
          jobId: "job_123",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      status: "queued",
      jobId: "job_123",
      account: "stan",
    });
  });

  test("returns the completed onboarding payload when the job finished", async () => {
    mocks.readOnboardingScrapeJobByIdForUser.mockResolvedValue({
      jobId: "job_123",
      kind: "onboarding_run",
      userId: "user_1",
      account: "stan",
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
      status: "completed",
      requestInput: null,
      attempts: 1,
      lastError: null,
      resultPayload: {
        ok: true,
        runId: "or_123",
        persistedAt: "2026-03-19T00:05:00.000Z",
        backfill: {
          queued: false,
          jobId: null,
          deduped: false,
        },
        data: {
          account: "stan",
        },
      },
      completedRunId: "or_123",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      completedAt: "2026-03-19T00:05:00.000Z",
      failedAt: null,
    });

    const response = await GET(
      new Request("http://localhost/api/onboarding/jobs/job_123"),
      {
        params: Promise.resolve({
          jobId: "job_123",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("completed");
    expect(payload.runId).toBe("or_123");
    expect(payload.account).toBe("stan");
  });
});
