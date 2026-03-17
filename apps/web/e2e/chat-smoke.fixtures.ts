import type { Page, Route } from "playwright/test";

export const CHAT_SMOKE_HANDLE = "playwright_creator";
export const CHAT_SMOKE_USER = {
  userId: "playwright-chat-user",
  email: "playwright-chat@example.com",
  name: "Playwright Chat",
  handle: "playwright",
  activeXHandle: CHAT_SMOKE_HANDLE,
} as const;

export interface ChatSmokeRequestCounts {
  billing: number;
  chat: number;
  context: number;
  contract: number;
  imageTurns: number;
  lastChatRequestBody: Record<string, unknown> | null;
  preferences: number;
  profileScrape: number;
  threads: number;
}

function buildAnchorPost(args: {
  id: string;
  text: string;
  lane?: "original" | "reply" | "quote";
}) {
  return {
    id: args.id,
    label: args.id,
    lane: args.lane ?? "original",
    reason: "fixture",
    selectionReason: "fixture",
    text: args.text,
    engagementTotal: 42,
    goalFitScore: 88,
    createdAt: "2026-03-15T12:00:00.000Z",
    totalProfileClicks: 6,
  };
}

function buildChatSmokeContext() {
  const proofPost = buildAnchorPost({
    id: "proof-post-1",
    text: "shipped a small improvement today.\n- posted the proof\n- shared the lesson",
  });
  const replyAnchor = buildAnchorPost({
    id: "reply-post-1",
    lane: "reply",
    text: "this is true. the missed part is tightening the feedback loop.",
  });

  return {
    generatedAt: "2026-03-15T12:00:00.000Z",
    contextVersion: "agent_context_v3",
    creatorProfileVersion: "fixture_v1",
    evaluationRubricVersion: "fixture_v1",
    runId: "run-playwright-chat",
    account: CHAT_SMOKE_HANDLE,
    avatarUrl: null,
    source: "fixture",
    creatorProfile: {
      identity: {
        isVerified: false,
        username: CHAT_SMOKE_HANDLE,
        displayName: "Playwright Creator",
        followersCount: 1850,
        followerBand: "1k-10k",
      },
      archetype: "builder_operator",
      niche: {
        primaryNiche: "saas",
        targetNiche: "saas",
        confidence: 78,
      },
      topics: {
        dominantTopics: [
          {
            label: "building in public",
            stability: "high",
          },
        ],
        audienceSignals: ["founders"],
      },
      voice: {
        primaryCasing: "normal",
        lowercaseSharePercent: 18,
        multiLinePostRate: 42,
        averageLengthBand: "medium",
        styleNotes: ["casual", "practical", "bullet friendly"],
      },
      styleCard: {
        punctuationGuidelines: ["use bullets for steps", "keep sentences clean"],
        preferredOpeners: ["here's what changed"],
        signaturePhrases: ["tight feedback loop"],
        forbiddenPhrases: ["synergy"],
      },
      strategy: {
        primaryGoal: "followers",
        currentStrengths: ["clear build updates", "specific proof"],
        currentWeaknesses: ["not enough distribution"],
      },
      distribution: {
        primaryLoop: "original",
      },
      playbook: {
        toneGuidelines: ["sound like a builder", "keep it concrete"],
        cadence: {
          threadBias: "medium",
        },
      },
      execution: {
        ctaUsageRate: 12,
      },
      examples: {
        voiceAnchors: [proofPost],
        replyVoiceAnchors: [replyAnchor],
        quoteVoiceAnchors: [],
        bestPerforming: [proofPost],
        strategyAnchors: [proofPost],
        goalAnchors: [proofPost],
        cautionExamples: [],
        goalConflictExamples: [],
      },
    },
    strategyDelta: {
      primaryGap: "Discovery from replies",
      adjustments: [
        {
          area: "distribution",
          direction: "Increase reply volume",
          note: "Reach is narrow without more reply-led discovery.",
          priority: "high",
        },
      ],
      preserveTraits: ["keep the practical proof"],
      shiftTraits: ["avoid vague motivation"],
    },
    growthStrategySnapshot: {
      confidence: {
        positioning: 76,
      },
      ambiguities: [],
      truthBoundary: {
        hardRules: [],
        softRules: [],
      },
    },
    confidence: {
      sampleBand: "sufficient",
      sampleSize: 18,
    },
    readiness: {
      score: 81,
      status: "ready",
      recommendedMode: "full_generation",
      reasons: ["fixture context is stable for the smoke test"],
    },
    anchorSummary: {
      positiveAnchorCount: 1,
      positiveLaneCount: 1,
      populatedPositiveRetrievalSets: 1,
      negativeAnchorCount: 0,
      negativeLaneCount: 0,
      goalConflictCount: 0,
      distinctGoalConflictCount: 0,
      anchorQualityScore: 82,
      anchorQualityStatus: "pass",
    },
    positiveAnchors: [proofPost],
    negativeAnchors: [],
    retrieval: {
      bestPerforming: [proofPost],
      voiceAnchors: [proofPost],
      strategyAnchors: [proofPost],
      goalAnchors: [proofPost],
      cautionExamples: [],
      goalConflictExamples: [],
      replyVoiceAnchors: [replyAnchor],
      quoteVoiceAnchors: [],
    },
    unknowns: [],
  };
}

function buildChatSmokeContract() {
  return {
    generatedAt: "2026-03-15T12:00:00.000Z",
    contractVersion: "generation_contract_v6",
    contextVersion: "agent_context_v3",
    runId: "run-playwright-chat",
    account: CHAT_SMOKE_HANDLE,
    source: "fixture",
    mode: "full_generation",
    planner: {
      outputShape: "long_form_post",
    },
    writer: {
      targetRisk: "safe",
    },
  };
}

function buildChatSmokeReply() {
  return {
    ok: true,
    data: {
      reply: "Here is a grounded reply for the smoke test.",
      angles: [],
      drafts: [],
      draftArtifacts: [],
      supportAsset: null,
      outputShape: "short_form_post",
      surfaceMode: "answer_directly",
      messageId: "assistant-smoke-1",
      newThreadId: "thread-smoke-1",
      threadTitle: "Chat smoke thread",
    },
  };
}

function buildBillingState() {
  return {
    ok: true,
    data: {
      billing: {
        plan: "free",
        status: "active",
        billingCycle: "monthly",
        creditsRemaining: 48,
        creditLimit: 50,
        creditCycleResetsAt: "2026-04-01T12:00:00.000Z",
        showFirstPricingModal: false,
        lowCreditWarning: false,
        criticalCreditWarning: false,
        fairUse: {
          softWarningThreshold: 0.7,
          reviewThreshold: 0.9,
          hardStopThreshold: 1,
          isSoftWarning: false,
          isReviewLevel: false,
          isHardStopped: false,
        },
      },
      lifetimeSlots: {
        total: 100,
        sold: 10,
        reserved: 0,
        remaining: 90,
      },
      offers: [
        {
          offer: "pro_monthly",
          label: "Pro Monthly",
          amountCents: 1999,
          cadence: "month",
          productCopy: "fixture",
          enabled: true,
        },
        {
          offer: "pro_annual",
          label: "Pro Annual",
          amountCents: 19999,
          cadence: "year",
          productCopy: "fixture",
          enabled: true,
        },
        {
          offer: "lifetime",
          label: "Founder",
          amountCents: 49900,
          cadence: "one_time",
          productCopy: "fixture",
          enabled: true,
        },
      ],
      supportEmail: "playwright@example.com",
    },
  };
}

function buildPreferences() {
  return {
    ok: true,
    data: {
      preferences: {
        casing: "auto",
        bulletStyle: "auto",
        writingGoal: "balanced",
        emojiUsage: "off",
        profanity: "off",
        blacklist: [],
        verifiedMaxChars: 25000,
      },
    },
  };
}

function buildThreads() {
  return {
    ok: true,
    data: {
      threads: [],
    },
  };
}

function buildProfileScrape() {
  return {
    ok: true,
    refreshed: false,
    reason: "fresh_enough",
    cooldownUntil: null,
  };
}

function buildCreatedThread() {
  return {
    ok: true,
    data: {
      thread: {
        id: "thread-smoke-image-1",
        title: "New Chat",
      },
    },
  };
}

const smokeImageVisualContext = {
  primary_subject: "founder at a laptop",
  setting: "a bright home office",
  lighting_and_mood: "warm and focused",
  any_readable_text: "ship the update",
  key_details: ["coffee mug", "analytics dashboard", "notebook"],
} as const;

const smokeImageAttachments = [
  {
    assetId: "chat-media-smoke-1",
    kind: "image",
    src: "/api/creator/v2/chat/media/chat-media-smoke-1",
    previewSrc: "/api/creator/v2/chat/media/chat-media-smoke-1?variant=preview",
    mimeType: "image/png",
    width: 1280,
    height: 720,
    name: "draft.png",
  },
] as const;

const smokeImageTurnContext = {
  imageAssetId: "chat-media-smoke-1",
  visualContext: smokeImageVisualContext,
  supportAsset:
    "Image anchor: founder at a laptop in a bright home office.\nMood: warm and focused.\nReadable text: ship the update.\nKey details: coffee mug, analytics dashboard, notebook.",
  mediaAttachments: smokeImageAttachments,
} as const;

function buildInitialImageTurnReply() {
  return {
    ok: true,
    data: {
      threadId: "thread-smoke-image-1",
      userMessage: {
        id: "user-image-1",
        threadId: "thread-smoke-image-1",
        role: "user",
        content: "",
        createdAt: "2026-03-16T12:01:00.000Z",
        mediaAttachments: smokeImageAttachments,
      },
      assistantMessage: {
        id: "assistant-image-1",
        threadId: "thread-smoke-image-1",
        role: "assistant",
        content:
          'I see you sent an image of founder at a laptop in a bright home office. The overall mood looks warm and focused. I can also read "ship the update". A few details that stand out: coffee mug, analytics dashboard, notebook.\n\nDid you want to write a post on this image?',
        createdAt: "2026-03-16T12:01:02.000Z",
        outputShape: "coach_question",
        surfaceMode: "ask_one_question",
        quickReplies: [
          {
            kind: "image_post_confirmation",
            value: "yes, write a post",
            label: "yes, write a post",
            decision: "confirm",
            imageAssetId: "chat-media-smoke-1",
          },
          {
            kind: "image_post_confirmation",
            value: "not now",
            label: "not now",
            decision: "decline",
            imageAssetId: "chat-media-smoke-1",
          },
        ],
        imageTurnContext: {
          ...smokeImageTurnContext,
          awaitingConfirmation: true,
        },
      },
    },
  };
}

function buildImageTurnConfirmationReply() {
  return {
    ok: true,
    data: {
      userMessage: {
        id: "user-image-2",
        threadId: "thread-smoke-image-1",
        role: "user",
        content: "yes, write a post",
        createdAt: "2026-03-16T12:01:04.000Z",
      },
      assistantMessage: {
        id: "assistant-image-2",
        threadId: "thread-smoke-image-1",
        role: "assistant",
        content: "I pulled a few post directions from the image. Choose one and I'll turn it into a draft.",
        createdAt: "2026-03-16T12:01:06.000Z",
        outputShape: "ideation_angles",
        surfaceMode: "offer_options",
        supportAsset: smokeImageTurnContext.supportAsset,
        angles: [
          { title: "Question hook post from the image." },
          { title: "Relatable take post from the image." },
          { title: "Bold statement post from the image." },
        ],
        quickReplies: [
          {
            kind: "ideation_angle",
            value: "Question hook post from the image.",
            label: "Question hook post from the image.",
            angle: "Question hook post from the image.",
            formatHint: "post",
            supportAsset: smokeImageTurnContext.supportAsset,
            imageAssetId: "chat-media-smoke-1",
          },
          {
            kind: "ideation_angle",
            value: "Relatable take post from the image.",
            label: "Relatable take post from the image.",
            angle: "Relatable take post from the image.",
            formatHint: "post",
            supportAsset: smokeImageTurnContext.supportAsset,
            imageAssetId: "chat-media-smoke-1",
          },
          {
            kind: "ideation_angle",
            value: "Bold statement post from the image.",
            label: "Bold statement post from the image.",
            angle: "Bold statement post from the image.",
            formatHint: "post",
            supportAsset: smokeImageTurnContext.supportAsset,
            imageAssetId: "chat-media-smoke-1",
          },
        ],
        imageTurnContext: {
          ...smokeImageTurnContext,
          awaitingConfirmation: false,
        },
      },
    },
  };
}

async function fulfillJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

export async function installChatSmokeApiMocks(
  page: Page,
  counts: ChatSmokeRequestCounts,
) {
  let currentSession: {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      handle?: string;
      activeXHandle?: string | null;
    };
  } | null = null;

  await page.route("**/api/test/session", async (route) => {
    const payload = route.request().postDataJSON() as
      | {
          userId?: string;
          email?: string;
          name?: string;
          handle?: string;
          activeXHandle?: string;
        }
      | undefined;
    currentSession = {
      user: {
        id: payload?.userId ?? "playwright-chat-user",
        name: payload?.name ?? "Playwright Chat",
        email: payload?.email ?? "playwright-chat@example.com",
        handle: payload?.handle ?? "playwright",
        activeXHandle: payload?.activeXHandle ?? CHAT_SMOKE_HANDLE,
      },
    };

    await fulfillJson(route, {
      ok: true,
    });
  });

  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON() as
        | {
            handle?: string;
            activeXHandle?: string | null;
          }
        | undefined;
      currentSession = currentSession
        ? {
            user: {
              ...currentSession.user,
              ...(patch?.handle !== undefined ? { handle: patch.handle } : {}),
              ...(patch?.activeXHandle !== undefined
                ? { activeXHandle: patch.activeXHandle }
                : {}),
            },
          }
        : currentSession;
    }

    await fulfillJson(route, {
      ok: true,
      session: currentSession,
    });
  });

  await page.route("**/api/auth/logout", async (route) => {
    currentSession = null;
    await fulfillJson(route, {
      ok: true,
    });
  });

  await page.route("**/api/creator/context", async (route) => {
    counts.context += 1;
    await fulfillJson(route, {
      ok: true,
      data: buildChatSmokeContext(),
    });
  });

  await page.route("**/api/creator/generation-contract", async (route) => {
    counts.contract += 1;
    await fulfillJson(route, {
      ok: true,
      data: buildChatSmokeContract(),
    });
  });

  await page.route("**/api/creator/v2/chat", async (route) => {
    counts.chat += 1;
    try {
      counts.lastChatRequestBody = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      counts.lastChatRequestBody = null;
    }
    await fulfillJson(route, buildChatSmokeReply());
  });

  await page.route("**/api/creator/v2/threads", async (route) => {
    counts.threads += 1;
    if (route.request().method() === "POST") {
      await fulfillJson(route, buildCreatedThread());
      return;
    }

    await fulfillJson(route, buildThreads());
  });

  await page.route("**/api/creator/v2/chat/image-turns", async (route) => {
    counts.imageTurns += 1;
    const contentType = route.request().headers()["content-type"] || "";
    await fulfillJson(
      route,
      contentType.includes("application/json")
        ? buildImageTurnConfirmationReply()
        : buildInitialImageTurnReply(),
    );
  });

  await page.route("**/api/creator/v2/chat/media/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("fixture-image"),
    });
  });

  await page.route("**/api/creator/v2/preferences", async (route) => {
    counts.preferences += 1;
    await fulfillJson(route, buildPreferences());
  });

  await page.route("**/api/creator/profile/scrape", async (route) => {
    counts.profileScrape += 1;
    await fulfillJson(route, buildProfileScrape());
  });

  await page.route("**/api/billing/state**", async (route) => {
    counts.billing += 1;
    await fulfillJson(route, buildBillingState());
  });
}
