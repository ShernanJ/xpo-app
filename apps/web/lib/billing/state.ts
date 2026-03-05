import type { BillingEntitlement } from "@/lib/generated/prisma/client";

import {
  BILLING_OFFER_CONFIG,
  LIFETIME_FAIR_USE_THRESHOLDS,
  STRIPE_PRICE_IDS,
  SUPPORT_EMAIL,
} from "@/lib/billing/config";
import type { BillingSnapshot, BillingStatePayload } from "@/lib/billing/types";

export function toBillingSnapshot(entitlement: BillingEntitlement): BillingSnapshot {
  const used = entitlement.creditLimit - entitlement.creditsRemaining;

  return {
    plan: entitlement.plan,
    status: entitlement.status,
    billingCycle: entitlement.billingCycle,
    creditsRemaining: entitlement.creditsRemaining,
    creditLimit: entitlement.creditLimit,
    creditCycleResetsAt: entitlement.creditCycleResetsAt.toISOString(),
    showFirstPricingModal: entitlement.showFirstPricingModal,
    lowCreditWarning:
      entitlement.creditLimit > 0 &&
      entitlement.creditsRemaining <= Math.floor(entitlement.creditLimit * 0.3),
    criticalCreditWarning:
      entitlement.creditLimit > 0 &&
      entitlement.creditsRemaining <= Math.floor(entitlement.creditLimit * 0.1),
    fairUse: {
      softWarningThreshold: LIFETIME_FAIR_USE_THRESHOLDS.softWarning,
      reviewThreshold: LIFETIME_FAIR_USE_THRESHOLDS.review,
      hardStopThreshold: LIFETIME_FAIR_USE_THRESHOLDS.hardStop,
      isSoftWarning:
        entitlement.plan === "lifetime" &&
        used >= LIFETIME_FAIR_USE_THRESHOLDS.softWarning,
      isReviewLevel:
        entitlement.plan === "lifetime" &&
        used >= LIFETIME_FAIR_USE_THRESHOLDS.review,
      isHardStopped:
        entitlement.plan === "lifetime" &&
        used >= LIFETIME_FAIR_USE_THRESHOLDS.hardStop,
    },
  };
}

export function toBillingStatePayload(args: {
  entitlement: BillingEntitlement;
  lifetimeSlots: {
    total: number;
    sold: number;
    reserved: number;
    remaining: number;
  };
}): BillingStatePayload {
  return {
    billing: toBillingSnapshot(args.entitlement),
    lifetimeSlots: args.lifetimeSlots,
    offers: Object.entries(BILLING_OFFER_CONFIG).map(([offer, config]) => ({
      offer: offer as "pro_monthly" | "pro_annual" | "lifetime",
      label: config.label,
      amountCents: config.amountCents,
      cadence: config.cadence,
      productCopy: config.productCopy,
      enabled: Boolean(STRIPE_PRICE_IDS[offer as keyof typeof STRIPE_PRICE_IDS]),
    })),
    supportEmail: SUPPORT_EMAIL,
  };
}
