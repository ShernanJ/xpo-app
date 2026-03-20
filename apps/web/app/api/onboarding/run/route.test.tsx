import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(),
  enforceSessionMutationRateLimit: vi.fn(),
  parseOnboardingInput: vi.fn(),
  validateHandleLimit: vi.fn(),
  getBillingStateForUser: vi.fn(),
  shouldQueueOnboardingLiveScrape: vi.fn(),
  enqueueOnboardingRunJob: vi.fn(),
  runOnboarding: vi.fn(),
  finalizeOnboardingRunForUser: vi.fn(),
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

vi.mock("@/lib/onboarding/pipeline/liveScrapePolicy", () => ({
  shouldQueueOnboardingLiveScrape: mocks.shouldQueueOnboardingLiveScrape,
}));

vi.mock("@/lib/onboarding/pipeline/scrapeJob", () => ({
  enqueueOnboardingRunJob: mocks.enqueueOnboardingRunJob,
}));

vi.mock("@/lib/onboarding/pipeline/service", () => ({
  runOnboarding: mocks.runOnboarding,
}));

vi.mock("@/lib/onboarding/pipeline/finalizeRun", () => ({
  finalizeOnboardingRunForUser: mocks.finalizeOnboardingRunForUser,
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

function createOnboardingResult() {
  return {
    account: "stan",
    source: "scrape" as const,
    generatedAt: "2026-03-19T00:00:00.000Z",
    profile: {
      username: "stan",
      name: "Stan",
      bio: "builder",
      avatarUrl: null,
      headerImageUrl: null,
      isVerified: false,
      followersCount: 1200,
      followingCount: 140,
      createdAt: "2020-01-01T00:00:00.000Z",
    },
    pinnedPost: null,
    recentPosts: [],
    recentReplyPosts: [],
    recentQuotePosts: [],
    recentPostSampleCount: 0,
    replyPostSampleCount: 0,
    quotePostSampleCount: 0,
    capturedPostCount: 0,
    capturedReplyPostCount: 0,
    capturedQuotePostCount: 0,
    totalCapturedActivityCount: 0,
    analysisConfidence: {
      sampleSize: 0,
      score: 20,
      band: "very_low" as const,
      minimumViableReached: false,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: true,
      targetPostCount: 80,
      message: "thin sample",
    },
    baseline: {
      averageEngagement: 0,
      medianEngagement: 0,
      engagementRate: 0,
      postingCadencePerWeek: 0,
      averagePostLength: 0,
    },
    growthStage: "1k-10k" as const,
    contentDistribution: [],
    hookPatterns: [],
    bestFormats: [],
    underperformingFormats: [],
    strategyState: {
      growthStage: "1k-10k" as const,
      goal: "followers" as const,
      postingCadenceCapacity: "1_per_day" as const,
      replyBudgetPerDay: "5_15" as const,
      transformationMode: "preserve" as const,
      transformationModeSource: "default" as const,
      recommendedPostsPerWeek: 5,
      weights: {
        distribution: 0.35,
        authority: 0.55,
        leverage: 0.1,
      },
      rationale: "keep compounding",
    },
    warnings: [],
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
  mocks.capturePostHogServerEvent.mockResolvedValue(undefined);
  mocks.capturePostHogServerException.mockResolvedValue(undefined);
});

describe("POST /api/onboarding/run", () => {
  test("returns 202 and a job ticket when production needs a live scrape", async () => {
    mocks.shouldQueueOnboardingLiveScrape.mockResolvedValue(true);
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
    expect(mocks.runOnboarding).not.toHaveBeenCalled();
  });

  test("returns the finalized onboarding payload when a cached path can run inline", async () => {
    const result = createOnboardingResult();
    mocks.shouldQueueOnboardingLiveScrape.mockResolvedValue(false);
    mocks.runOnboarding.mockResolvedValue(result);
    mocks.finalizeOnboardingRunForUser.mockResolvedValue({
      normalizedHandle: "stan",
      payload: {
        ok: true,
        runId: "or_123",
        persistedAt: "2026-03-19T00:00:00.000Z",
        backfill: {
          queued: false,
          jobId: null,
          deduped: false,
        },
        data: result,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/onboarding/run", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.runId).toBe("or_123");
    expect(payload.data.account).toBe("stan");
  });
});
