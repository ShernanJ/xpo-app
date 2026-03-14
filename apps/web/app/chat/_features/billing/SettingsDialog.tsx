"use client";

import { ArrowUpRight, LogOut } from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monetizationEnabled: boolean;
  planStatusLabel: string;
  settingsPlanLabel: string;
  rateLimitResetLabel: string;
  isOpeningBillingPortal: boolean;
  onOpenBillingPortal: () => void;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string;
  onOpenPricing: () => void;
  settingsCreditsRemaining: number;
  settingsCreditsUsed: number;
  settingsCreditLimit: number;
  settingsCreditsRemainingPercent: number | null;
  supportEmail: string;
  onSignOut: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const {
    open,
    onOpenChange,
    monetizationEnabled,
    planStatusLabel,
    settingsPlanLabel,
    rateLimitResetLabel,
    isOpeningBillingPortal,
    onOpenBillingPortal,
    showRateLimitUpgradeCta,
    rateLimitUpgradeLabel,
    onOpenPricing,
    settingsCreditsRemaining,
    settingsCreditsUsed,
    settingsCreditLimit,
    settingsCreditsRemainingPercent,
    supportEmail,
    onSignOut,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="relative my-auto w-full max-w-4xl rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white sm:text-[2rem]">
              {monetizationEnabled ? "Account & Billing" : "Account Settings"}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              {monetizationEnabled
                ? "Review your current plan, usage, and billing actions."
                : "Manage your account session and support details."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
          >
            Close
          </button>
        </div>

        {monetizationEnabled ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Current plan
                </p>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
                  {planStatusLabel}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{settingsPlanLabel}</p>
              <p className="mt-2 text-sm text-zinc-500">Cycle resets {rateLimitResetLabel}</p>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isOpeningBillingPortal}
                  onClick={onOpenBillingPortal}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isOpeningBillingPortal ? "Opening…" : "Manage Billing"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                {showRateLimitUpgradeCta ? (
                  <button
                    type="button"
                    onClick={onOpenPricing}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
                  >
                    {rateLimitUpgradeLabel}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <div className="rounded-full border border-white/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Founder plan active
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Usage
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Remaining
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {settingsCreditsRemaining.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Used</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {settingsCreditsUsed.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Limit</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {settingsCreditLimit.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white/75 transition-all"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, settingsCreditsRemainingPercent ?? 0),
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  {settingsCreditsRemainingPercent !== null
                    ? `${settingsCreditsRemainingPercent}% remaining`
                    : "Usage loading"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Session
            </p>
            <p className="mt-3 text-lg font-semibold text-white">Monetization is currently off</p>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Plans, credits, and billing controls are hidden until monetization is enabled for
              this environment.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-xs text-zinc-500">
            {monetizationEnabled ? "Need billing help?" : "Need help?"} {supportEmail}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-200 transition hover:bg-rose-300/10 hover:text-rose-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
