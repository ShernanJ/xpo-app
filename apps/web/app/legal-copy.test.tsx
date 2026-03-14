import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/components/back-home-button", () => ({
  BackHomeButton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="back-home-button" />
  ),
}));

vi.mock("@/components/legal-footer", () => ({
  LegalFooter: ({ className }: { className?: string }) => (
    <div className={className} data-testid="legal-footer" />
  ),
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

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;
  vi.resetModules();
});

test("terms removes monetization references when the feature is disabled", async () => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;

  const { default: TermsPage } = await import("./terms/page");

  render(<TermsPage />);

  expect(screen.getByRole("heading", { name: "3. Service access and limits" })).toBeVisible();
  expect(screen.queryByText("3. Plans, billing, and credits")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Refund Policy" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument();
});

test("privacy removes billing wording when the feature is disabled", async () => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;

  const { default: PrivacyPage } = await import("./privacy/page");

  render(<PrivacyPage />);

  expect(screen.getByText(/Privacy questions:/i)).toBeVisible();
  expect(screen.queryByText(/Privacy or billing questions:/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument();
});
