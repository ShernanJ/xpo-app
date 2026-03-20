import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { useAnalysisState } from "./useAnalysisState";

function createResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function createContext(args?: {
  fingerprint?: string;
  shouldAutoOpen?: boolean;
  originStoryPrompt?: string;
  coreThesisPrompt?: string;
}) {
  return {
    creatorProfile: {
      identity: {
        followersCount: 2400,
        isVerified: false,
      },
      archetype: "builder",
      distribution: {
        primaryLoop: "reply_driven",
      },
      examples: {
        cautionExamples: [],
        goalConflictExamples: [],
        replyVoiceAnchors: [],
        voiceAnchors: [],
        quoteVoiceAnchors: [],
        bestPerforming: [],
        strategyAnchors: [],
        goalAnchors: [],
      },
      voice: {
        multiLinePostRate: 0.2,
        styleNotes: [],
        lowercaseSharePercent: 18,
        primaryCasing: "normal",
        averageLengthBand: "medium",
      },
      styleCard: {
        punctuationGuidelines: [],
        forbiddenPhrases: [],
      },
      topics: {
        dominantTopics: [],
      },
      niche: {
        confidence: 82,
      },
      execution: {
        ctaUsageRate: 8,
      },
      strategy: {
        currentStrengths: [],
        currentWeaknesses: [],
      },
      playbook: {
        toneGuidelines: [],
      },
    },
    growthStrategySnapshot: {
      knownFor: "AI growth systems",
      targetAudience: "SaaS founders",
      contentPillars: ["AI growth systems", "profile conversion"],
      confidence: {
        positioning: 85,
      },
      ambiguities: [],
    },
    strategyDelta: {
      primaryGap: "bio clarity",
      adjustments: [],
      preserveTraits: [],
      shiftTraits: [],
    },
    readiness: {
      score: 78,
    },
    confidence: {
      sampleSize: 12,
    },
    positiveAnchors: [],
    negativeAnchors: [],
    profileConversionAudit: {
      fingerprint: args?.fingerprint ?? "fingerprint-1",
      shouldAutoOpen: args?.shouldAutoOpen ?? true,
      score: 48,
      visualRealEstateCheck: {
        headerImageUrl: "https://pbs.twimg.com/profile_banners/123/1500x500",
      },
      pinnedTweetCheck: {
        promptSuggestions: {
          originStory:
            args?.originStoryPrompt ?? "write an origin story thread for my profile",
          coreThesis:
            args?.coreThesisPrompt ?? "write a core thesis thread for my profile",
        },
      },
    },
  } as never;
}

function createOptions(args?: {
  context?: ReturnType<typeof createContext> | null;
  fetchWorkspace?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  submitQuickStarter?: (prompt: string) => Promise<void>;
}) {
  return {
    accountName: "stan",
    activeThreadId: "thread-1",
    context: args?.context ?? createContext(),
    currentPlaybookStage: "1k-10k" as const,
    fetchWorkspace:
      args?.fetchWorkspace ??
      vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        createResponse({
          ok: true,
          data: {
            profileAuditState: {
              lastDismissedFingerprint: "fingerprint-1",
              headerClarity: null,
              headerClarityAnsweredAt: null,
              headerClarityBannerUrl: null,
            },
          },
        }),
      ),
    loadWorkspace: vi.fn(async () => undefined),
    submitQuickStarter:
      args?.submitQuickStarter ?? vi.fn(async (_prompt: string) => undefined),
    dedupePreserveOrder: (values: string[]) => [...new Set(values)],
    formatEnumLabel: (value: string) => value,
    formatNicheSummary: () => "AI growth systems",
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

test("keeps the profile audit closed on mount even when the audit requests auto-open", async () => {
  const { result } = renderHook(() => useAnalysisState(createOptions()));

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.analysisOpen).toBe(false);
});

test("does not auto-open when the audit fingerprint changes", async () => {
  const { result, rerender } = renderHook(
    ({ context }: { context: ReturnType<typeof createContext> | null }) =>
      useAnalysisState(
        createOptions({
          context,
        }),
      ),
    {
      initialProps: {
        context: createContext({
          fingerprint: "fingerprint-1",
        }),
      },
    },
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.analysisOpen).toBe(false);

  rerender({
    context: createContext({
      fingerprint: "fingerprint-2",
    }),
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.analysisOpen).toBe(false);
});

test("opens the profile audit only when explicitly requested", async () => {
  const { result } = renderHook(() => useAnalysisState(createOptions()));

  await act(async () => {
    result.current.openAnalysis();
  });

  expect(result.current.analysisOpen).toBe(true);
});

test("starts the pinned-thread CTA with the prefilled origin story prompt", async () => {
  const submitQuickStarter = vi.fn(async () => undefined);
  const context = createContext({
    shouldAutoOpen: false,
    originStoryPrompt: "origin-story-prompt",
  });
  const { result } = renderHook(() =>
    useAnalysisState(
      createOptions({
        context,
        submitQuickStarter,
      }),
    ),
  );

  await act(async () => {
    await result.current.handlePinnedPromptStart("origin_story");
  });

  expect(submitQuickStarter).toHaveBeenCalledWith("origin-story-prompt");
});
