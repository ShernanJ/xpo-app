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

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: null }),
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

test("renders pricing content when monetization is enabled", async () => {
  process.env.NEXT_PUBLIC_ENABLE_MONETIZATION = "1";

  const { default: PricingPageContent } = await import("./PricingPageContent");

  render(<PricingPageContent />);

  expect(
    screen.getByRole("heading", { name: /simple pricing\. predictable usage\./i }),
  ).toBeVisible();
  expect(screen.getByRole("radiogroup", { name: "Billing cadence" })).toBeVisible();
});
