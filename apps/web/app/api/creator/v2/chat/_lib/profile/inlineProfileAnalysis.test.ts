import { expect, test } from "vitest";

import {
  buildInlineProfileAnalysisResponse,
  isInlineProfileAnalysisRequest,
} from "./inlineProfileAnalysis.ts";
import type { ProfileConversionAudit } from "@/lib/onboarding/profile/profileConversionAudit";
import type { OnboardingResult } from "@/lib/onboarding/types";

function createAudit(): ProfileConversionAudit {
  return {
    generatedAt: "2026-03-15T12:00:00.000Z",
    score: 62,
    headline: "Your profile is attracting attention but leaking conversion.",
    fingerprint: "fp-123",
    shouldAutoOpen: true,
    steps: [
      {
        key: "bio_formula",
        title: "Bio Formula",
        status: "fail",
        score: 42,
        summary: "The bio is too vague.",
        findings: ["No clear who-you-help statement."],
        actionLabel: "Rewrite bio",
      },
      {
        key: "visual_real_estate",
        title: "Visual Real Estate",
        status: "warn",
        score: 65,
        summary: "The banner exists, but it does not explain the offer.",
        findings: ["Header self-check is still unresolved."],
        actionLabel: "Clarify header",
      },
      {
        key: "pinned_tweet",
        title: "Pinned Tweet",
        status: "fail",
        score: 30,
        summary: "The pinned tweet is stale and low-authority.",
        findings: ["Pinned tweet is older than 365 days."],
        actionLabel: "Write a new pinned thread",
      },
    ],
    strengths: ["Clear face and recognizable avatar."],
    gaps: ["Bio is too broad.", "Pinned tweet is stale."],
    recommendedBioEdits: [
      "I help AI builders turn profile visits into warm inbound.",
      "Helping founders grow on X with clear systems and proof.",
      "Documenting what works for builders who want authority online.",
    ],
    recentPostCoherenceNotes: [],
    unknowns: [],
    bioFormulaCheck: {
      status: "fail",
      score: 42,
      summary: "The bio is too vague.",
      findings: ["No clear who-you-help statement."],
      bio: "building in public",
      charCount: 18,
      matchesFormula: {
        what: false,
        who: false,
        proofOrCta: false,
      },
      alternatives: [
        {
          id: "bio-1",
          text: "I help founders build audience systems that turn profile visits into pipeline.",
          proofMode: "cta",
        },
        {
          id: "bio-2",
          text: "Helping SaaS builders grow authority on X with clear operating systems.",
          proofMode: "cta",
        },
        {
          id: "bio-3",
          text: "I help operators explain what they do so the right people follow fast.",
          proofMode: "cta",
        },
      ],
    },
    visualRealEstateCheck: {
      status: "warn",
      score: 65,
      summary: "The banner exists, but it does not explain the offer.",
      findings: ["Header self-check is still unresolved."],
      hasHeaderImage: true,
      headerImageUrl: "https://pbs.twimg.com/profile_banners/1/banner.jpg",
      headerClarity: null,
      headerClarityResolved: false,
    },
    pinnedTweetCheck: {
      status: "fail",
      score: 30,
      summary: "The pinned tweet is stale and low-authority.",
      findings: ["Pinned tweet is older than 365 days."],
      pinnedPost: {
        id: "pin-1",
        text: "old pinned tweet",
        createdAt: "2024-01-01T00:00:00.000Z",
        metrics: {
          likeCount: 10,
          replyCount: 2,
          repostCount: 1,
          quoteCount: 0,
        },
        url: "https://x.com/test/status/1",
      },
      category: "weak",
      ageDays: 430,
      isStale: true,
      promptSuggestions: {
        originStory: "write me an origin story thread i can pin on x",
        coreThesis: "write me a core thesis thread i can pin on x",
      },
    },
  };
}

function createOnboarding(): OnboardingResult {
  return {
    account: "shernanjavier",
    source: "scrape",
    generatedAt: "2026-03-15T12:00:00.000Z",
    profile: {
      username: "shernanjavier",
      name: "shernan ✦",
      bio: "sharing my learnings as i build in public / road to gmi",
      avatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg",
      headerImageUrl: "https://pbs.twimg.com/profile_banners/banner.jpg",
      isVerified: false,
      followersCount: 125,
      followingCount: 245,
      createdAt: "2017-09-01T00:00:00.000Z",
    },
    pinnedPost: {
      id: "pin-1",
      text: "old pinned tweet",
      createdAt: "2024-01-01T00:00:00.000Z",
      metrics: {
        likeCount: 10,
        replyCount: 2,
        repostCount: 1,
        quoteCount: 0,
      },
      url: "https://x.com/test/status/1",
    },
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
      score: 0,
      band: "usable",
      minimumViableReached: true,
      recommendedDepthReached: false,
      backgroundBackfillRecommended: false,
      targetPostCount: 50,
      message: "ready",
    },
    baseline: {
      averageEngagement: 0,
      medianEngagement: 0,
      engagementRate: 0,
      postingCadencePerWeek: 0,
      averagePostLength: 0,
    },
    growthStage: "0-1k",
    contentDistribution: [],
    hookPatterns: [],
    bestFormats: [],
    underperformingFormats: [],
    strategyState: {
      growthStage: "0-1k",
      goal: "followers",
      postingCadenceCapacity: "1_per_day",
      replyBudgetPerDay: "5_15",
      transformationMode: "optimize",
      transformationModeSource: "default",
      recommendedPostsPerWeek: 7,
      weights: {
        distribution: 0.4,
        authority: 0.3,
        leverage: 0.3,
      },
      rationale: "default",
    },
    warnings: [],
  };
}

test("matches clear profile-audit requests and ignores generic analysis prompts", () => {
  expect(isInlineProfileAnalysisRequest("analyze my profile")).toBe(true);
  expect(isInlineProfileAnalysisRequest("audit my x bio and banner")).toBe(true);
  expect(isInlineProfileAnalysisRequest("write a summary about my profile")).toBe(false);
  expect(isInlineProfileAnalysisRequest("analyze this post")).toBe(false);
});

test("buildInlineProfileAnalysisResponse returns a profile-analysis artifact payload", async () => {
  const response = await buildInlineProfileAnalysisResponse({
    onboarding: createOnboarding(),
    audit: createAudit(),
    memory: {
      conversationState: "needs_more_context",
      activeConstraints: [],
      topicSummary: null,
      lastIdeationAngles: [],
      concreteAnswerCount: 0,
      currentDraftArtifactId: null,
      activeDraftRef: null,
      rollingSummary: null,
      pendingPlan: null,
      clarificationState: null,
      assistantTurnCount: 2,
      latestRefinementInstruction: null,
      unresolvedQuestion: "old question",
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: null,
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
    analyzeBannerUrl: async () => ({
      vision: {
        readable_text: "Helping founders grow on X",
        color_palette: ["black", "white"],
        objects_detected: ["text"],
        is_bottom_left_clear: true,
        overall_vibe: "clean minimalism",
      },
      feedback: {
        score: 7.4,
        strengths: ["The banner includes readable text that signals the niche."],
        actionable_improvements: ["Make the promise more specific."],
      },
      meta: {
        visionModel: "vision-model",
        reasoningModel: "reasoning-model",
        reasoningFallbackUsed: false,
      },
    }),
  });

  expect(response.outputShape).toBe("profile_analysis");
  expect(response.data?.profileAnalysisArtifact?.profile.name).toBe("shernan ✦");
  expect(response.data?.profileAnalysisArtifact?.audit.score).toBe(62);
  expect(response.data?.profileAnalysisArtifact?.bannerAnalysis?.feedback.score).toBe(7.4);
  expect(response.response).toContain("visual read on what the banner image is communicating");
  expect(response.response).not.toContain("mocked up the landing view");
  expect(response.memory.assistantTurnCount).toBe(3);
  expect(response.memory.unresolvedQuestion).toBeNull();
});
