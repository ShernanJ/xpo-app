import type { BillingPlan } from "@/lib/generated/prisma/client";

export type DraftAnalysisMode = "analyze" | "compare";

export function canAccessDraftAnalysis(
  plan: BillingPlan,
  mode: DraftAnalysisMode,
): boolean {
  if (mode === "analyze") {
    return true;
  }

  return plan !== "free";
}

export function getDraftAnalysisUpgradeMessage(mode: DraftAnalysisMode): string {
  return mode === "compare"
    ? "Draft compare is available on Pro and Lifetime."
    : "Draft analysis is not available on the current plan.";
}

export function shouldActivateProFromCheckoutSession(args: {
  status: string | null;
  paymentStatus: string | null;
  hasSubscriptionId: boolean;
}): boolean {
  if (args.status !== "complete") {
    return false;
  }

  if (args.paymentStatus === "paid" || args.paymentStatus === "no_payment_required") {
    return true;
  }

  return args.hasSubscriptionId;
}
