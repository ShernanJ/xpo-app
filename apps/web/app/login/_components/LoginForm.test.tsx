import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const searchParamMocks = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.push,
    refresh: navigationMocks.refresh,
  }),
  useSearchParams: () => searchParamMocks.value,
}));

vi.mock("@/lib/auth/client", () => ({
  signIn: authMocks.signIn,
}));

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: (headers?: HeadersInit) => headers,
  capturePostHogEvent: vi.fn(),
  capturePostHogException: vi.fn(),
  identifyPostHogUser: vi.fn(),
}));

import { LoginForm } from "./LoginForm";

beforeEach(() => {
  navigationMocks.push.mockReset();
  navigationMocks.refresh.mockReset();
  authMocks.signIn.mockReset();
  searchParamMocks.value = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders labelled auth fields and supports password reveal", async () => {
  const user = userEvent.setup();

  render(<LoginForm />);

  const emailInput = screen.getByLabelText("Email");
  const passwordInput = screen.getByLabelText("Password");

  expect(emailInput).toHaveAttribute("type", "email");
  expect(passwordInput).toHaveAttribute("type", "password");

  await user.click(screen.getByRole("button", { name: "Show password" }));

  expect(passwordInput).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Hide password" })).toBeVisible();
});

test("logs in with xHandle by attaching the handle before redirecting to chat without waiting for onboarding", async () => {
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
  authMocks.signIn.mockResolvedValue({
    ok: true,
    status: 200,
    url: null,
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<LoginForm />);

  await user.type(screen.getByLabelText("Email"), "stan@example.com");
  await user.type(screen.getByLabelText("Password"), "super-secret");
  await user.click(screen.getByRole("button", { name: "Continue as @Stan" }));

  await waitFor(() => {
    expect(authMocks.signIn).toHaveBeenCalledWith("credentials", {
      email: "stan@example.com",
      password: "super-secret",
      redirect: false,
    });
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/creator/profile/handles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: "stan" }),
  });
  expect(navigationMocks.push).not.toHaveBeenCalled();

  handleAttachDeferred.resolve({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  } as Response);

  await waitFor(() => {
    expect(navigationMocks.push).toHaveBeenCalledWith("/chat?threadId=thread-1&xHandle=stan");
  });
  expect(navigationMocks.refresh).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
