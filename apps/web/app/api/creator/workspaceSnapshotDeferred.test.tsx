import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeParse: vi.fn(),
  hydrateOnboardingProfileForAnalysis: vi.fn(),
  shouldDeferLiveScrapesToWorker: vi.fn(),
  enqueueProfileRefreshJobIfNeeded: vi.fn(),
  readLatestOnboardingRunByHandle: vi.fn(),
  prismaVoiceProfileFindFirst: vi.fn(),
  buildCreatorAgentContext: vi.fn(),
  buildGrowthOperatingSystemPayload: vi.fn(),
  buildCreatorGenerationContract: vi.fn(),
  extractCreatorStrategyOverrides: vi.fn(),
  extractCreatorToneOverrides: vi.fn(),
  applyCreatorStrategyOverrides: vi.fn(),
  applyCreatorToneOverrides: vi.fn(),
}));

vi.mock("@/lib/agent-v2/core/styleProfile", () => ({
  StyleCardSchema: {
    safeParse: mocks.safeParse,
  },
}));

vi.mock("@/lib/onboarding/profile/profileHydration", () => ({
  hydrateOnboardingProfileForAnalysis: mocks.hydrateOnboardingProfileForAnalysis,
}));

vi.mock("@/lib/onboarding/pipeline/liveScrapePolicy", () => ({
  shouldDeferLiveScrapesToWorker: mocks.shouldDeferLiveScrapesToWorker,
}));

vi.mock("@/lib/onboarding/pipeline/scrapeJob", () => ({
  enqueueProfileRefreshJobIfNeeded: mocks.enqueueProfileRefreshJobIfNeeded,
}));

vi.mock("@/lib/onboarding/store/onboardingRunStore", () => ({
  readLatestOnboardingRunByHandle: mocks.readLatestOnboardingRunByHandle,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    voiceProfile: {
      findFirst: mocks.prismaVoiceProfileFindFirst,
    },
  },
}));

vi.mock("@/lib/onboarding/strategy/agentContext", () => ({
  buildCreatorAgentContext: mocks.buildCreatorAgentContext,
}));

vi.mock("@/lib/onboarding/strategy/contextEnrichment", () => ({
  buildGrowthOperatingSystemPayload: mocks.buildGrowthOperatingSystemPayload,
}));

vi.mock("@/lib/onboarding/contracts/generationContract", () => ({
  buildCreatorGenerationContract: mocks.buildCreatorGenerationContract,
}));

vi.mock("@/lib/onboarding/strategy/strategyOverrides", () => ({
  extractCreatorStrategyOverrides: mocks.extractCreatorStrategyOverrides,
  extractCreatorToneOverrides: mocks.extractCreatorToneOverrides,
  applyCreatorStrategyOverrides: mocks.applyCreatorStrategyOverrides,
  applyCreatorToneOverrides: mocks.applyCreatorToneOverrides,
}));

import { loadCreatorWorkspaceSnapshot } from "@/lib/creator/workspaceSnapshot";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.safeParse.mockReturnValue({
    success: false,
  });
  mocks.hydrateOnboardingProfileForAnalysis.mockImplementation(async (value) => value);
  mocks.shouldDeferLiveScrapesToWorker.mockReturnValue(true);
  mocks.enqueueProfileRefreshJobIfNeeded.mockResolvedValue({
    queued: true,
    jobId: "job_123",
    deduped: false,
  });
  mocks.readLatestOnboardingRunByHandle.mockResolvedValue(null);
  mocks.prismaVoiceProfileFindFirst.mockResolvedValue(null);
  mocks.buildCreatorAgentContext.mockReturnValue({
    growthStrategySnapshot: null,
    profileAuditState: null,
  });
  mocks.buildGrowthOperatingSystemPayload.mockResolvedValue({
    unknowns: [],
    replyInsights: {
      bestSignals: [],
      cautionSignals: [],
    },
    strategyAdjustments: {
      experiments: [],
    },
    contentInsights: {},
    contentAdjustments: {},
  });
  mocks.buildCreatorGenerationContract.mockReturnValue({});
  mocks.extractCreatorStrategyOverrides.mockReturnValue(null);
  mocks.extractCreatorToneOverrides.mockReturnValue(null);
  mocks.applyCreatorStrategyOverrides.mockImplementation(({ onboarding }) => onboarding);
  mocks.applyCreatorToneOverrides.mockImplementation(({ baseTone }) => baseTone);
});

describe("loadCreatorWorkspaceSnapshot", () => {
  test("re-reads the latest onboarding run after an earlier miss for the same handle", async () => {
    const onboarding = {
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

    mocks.readLatestOnboardingRunByHandle
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        runId: "or_123",
        persistedAt: "2026-03-20T00:00:00.000Z",
        userId: "user_1",
        input: {
          account: "stan",
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: {
            casing: "lowercase",
            risk: "safe",
          },
        },
        result: onboarding,
        metadata: {
          userAgent: null,
        },
      });

    const firstResult = await loadCreatorWorkspaceSnapshot({
      userId: "user_1",
      xHandle: "stan",
    });
    const secondResult = await loadCreatorWorkspaceSnapshot({
      userId: "user_1",
      xHandle: "stan",
    });

    expect(firstResult).toEqual({
      ok: false,
      code: "MISSING_ONBOARDING_RUN",
      message: "No onboarding run found for this handle.",
    });
    expect(secondResult.ok).toBe(true);
    expect(mocks.readLatestOnboardingRunByHandle).toHaveBeenCalledTimes(2);
  });

  test("queues a pinned-profile refresh instead of live scraping in deferred mode", async () => {
    const onboarding = {
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

    const result = await loadCreatorWorkspaceSnapshot({
      userId: "user_1",
      xHandle: "stan",
      refreshPinnedProfile: true,
      storedRun: {
        id: "or_123",
        input: {
          account: "stan",
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: {
            casing: "lowercase",
            risk: "safe",
          },
        },
        result: onboarding,
      },
    });

    expect(result.ok).toBe(true);
    expect(mocks.enqueueProfileRefreshJobIfNeeded).toHaveBeenCalledWith({
      account: "stan",
      userId: "user_1",
    });
    expect(mocks.hydrateOnboardingProfileForAnalysis).toHaveBeenCalled();
  });
});
