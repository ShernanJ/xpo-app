import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import OnboardingLanding from "./OnboardingLanding";

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({
    data: null,
    status: "unauthenticated",
    update: vi.fn(),
  }),
}));

vi.mock("@/lib/billing/monetization", () => ({
  isMonetizationEnabled: () => false,
}));

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: () => ({}),
  capturePostHogEvent: vi.fn(),
  capturePostHogException: vi.fn(),
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

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, "error").mockImplementation((message) => {
    if (
      typeof message === "string" &&
      (message.includes("Received `true` for a non-boolean attribute `jsx`") ||
        message.includes("Received `true` for a non-boolean attribute `global`"))
    ) {
      return;
    }
  });
});

test("faq cards toggle from the full card control and keep multi-open behavior", async () => {
  const user = userEvent.setup();

  render(<OnboardingLanding pricingOffers={[]} />);

  expect(screen.getByRole("button", { name: /how does onboarding work\?/i })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: /will it sound like me\?/i })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("button", { name: /do i need the extension\?/i })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    screen.getByText(/enter your x handle and xpo maps your profile \+ post signals/i),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: /will it sound like me\?/i }));

  expect(screen.getByRole("button", { name: /will it sound like me\?/i })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByText(/yes\. xpo biases toward your voice patterns and constraints/i),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /how does onboarding work\?/i })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await user.click(screen.getByRole("button", { name: /will it sound like me\?/i }));

  expect(screen.getByRole("button", { name: /will it sound like me\?/i })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    screen.queryByText(/yes\. xpo biases toward your voice patterns and constraints/i),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /how does onboarding work\?/i })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await user.click(screen.getByRole("button", { name: /do i need the extension\?/i }));

  expect(screen.getByRole("button", { name: /do i need the extension\?/i })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    screen.getByText(/the extension is optional for faster in-feed reply execution/i),
  ).toBeVisible();
});
