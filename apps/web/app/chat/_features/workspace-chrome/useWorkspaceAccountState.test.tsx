import type { FormEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";

import { consumeJustOnboardedHandle } from "@/lib/chat/workspaceStartupSession";

import { useWorkspaceAccountState } from "./useWorkspaceAccountState";

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("marks a newly analyzed account as just onboarded before switching into it", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/onboarding/preview")) {
      const payload = {
        ok: true,
        account: "newhandle",
        preview: {
          username: "newhandle",
          name: "New Handle",
          avatarUrl: null,
          followersCount: 1200,
          isVerified: false,
        },
      };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      } as Response;
    }

    if (url === "/api/onboarding/run") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          runId: "run-1",
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.fetch = fetchMock as typeof fetch;

  const setAvailableHandles = vi.fn();
  const { result } = renderHook(() =>
    useWorkspaceAccountState({
      accountName: "stanley",
      requiresXAccountGate: false,
      normalizeAccountHandle: (value) => value.trim().replace(/^@+/, "").toLowerCase(),
      refreshSession: vi.fn(async () => undefined),
      closeAccountMenu: vi.fn(),
      setAvailableHandles,
      buildChatWorkspaceUrl: ({ xHandle }) => `/chat?xHandle=${xHandle ?? ""}`,
      applyBillingSnapshot: vi.fn(),
      onOpenPricing: vi.fn(),
      onErrorMessage: vi.fn(),
      onLoadingChange: vi.fn(),
    }),
  );

  act(() => {
    result.current.openAddAccountModal();
    result.current.updateAddAccountInput("@newhandle");
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
    await Promise.resolve();
  });

  expect(result.current.hasValidAddAccountPreview).toBe(true);

  await act(async () => {
    const submitPromise = result.current.handleAddAccountSubmit({
      preventDefault() {},
    } as FormEvent<HTMLFormElement>);
    await vi.advanceTimersByTimeAsync(2600);
    await submitPromise;
  });

  expect(setAvailableHandles).toHaveBeenCalledWith(expect.any(Function));
  expect(result.current.readyAccountHandle).toBe("newhandle");
  expect(consumeJustOnboardedHandle("newhandle")).toBe(true);
});

test("loads scrape debug data in development", async () => {
  const capture = {
    captureId: "sc_123",
    capturedAt: "2026-03-20T12:00:00.000Z",
    account: "stanley",
    posts: [{ id: "1" }],
    replyPosts: [],
    quotePosts: [],
    metadata: {
      source: "agent",
      userAgent: "test",
    },
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === "/api/creator/profile/scrape?xHandle=growthmode") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          capture: {
            ...capture,
            account: "growthmode",
          },
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  window.fetch = fetchMock as typeof fetch;

  const { result } = renderHook(() =>
    useWorkspaceAccountState({
      accountName: "stanley",
      requiresXAccountGate: false,
      normalizeAccountHandle: (value) => value.trim().replace(/^@+/, "").toLowerCase(),
      refreshSession: vi.fn(async () => undefined),
      closeAccountMenu: vi.fn(),
      setAvailableHandles: vi.fn(),
      buildChatWorkspaceUrl: ({ xHandle }) => `/chat?xHandle=${xHandle ?? ""}`,
      applyBillingSnapshot: vi.fn(),
      onOpenPricing: vi.fn(),
      onErrorMessage: vi.fn(),
      onLoadingChange: vi.fn(),
    }),
  );

  act(() => {
    result.current.openScrapeDebug("growthmode");
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.scrapeDebugCapture).not.toBeNull();
  expect(result.current.isScrapeDebugDialogOpen).toBe(true);
  expect(result.current.scrapeDebugHandle).toBe("growthmode");
});
