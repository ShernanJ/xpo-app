import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useThreadHistoryHydration } from "./useThreadHistoryHydration";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  threadId?: string;
  createdAt?: string;
  feedbackValue?: "up" | "down" | null;
}

function createThreadResponse(messages: Array<Record<string, unknown>>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: {
        messages,
      },
    }),
  } as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function buildOptions(
  overrides: Partial<{
    accountName: string | null;
    activeThreadId: string | null;
    activeStrategyInputs: unknown;
    activeToneInputs: unknown;
    context: unknown;
    contract: unknown;
    fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    isSending: boolean;
    jumpThreadToBottomImmediately: () => void;
    searchParamsKey: string;
    setIsThreadHydrating: (value: boolean) => void;
    setMessages: (messages: ChatMessage[]) => void;
    shouldJumpToBottomAfterThreadSwitchRef: { current: boolean };
    threadCreatedInSessionRef: { current: boolean };
  }> = {},
) {
  return {
    accountName: overrides.accountName ?? "stanley",
    activeThreadId: overrides.activeThreadId ?? "thread-1",
    activeStrategyInputs: overrides.activeStrategyInputs ?? { goal: "followers" },
    activeToneInputs: overrides.activeToneInputs ?? { tone: "bold" },
    context: overrides.context ?? { id: "context-1" },
    contract: overrides.contract ?? { id: "contract-1" },
    fetchWorkspace: overrides.fetchWorkspace ?? vi.fn(async () => createThreadResponse([])),
    isSending: overrides.isSending ?? false,
    jumpThreadToBottomImmediately:
      overrides.jumpThreadToBottomImmediately ?? vi.fn(),
    searchParamsKey: overrides.searchParamsKey ?? "",
    setIsThreadHydrating: overrides.setIsThreadHydrating ?? vi.fn(),
    setMessages: overrides.setMessages ?? vi.fn(),
    shouldJumpToBottomAfterThreadSwitchRef:
      overrides.shouldJumpToBottomAfterThreadSwitchRef ?? { current: false },
    threadCreatedInSessionRef:
      overrides.threadCreatedInSessionRef ?? { current: false },
  };
}

test("fetches thread history once when hydration prerequisites are ready", async () => {
  const fetchWorkspace = vi.fn(async () =>
    createThreadResponse([
      {
        id: "assistant-1",
        role: "assistant",
        content: "hello",
      },
    ]),
  );
  const setMessages = vi.fn();
  const setIsThreadHydrating = vi.fn();

  renderHook(() =>
    useThreadHistoryHydration<ChatMessage>(
      buildOptions({
        fetchWorkspace,
        setMessages,
        setIsThreadHydrating,
      }),
    ),
  );

  await waitFor(() => {
    expect(fetchWorkspace).toHaveBeenCalledWith(
      "/api/creator/v2/threads/thread-1",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  expect(setMessages).toHaveBeenCalledWith([
    {
      id: "assistant-1",
      role: "assistant",
      content: "hello",
      createdAt: undefined,
      threadId: "thread-1",
      feedbackValue: null,
    },
  ]);
  expect(setIsThreadHydrating).toHaveBeenCalledWith(false);
});

test("skips thread hydration for threads created in the current session", async () => {
  const fetchWorkspace = vi.fn(async () => createThreadResponse([]));
  const setIsThreadHydrating = vi.fn();

  renderHook(() =>
    useThreadHistoryHydration<ChatMessage>(
      buildOptions({
        fetchWorkspace,
        setIsThreadHydrating,
        threadCreatedInSessionRef: { current: true },
      }),
    ),
  );

  await waitFor(() => {
    expect(setIsThreadHydrating).toHaveBeenCalledWith(false);
  });

  expect(fetchWorkspace).not.toHaveBeenCalled();
});

test("ignores stale thread responses after switching threads and only jumps for the latest one", async () => {
  const firstResponse = createDeferred<Response>();
  const secondResponse = createDeferred<Response>();
  const fetchWorkspace = vi.fn((input: RequestInfo | URL) => {
    if (String(input).endsWith("/thread-1")) {
      return firstResponse.promise;
    }

    return secondResponse.promise;
  });
  const setMessages = vi.fn();
  const jumpThreadToBottomImmediately = vi.fn();
  const requestAnimationFrameSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  const shouldJumpToBottomAfterThreadSwitchRef = { current: true };

  const { rerender } = renderHook(
    ({ activeThreadId }: { activeThreadId: string | null }) =>
      useThreadHistoryHydration<ChatMessage>(
        buildOptions({
          activeThreadId,
          fetchWorkspace,
          setMessages,
          jumpThreadToBottomImmediately,
          shouldJumpToBottomAfterThreadSwitchRef,
        }),
      ),
    {
      initialProps: {
        activeThreadId: "thread-1",
      },
    },
  );

  rerender({
    activeThreadId: "thread-2",
  });

  await act(async () => {
    firstResponse.resolve(
      createThreadResponse([
        {
          id: "assistant-old",
          role: "assistant",
          content: "stale",
        },
      ]),
    );
    await Promise.resolve();
  });

  expect(setMessages).not.toHaveBeenCalled();

  await act(async () => {
    secondResponse.resolve(
      createThreadResponse([
        {
          id: "assistant-new",
          role: "assistant",
          content: "fresh",
        },
      ]),
    );
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(setMessages).toHaveBeenCalledWith([
      {
        id: "assistant-new",
        role: "assistant",
        content: "fresh",
        createdAt: undefined,
        threadId: "thread-2",
        feedbackValue: null,
      },
    ]);
  });

  expect(jumpThreadToBottomImmediately).toHaveBeenCalledTimes(1);
  expect(shouldJumpToBottomAfterThreadSwitchRef.current).toBe(false);

  requestAnimationFrameSpy.mockRestore();
});

test("ignores late thread history responses after unmount", async () => {
  const deferredResponse = createDeferred<Response>();
  const fetchWorkspace = vi.fn(async () => deferredResponse.promise);
  const setMessages = vi.fn();

  const { unmount } = renderHook(() =>
    useThreadHistoryHydration<ChatMessage>(
      buildOptions({
        fetchWorkspace,
        setMessages,
      }),
    ),
  );

  unmount();

  await act(async () => {
    deferredResponse.resolve(
      createThreadResponse([
        {
          id: "assistant-1",
          role: "assistant",
          content: "late",
        },
      ]),
    );
    await Promise.resolve();
  });

  expect(setMessages).not.toHaveBeenCalled();
});
