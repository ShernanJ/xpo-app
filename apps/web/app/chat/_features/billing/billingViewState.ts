export interface BillingSnapshotPayload {
  plan: "free" | "pro" | "lifetime";
  status: "active" | "past_due" | "canceled" | "blocked_fair_use";
  billingCycle: "monthly" | "annual" | "lifetime";
  creditsRemaining: number;
  creditLimit: number;
  creditCycleResetsAt: string;
  showFirstPricingModal: boolean;
  lowCreditWarning: boolean;
  criticalCreditWarning: boolean;
  fairUse: {
    softWarningThreshold: number;
    reviewThreshold: number;
    hardStopThreshold: number;
    isSoftWarning: boolean;
    isReviewLevel: boolean;
    isHardStopped: boolean;
  };
}

export interface BillingStatePayload {
  billing: BillingSnapshotPayload;
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

export interface BillingViewState {
  activeBillingSnapshot: BillingSnapshotPayload | null;
  modalMonthlyCents: number;
  modalAnnualCents: number;
  lifetimeOfferCents: number;
  billingCreditsLabel: string;
  rateLimitsRemainingPercent: number | null;
  rateLimitWindowLabel: string;
  rateLimitResetLabel: string;
  rateLimitUpgradeLabel: string;
  showRateLimitUpgradeCta: boolean;
  settingsPlanLabel: string;
  settingsCreditsRemaining: number;
  settingsCreditLimit: number;
  settingsCreditsUsed: number;
  settingsCreditsRemainingPercent: number | null;
  billingWarningLevel: "none" | "low" | "critical";
  showBillingWarningBanner: boolean;
  pricingModalDismissLabel: string;
  proMonthlyOfferEnabled: boolean;
  proAnnualOfferEnabled: boolean;
  selectedModalProIsAnnual: boolean;
  selectedModalProCents: number;
  selectedModalProOffer: "pro_monthly" | "pro_annual";
  selectedModalProOfferEnabled: boolean;
  selectedModalProPriceSuffix: string;
  isProActive: boolean;
  isProMonthlyCurrent: boolean;
  isProAnnualCurrent: boolean;
  isFounderCurrent: boolean;
  selectedModalProIsCurrent: boolean;
  selectedModalProNeedsPortalSwitch: boolean;
  selectedModalProButtonLabel: string;
}

export function formatUsdPrice(amountCents: number): string {
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

export const DEFAULT_MODAL_PRO_MONTHLY_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_USD,
  1999,
);
export const DEFAULT_MODAL_PRO_ANNUAL_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_USD,
  19999,
);
export const DEFAULT_MODAL_LIFETIME_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_USD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_CAD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_USD,
  49900,
);
export const MODAL_FREE_CREDITS_PER_MONTH = 50;
export const MODAL_PRO_CREDITS_PER_MONTH = 500;
const MODAL_CHAT_TURN_CREDIT_COST = 2;
const MODAL_DRAFT_TURN_CREDIT_COST = 5;
export const MODAL_FREE_APPROX_CHAT_TURNS = Math.floor(
  MODAL_FREE_CREDITS_PER_MONTH / MODAL_CHAT_TURN_CREDIT_COST,
);
export const MODAL_FREE_APPROX_DRAFT_TURNS = Math.floor(
  MODAL_FREE_CREDITS_PER_MONTH / MODAL_DRAFT_TURN_CREDIT_COST,
);
export const MODAL_PRO_APPROX_CHAT_TURNS = Math.floor(
  MODAL_PRO_CREDITS_PER_MONTH / MODAL_CHAT_TURN_CREDIT_COST,
);
export const MODAL_PRO_APPROX_DRAFT_TURNS = Math.floor(
  MODAL_PRO_CREDITS_PER_MONTH / MODAL_DRAFT_TURN_CREDIT_COST,
);

export function resolveBillingViewState(params: {
  billingState: BillingStatePayload | null;
  dismissedBillingWarningLevel: "low" | "critical" | null;
  isBillingLoading: boolean;
  selectedModalProCadence: "monthly" | "annual";
}): BillingViewState {
  const {
    billingState,
    dismissedBillingWarningLevel,
    isBillingLoading,
    selectedModalProCadence,
  } = params;

  const activeBillingSnapshot = billingState?.billing ?? null;
  const proMonthlyOffer = billingState?.offers.find(
    (offer) => offer.offer === "pro_monthly",
  );
  const proAnnualOffer = billingState?.offers.find(
    (offer) => offer.offer === "pro_annual",
  );
  const lifetimeOffer = billingState?.offers.find((offer) => offer.offer === "lifetime");
  const modalMonthlyCents = proMonthlyOffer?.amountCents ?? DEFAULT_MODAL_PRO_MONTHLY_CENTS;
  const modalAnnualCents = proAnnualOffer?.amountCents ?? DEFAULT_MODAL_PRO_ANNUAL_CENTS;
  const lifetimeOfferCents = lifetimeOffer?.amountCents ?? DEFAULT_MODAL_LIFETIME_CENTS;
  const isProActive =
    activeBillingSnapshot?.plan === "pro" && activeBillingSnapshot.status === "active";
  const isProMonthlyCurrent = isProActive && activeBillingSnapshot?.billingCycle === "monthly";
  const isProAnnualCurrent = isProActive && activeBillingSnapshot?.billingCycle === "annual";
  const isFounderCurrent =
    activeBillingSnapshot?.plan === "lifetime" && activeBillingSnapshot.status === "active";
  const pricingModalDismissLabel =
    activeBillingSnapshot?.plan === "free" ? "Continue Free" : "Close";
  const selectedModalProIsAnnual = selectedModalProCadence === "annual";
  const selectedModalProCents = selectedModalProIsAnnual ? modalAnnualCents : modalMonthlyCents;
  const selectedModalProOffer = selectedModalProIsAnnual ? "pro_annual" : "pro_monthly";
  const selectedModalProOfferEnabled = Boolean(
    selectedModalProIsAnnual ? proAnnualOffer?.enabled : proMonthlyOffer?.enabled,
  );
  const selectedModalProPriceSuffix = selectedModalProIsAnnual ? "/year" : "/month";
  const selectedModalProIsCurrent = selectedModalProIsAnnual
    ? isProAnnualCurrent
    : isProMonthlyCurrent;
  const selectedModalProNeedsPortalSwitch =
    isProActive && !selectedModalProIsCurrent && !isFounderCurrent;
  const selectedModalProButtonLabel = isFounderCurrent
    ? "Founder plan active"
    : selectedModalProIsCurrent
      ? "Current plan"
      : selectedModalProNeedsPortalSwitch
        ? "Switch in billing portal"
        : selectedModalProIsAnnual
          ? "Get Pro Annual"
          : "Get Pro Monthly";

  const billingCreditsLabel = activeBillingSnapshot
    ? `${Math.max(0, activeBillingSnapshot.creditsRemaining)}/${Math.max(
        0,
        activeBillingSnapshot.creditLimit,
      )}`
    : "0/0";
  const rateLimitsRemainingPercent = activeBillingSnapshot
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (Math.max(0, activeBillingSnapshot.creditsRemaining) /
              Math.max(1, activeBillingSnapshot.creditLimit)) *
              100,
          ),
        ),
      )
    : null;
  const rateLimitWindowLabel = activeBillingSnapshot
    ? activeBillingSnapshot.plan === "lifetime"
      ? "Founder Pass"
      : activeBillingSnapshot.plan === "pro"
        ? activeBillingSnapshot.billingCycle === "annual"
          ? "Pro Annual"
          : "Pro Monthly"
        : "Free"
    : "Free";
  const rateLimitResetLabel = activeBillingSnapshot
    ? new Date(activeBillingSnapshot.creditCycleResetsAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : isBillingLoading
      ? "Loading..."
      : "Unavailable";
  const rateLimitUpgradeLabel =
    activeBillingSnapshot?.plan === "pro" ? "Get Founder Pass" : "Upgrade to Pro";
  const showRateLimitUpgradeCta = activeBillingSnapshot?.plan !== "lifetime";
  const settingsPlanLabel = rateLimitWindowLabel;
  const settingsCreditsRemaining = activeBillingSnapshot
    ? Math.max(0, activeBillingSnapshot.creditsRemaining)
    : 0;
  const settingsCreditLimit = activeBillingSnapshot
    ? Math.max(0, activeBillingSnapshot.creditLimit)
    : 0;
  const settingsCreditsUsed = Math.max(0, settingsCreditLimit - settingsCreditsRemaining);
  const settingsCreditsRemainingPercent = rateLimitsRemainingPercent;
  const billingWarningLevel = activeBillingSnapshot?.criticalCreditWarning
    ? "critical"
    : activeBillingSnapshot?.lowCreditWarning
      ? "low"
      : "none";
  const showBillingWarningBanner =
    billingWarningLevel !== "none" &&
    dismissedBillingWarningLevel !== billingWarningLevel;

  return {
    activeBillingSnapshot,
    modalMonthlyCents,
    modalAnnualCents,
    lifetimeOfferCents,
    billingCreditsLabel,
    rateLimitsRemainingPercent,
    rateLimitWindowLabel,
    rateLimitResetLabel,
    rateLimitUpgradeLabel,
    showRateLimitUpgradeCta,
    settingsPlanLabel,
    settingsCreditsRemaining,
    settingsCreditLimit,
    settingsCreditsUsed,
    settingsCreditsRemainingPercent,
    billingWarningLevel,
    showBillingWarningBanner,
    pricingModalDismissLabel,
    proMonthlyOfferEnabled: Boolean(proMonthlyOffer?.enabled),
    proAnnualOfferEnabled: Boolean(proAnnualOffer?.enabled),
    selectedModalProIsAnnual,
    selectedModalProCents,
    selectedModalProOffer,
    selectedModalProOfferEnabled,
    selectedModalProPriceSuffix,
    isProActive,
    isProMonthlyCurrent,
    isProAnnualCurrent,
    isFounderCurrent,
    selectedModalProIsCurrent,
    selectedModalProNeedsPortalSwitch,
    selectedModalProButtonLabel,
  };
}
