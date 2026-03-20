import { expect, test } from "vitest";

import {
  buildInlineProfileAnalysisResponse,
  isInlineProfileAnalysisRequest,
} from "./inlineProfileAnalysis.ts";
import type { ProfileReplyContext } from "@/lib/agent-v2/grounding/profileReplyContext";
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
    recentPosts: [
      {
        id: "post-1",
        text: "generic ai copy usually comes from weak retrieval, not weak models.",
        createdAt: "2026-03-12T00:00:00.000Z",
        metrics: {
          likeCount: 27,
          replyCount: 6,
          repostCount: 4,
          quoteCount: 0,
        },
      },
    ],
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

function createProfileReplyContext(): ProfileReplyContext {
  return {
    accountLabel: "shernan ✦ @shernanjavier",
    bio: "sharing my learnings as i build in public / road to gmi",
    knownFor: "builder-focused growth systems",
    targetAudience: "builders trying to grow on X",
    contentPillars: ["retrieval quality", "proof-first writing", "x growth systems"],
    topicInsights: [
      {
        label: "Retrieval quality and proof-first writing",
        confidence: "medium",
        kind: "theme",
        evidenceSnippets: [
          "generic ai copy usually comes from weak retrieval, not weak models.",
        ],
        source: "recent_posts",
      },
      {
        label: "Narrowing the lane before scaling output",
        confidence: "low",
        kind: "positioning",
        evidenceSnippets: [
          "generic ai copy usually comes from weak retrieval, not weak models.",
        ],
        source: "mixed",
      },
    ],
    stage: "0-1k",
    goal: "followers",
    topicBullets: [
      "Retrieval quality and proof-first writing",
      "Narrowing the lane before scaling output",
    ],
    recentPostSnippets: [
      "generic ai copy usually comes from weak retrieval, not weak models.",
    ],
    pinnedPost: "old pinned tweet",
    recentPostCount: 1,
    strongestPost: {
      timeframe: "recent",
      text: "generic ai copy usually comes from weak retrieval, not weak models.",
      createdAt: "2026-03-12T00:00:00.000Z",
      engagementTotal: 37,
      metrics: {
        likeCount: 27,
        replyCount: 6,
        repostCount: 4,
        quoteCount: 0,
      },
      comparison: {
        basis: "baseline_average_engagement",
        referenceEngagementTotal: 12,
        ratio: 3.08,
      },
      imageUrls: [],
      linkSignal: "none",
      reasons: [
        "The opener gets to the point fast, which makes the post easy to process.",
      ],
      hookPattern: "statement_open",
      contentType: "multi_line",
    },
  };
}

function createCreatorAgentContext() {
  return {
    growthStrategySnapshot: {
      knownFor: "builder-focused growth systems",
      targetAudience: "builders trying to grow on X",
      contentPillars: ["retrieval quality", "proof-first writing", "x growth systems"],
    },
    creatorProfile: {
      strategy: {
        primaryGoal: "authority",
      },
    },
    profileAuditState: null,
  } as never;
}

test("matches clear profile-audit requests and ignores generic analysis prompts", () => {
  expect(isInlineProfileAnalysisRequest("analyze my profile")).toBe(true);
  expect(isInlineProfileAnalysisRequest("audit my x bio and banner")).toBe(true);
  expect(isInlineProfileAnalysisRequest("write a summary about my profile")).toBe(false);
  expect(isInlineProfileAnalysisRequest("analyze this post")).toBe(false);
});

test("buildInlineProfileAnalysisResponse falls back to structured markdown when no narrative writer is provided", async () => {
  const onboarding = createOnboarding();
  onboarding.pinnedPost = onboarding.pinnedPost
    ? {
        ...onboarding.pinnedPost,
        imageUrls: ["https://pbs.twimg.com/media/pinned-proof.jpg"],
      }
    : null;

  const response = await buildInlineProfileAnalysisResponse({
    onboarding,
    audit: createAudit(),
    profileReplyContext: createProfileReplyContext(),
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
      activeProfileAnalysisRef: null,
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
    analyzePinnedPostImage: async () => ({
      imageRole: "proof",
      readableText: "$47k MRR",
      primarySubject: "dashboard screenshot",
      sceneSummary: "Dashboard screenshot showing growth and revenue proof.",
      strategicSignal:
        "The image adds concrete proof that the pinned post is backed by real business traction.",
      keyDetails: ["revenue chart", "customer counts"],
    }),
    creatorAgentContext: createCreatorAgentContext(),
  });

  expect(response.outputShape).toBe("profile_analysis");
  expect(response.data?.profileAnalysisArtifact?.profile.name).toBe("shernan ✦");
  expect(response.data?.profileAnalysisArtifact?.audit.score).toBeGreaterThan(45);
  expect(response.data?.profileAnalysisArtifact?.bannerAnalysis?.feedback.score).toBe(7.4);
  expect(response.data?.profileAnalysisArtifact?.pinnedPostImageAnalysis?.imageRole).toBe("proof");
  expect(response.data?.profileAnalysisArtifact?.audit.pinnedTweetCheck.proofStrength).toBe("high");
  expect(response.data?.profileAnalysisArtifact?.audit.pinnedTweetCheck.imageAdjusted).toBe(true);
  expect(response.data?.quickReplies).toHaveLength(3);
  expect(response.data?.quickReplies?.[0]?.label).toBe("Rewrite bio");
  expect(response.response).toContain("**Verdict:**");
  expect(response.response).toContain("## Profile Snapshot");
  expect(response.response).toContain("## Content Patterns");
  expect(response.response).toContain("## Priority Order");
  expect(response.response).toContain("Your clearest signal right now is");
  expect(response.response).toContain("\n  - ");
  expect(response.response).toContain("retrieval quality and proof-first writing");
  expect(response.response).toContain("Dashboard screenshot showing growth and revenue proof.");
  expect(response.response).not.toContain("Recent theme:");
  expect(response.response).not.toContain("confidence signal");
  expect(response.response).toContain("What's your goal for this profile, and did I get anything wrong?");
  expect(response.memory.assistantTurnCount).toBe(3);
  expect(response.memory.unresolvedQuestion).toBeNull();
  expect(response.memory.preferredSurfaceMode).toBe("structured");
  expect(response.presentationStyle).toBe("preserve_authored_structure");
});

test("buildInlineProfileAnalysisResponse softens low-confidence reads without exposing internal confidence labels", async () => {
  const response = await buildInlineProfileAnalysisResponse({
    onboarding: createOnboarding(),
    audit: createAudit(),
    profileReplyContext: {
      ...createProfileReplyContext(),
      topicInsights: [
        {
          label: "Proof-first writing for builders",
          confidence: "low",
          kind: "theme",
          evidenceSnippets: ["generic ai copy usually comes from weak retrieval, not weak models."],
          source: "recent_posts",
        },
      ],
    },
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
      assistantTurnCount: 1,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: null,
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      activeProfileAnalysisRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
    analyzeBannerUrl: async () => null,
  });

  expect(response.response).toContain("There may be an opening around proof-first writing for builders");
  expect(response.response).toContain("generic ai copy usually comes from weak retrieval, not weak models.");
  expect(response.response).not.toContain("low-confidence");
  expect(response.response).not.toContain("Recent theme:");
});

test("buildInlineProfileAnalysisResponse promotes pinned proof over one-off noisy posts", async () => {
  const onboarding = createOnboarding();
  onboarding.profile.username = "kkevinvalencia";
  onboarding.profile.name = "Kevin Valencia";
  onboarding.profile.bio = "19, gpu infra // eng @cloverlabsco";
  onboarding.profile.followersCount = 109;
  onboarding.profile.followingCount = 121;
  onboarding.pinnedPost = onboarding.pinnedPost
    ? {
        ...onboarding.pinnedPost,
        text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
        imageUrls: ["https://pbs.twimg.com/media/kevin-proof.jpg"],
      }
    : null;
  onboarding.recentPosts = [
    {
      id: "post-1",
      text: "sf or nyc for one week?",
      createdAt: "2026-03-12T00:00:00.000Z",
      metrics: {
        likeCount: 12,
        replyCount: 1,
        repostCount: 0,
        quoteCount: 0,
      },
    },
    {
      id: "post-2",
      text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      createdAt: "2026-03-11T00:00:00.000Z",
      metrics: {
        likeCount: 80,
        replyCount: 20,
        repostCount: 1,
        quoteCount: 0,
      },
    },
    {
      id: "post-3",
      text: "please z fellows i need this 🥹🥹",
      createdAt: "2026-03-10T00:00:00.000Z",
      metrics: {
        likeCount: 9,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
      },
    },
  ];

  const response = await buildInlineProfileAnalysisResponse({
    onboarding,
    audit: createAudit(),
    profileReplyContext: {
      accountLabel: "Kevin Valencia @kkevinvalencia",
      bio: "19, gpu infra // eng @cloverlabsco",
      knownFor: "gpu infra and engineering wins",
      targetAudience: "builders and engineers",
      contentPillars: ["gpu infra systems"],
      topicInsights: [
        {
          label: "GPU infra systems",
          confidence: "medium",
          kind: "positioning",
          evidenceSnippets: ["19, gpu infra // eng @cloverlabsco"],
          source: "profile_surface",
        },
      ],
      stage: "0-1k",
      goal: "authority",
      topicBullets: ["GPU infra systems"],
      recentPostSnippets: [
        "sf or nyc for one week?",
        "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      ],
      pinnedPost: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
      recentPostCount: 3,
      strongestPost: {
        timeframe: "recent",
        text: "holy fucking cinema. https://t.co/Fqnj4ifTfI",
        createdAt: "2026-03-11T00:00:00.000Z",
        engagementTotal: 101,
        metrics: {
          likeCount: 80,
          replyCount: 20,
          repostCount: 1,
          quoteCount: 0,
        },
        comparison: {
          basis: "baseline_average_engagement",
          referenceEngagementTotal: 14,
          ratio: 7.2,
        },
        imageUrls: ["https://pbs.twimg.com/media/kevin-proof.jpg"],
        linkSignal: "media_only",
        reasons: ["The opener is short, but it does not explain the positioning on its own."],
        hookPattern: "statement_open",
        contentType: "single_line",
      },
    },
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
      assistantTurnCount: 0,
      latestRefinementInstruction: null,
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: null,
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      activeProfileAnalysisRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
    analyzePinnedPostImage: async () => ({
      imageRole: "proof",
      readableText: "First Prize Winner $20k CAD",
      primarySubject: "Kevin holding a large cheque beside trophies",
      sceneSummary: "A winner photo with a large cheque and first-place trophies.",
      strategicSignal: "The image communicates a real achievement and gives the profile tangible authority.",
      keyDetails: ["first-place trophies", "large cheque", "$20k CAD"],
    }),
    creatorAgentContext: {
      growthStrategySnapshot: {
        knownFor: "gpu infra and engineering wins",
        targetAudience: "builders and engineers",
        contentPillars: ["gpu infra systems"],
      },
      creatorProfile: {
        strategy: {
          primaryGoal: "authority",
        },
      },
      profileAuditState: null,
    } as never,
    analyzeBannerUrl: async () => null,
  });

  expect(response.response).toContain("visible proof of a real win");
  expect(response.response).toContain("First Prize Winner $20k CAD");
  expect(response.response).toContain("media-backed proof post");
  expect(response.response).not.toContain("Recent theme:");
  expect(response.response).not.toContain("medium-confidence signal");
  expect(response.response).not.toContain("sf or nyc for one week");
});

test("buildInlineProfileAnalysisResponse uses the injected narrative when available", async () => {
  const response = await buildInlineProfileAnalysisResponse({
    onboarding: createOnboarding(),
    audit: createAudit(),
    profileReplyContext: createProfileReplyContext(),
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
      unresolvedQuestion: null,
      clarificationQuestionsAsked: 0,
      preferredSurfaceMode: null,
      formatPreference: null,
      activeReplyContext: null,
      activeReplyArtifactRef: null,
      activeProfileAnalysisRef: null,
      selectedReplyOptionId: null,
      voiceFidelity: "balanced",
    },
    generateNarrative: async () =>
      [
        "**Verdict:** strong foundation, but the conversion surfaces are still misaligned.",
        "",
        "## Profile Snapshot",
        "- Bio is too broad right now.",
      ].join("\n"),
  });

  expect(response.response).toContain("strong foundation, but the conversion surfaces are still misaligned");
  expect(response.response).not.toContain("## Content Patterns");
});
