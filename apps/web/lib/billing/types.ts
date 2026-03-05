import type {
  BillingCycle,
  BillingPlan,
  BillingStatus,
  BillingEntitlement,
} from "@/lib/generated/prisma/client";

export type BillingSnapshot = {
  plan: BillingPlan;
  status: BillingStatus;
  billingCycle: BillingCycle;
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
};

export type BillingStatePayload = {
  billing: BillingSnapshot;
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
};

export type CreditConsumeResult =
  | {
      ok: true;
      cost: number;
      idempotencyKey: string;
      entitlement: BillingEntitlement;
      snapshot: BillingSnapshot;
    }
  | {
      ok: false;
      reason:
        | "INSUFFICIENT_CREDITS"
        | "ENTITLEMENT_INACTIVE"
        | "RATE_LIMITED"
        | "LIFETIME_HARD_STOP";
      entitlement: BillingEntitlement;
      snapshot: BillingSnapshot;
      retryAfterSeconds?: number;
    };
