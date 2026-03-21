import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  readOnboardingBackfillJobById: vi.fn(),
  readOnboardingBackfillJobSummary: vi.fn(),
  readOnboardingScrapeJobById: vi.fn(),
  readRecentOnboardingBackfillJobs: vi.fn(),
  requireWorkerAuth: vi.fn(),
}));

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/onboarding/store/backfillJobStore", () => ({
  readOnboardingBackfillJobById: mocks.readOnboardingBackfillJobById,
  readOnboardingBackfillJobSummary: mocks.readOnboardingBackfillJobSummary,
  readRecentOnboardingBackfillJobs: mocks.readRecentOnboardingBackfillJobs,
}));

vi.mock("@/lib/onboarding/store/onboardingScrapeJobStore", () => ({
  readOnboardingScrapeJobById: mocks.readOnboardingScrapeJobById,
}));

vi.mock("@/lib/security/workerAuth", () => ({
  requireWorkerAuth: mocks.requireWorkerAuth,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: "user_1",
    },
  });
  mocks.requireWorkerAuth.mockReturnValue(null);
  mocks.readOnboardingBackfillJobById.mockResolvedValue(null);
  mocks.readOnboardingBackfillJobSummary.mockResolvedValue(null);
  mocks.readRecentOnboardingBackfillJobs.mockResolvedValue([]);
  mocks.readOnboardingScrapeJobById.mockResolvedValue(null);
});

describe("GET /api/onboarding/backfill/jobs", () => {
  test("maps SearchTimeline primer jobs onto the legacy polling contract", async () => {
    mocks.readOnboardingScrapeJobById.mockResolvedValue({
      jobId: "job_123",
      kind: "context_primer",
      status: "completed",
      lastError: null,
      progressPayload: {
        nextJobId: "job_456",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/onboarding/backfill/jobs?jobId=job_123"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      job: {
        jobId: "job_123",
        status: "completed",
        lastError: null,
        nextJobId: "job_456",
        phase: "primer",
      },
    });
    expect(mocks.readOnboardingBackfillJobById).not.toHaveBeenCalled();
  });
});
