import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(),
  enforceSessionMutationRateLimit: vi.fn(),
  parseOnboardingInput: vi.fn(),
  validateHandleLimit: vi.fn(),
  getBillingStateForUser: vi.fn(),
  enqueueOnboardingRunJob: vi.fn(),
  inngestSend: vi.fn(),
  markOnboardingScrapeJobFailed: vi.fn(),
  capturePostHogServerEvent: vi.fn(),
  capturePostHogServerException: vi.fn(),
}));

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/security/requestValidation", () => ({
  parseJsonBody: mocks.parseJsonBody,
  requireAllowedOrigin: mocks.requireAllowedOrigin,
  enforceSessionMutationRateLimit: mocks.enforceSessionMutationRateLimit,
}));

vi.mock("@/lib/onboarding/contracts/validation", () => ({
  parseOnboardingInput: mocks.parseOnboardingInput,
}));

vi.mock("@/lib/billing/handleLimits", () => ({
  validateHandleLimit: mocks.validateHandleLimit,
}));

vi.mock("@/lib/billing/entitlements", () => ({
  getBillingStateForUser: mocks.getBillingStateForUser,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/onboarding/pipeline/scrapeJob", () => ({
  enqueueOnboardingRunJob: mocks.enqueueOnboardingRunJob,
}));

vi.mock("@/lib/onboarding/store/onboardingScrapeJobStore", () => ({
  markOnboardingScrapeJobFailed: mocks.markOnboardingScrapeJobFailed,
}));

vi.mock("@/lib/posthog/server", () => ({
  capturePostHogServerEvent: mocks.capturePostHogServerEvent,
  capturePostHogServerException: mocks.capturePostHogServerException,
}));

import { POST } from "./route";

function createParsedInput() {
  return {
    account: "stan",
    goal: "followers" as const,
    timeBudgetMinutes: 30,
    tone: {
      casing: "lowercase" as const,
      risk: "safe" as const,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAllowedOrigin.mockReturnValue(null);
  mocks.enforceSessionMutationRateLimit.mockResolvedValue(null);
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: "user_1",
    },
  });
  mocks.parseJsonBody.mockResolvedValue({
    ok: true,
    value: {
      account: "stan",
    },
  });
  mocks.parseOnboardingInput.mockReturnValue({
    ok: true,
    data: createParsedInput(),
  });
  mocks.validateHandleLimit.mockResolvedValue({
    ok: true,
  });
  mocks.getBillingStateForUser.mockResolvedValue({
    billing: null,
  });
  mocks.inngestSend.mockResolvedValue({
    ids: ["job_123"],
  });
  mocks.markOnboardingScrapeJobFailed.mockResolvedValue(undefined);
  mocks.capturePostHogServerEvent.mockResolvedValue(undefined);
  mocks.capturePostHogServerException.mockResolvedValue(undefined);
});

describe("POST /api/onboarding/run", () => {
  test("returns 202 and sends an Inngest event for a fresh onboarding job", async () => {
    mocks.enqueueOnboardingRunJob.mockResolvedValue({
      jobId: "job_123",
      account: "stan",
      deduped: false,
    });

    const response = await POST(
      new Request("http://localhost/api/onboarding/run", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual({
      ok: true,
      status: "queued",
      jobId: "job_123",
      account: "stan",
    });
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      id: "job_123",
      name: "onboarding/run.requested",
      data: {
        effectiveInput: {
          ...createParsedInput(),
          scrapeFreshness: "if_stale",
        },
        jobId: "job_123",
        userAgent: null,
        userId: "user_1",
      },
    });
  });

  test("reuses an active queued job without sending a duplicate Inngest event", async () => {
    mocks.enqueueOnboardingRunJob.mockResolvedValue({
      jobId: "job_existing",
      account: "stan",
      deduped: true,
    });

    const response = await POST(
      new Request("http://localhost/api/onboarding/run", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual({
      ok: true,
      status: "queued",
      jobId: "job_existing",
      account: "stan",
    });
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  test("marks the job failed when Inngest event submission fails", async () => {
    mocks.enqueueOnboardingRunJob.mockResolvedValue({
      jobId: "job_500",
      account: "stan",
      deduped: false,
    });
    mocks.inngestSend.mockRejectedValue(new Error("inngest unavailable"));

    const response = await POST(
      new Request("http://localhost/api/onboarding/run", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      ok: false,
      code: "QUEUE_UNAVAILABLE",
      errors: [
        {
          field: "account",
          message: "Failed to start onboarding. Please try again.",
        },
      ],
    });
    expect(mocks.markOnboardingScrapeJobFailed).toHaveBeenCalledWith({
      jobId: "job_500",
      error: "inngest unavailable",
    });
  });
});
