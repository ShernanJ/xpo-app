import type { BillingPlan } from "@/lib/generated/prisma/client";

export const BILLING_RESET_INTERVAL_DAYS = 30;

export const BILLING_CREDIT_LIMITS: Record<BillingPlan, number> = {
  free: 50,
  pro: 500,
  lifetime: 500,
};

export const BILLING_HANDLE_LIMITS: Record<BillingPlan, number | null> = {
  free: null,
  pro: null,
  lifetime: null,
};

export const LIFETIME_SLOT_LIMIT = 10;
export const LIFETIME_RESERVATION_TTL_MINUTES = 30;

export const LIFETIME_FAIR_USE_THRESHOLDS = {
  softWarning: 320,
  review: 400,
  hardStop: 500,
} as const;

export const ACTION_CREDIT_COST = {
  chat_standard: 2,
  chat_draft_like: 5,
  draft_analysis_analyze: 3,
  draft_analysis_compare: 4,
} as const;

export const BILLING_RATE_LIMIT = {
  freePerMinute: 5,
  paidPerMinute: 20,
} as const;

export type BillingOffer = "pro_monthly" | "pro_annual" | "lifetime";

function parseUsdAmountToCents(
  rawValue: string | undefined,
  fallbackCents: number,
): number {
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

const PRO_ANNUAL_AMOUNT_CENTS = parseUsdAmountToCents(
  process.env.BILLING_PRICE_PRO_ANNUAL_CAD ||
    process.env.BILLING_PRICE_PRO_ANNUAL_USD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_CAD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_USD,
  19999,
);
const PRO_MONTHLY_AMOUNT_CENTS = parseUsdAmountToCents(
  process.env.BILLING_PRICE_PRO_MONTHLY_CAD ||
    process.env.BILLING_PRICE_PRO_MONTHLY_USD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_CAD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_USD,
  1999,
);
const FOUNDER_PASS_AMOUNT_CENTS = parseUsdAmountToCents(
  process.env.BILLING_PRICE_FOUNDER_PASS_CAD ||
    process.env.BILLING_PRICE_FOUNDER_PASS_USD ||
    process.env.BILLING_PRICE_LIFETIME_CAD ||
    process.env.BILLING_PRICE_LIFETIME_USD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_CAD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_USD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_CAD ||
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_USD,
  49900,
);

export const BILLING_OFFER_CONFIG: Record<
  BillingOffer,
  {
    label: string;
    amountCents: number;
    cadence: "month" | "year" | "one_time";
    productCopy: string;
  }
> = {
  pro_monthly: {
    label: "Pro Monthly",
    amountCents: PRO_MONTHLY_AMOUNT_CENTS,
    cadence: "month",
    productCopy: "Early pricing — will increase as we ship more features.",
  },
  pro_annual: {
    label: "Pro Annual",
    amountCents: PRO_ANNUAL_AMOUNT_CENTS,
    cadence: "year",
    productCopy: "2 months free vs monthly.",
  },
  lifetime: {
    label: "Founder Pass",
    amountCents: FOUNDER_PASS_AMOUNT_CENTS,
    cadence: "one_time",
    productCopy: "One-time founder access with Pro limits and monthly Pro credits.",
  },
};

export const STRIPE_PRICE_IDS: Record<BillingOffer, string | null> = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL || null,
  lifetime: process.env.STRIPE_PRICE_LIFETIME || null,
};

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "shernanjavier@gmail.com";
