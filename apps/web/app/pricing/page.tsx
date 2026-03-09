"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { LegalFooter } from "@/components/legal-footer";
import { BackHomeButton } from "@/components/back-home-button";
import { useSession } from "@/lib/auth/client";

interface ValidationError {
  field: string;
  message: string;
}

interface BillingStatePayload {
  billing: {
    plan: "free" | "pro" | "lifetime";
    status: "active" | "past_due" | "canceled" | "blocked_fair_use";
    billingCycle: "monthly" | "annual" | "lifetime";
  };
  lifetimeSlots: {
    total: number;
    sold: number;
    reserved: number;
    remaining: number;
  };
  offers: Array<{
    offer: "pro_monthly" | "pro_annual" | "lifetime";
    label: string;
    amountCents: number;
    cadence: "month" | "year" | "one_time";
    productCopy: string;
    enabled: boolean;
  }>;
  supportEmail: string;
}

interface BillingStateResponseSuccess {
  ok: true;
  data: BillingStatePayload;
}

interface BillingStateResponseFailure {
  ok: false;
  errors: ValidationError[];
}

type BillingStateResponse = BillingStateResponseSuccess | BillingStateResponseFailure;

function formatUsdPrice(amountCents: number): string {
  const displayCurrency =
    process.env.NEXT_PUBLIC_BILLING_DISPLAY_CURRENCY?.trim().toUpperCase() === "USD"
      ? "USD"
      : "CAD";
  return new Intl.NumberFormat(displayCurrency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: displayCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function parsePublicUsdToCents(rawValue: string | undefined, fallbackCents: number): number {
  if (!rawValue) {
    return fallbackCents;
  }

  const normalized = rawValue.trim().replace(/\$/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackCents;
  }

  return Math.round(parsed * 100);
}

const DEFAULT_PRO_MONTHLY_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_USD,
  1999,
);
const DEFAULT_PRO_ANNUAL_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_USD,
  19999,
);
const DEFAULT_LIFETIME_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_USD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_USD,
  49900,
);
const FREE_CREDITS_PER_MONTH = 50;
const PRO_CREDITS_PER_MONTH = 500;
const CHAT_TURN_CREDIT_COST = 2;
const DRAFT_TURN_CREDIT_COST = 5;

export default function PricingPage() {
  const { data: session } = useSession();
  const [billingState, setBillingState] = useState<BillingStatePayload | null>(null);
  const [loadingOffer, setLoadingOffer] = useState<"pro_monthly" | "pro_annual" | "lifetime" | null>(null);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [selectedProCadence, setSelectedProCadence] = useState<"monthly" | "annual">("monthly");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    fetch("/api/billing/state")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        const parsed = data as BillingStateResponse;
        if (!response.ok || !parsed.ok) {
          return;
        }
        setBillingState(parsed.data);
      })
      .catch((error) => {
        console.error("Failed to load billing state", error);
      });
  }, [session?.user?.id]);

  const offers = useMemo(() => {
    const fallback: BillingStatePayload["offers"] = [
      {
        offer: "pro_monthly",
        label: "Pro Monthly",
        amountCents: DEFAULT_PRO_MONTHLY_CENTS,
        cadence: "month",
        productCopy: "Early pricing — will increase as we ship more features.",
        enabled: true,
      },
      {
        offer: "pro_annual",
        label: "Pro Annual",
        amountCents: DEFAULT_PRO_ANNUAL_CENTS,
        cadence: "year",
        productCopy: "2 months free vs monthly.",
        enabled: true,
      },
      {
        offer: "lifetime",
        label: "Founder Pass",
        amountCents: DEFAULT_LIFETIME_CENTS,
        cadence: "one_time",
        productCopy: "One-time founder access with Pro limits and monthly Pro credits.",
        enabled: true,
      },
    ];

    return billingState?.offers ?? fallback;
  }, [billingState?.offers]);

  const startCheckout = useCallback(async (offer: "pro_monthly" | "pro_annual" | "lifetime") => {
    setLoadingOffer(offer);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, successPath: "/chat", cancelPath: "/pricing" }),
      });
      const payload = (await response.json()) as
        | { ok: true; data: { checkoutUrl?: string | null } }
        | { ok: false; errors?: ValidationError[] };

      if (!response.ok || !payload.ok || !payload.data.checkoutUrl) {
        setErrorMessage(
          !payload.ok && payload.errors?.[0]?.message
            ? payload.errors[0].message
            : "Could not start checkout.",
        );
        return;
      }

      window.location.href = payload.data.checkoutUrl;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setLoadingOffer(null);
    }
  }, []);

  useEffect(() => {
    if (billingState?.billing.plan === "pro") {
      setSelectedProCadence(billingState.billing.billingCycle === "annual" ? "annual" : "monthly");
    }
  }, [billingState?.billing.billingCycle, billingState?.billing.plan]);

  const openBillingPortal = useCallback(async () => {
    setIsOpeningBillingPortal(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const payload = (await response.json()) as
        | { ok: true; data: { url?: string } }
        | { ok: false; errors?: ValidationError[] };

      if (!response.ok || !payload.ok || !payload.data?.url) {
        setErrorMessage(
          !payload.ok && payload.errors?.[0]?.message
            ? payload.errors[0].message
            : "Could not open billing portal.",
        );
        return;
      }

      window.open(payload.data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open billing portal.");
    } finally {
      setIsOpeningBillingPortal(false);
    }
  }, []);

  const lifetimeSlotsLabel = billingState?.lifetimeSlots
    ? `${billingState.lifetimeSlots.remaining}/${billingState.lifetimeSlots.total} founder passes remaining`
    : "Limited founder passes";
  const proMonthlyOffer = offers.find((offer) => offer.offer === "pro_monthly");
  const proAnnualOffer = offers.find((offer) => offer.offer === "pro_annual");
  const lifetimeOffer = offers.find((offer) => offer.offer === "lifetime");
  const monthlyCents = proMonthlyOffer?.amountCents ?? DEFAULT_PRO_MONTHLY_CENTS;
  const annualCents = proAnnualOffer?.amountCents ?? DEFAULT_PRO_ANNUAL_CENTS;
  const freeApproxChatTurns = Math.floor(FREE_CREDITS_PER_MONTH / CHAT_TURN_CREDIT_COST);
  const freeApproxDraftTurns = Math.floor(FREE_CREDITS_PER_MONTH / DRAFT_TURN_CREDIT_COST);
  const proApproxChatTurns = Math.floor(PRO_CREDITS_PER_MONTH / CHAT_TURN_CREDIT_COST);
  const proApproxDraftTurns = Math.floor(PRO_CREDITS_PER_MONTH / DRAFT_TURN_CREDIT_COST);
  const activeBilling = billingState?.billing ?? null;
  const isProActive = activeBilling?.plan === "pro" && activeBilling.status === "active";
  const isProMonthlyCurrent = isProActive && activeBilling.billingCycle === "monthly";
  const isProAnnualCurrent = isProActive && activeBilling.billingCycle === "annual";
  const isFounderCurrent =
    activeBilling?.plan === "lifetime" && activeBilling.status === "active";
  const isFreeCurrent = activeBilling?.plan === "free";
  const proMonthlyButtonLabel = isFounderCurrent
    ? "Included"
    : isProMonthlyCurrent
      ? "Current Plan"
      : isProAnnualCurrent
        ? "Switch to Monthly"
        : "Go Pro";
  const proAnnualButtonLabel = isFounderCurrent
    ? "Included"
    : isProAnnualCurrent
      ? "Current Plan"
      : isProMonthlyCurrent
        ? "Switch to Annual"
        : "Go Pro Annual";
  const selectedProIsAnnual = selectedProCadence === "annual";
  const selectedProCents = selectedProIsAnnual ? annualCents : monthlyCents;
  const selectedProPriceSuffix = selectedProIsAnnual ? " / year" : " / month";
  const selectedProButtonLabel = selectedProIsAnnual ? proAnnualButtonLabel : proMonthlyButtonLabel;
  const selectedProOffer = selectedProIsAnnual ? "pro_annual" : "pro_monthly";
  const selectedProIsCurrent = selectedProIsAnnual ? isProAnnualCurrent : isProMonthlyCurrent;
  const selectedProNeedsPortalSwitch = selectedProIsAnnual ? isProMonthlyCurrent : isProAnnualCurrent;
  const selectedProOfferEnabled = selectedProIsAnnual
    ? proAnnualOffer?.enabled !== false
    : proMonthlyOffer?.enabled !== false;
  const isSelectedProCheckoutLoading = loadingOffer === selectedProOffer;

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute -left-28 top-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -right-24 top-40 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-zinc-500/10 blur-3xl animate-pulse" />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-12">
        <BackHomeButton className="mb-5" />

        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Pricing
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Simple pricing. Predictable usage.
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Credits keep costs clear, so you always know what you can run each month.
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.035]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Free</p>
            <p className="mt-2 text-3xl font-semibold">$0</p>
            <p className="mt-2 text-sm text-zinc-400">Try it in minutes. No card required.</p>
            <p className="mt-4 text-xs text-zinc-500">{FREE_CREDITS_PER_MONTH} credits/month</p>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <p>• Core chat + onboarding included</p>
              <p>• Draft analysis: Analyze</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>• ≈ {freeApproxChatTurns} chat turns or ≈ {freeApproxDraftTurns} draft/review turns</p>
              <p>• Upgrade anytime without losing workspace history</p>
            </div>
            {!session?.user?.id ? (
              <Link
                href="/login"
                className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05]"
              >
                Start free
              </Link>
            ) : isFreeCurrent || !activeBilling ? (
              <Link
                href="/chat"
                className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05]"
              >
                Start free
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="mt-5 inline-flex cursor-not-allowed rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
              >
                {activeBilling?.plan === "pro" ? "On Pro Plan" : "On Founder Pass"}
              </button>
            )}
          </article>

          <article className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/[0.05] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_16px_44px_rgba(255,255,255,0.08)]">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl transition-opacity duration-300 group-hover:opacity-90" />
            <div className="flex items-start justify-between gap-3">
              <p className="inline-flex whitespace-nowrap rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
                {isProActive ? "Current plan" : "Most popular"}
              </p>
              <div className="flex flex-col items-end gap-1">
                <div className="relative inline-flex w-full max-w-[172px] rounded-full border border-white/20 bg-black/35 p-0.5">
                  <span
                    className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-white transition-transform duration-200 ${
                      selectedProIsAnnual ? "translate-x-full" : "translate-x-0"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedProCadence("monthly")}
                    className={`relative z-10 flex-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                      selectedProIsAnnual ? "text-zinc-300 hover:text-white" : "text-black"
                    }`}
                  >
                    Monthly
                  </button>
                  <div className="relative z-10 flex-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProCadence("annual")}
                      className={`w-full rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                        selectedProIsAnnual ? "text-black" : "text-zinc-300 hover:text-white"
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
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Pro</p>
            <p className="mt-2 text-3xl font-semibold">
              {formatUsdPrice(selectedProCents)}
              <span className="text-sm font-medium text-zinc-400">{selectedProPriceSuffix}</span>
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Best for consistent creators. Save more with annual billing.
            </p>
            <div className="mt-4 space-y-2 text-sm text-zinc-200">
              <p>• {PRO_CREDITS_PER_MONTH} credits/month</p>
              <p>• Draft analysis: Analyze + Compare</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>• Higher throughput + priority processing</p>
              <p>• ≈ {proApproxChatTurns} chat turns or ≈ {proApproxDraftTurns} draft/review turns</p>
              <p>• Early pricing lock while your subscription stays active</p>
            </div>
            {session?.user?.id ? (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => {
                    if (isFounderCurrent || selectedProIsCurrent) {
                      return;
                    }
                    if (selectedProNeedsPortalSwitch) {
                      void openBillingPortal();
                      return;
                    }
                    void startCheckout(selectedProOffer);
                  }}
                  disabled={
                    loadingOffer !== null ||
                    isOpeningBillingPortal ||
                    !selectedProOfferEnabled ||
                    isFounderCurrent ||
                    selectedProIsCurrent
                  }
                  className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:scale-[1.02] hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {isSelectedProCheckoutLoading
                    ? "Opening…"
                    : isOpeningBillingPortal && selectedProNeedsPortalSwitch
                      ? "Opening…"
                      : selectedProButtonLabel}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
              >
                {selectedProIsAnnual ? "Go Pro Annual" : "Go Pro Monthly"}
              </Link>
            )}
          </article>

          <article className="group relative overflow-hidden rounded-2xl border border-amber-200/35 bg-amber-200/[0.08] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/70 hover:bg-amber-200/[0.12] hover:shadow-[0_20px_56px_rgba(251,191,36,0.24)]">
            <div className="pointer-events-none absolute -left-14 top-6 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
            <div className="pointer-events-none absolute -right-16 -top-14 h-36 w-36 rounded-full bg-amber-200/20 blur-3xl animate-pulse" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_24%,rgba(251,191,36,0.2)_50%,transparent_76%)] opacity-40 transition-opacity duration-500 group-hover:opacity-70" />
            <Sparkles className="pointer-events-none absolute right-6 top-6 h-4 w-4 text-amber-100/90 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]" />
            <Sparkles className="pointer-events-none absolute right-12 top-14 h-3 w-3 text-amber-100/70 animate-pulse" />
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-100" />
              Founder Pass
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {formatUsdPrice(lifetimeOffer?.amountCents ?? DEFAULT_LIFETIME_CENTS)}
            </p>
            <p className="mt-2 text-sm text-zinc-200">
              One-time founder access for long-term users who want no recurring billing.
            </p>
            <p className="mt-2 text-xs text-amber-100/80">{lifetimeSlotsLabel}</p>
            <div className="mt-4 space-y-2 text-sm text-zinc-200">
              <p>• Includes Pro features + Pro monthly credits</p>
              <p>• Draft analysis: Analyze + Compare</p>
              <p>• Multiple X accounts on one shared credit pool</p>
              <p>• {PRO_CREDITS_PER_MONTH} credits/month (same limits as Pro)</p>
              <p>• No recurring subscription</p>
              <p>• ≈ {proApproxChatTurns} chat turns or ≈ {proApproxDraftTurns} draft/review turns</p>
              <p>• Founder priority support lane</p>
            </div>
            {session?.user?.id ? (
              <button
                type="button"
                onClick={() => {
                  if (isFounderCurrent) {
                    return;
                  }
                  void startCheckout("lifetime");
                }}
                disabled={
                  loadingOffer !== null ||
                  isFounderCurrent ||
                  lifetimeOffer?.enabled === false ||
                  (billingState ? billingState.lifetimeSlots.remaining <= 0 : false)
                }
                className="mt-5 inline-flex rounded-full border border-amber-200/50 bg-amber-100/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.18)] transition hover:scale-[1.02] hover:bg-amber-100/18 hover:shadow-[0_0_26px_rgba(251,191,36,0.32)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingOffer === "lifetime"
                  ? "Opening…"
                  : isFounderCurrent
                    ? "Current Plan"
                  : billingState && billingState.lifetimeSlots.remaining <= 0
                    ? "Sold out"
                    : "Get Founder Pass"}
              </button>
            ) : (
              <Link
                href="/login"
                className="mt-5 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05]"
              >
                Get Founder Pass
              </Link>
            )}
            <p className="mt-3 text-[11px] leading-5 text-amber-100/75">
              Founder Pass includes Pro plan limits and monthly Pro credits while Xpo and this plan
              are offered. If this plan is retired, your purchase is honored with an equivalent plan
              or account credit.
            </p>
          </article>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Credits model
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">How usage is metered</h2>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <p>• Chat turns: 2 credits (standard)</p>
              <p>• Draft/edit/review turns: 5 credits</p>
              <p>• Draft analysis analyze: 3 credits</p>
              <p>• Draft analysis compare: 4 credits</p>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Policies
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">Billing, refunds, and support</h2>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <p>• Subscription refunds: within 7 days if usage is 120 credits or less</p>
              <p>• Founder Pass refunds: within 72 hours if usage is 60 credits or less</p>
              <p>• Fair-use protections apply to Founder Pass for platform reliability</p>
              <p>• Billing support: {billingState?.supportEmail ?? "shernanjavier@gmail.com"}</p>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Full details:{" "}
              <Link href="/refund-policy" className="underline">
                refund policy
              </Link>
            </p>
          </article>
        </section>

        <LegalFooter className="mt-10" />
      </div>
    </main>
  );
}
