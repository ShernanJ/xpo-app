import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { z } from "zod";

import {
  BILLING_OFFER_CONFIG,
  STRIPE_PRICE_IDS,
  type BillingOffer,
} from "@/lib/billing/config";
import { ensureBillingEntitlement } from "@/lib/billing/entitlements";
import {
  attachCheckoutSessionToReservation,
  releaseLifetimeReservationById,
  reserveLifetimeSlot,
} from "@/lib/billing/lifetimeSlots";
import {
  ensureStripeCustomer,
  createCheckoutSession,
  findExistingSubscriptionForCustomer,
  resolveCheckoutBaseUrl,
} from "@/lib/billing/stripe";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

const CheckoutRequestSchema = z.object({
  offer: z.enum(["pro_monthly", "pro_annual", "lifetime"]),
  successPath: z.string().optional(),
  cancelPath: z.string().optional(),
});

function resolveSuccessUrl(args: {
  baseUrl: string;
  successPath?: string;
}): string {
  const rawPath = args.successPath?.trim();
  const safePath = rawPath && rawPath.startsWith("/") ? rawPath : "/chat";
  return `${args.baseUrl}${safePath}?billing=success&session_id={CHECKOUT_SESSION_ID}`;
}

function resolveCancelUrl(args: {
  baseUrl: string;
  cancelPath?: string;
}): string {
  const rawPath = args.cancelPath?.trim();
  const safePath = rawPath && rawPath.startsWith("/") ? rawPath : "/chat";
  return `${args.baseUrl}${safePath}?billing=cancel`;
}

function missingPriceError(offer: BillingOffer) {
  return NextResponse.json(
    {
      ok: false,
      errors: [
        {
          field: "offer",
          message: `${BILLING_OFFER_CONFIG[offer].label} is not configured yet.`,
        },
      ],
    },
    { status: 500 },
  );
}

function conflictError(message: string, code = "ALREADY_SUBSCRIBED") {
  return NextResponse.json(
    {
      ok: false,
      code,
      errors: [{ field: "offer", message }],
    },
    { status: 409 },
  );
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  if (!isMonetizationEnabled()) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "billing", message: "Not found." }] },
      { status: 404 },
    );
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "billing:checkout",
    user: {
      limit: 12,
      windowMs: 5 * 60 * 1000,
      message: "Too many checkout requests. Please wait before trying again.",
    },
    ip: {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: "Too many checkout requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<unknown>(request, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const rawBody = bodyResult.value;

  const parsed = CheckoutRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Invalid checkout payload." }] },
      { status: 400 },
    );
  }

  const offer = parsed.data.offer;
  const priceId = STRIPE_PRICE_IDS[offer];
  if (!priceId) {
    return missingPriceError(offer);
  }

  const entitlement = await ensureBillingEntitlement(session.user.id);
  if (offer === "pro_monthly" || offer === "pro_annual") {
    if (entitlement.plan === "lifetime") {
      return conflictError("Founder Pass already includes Pro access.");
    }

    if (entitlement.plan === "pro" && entitlement.status === "active") {
      const sameCycle =
        (offer === "pro_monthly" && entitlement.billingCycle === "monthly") ||
        (offer === "pro_annual" && entitlement.billingCycle === "annual");

      if (sameCycle) {
        return conflictError(
          entitlement.billingCycle === "annual"
            ? "You are already on Pro Annual."
            : "You are already on Pro Monthly.",
        );
      }

      return conflictError(
        "Use Manage Billing to switch between monthly and annual Pro plans.",
        "PLAN_SWITCH_IN_PORTAL",
      );
    }
  }

  if (offer === "lifetime" && entitlement.plan === "lifetime") {
    return conflictError("You already have Founder Pass access.");
  }

  const baseUrl = resolveCheckoutBaseUrl(request.url);
  const customerId = await ensureStripeCustomer({
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  if (offer === "pro_monthly" || offer === "pro_annual") {
    const existingSubscription = await findExistingSubscriptionForCustomer({
      customerId,
    });

    if (existingSubscription) {
      const monthlyPriceId = STRIPE_PRICE_IDS.pro_monthly;
      const annualPriceId = STRIPE_PRICE_IDS.pro_annual;
      const isKnownProSubscriptionPrice =
        existingSubscription.priceId === monthlyPriceId ||
        existingSubscription.priceId === annualPriceId;

      if (isKnownProSubscriptionPrice && existingSubscription.priceId === priceId) {
        return conflictError(
          offer === "pro_annual"
            ? "You are already on Pro Annual."
            : "You are already on Pro Monthly.",
        );
      }

      return conflictError(
        "Use Manage Billing to switch between monthly and annual Pro plans.",
        "PLAN_SWITCH_IN_PORTAL",
      );
    }
  }

  const successUrl = resolveSuccessUrl({
    baseUrl,
    successPath: parsed.data.successPath,
  });
  const cancelUrl = resolveCancelUrl({
    baseUrl,
    cancelPath: parsed.data.cancelPath,
  });

  if (offer === "lifetime") {
    const reservation = await reserveLifetimeSlot(session.user.id);
    if (!reservation.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "SOLD_OUT",
          errors: [{ field: "offer", message: "All Founder Pass slots are currently sold out." }],
        },
        { status: 409 },
      );
    }

    let checkoutSession: Awaited<ReturnType<typeof createCheckoutSession>>;
    try {
      checkoutSession = await createCheckoutSession({
        mode: "payment",
        customerId,
        priceId,
        successUrl,
        cancelUrl,
        userId: session.user.id,
        offer,
        reservationId: reservation.reservationId,
      });
    } catch (error) {
      await releaseLifetimeReservationById(reservation.reservationId).catch(() => undefined);
      throw error;
    }

    if (!checkoutSession.url) {
      await releaseLifetimeReservationById(reservation.reservationId).catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "checkout", message: "Failed to initialize checkout." }],
        },
        { status: 502 },
      );
    }

    await attachCheckoutSessionToReservation({
      reservationId: reservation.reservationId,
      sessionId: checkoutSession.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        checkoutUrl: checkoutSession.url,
      },
    });
  }

  const checkoutSession = await createCheckoutSession({
    mode: "subscription",
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    userId: session.user.id,
    offer,
  });

  if (!checkoutSession.url) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "checkout", message: "Failed to initialize checkout." }],
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      checkoutUrl: checkoutSession.url,
    },
  });
}
