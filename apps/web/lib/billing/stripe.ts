import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";
import { ensureBillingEntitlement } from "@/lib/billing/entitlements";

const STRIPE_API_BASE_URL = "https://api.stripe.com";

function getStripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return secretKey;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return webhookSecret;
}

function appendFormEncoded(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value === null || value === undefined) {
    return;
  }

  params.append(key, typeof value === "string" ? value : String(value));
}

async function stripeApiRequest<T>(args: {
  path: string;
  method?: "POST" | "GET";
  body?: URLSearchParams;
}): Promise<T> {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`${STRIPE_API_BASE_URL}${args.path}`, {
    method: args.method || "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(args.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: args.body ? args.body.toString() : undefined,
  });

  const text = await response.text();
  let parsed: unknown = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
        ? parsed.error.message
        : `Stripe API request failed (${response.status}).`;

    throw new Error(message);
  }

  return parsed as T;
}

export async function createCheckoutSession(args: {
  mode: "subscription" | "payment";
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
  offer: "pro_monthly" | "pro_annual" | "lifetime";
  reservationId?: string;
}): Promise<{
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  metadata: Record<string, string>;
}> {
  const params = new URLSearchParams();

  appendFormEncoded(params, "mode", args.mode);
  appendFormEncoded(params, "customer", args.customerId);
  appendFormEncoded(params, "line_items[0][price]", args.priceId);
  appendFormEncoded(params, "line_items[0][quantity]", 1);
  appendFormEncoded(params, "success_url", args.successUrl);
  appendFormEncoded(params, "cancel_url", args.cancelUrl);
  appendFormEncoded(params, "client_reference_id", args.userId);
  appendFormEncoded(params, "metadata[userId]", args.userId);
  appendFormEncoded(params, "metadata[offer]", args.offer);

  if (args.reservationId) {
    appendFormEncoded(params, "metadata[reservationId]", args.reservationId);
  }

  if (args.mode === "subscription") {
    appendFormEncoded(params, "allow_promotion_codes", true);
    appendFormEncoded(params, "subscription_data[metadata][userId]", args.userId);
    appendFormEncoded(params, "subscription_data[metadata][offer]", args.offer);
  }

  const response = await stripeApiRequest<{
    id: string;
    url: string | null;
    customer?: string | null;
    subscription?: string | null;
    metadata?: Record<string, string>;
  }>({
    path: "/v1/checkout/sessions",
    method: "POST",
    body: params,
  });

  return {
    id: response.id,
    url: response.url ?? null,
    customer: response.customer ?? null,
    subscription: response.subscription ?? null,
    metadata: response.metadata ?? {},
  };
}

export async function createBillingPortalSession(args: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const params = new URLSearchParams();
  appendFormEncoded(params, "customer", args.customerId);
  appendFormEncoded(params, "return_url", args.returnUrl);

  const response = await stripeApiRequest<{ url: string }>({
    path: "/v1/billing_portal/sessions",
    method: "POST",
    body: params,
  });

  return {
    url: response.url,
  };
}

export async function findExistingSubscriptionForCustomer(args: {
  customerId: string;
}): Promise<
  | {
      id: string;
      status: string;
      priceId: string | null;
      interval: "month" | "year" | null;
    }
  | null
> {
  const response = await stripeApiRequest<{
    data?: Array<{
      id?: string;
      status?: string;
      items?: {
        data?: Array<{
          price?: {
            id?: string;
            recurring?: {
              interval?: string;
            };
          };
        }>;
      };
    }>;
  }>({
    path: `/v1/subscriptions?customer=${encodeURIComponent(args.customerId)}&status=all&limit=10`,
    method: "GET",
  });

  const subscriptions = Array.isArray(response.data) ? response.data : [];
  const existing = subscriptions.find((subscription) => {
    const status = subscription.status ?? "";
    return status !== "canceled" && status !== "incomplete_expired";
  });

  if (!existing?.id) {
    return null;
  }

  const firstItem = Array.isArray(existing.items?.data) ? existing.items?.data[0] : undefined;
  const priceId = firstItem?.price?.id ?? null;
  const interval = firstItem?.price?.recurring?.interval;

  return {
    id: existing.id,
    status: existing.status ?? "unknown",
    priceId,
    interval: interval === "year" ? "year" : interval === "month" ? "month" : null,
  };
}

export async function createStripeCustomer(args: {
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<{ id: string }> {
  const params = new URLSearchParams();
  appendFormEncoded(params, "email", args.email ?? null);
  appendFormEncoded(params, "name", args.name ?? null);
  appendFormEncoded(params, "metadata[userId]", args.userId);

  return stripeApiRequest<{ id: string }>({
    path: "/v1/customers",
    method: "POST",
    body: params,
  });
}

export async function ensureStripeCustomer(args: {
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<string> {
  const entitlement = await ensureBillingEntitlement(args.userId);
  if (entitlement.stripeCustomerId) {
    return entitlement.stripeCustomerId;
  }

  const customer = await createStripeCustomer({
    userId: args.userId,
    email: args.email,
    name: args.name,
  });

  await prisma.billingEntitlement.update({
    where: { userId: args.userId },
    data: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function parseStripeSignatureHeader(signature: string): {
  timestamp: string;
  signatures: string[];
} {
  const parts = signature
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) {
      timestamp = value;
    }

    if (key === "v1" && value) {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error("Malformed stripe-signature header.");
  }

  return { timestamp, signatures };
}

function verifyStripeWebhookSignature(args: {
  payload: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
}): void {
  const toleranceSeconds = args.toleranceSeconds ?? 300;
  const { timestamp, signatures } = parseStripeSignatureHeader(args.signature);

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Invalid webhook timestamp.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) {
    throw new Error("Webhook timestamp is outside the allowed tolerance.");
  }

  const signedPayload = `${timestamp}.${args.payload}`;
  const expectedSignature = createHmac("sha256", args.secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature);
  const matched = signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate);
    if (candidateBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(candidateBuffer, expectedBuffer);
  });

  if (!matched) {
    throw new Error("Invalid webhook signature.");
  }
}

export function constructStripeWebhookEvent(args: {
  payload: string;
  signature: string;
}): StripeWebhookEvent {
  verifyStripeWebhookSignature({
    payload: args.payload,
    signature: args.signature,
    secret: getStripeWebhookSecret(),
  });

  const parsed = JSON.parse(args.payload) as StripeWebhookEvent;
  if (!parsed?.id || !parsed?.type || !parsed?.data?.object) {
    throw new Error("Invalid webhook payload.");
  }

  return parsed;
}

export function resolveCheckoutBaseUrl(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const parsed = new URL(requestUrl);
  return `${parsed.protocol}//${parsed.host}`;
}
