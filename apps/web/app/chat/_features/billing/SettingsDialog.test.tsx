import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

function buildProps(overrides: Partial<ComponentProps<typeof SettingsDialog>> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    monetizationEnabled: true,
    planStatusLabel: "Active",
    settingsPlanLabel: "Pro Monthly",
    rateLimitResetLabel: "Mar 20, 12:00 PM",
    isOpeningBillingPortal: false,
    onOpenBillingPortal: vi.fn(),
    showRateLimitUpgradeCta: true,
    rateLimitUpgradeLabel: "Upgrade to Pro",
    onOpenPricing: vi.fn(),
    settingsCreditsRemaining: 120,
    settingsCreditsUsed: 30,
    settingsCreditLimit: 150,
    settingsCreditsRemainingPercent: 80,
    supportEmail: "support@example.com",
    onSignOut: vi.fn(),
    ...overrides,
  };
}

test("shows billing sections when monetization is enabled", () => {
  render(<SettingsDialog {...buildProps()} />);

  expect(screen.getByRole("heading", { name: "Account & Billing" })).toBeVisible();
  expect(screen.getByText("Current plan")).toBeVisible();
  expect(screen.getByText("Usage")).toBeVisible();
  expect(screen.getByRole("button", { name: /manage billing/i })).toBeVisible();
});

test("hides billing sections when monetization is disabled", () => {
  render(
    <SettingsDialog
      {...buildProps({
        monetizationEnabled: false,
      })}
    />,
  );

  expect(screen.getByRole("heading", { name: "Account Settings" })).toBeVisible();
  expect(screen.getByText("Monetization is currently off")).toBeVisible();
  expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
  expect(screen.queryByText("Usage")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /manage billing/i })).not.toBeInTheDocument();
});
