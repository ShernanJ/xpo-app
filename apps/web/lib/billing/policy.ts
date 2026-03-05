const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const REFUND_POLICY = {
  subscriptionWindowMs: 7 * DAY_MS,
  lifetimeWindowMs: 72 * HOUR_MS,
  subscriptionUsageCapCredits: 120,
  lifetimeUsageCapCredits: 60,
} as const;

export function evaluateSubscriptionRefundEligibility(args: {
  purchasedAt: Date;
  now?: Date;
  creditsUsed: number;
}): { eligible: boolean; reason: string } {
  const now = args.now ?? new Date();
  const withinWindow = now.getTime() - args.purchasedAt.getTime() <= REFUND_POLICY.subscriptionWindowMs;

  if (!withinWindow) {
    return {
      eligible: false,
      reason: "Purchase is outside the 7-day subscription refund window.",
    };
  }

  if (args.creditsUsed > REFUND_POLICY.subscriptionUsageCapCredits) {
    return {
      eligible: false,
      reason: "Usage exceeded the subscription refund threshold.",
    };
  }

  return {
    eligible: true,
    reason: "Eligible for subscription refund policy.",
  };
}

export function evaluateLifetimeRefundEligibility(args: {
  purchasedAt: Date;
  now?: Date;
  creditsUsed: number;
}): { eligible: boolean; reason: string } {
  const now = args.now ?? new Date();
  const withinWindow = now.getTime() - args.purchasedAt.getTime() <= REFUND_POLICY.lifetimeWindowMs;

  if (!withinWindow) {
    return {
      eligible: false,
      reason: "Purchase is outside the 72-hour lifetime refund window.",
    };
  }

  if (args.creditsUsed > REFUND_POLICY.lifetimeUsageCapCredits) {
    return {
      eligible: false,
      reason: "Usage exceeded the lifetime refund threshold.",
    };
  }

  return {
    eligible: true,
    reason: "Eligible for lifetime refund policy.",
  };
}
