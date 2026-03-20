import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const searchParamMocks = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

const authMocks = vi.hoisted(() => ({
  requestEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));

const loginNavigationMocks = vi.hoisted(() => ({
  navigateToPostLoginDestination: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamMocks.value,
}));

vi.mock("@/lib/auth/client", () => ({
  requestEmailCode: authMocks.requestEmailCode,
  verifyEmailCode: authMocks.verifyEmailCode,
}));

vi.mock("./loginNavigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./loginNavigation")>();
  return {
    ...actual,
    navigateToPostLoginDestination: loginNavigationMocks.navigateToPostLoginDestination,
  };
});

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: (headers?: HeadersInit) => headers,
  capturePostHogEvent: vi.fn(),
  capturePostHogException: vi.fn(),
  identifyPostHogUser: vi.fn(),
}));

import { LoginForm } from "./LoginForm";

beforeEach(() => {
  authMocks.requestEmailCode.mockReset();
  authMocks.verifyEmailCode.mockReset();
  loginNavigationMocks.navigateToPostLoginDestination.mockReset();
  searchParamMocks.value = new URLSearchParams();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("renders an email-only auth form", () => {
  render(<LoginForm />);

  const emailInput = screen.getByLabelText("Email");
  const googleLink = screen.getByRole("link", { name: "Continue with Google" });

  expect(emailInput).toHaveAttribute("type", "email");
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send code" })).toBeVisible();
  expect(googleLink).toHaveAttribute("href", "/api/auth/oauth/google/start?callbackUrl=%2Fchat");
});

test("requests a verification code and transitions to the verification step", async () => {
  const user = userEvent.setup();

  authMocks.requestEmailCode.mockResolvedValue({
    ok: true,
    status: 200,
    user: undefined,
  });

  render(<LoginForm />);

  await user.type(screen.getByLabelText("Email"), "Stan@Example.com");
  await user.click(screen.getByRole("button", { name: "Send code" }));

  await waitFor(() => {
    expect(authMocks.requestEmailCode).toHaveBeenCalledWith({
      email: "stan@example.com",
    });
  });

  expect(await screen.findByLabelText("Verification Code")).toBeVisible();
  expect(screen.getByText("stan@example.com")).toBeVisible();
});

test("verifies the code and attaches xHandle before redirecting to chat without waiting for onboarding", async () => {
  const user = userEvent.setup();
  const handleAttachDeferred = Promise.withResolvers<Response>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (input === "/api/creator/profile/handles") {
      return handleAttachDeferred.promise;
    }

    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });

  searchParamMocks.value = new URLSearchParams(
    "xHandle=Stan&callbackUrl=%2Fchat%3FthreadId%3Dthread-1",
  );
  authMocks.requestEmailCode.mockResolvedValue({
    ok: true,
    status: 200,
    user: undefined,
  });
  authMocks.verifyEmailCode.mockResolvedValue({
    ok: true,
    status: 200,
    user: {
      id: "user-1",
      email: "stan@example.com",
      handle: null,
      activeXHandle: null,
    },
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<LoginForm />);

  await user.type(screen.getByLabelText("Email"), "stan@example.com");
  await user.click(screen.getByRole("button", { name: "Send code" }));

  await waitFor(() => {
    expect(authMocks.requestEmailCode).toHaveBeenCalledWith({
      email: "stan@example.com",
    });
  });

  await user.type(screen.getByLabelText("Verification Code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify code" }));

  await waitFor(() => {
    expect(authMocks.verifyEmailCode).toHaveBeenCalledWith({
      email: "stan@example.com",
      code: "123456",
    });
  });

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/creator/profile/handles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "stan" }),
    });
  });
  expect(loginNavigationMocks.navigateToPostLoginDestination).not.toHaveBeenCalled();

  handleAttachDeferred.resolve({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  } as Response);

  await waitFor(() => {
    expect(loginNavigationMocks.navigateToPostLoginDestination).toHaveBeenCalledWith(
      "/chat?threadId=thread-1&xHandle=stan",
    );
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("includes callback and xHandle in the Google sign-in link", () => {
  searchParamMocks.value = new URLSearchParams(
    "xHandle=Stan&callbackUrl=%2Fchat%3FthreadId%3Dthread-1",
  );

  render(<LoginForm />);

  expect(
    screen.getByRole("link", { name: "Continue with Google" }),
  ).toHaveAttribute(
    "href",
    "/api/auth/oauth/google/start?callbackUrl=%2Fchat%3FthreadId%3Dthread-1&xHandle=stan",
  );
});
