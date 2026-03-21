import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capturePostHogEvent: vi.fn(),
  capturePostHogException: vi.fn(),
  markHandleJustOnboarded: vi.fn(),
  sessionStatus: "authenticated",
  sessionUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user_1",
      },
    },
    status: mocks.sessionStatus,
    update: mocks.sessionUpdate,
  }),
}));

vi.mock("@/lib/billing/monetization", () => ({
  isMonetizationEnabled: () => false,
}));

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: () => ({}),
  capturePostHogEvent: mocks.capturePostHogEvent,
  capturePostHogException: mocks.capturePostHogException,
}));

vi.mock("@/lib/chat/workspaceStartupSession", () => ({
  markHandleJustOnboarded: mocks.markHandleJustOnboarded,
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    ...props
  }: {
    alt: string;
    src: string;
  }) => <img alt={alt} src={src} {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy({} as typeof import("framer-motion").motion, {
    get: (_target, tagName: string) =>
      (({
        animate: _animate,
        exit: _exit,
        initial: _initial,
        transition: _transition,
        variants: _variants,
        viewport: _viewport,
        whileHover: _whileHover,
        whileInView: _whileInView,
        children,
        ...props
      }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) => {
        const Component = tagName as ElementType;
        return <Component {...props}>{children}</Component>;
      }) as ElementType,
  }),
}));

import OnboardingLanding from "./OnboardingLanding";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.sessionStatus = "authenticated";
  mocks.sessionUpdate.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation((message) => {
    if (
      typeof message === "string" &&
      (message.includes("Received `true` for a non-boolean attribute `jsx`") ||
        message.includes("Received `true` for a non-boolean attribute `global`") ||
        message.includes("Not implemented: navigation to another Document"))
    ) {
      return;
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("submits authenticated onboarding as a queued job and completes through polling", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          account: "stan",
          preview: {
            username: "stan",
            name: "Stan",
            bio: "builder",
            avatarUrl: null,
            headerImageUrl: null,
            isVerified: false,
            followersCount: 1200,
            followingCount: 140,
            createdAt: "2020-01-01T00:00:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          status: "queued",
          jobId: "job_123",
          account: "stan",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          status: "completed",
          jobId: "job_123",
          account: "stan",
          runId: "or_job_123",
          persistedAt: "2026-03-20T00:00:00.000Z",
          backfill: {
            queued: false,
            jobId: null,
            deduped: false,
          },
          data: {
            account: "stan",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);

  render(<OnboardingLanding pricingOffers={[]} />);

  fireEvent.change(screen.getByLabelText(/x username/i), {
    target: { value: "stan" },
  });

  await act(async () => {
    vi.advanceTimersByTime(850);
  });

  expect(screen.getByText("@stan")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: /analyze my x/i }));

  await act(async () => {
    vi.advanceTimersByTime(1100);
  });

  await act(async () => {
    vi.advanceTimersByTime(700);
  });

  await act(async () => {
    vi.advanceTimersByTime(5000);
  });

  expect(mocks.sessionUpdate).toHaveBeenCalledTimes(1);
  expect(mocks.markHandleJustOnboarded).toHaveBeenCalledWith("stan");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/onboarding/run",
    expect.objectContaining({
      method: "POST",
    }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "/api/onboarding/jobs/job_123",
    expect.objectContaining({
      method: "GET",
    }),
  );
});
