import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { readQueuedInitialPrompt } from "@/lib/chat/workspaceStartupSession";
import { useQueuedInitialPrompt } from "./useQueuedInitialPrompt";

beforeEach(() => {
  window.sessionStorage.clear();
});

test("queues one initial prompt, restores it from session storage, and auto-sends when ready", async () => {
  const onInlineNotice = vi.fn();
  const submitPrompt = vi.fn(async (_prompt: string) => undefined);

  const { result, rerender } = renderHook(
    ({ canAutoSend }: { canAutoSend: boolean }) =>
      useQueuedInitialPrompt({
        accountName: "Shernanj",
        canAutoSend,
        onInlineNotice,
        submitPrompt,
      }),
    {
      initialProps: {
        canAutoSend: false,
      },
    },
  );

  act(() => {
    const queueResult = result.current.queueInitialPrompt("  write a post  ", "composer");
    expect(queueResult.status).toBe("queued");
  });

  expect(readQueuedInitialPrompt("shernanj")).toEqual({
    handle: "shernanj",
    prompt: "write a post",
    source: "composer",
    createdAt: expect.any(String),
  });

  rerender({
    canAutoSend: false,
  });

  expect(result.current.hasQueuedInitialPrompt).toBe(true);

  rerender({
    canAutoSend: true,
  });

  await waitFor(() => {
    expect(submitPrompt).toHaveBeenCalledWith("write a post");
  });

  expect(readQueuedInitialPrompt("shernanj")).toBeNull();
});

test("allows only one queued initial prompt at a time", () => {
  const onInlineNotice = vi.fn();
  const submitPrompt = vi.fn(async (_prompt: string) => undefined);

  const { result } = renderHook(() =>
    useQueuedInitialPrompt({
      accountName: "Shernanj",
      canAutoSend: false,
      onInlineNotice,
      submitPrompt,
    }),
  );

  act(() => {
    expect(result.current.queueInitialPrompt("write a post", "composer").status).toBe("queued");
  });

  act(() => {
    expect(result.current.queueInitialPrompt("write a thread", "quick_action").status).toBe(
      "already_queued",
    );
  });

  expect(readQueuedInitialPrompt("shernanj")?.prompt).toBe("write a post");
  expect(submitPrompt).not.toHaveBeenCalled();
});
