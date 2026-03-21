import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useChatRuntimeState } from "./useChatRuntimeState";

function createBackfillResponse(args: {
  status: "pending" | "processing" | "completed" | "failed";
  lastError?: string | null;
  nextJobId?: string | null;
  phase?: "primer" | "archive" | null;
  jobId?: string;
}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      job: {
        jobId: args.jobId ?? "job-1",
        status: args.status,
        lastError: args.lastError ?? null,
        nextJobId: args.nextJobId ?? null,
        phase: args.phase ?? null,
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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("cleans up the hero exit timeout on unmount", () => {
  vi.useFakeTimers();

  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
  const { result, unmount } = renderHook(() =>
    useChatRuntimeState({
      backfillJobId: "",
      messagesLength: 1,
      loadWorkspace: vi.fn().mockResolvedValue(undefined),
    }),
  );

  act(() => {
    result.current.setIsLeavingHero(true);
  });

  unmount();

  expect(clearTimeoutSpy).toHaveBeenCalled();

  clearTimeoutSpy.mockRestore();
  vi.useRealTimers();
});

test("stops backfill polling after completion and reloads the workspace once", async () => {
  vi.useFakeTimers();

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(createBackfillResponse({ status: "processing" }))
    .mockResolvedValueOnce(createBackfillResponse({ status: "completed" }));
  const loadWorkspace = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useChatRuntimeState({
      backfillJobId: "job-1",
      messagesLength: 0,
      loadWorkspace,
    }),
  );

  await flushMicrotasks();

  expect(result.current.backfillNotice).toBe("Background backfill is deepening the model.");
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.backfillNotice).toBe("Background backfill completed. Context refreshed.");
  expect(loadWorkspace).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  await act(async () => {
    vi.advanceTimersByTime(15000);
    await Promise.resolve();
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);

  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("stops backfill polling after a failed job without reloading the workspace", async () => {
  vi.useFakeTimers();

  const fetchMock = vi.fn().mockResolvedValue(
    createBackfillResponse({
      status: "failed",
      lastError: "provider timeout",
    }),
  );
  const loadWorkspace = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useChatRuntimeState({
      backfillJobId: "job-1",
      messagesLength: 0,
      loadWorkspace,
    }),
  );

  await flushMicrotasks();

  expect(result.current.backfillNotice).toBe("Background backfill failed: provider timeout");

  await act(async () => {
    vi.advanceTimersByTime(15000);
    await Promise.resolve();
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(loadWorkspace).not.toHaveBeenCalled();

  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("hands polling off from primer to archive jobs", async () => {
  vi.useFakeTimers();

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      createBackfillResponse({
        jobId: "job-1",
        status: "completed",
        nextJobId: "job-2",
        phase: "primer",
      }),
    )
    .mockResolvedValueOnce(
      createBackfillResponse({
        jobId: "job-2",
        status: "processing",
        phase: "archive",
      }),
    );
  const loadWorkspace = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useChatRuntimeState({
      backfillJobId: "job-1",
      messagesLength: 0,
      loadWorkspace,
    }),
  );

  await flushMicrotasks();
  await flushMicrotasks();

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/onboarding/backfill/jobs?jobId=job-1",
    { method: "GET" },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/onboarding/backfill/jobs?jobId=job-2",
    { method: "GET" },
  );
  expect(result.current.backfillNotice).toBe("Background archive is deepening the model.");
  expect(loadWorkspace).not.toHaveBeenCalled();

  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("uses the latest loadWorkspace callback for a completed backfill without restarting polling", async () => {
  const deferredFetch = createDeferred<Response>();
  const fetchMock = vi.fn().mockImplementation(async () => deferredFetch.promise);
  const initialLoadWorkspace = vi.fn().mockResolvedValue(undefined);
  const rerenderLoadWorkspace = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("fetch", fetchMock);

  const { rerender } = renderHook(
    ({ loadWorkspace }: { loadWorkspace: () => Promise<unknown> }) =>
      useChatRuntimeState({
        backfillJobId: "job-1",
        messagesLength: 0,
        loadWorkspace,
      }),
    {
      initialProps: {
        loadWorkspace: initialLoadWorkspace,
      },
    },
  );

  rerender({
    loadWorkspace: rerenderLoadWorkspace,
  });

  await act(async () => {
    deferredFetch.resolve(createBackfillResponse({ status: "completed" }));
    await Promise.resolve();
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(initialLoadWorkspace).not.toHaveBeenCalled();
  expect(rerenderLoadWorkspace).toHaveBeenCalledTimes(1);

  vi.unstubAllGlobals();
});
