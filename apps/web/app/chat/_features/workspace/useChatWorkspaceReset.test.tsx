import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useChatWorkspaceReset } from "./useChatWorkspaceReset";

interface ToneInputs {
  tone: string;
}

interface StrategyInputs {
  goal: string;
}

function buildResetOptions(
  overrides: {
    accountName?: string | null;
    loadWorkspace?: () => Promise<unknown>;
    threadStateResetVersion?: number;
    clearMissingOnboardingAttempts?: () => void;
    setContext?: (value: { id: string } | null) => void;
    setContract?: (value: { id: string } | null) => void;
    setMessages?: (value: { id: string }[] | ((current: { id: string }[]) => { id: string }[])) => void;
  } = {},
) {
  return {
    accountName: overrides.accountName ?? "stanley",
    buildWorkspaceChatHref: vi.fn(() => "/chat"),
    threadStateResetVersion: overrides.threadStateResetVersion ?? 0,
    loadWorkspace: overrides.loadWorkspace ?? vi.fn().mockResolvedValue(undefined),
    clearMissingOnboardingAttempts:
      overrides.clearMissingOnboardingAttempts ?? vi.fn(),
    defaultToneInputs: { tone: "safe" } satisfies ToneInputs,
    defaultStrategyInputs: { goal: "followers" } satisfies StrategyInputs,
    threadCreatedInSessionRef: { current: false },
    setActiveThreadId: vi.fn(),
    setContext: overrides.setContext ?? vi.fn(),
    setContract: overrides.setContract ?? vi.fn(),
    setConversationMemory: vi.fn(),
    setStreamStatus: vi.fn(),
    setIsWorkspaceInitializing: vi.fn(),
    setAnalysisOpen: vi.fn(),
    setBackfillNotice: vi.fn(),
    setIsAnalysisScrapeRefreshing: vi.fn(),
    setAnalysisScrapeNotice: vi.fn(),
    setAnalysisScrapeCooldownUntil: vi.fn(),
    setActiveContentFocus: vi.fn(),
    setToneInputs: vi.fn(),
    setActiveToneInputs: vi.fn(),
    setActiveStrategyInputs: vi.fn(),
    setDraftQueueItems: vi.fn(),
    setDraftQueueError: vi.fn(),
    setEditingDraftCandidateId: vi.fn(),
    setEditingDraftCandidateText: vi.fn(),
    setMessages: overrides.setMessages ?? vi.fn(),
    setDraftInput: vi.fn(),
    setErrorMessage: vi.fn(),
    setActiveDraftEditor: vi.fn(),
    setEditorDraftText: vi.fn(),
    setEditorDraftPosts: vi.fn(),
    setTypedAssistantLengths: vi.fn(),
    setActiveDraftRevealByMessageId: vi.fn(),
    setRevealedDraftMessageIds: vi.fn(),
    setIsLeavingHero: vi.fn(),
  };
}

test("bootstraps once per workspace identity instead of on every loadWorkspace rerender", () => {
  const initialLoadWorkspace = vi.fn().mockResolvedValue(undefined);
  const rerenderLoadWorkspace = vi.fn().mockResolvedValue(undefined);
  const switchedAccountLoadWorkspace = vi.fn().mockResolvedValue(undefined);

  const { rerender } = renderHook(
    ({
      accountName,
      loadWorkspace,
    }: {
      accountName: string | null;
      loadWorkspace: () => Promise<unknown>;
    }) =>
      useChatWorkspaceReset<
        { id: string },
        { id: string },
        { id: string },
        ToneInputs,
        StrategyInputs,
        string,
        { id: string },
        { id: string },
        { id: string },
        string
      >(buildResetOptions({ accountName, loadWorkspace })),
    {
      initialProps: {
        accountName: "stanley",
        loadWorkspace: initialLoadWorkspace,
      },
    },
  );

  expect(initialLoadWorkspace).toHaveBeenCalledTimes(1);

  rerender({
    accountName: "stanley",
    loadWorkspace: rerenderLoadWorkspace,
  });

  expect(initialLoadWorkspace).toHaveBeenCalledTimes(1);
  expect(rerenderLoadWorkspace).not.toHaveBeenCalled();

  rerender({
    accountName: "casey",
    loadWorkspace: switchedAccountLoadWorkspace,
  });

  expect(switchedAccountLoadWorkspace).toHaveBeenCalledTimes(1);
});

test("thread reset version resets thread state without re-running workspace bootstrap", () => {
  vi.useFakeTimers();

  const loadWorkspace = vi.fn().mockResolvedValue(undefined);
  const setMessages = vi.fn();

  const { rerender } = renderHook(
    ({ threadStateResetVersion }: { threadStateResetVersion: number }) =>
      useChatWorkspaceReset<
        { id: string },
        { id: string },
        { id: string },
        ToneInputs,
        StrategyInputs,
        string,
        { id: string },
        { id: string },
        { id: string },
        string
      >(
        buildResetOptions({
          loadWorkspace,
          setMessages,
          threadStateResetVersion,
        }),
      ),
    {
      initialProps: {
        threadStateResetVersion: 0,
      },
    },
  );

  expect(loadWorkspace).toHaveBeenCalledTimes(1);

  rerender({
    threadStateResetVersion: 1,
  });

  act(() => {
    vi.runAllTimers();
  });

  expect(loadWorkspace).toHaveBeenCalledTimes(1);
  expect(setMessages).toHaveBeenCalledWith([]);

  vi.useRealTimers();
});

test("account switch clears onboarding attempts and applies one workspace reset", () => {
  vi.useFakeTimers();

  const clearMissingOnboardingAttempts = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();

  const { rerender } = renderHook(
    ({ accountName }: { accountName: string | null }) =>
      useChatWorkspaceReset<
        { id: string },
        { id: string },
        { id: string },
        ToneInputs,
        StrategyInputs,
        string,
        { id: string },
        { id: string },
        { id: string },
        string
      >(
        buildResetOptions({
          accountName,
          clearMissingOnboardingAttempts,
          setContext,
          setContract,
        }),
      ),
    {
      initialProps: {
        accountName: "stanley",
      },
    },
  );

  act(() => {
    vi.runAllTimers();
  });

  expect(clearMissingOnboardingAttempts).toHaveBeenCalledTimes(1);
  expect(setContext).toHaveBeenCalledTimes(1);
  expect(setContract).toHaveBeenCalledTimes(1);

  rerender({
    accountName: "stanley",
  });

  act(() => {
    vi.runAllTimers();
  });

  expect(clearMissingOnboardingAttempts).toHaveBeenCalledTimes(1);
  expect(setContext).toHaveBeenCalledTimes(1);
  expect(setContract).toHaveBeenCalledTimes(1);

  rerender({
    accountName: "casey",
  });

  act(() => {
    vi.runAllTimers();
  });

  expect(clearMissingOnboardingAttempts).toHaveBeenCalledTimes(2);
  expect(setContext).toHaveBeenCalledTimes(2);
  expect(setContract).toHaveBeenCalledTimes(2);

  vi.useRealTimers();
});
