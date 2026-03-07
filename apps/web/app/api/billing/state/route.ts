import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import {
  activateLifetimeEntitlement,
  activateProEntitlement,
  getBillingStateForUser,
  setBillingStatus,
} from "@/lib/billing/entitlements";
import {
  getCheckoutSessionById,
  getSubscriptionById,
} from "@/lib/billing/stripe";

async function reconcileBillingFromCheckoutSession(args: {
  userId: string;
  checkoutSessionId: string;
}): Promise<void> {
  const checkoutSession = await getCheckoutSessionById({
    sessionId: args.checkoutSessionId,
  });
  if (!checkoutSession) {
    return;
  }

  const metadataUserId = checkoutSession.metadata.userId?.trim();
  if (!metadataUserId || metadataUserId !== args.userId) {
    return;
  }

  const offer = checkoutSession.metadata.offer;
  if (offer !== "pro_monthly" && offer !== "pro_annual" && offer !== "lifetime") {
    return;
  }

  if (offer === "lifetime") {
    if (
      checkoutSession.paymentStatus &&
      checkoutSession.paymentStatus !== "paid"
    ) {
      return;
    }

    await activateLifetimeEntitlement({
      userId: args.userId,
      stripeCustomerId: checkoutSession.customerId,
      stripePriceId: null,
    });
    return;
  }

  const fallbackCycle = offer === "pro_annual" ? "annual" : "monthly";

  if (!checkoutSession.subscriptionId) {
    await activateProEntitlement({
      userId: args.userId,
      cycle: fallbackCycle,
      stripeCustomerId: checkoutSession.customerId,
      stripeSubscriptionId: null,
      stripePriceId: null,
    });
    return;
  }

  const subscription = await getSubscriptionById({
    subscriptionId: checkoutSession.subscriptionId,
  });
  if (!subscription) {
    return;
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    await activateProEntitlement({
      userId: args.userId,
      cycle: subscription.interval === "year" ? "annual" : fallbackCycle,
      stripeCustomerId: subscription.customerId ?? checkoutSession.customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.priceId,
    });
    return;
  }

  if (
    subscription.status === "past_due" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete"
  ) {
    await setBillingStatus({
      userId: args.userId,
      status: "past_due",
    });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const checkoutSessionId = request.nextUrl.searchParams.get("session_id")?.trim() || "";
  if (checkoutSessionId) {
    try {
      await reconcileBillingFromCheckoutSession({
        userId: session.user.id,
        checkoutSessionId,
      });
    } catch (error) {
      console.error("Failed billing reconciliation from checkout session", error);
    }
  }

  const state = await getBillingStateForUser(session.user.id);
  return NextResponse.json({
    ok: true,
    data: state,
  });
}
