"use client";

import { ArrowUpRight, Check, ChevronDown, ChevronRight, Plus } from "lucide-react";

interface AccountMenuPanelProps {
  className: string;
  accountMenuVisible: boolean;
  accountMenuOpen: boolean;
  monetizationEnabled: boolean;
  availableHandles: string[];
  accountName: string | null;
  canAddAccount: boolean;
  onSwitchActiveHandle: (handle: string) => void;
  onOpenAddAccount: () => void;
  onOpenSettings: () => void;
  rateLimitsMenuOpen: boolean;
  onToggleRateLimitsMenu: () => void;
  rateLimitWindowLabel: string;
  rateLimitsRemainingPercent: number | null;
  rateLimitResetLabel: string;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string;
  onOpenPricing: () => void;
}

export function AccountMenuPanel(props: AccountMenuPanelProps) {
  const {
    className,
    accountMenuVisible,
    accountMenuOpen,
    monetizationEnabled,
    availableHandles,
    accountName,
    canAddAccount,
    onSwitchActiveHandle,
    onOpenAddAccount,
    onOpenSettings,
    rateLimitsMenuOpen,
    onToggleRateLimitsMenu,
    rateLimitWindowLabel,
    rateLimitsRemainingPercent,
    rateLimitResetLabel,
    showRateLimitUpgradeCta,
    rateLimitUpgradeLabel,
    onOpenPricing,
  } = props;

  if (!accountMenuVisible) {
    return null;
  }

  return (
    <div
      className={`${className} [&_button:not(:disabled)]:cursor-pointer origin-bottom transition-all duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        accountMenuOpen
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
          : "pointer-events-none translate-y-2 scale-95 opacity-0 blur-[1px]"
      }`}
    >
      <div className="max-h-[200px] overflow-y-auto px-1 py-1">
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          X Accounts
        </p>
        {availableHandles.map((handle) => (
          <button
            key={handle}
            type="button"
            onClick={() => onSwitchActiveHandle(handle)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <span className="truncate">@{handle}</span>
            {handle === accountName ? <Check className="h-4 w-4 text-white" /> : null}
          </button>
        ))}
        <button
          type="button"
          disabled={!canAddAccount}
          onClick={onOpenAddAccount}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          <span>{canAddAccount ? "Add Account" : "Upgrade to add account"}</span>
        </button>
      </div>

      <div className="my-1 h-px bg-white/10" />

      <div className="px-1 py-1">
        <button
          type="button"
          onClick={onOpenSettings}
          className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
        >
          <span>Settings</span>
          <ChevronRight className="h-4 w-4" />
        </button>

        {monetizationEnabled ? (
          <>
            <button
              type="button"
              onClick={onToggleRateLimitsMenu}
              className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>Rate limits remaining</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${rateLimitsMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {rateLimitsMenuOpen ? (
              <div className="mb-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-300">{rateLimitWindowLabel}</span>
                  <span className="font-semibold text-zinc-100">
                    {rateLimitsRemainingPercent !== null ? `${rateLimitsRemainingPercent}%` : "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Resets {rateLimitResetLabel}</p>
                {showRateLimitUpgradeCta ? (
                  <button
                    type="button"
                    onClick={onOpenPricing}
                    className="mt-2 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                  >
                    <span>{rateLimitUpgradeLabel}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
