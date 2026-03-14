"use client";

import { Sparkles } from "lucide-react";

import {
  DEFAULT_MODAL_LIFETIME_CENTS,
  MODAL_FREE_APPROX_CHAT_TURNS,
  MODAL_FREE_APPROX_DRAFT_TURNS,
  MODAL_FREE_CREDITS_PER_MONTH,
  MODAL_PRO_APPROX_CHAT_TURNS,
  MODAL_PRO_APPROX_DRAFT_TURNS,
  MODAL_PRO_CREDITS_PER_MONTH,
  formatUsdPrice,
} from "./billingViewState";

interface PricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPricingPage: () => void;
  dismissLabel: string;
  selectedModalProIsAnnual: boolean;
  selectedModalProCents: number;
  selectedModalProPriceSuffix: string;
  setSelectedModalProCadence: (cadence: "monthly" | "annual") => void;
  isProActive: boolean;
  isFounderCurrent: boolean;
  selectedModalProIsCurrent: boolean;
  selectedModalProNeedsPortalSwitch: boolean;
  selectedModalProOfferEnabled: boolean;
  selectedModalProButtonLabel: string;
  isSelectedModalProCheckoutLoading: boolean;
  isOpeningBillingPortal: boolean;
  onOpenBillingPortal: () => void;
  onOpenCheckout: (offer: "pro_monthly" | "pro_annual" | "lifetime") => void;
  selectedModalProOffer: "pro_monthly" | "pro_annual";
  lifetimeAmountCents: number;
  lifetimeSlotSummary:
    | {
        total: number;
        sold: number;
        reserved: number;
        remaining: number;
      }
    | null;
  lifetimeOfferEnabled: boolean;
  supportEmail: string;
}

export function PricingDialog(props: PricingDialogProps) {
  const {
    open,
    onOpenChange,
    onOpenPricingPage,
    dismissLabel,
    selectedModalProIsAnnual,
    selectedModalProCents,
    selectedModalProPriceSuffix,
    setSelectedModalProCadence,
    isProActive,
    isFounderCurrent,
    selectedModalProIsCurrent,
    selectedModalProNeedsPortalSwitch,
    selectedModalProOfferEnabled,
    selectedModalProButtonLabel,
    isSelectedModalProCheckoutLoading,
    isOpeningBillingPortal,
    onOpenBillingPortal,
    onOpenCheckout,
    selectedModalProOffer,
    lifetimeAmountCents,
    lifetimeSlotSummary,
    lifetimeOfferEnabled,
    supportEmail,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/85 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="relative my-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl">
        <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -right-14 top-24 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl animate-pulse" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Pricing
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Choose your plan</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Credits keep usage predictable. Start free, then upgrade when you need more scale.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPricingPage}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
            >
              More details
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
            >
              {dismissLabel}
            </button>
          </div>
        </div>

        <div className="relative mt-6 grid gap-4 md:grid-cols-3">
          <article className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Free
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">$0</p>
            <p className="mt-2 text-sm text-zinc-400">Try it in minutes. No card required.</p>
            <p className="mt-3 text-xs text-zinc-500">
              {MODAL_FREE_CREDITS_PER_MONTH} credits / month
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-zinc-300">
              <p>• Core chat + onboarding</p>
              <p>• Draft analysis: Analyze</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>
                • ≈ {MODAL_FREE_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                {MODAL_FREE_APPROX_DRAFT_TURNS} draft/review turns
              </p>
            </div>
          </article>

          <article className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/[0.05] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_14px_36px_rgba(255,255,255,0.1)]">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl transition-opacity duration-300 group-hover:opacity-90" />
            <div className="flex items-start justify-between gap-3">
              <p className="inline-flex whitespace-nowrap rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
                {isProActive ? "Current plan" : "Most popular"}
              </p>
              <div className="flex flex-col items-end gap-1">
                <div className="relative inline-flex w-full max-w-[172px] rounded-full border border-white/20 bg-black/35 p-0.5">
                  <span
                    className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-white transition-transform duration-200 ${
                      selectedModalProIsAnnual ? "translate-x-full" : "translate-x-0"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedModalProCadence("monthly")}
                    className={`relative z-10 flex-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                      selectedModalProIsAnnual ? "text-zinc-300 hover:text-white" : "text-black"
                    }`}
                  >
                    Monthly
                  </button>
                  <div className="relative z-10 flex-1">
                    <button
                      type="button"
                      onClick={() => setSelectedModalProCadence("annual")}
                      className={`w-full rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                        selectedModalProIsAnnual ? "text-black" : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      Annual
                    </button>
                  </div>
                  <span className="pointer-events-none absolute left-3/4 top-full z-20 mt-1 w-max -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/35 bg-emerald-400/10 px-1.5 py-[3px] text-[7px] font-semibold uppercase leading-none tracking-[0.1em] text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.25)]">
                    2 months free
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
              Pro
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatUsdPrice(selectedModalProCents)}
              <span className="text-sm font-medium text-zinc-400">
                {selectedModalProPriceSuffix}
              </span>
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Best for consistent creators. Save more with annual billing.
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-zinc-200">
              <p>• {MODAL_PRO_CREDITS_PER_MONTH} credits/month</p>
              <p>• Draft analysis: Analyze + Compare</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>
                • ≈ {MODAL_PRO_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                {MODAL_PRO_APPROX_DRAFT_TURNS} draft/review turns
              </p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  if (isFounderCurrent || selectedModalProIsCurrent) {
                    return;
                  }
                  if (selectedModalProNeedsPortalSwitch) {
                    onOpenBillingPortal();
                    return;
                  }
                  onOpenCheckout(selectedModalProOffer);
                }}
                disabled={
                  isSelectedModalProCheckoutLoading ||
                  isOpeningBillingPortal ||
                  !selectedModalProOfferEnabled ||
                  isFounderCurrent ||
                  selectedModalProIsCurrent
                }
                className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-black transition hover:scale-[1.02] hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isSelectedModalProCheckoutLoading ||
                (isOpeningBillingPortal && selectedModalProNeedsPortalSwitch)
                  ? "Opening…"
                  : selectedModalProButtonLabel}
              </button>
            </div>
          </article>

          <article className="group relative overflow-hidden rounded-2xl border border-amber-200/35 bg-amber-200/[0.08] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/70 hover:bg-amber-200/[0.12] hover:shadow-[0_16px_44px_rgba(251,191,36,0.24)]">
            <div className="pointer-events-none absolute -left-10 top-4 h-28 w-28 rounded-full bg-amber-200/24 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
            <div className="pointer-events-none absolute -right-14 -top-10 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl animate-pulse" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_22%,rgba(251,191,36,0.2)_50%,transparent_78%)] opacity-35 transition-opacity duration-500 group-hover:opacity-65" />
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-100" />
              Founder Pass
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {formatUsdPrice(lifetimeAmountCents || DEFAULT_MODAL_LIFETIME_CENTS)}
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              One-time founder access with Pro limits and monthly Pro credits.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              {lifetimeSlotSummary
                ? `${lifetimeSlotSummary.remaining}/${lifetimeSlotSummary.total} founder passes remaining`
                : "Limited founder passes"}
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-zinc-200">
              <p>• Draft analysis: Analyze + Compare</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>• {MODAL_PRO_CREDITS_PER_MONTH} credits/month (same limits as Pro)</p>
              <p>
                • ≈ {MODAL_PRO_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                {MODAL_PRO_APPROX_DRAFT_TURNS} draft/review turns
              </p>
              <p>• No recurring subscription</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isFounderCurrent) {
                  return;
                }
                onOpenCheckout("lifetime");
              }}
              disabled={
                isFounderCurrent ||
                !lifetimeOfferEnabled ||
                (lifetimeSlotSummary ? lifetimeSlotSummary.remaining <= 0 : false)
              }
              className="mt-4 inline-flex items-center rounded-full border border-amber-200/50 bg-amber-100/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.18)] transition hover:scale-[1.02] hover:bg-amber-100/18 hover:shadow-[0_0_24px_rgba(251,191,36,0.32)] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
            >
              {isFounderCurrent
                ? "Current Plan"
                : lifetimeSlotSummary && lifetimeSlotSummary.remaining <= 0
                  ? "Sold out"
                  : "Get Founder Pass"}
            </button>
            <p className="mt-3 text-[11px] leading-5 text-amber-100/75">
              Includes Pro plan limits and monthly Pro credits while Xpo and this plan are
              offered. If this plan is retired, we honor your purchase with an equivalent plan or
              account credit.
            </p>
          </article>
        </div>

        <p className="relative mt-5 text-xs text-zinc-500">Need billing help? {supportEmail}</p>
        <p className="relative mt-1 text-xs text-zinc-500">
          Refunds: subscriptions within 7 days (up to 120 credits), Founder Pass within 72 hours
          (up to 60 credits).{" "}
          <a href="/refund-policy" className="underline transition hover:text-zinc-300">
            View refund policy
          </a>
        </p>
      </div>
    </div>
  );
}
