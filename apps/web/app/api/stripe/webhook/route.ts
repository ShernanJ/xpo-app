import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  activateLifetimeEntitlement,
  activateProEntitlement,
  downgradeToFreeEntitlement,
  ensureBillingEntitlement,
  setBillingStatus,
} from "@/lib/billing/entitlements";
import {
  markLifetimeReservationCompletedById,
  releaseLifetimeReservationBySessionId,
} from "@/lib/billing/lifetimeSlots";
import {
  constructStripeWebhookEvent,
  type StripeWebhookEvent,
} from "@/lib/billing/stripe";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (value && typeof value === "object" && "id" in value) {
    const candidate = (value as { id?: unknown }).id;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getEventObject(event: StripeWebhookEvent): Record<string, unknown> {
  return asRecord(event.data.object) || {};
}

function getMetadata(object: Record<string, unknown>): Record<string, unknown> {
  return asRecord(object.metadata) || {};
}

function getSubscriptionCycle(subscription: Record<string, unknown>): "monthly" | "annual" {
  const items = asRecord(subscription.items);
  const itemList = Array.isArray(items?.data) ? items.data : [];
  const firstItem = asRecord(itemList[0]);
  const price = asRecord(firstItem?.price);
  const recurring = asRecord(price?.recurring);
  const interval = asString(recurring?.interval);

  return interval === "year" ? "annual" : "monthly";
}

function getSubscriptionPriceId(subscription: Record<string, unknown>): string | null {
  const items = asRecord(subscription.items);
  const itemList = Array.isArray(items?.data) ? items.data : [];
  const firstItem = asRecord(itemList[0]);
  const price = asRecord(firstItem?.price);

  return asString(price?.id);
}

async function resolveUserIdFromStripeReferences(args: {
  metadataUserId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  if (args.metadataUserId) {
    return args.metadataUserId;
  }

  if (args.customerId) {
    const entitlementByCustomer = await prisma.billingEntitlement.findFirst({
      where: {
        stripeCustomerId: args.customerId,
      },
      select: { userId: true },
    });

    if (entitlementByCustomer?.userId) {
      return entitlementByCustomer.userId;
    }
  }

  if (args.subscriptionId) {
    const entitlementBySubscription = await prisma.billingEntitlement.findFirst({
      where: {
        stripeSubscriptionId: args.subscriptionId,
      },
      select: { userId: true },
    });

    if (entitlementBySubscription?.userId) {
      return entitlementBySubscription.userId;
    }
  }

  return null;
}

async function handleCheckoutCompleted(event: StripeWebhookEvent) {
  const session = getEventObject(event);
  const metadata = getMetadata(session);
  const offer = asString(metadata.offer);
  const reservationId = asString(metadata.reservationId);

  const userId = await resolveUserIdFromStripeReferences({
    metadataUserId: asString(metadata.userId),
    customerId: asString(session.customer),
    subscriptionId: asString(session.subscription),
  });

  if (!userId || !offer) {
    return;
  }

  if (offer === "lifetime") {
    await activateLifetimeEntitlement({
      userId,
      stripeCustomerId: asString(session.customer),
      stripePriceId: null,
    });

    if (reservationId) {
      await markLifetimeReservationCompletedById(reservationId);
    }

    return;
  }

  const cycle = offer === "pro_annual" ? "annual" : "monthly";
  await activateProEntitlement({
    userId,
    cycle: cycle,
    stripeCustomerId: asString(session.customer),
    stripeSubscriptionId: asString(session.subscription),
    stripePriceId: null,
  });
}

async function handleCheckoutExpired(event: StripeWebhookEvent) {
  const session = getEventObject(event);
  const sessionId = asString(session.id);
  if (!sessionId) {
    return;
  }

  await releaseLifetimeReservationBySessionId(sessionId);
}

async function handleSubscriptionUpdated(event: StripeWebhookEvent) {
  const subscription = getEventObject(event);
  const metadata = getMetadata(subscription);
  const subscriptionId = asString(subscription.id);

  const userId = await resolveUserIdFromStripeReferences({
    metadataUserId: asString(metadata.userId),
    customerId: asString(subscription.customer),
    subscriptionId,
  });

  if (!userId) {
    return;
  }

  const cycle = getSubscriptionCycle(subscription);
  const status = asString(subscription.status);
  const priceId = getSubscriptionPriceId(subscription);

  if (status === "active" || status === "trialing") {
    await activateProEntitlement({
      userId,
      cycle,
      stripeCustomerId: asString(subscription.customer),
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
    });
    return;
  }

  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    await setBillingStatus({
      userId,
      status: "past_due",
    });
    return;
  }

  if (status === "canceled" || status === "incomplete_expired") {
    await downgradeToFreeEntitlement({
      userId,
      clearStripeSubscription: true,
    });
  }
}

async function handleSubscriptionDeleted(event: StripeWebhookEvent) {
  const subscription = getEventObject(event);
  const metadata = getMetadata(subscription);

  const userId = await resolveUserIdFromStripeReferences({
    metadataUserId: asString(metadata.userId),
    customerId: asString(subscription.customer),
    subscriptionId: asString(subscription.id),
  });

  if (!userId) {
    return;
  }

  await downgradeToFreeEntitlement({
    userId,
    clearStripeSubscription: true,
  });
}

async function handleInvoicePaid(event: StripeWebhookEvent) {
  const invoice = getEventObject(event);
  const userId = await resolveUserIdFromStripeReferences({
    customerId: asString(invoice.customer),
    subscriptionId: asString(invoice.subscription),
  });

  if (!userId) {
    return;
  }

  const entitlement = await ensureBillingEntitlement(userId);
  if (entitlement.plan === "pro") {
    await setBillingStatus({
      userId,
      status: "active",
    });
  }
}

async function handleInvoicePaymentFailed(event: StripeWebhookEvent) {
  const invoice = getEventObject(event);
  const userId = await resolveUserIdFromStripeReferences({
    customerId: asString(invoice.customer),
    subscriptionId: asString(invoice.subscription),
  });

  if (!userId) {
    return;
  }

  await setBillingStatus({
    userId,
    status: "past_due",
  });
}

async function dispatchStripeEvent(event: StripeWebhookEvent): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event);
      break;
    case "checkout.session.expired":
      await handleCheckoutExpired(event);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;
    default:
      break;
  }
}

export async function POST(request: NextRequest) {
  if (!isMonetizationEnabled()) {
    return NextResponse.json({ ok: true, monetizationEnabled: false });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "signature", message: "Missing stripe-signature header." }],
      },
      { status: 400 },
    );
  }

  const payload = await request.text();
  let event: StripeWebhookEvent;

  try {
    event = constructStripeWebhookEvent({
      payload,
      signature,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "signature", message: error instanceof Error ? error.message : "Invalid signature." }],
      },
      { status: 400 },
    );
  }

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { id: true, status: true },
  });

  if (existing?.status === "processed") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!existing) {
    await prisma.stripeWebhookEvent.create({
      data: {
        id: event.id,
        eventType: event.type,
        payload: event as unknown as Prisma.JsonObject,
        status: "processing",
      },
    });
  } else {
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "processing",
        errorMessage: null,
      },
    });
  }

  try {
    await dispatchStripeEvent(event);

    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "processed",
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown webhook failure.",
        processedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "webhook", message: "Failed to process webhook." }],
      },
      { status: 500 },
    );
  }
}
