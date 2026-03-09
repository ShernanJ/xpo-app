import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import {
  activateLifetimeEntitlement,
  activateProEntitlement,
  ensureBillingEntitlement,
  getBillingStateForUser,
  setBillingStatus,
} from "@/lib/billing/entitlements";
import {
  findExistingSubscriptionForCustomer,
  getCheckoutSessionById,
  getSubscriptionById,
} from "@/lib/billing/stripe";
import { shouldActivateProFromCheckoutSession } from "@/lib/billing/rules";

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
  const shouldActivateFromCheckout = shouldActivateProFromCheckoutSession({
    status: checkoutSession.status,
    paymentStatus: checkoutSession.paymentStatus,
    hasSubscriptionId: Boolean(checkoutSession.subscriptionId),
  });

  if (!checkoutSession.subscriptionId) {
    if (!shouldActivateFromCheckout) {
      return;
    }

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
    if (!shouldActivateFromCheckout) {
      return;
    }

    await activateProEntitlement({
      userId: args.userId,
      cycle: fallbackCycle,
      stripeCustomerId: checkoutSession.customerId,
      stripeSubscriptionId: checkoutSession.subscriptionId,
      stripePriceId: null,
    });
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

  if (subscription.status === "incomplete" && shouldActivateFromCheckout) {
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

async function reconcileBillingFromStoredStripeState(args: {
  userId: string;
}): Promise<void> {
  const entitlement = await ensureBillingEntitlement(args.userId);
  if (
    (entitlement.plan === "pro" && entitlement.status === "active") ||
    entitlement.plan === "lifetime"
  ) {
    return;
  }

  if (!entitlement.stripeCustomerId) {
    return;
  }

  const subscription = entitlement.stripeSubscriptionId
    ? await getSubscriptionById({
        subscriptionId: entitlement.stripeSubscriptionId,
      })
    : await findExistingSubscriptionForCustomer({
        customerId: entitlement.stripeCustomerId,
      });

  if (!subscription) {
    return;
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    const stripeCustomerId =
      "customerId" in subscription && typeof subscription.customerId === "string"
        ? subscription.customerId
        : entitlement.stripeCustomerId;

    await activateProEntitlement({
      userId: args.userId,
      cycle: subscription.interval === "year" ? "annual" : "monthly",
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.priceId,
    });
    return;
  }

  if (
    entitlement.plan === "pro" &&
    (
      subscription.status === "past_due" ||
      subscription.status === "unpaid" ||
      subscription.status === "incomplete"
    )
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

  try {
    await reconcileBillingFromStoredStripeState({
      userId: session.user.id,
    });
  } catch (error) {
    console.error("Failed billing reconciliation from stored Stripe state", error);
  }

  const state = await getBillingStateForUser(session.user.id);
  return NextResponse.json({
    ok: true,
    data: state,
  });
}
