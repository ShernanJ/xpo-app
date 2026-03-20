import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const searchParamMocks = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

const loginNavigationMocks = vi.hoisted(() => ({
  navigateToPostLoginDestination: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamMocks.value,
}));

vi.mock("@/app/login/_components/loginNavigation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/app/login/_components/loginNavigation")
  >();
  return {
    ...actual,
    navigateToPostLoginDestination:
      loginNavigationMocks.navigateToPostLoginDestination,
  };
});

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: (headers?: HeadersInit) => headers,
  capturePostHogEvent: vi.fn(),
  capturePostHogException: vi.fn(),
}));

import GoogleOAuthCallbackPage from "./page";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  searchParamMocks.value = new URLSearchParams(
    "callbackUrl=%2Fchat&state=state_123",
  );
  window.location.hash = "#access_token=access_token_123";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.location.hash = "";
});

test("shows a retry state when session finalization times out", async () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          },
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<GoogleOAuthCallbackPage />);

  expect(screen.getByText("Connecting your account")).toBeVisible();

  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.resolve();
  });

  expect(screen.getByText("Sign-in needs another try")).toBeVisible();
  expect(
    screen.getByText("Google sign-in is taking too long. Please try again."),
  ).toBeVisible();
  expect(loginNavigationMocks.navigateToPostLoginDestination).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/oauth/google/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    signal: expect.any(AbortSignal),
    body: JSON.stringify({
      accessToken: "access_token_123",
      state: "state_123",
    }),
  });
});
