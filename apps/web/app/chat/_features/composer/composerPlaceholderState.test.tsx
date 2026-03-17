import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useComposerPlaceholderState } from "./composerPlaceholderState";

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("rotates placeholder prompts until paused", () => {
  mockReducedMotion(false);

  const { result, rerender } = renderHook(
    ({ isPaused }) =>
      useComposerPlaceholderState({
        prompts: ["write a post", "write a thread", "grow on x"],
        isPaused,
        intervalMs: 100,
      }),
    {
      initialProps: { isPaused: false },
    },
  );

  expect(result.current.activePlaceholder).toBe("write a post");
  expect(result.current.shouldAnimatePlaceholder).toBe(true);

  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(result.current.activePlaceholder).toBe("write a thread");

  rerender({ isPaused: true });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(result.current.activePlaceholder).toBe("write a thread");
  expect(result.current.shouldAnimatePlaceholder).toBe(false);

  rerender({ isPaused: false });
  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(result.current.activePlaceholder).toBe("grow on x");
});

test("disables rotation when reduced motion is preferred", () => {
  mockReducedMotion(true);

  const { result } = renderHook(() =>
    useComposerPlaceholderState({
      prompts: ["write a post", "write a thread"],
      isPaused: false,
      intervalMs: 100,
    }),
  );

  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(result.current.activePlaceholder).toBe("write a post");
  expect(result.current.shouldAnimatePlaceholder).toBe(false);
});
