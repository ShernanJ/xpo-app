import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { ensureBillingEntitlement } from "@/lib/billing/entitlements";
import {
  createBillingPortalSession,
  ensureStripeCustomer,
  resolveCheckoutBaseUrl,
} from "@/lib/billing/stripe";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import {
  buildErrorResponse,
  enforceSessionMutationRateLimit,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

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
    scope: "billing:portal",
    user: {
      limit: 10,
      windowMs: 5 * 60 * 1000,
      message: "Too many billing portal requests. Please wait before trying again.",
    },
    ip: {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: "Too many billing portal requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const entitlement = await ensureBillingEntitlement(session.user.id);
  const customerId = entitlement.stripeCustomerId
    ? entitlement.stripeCustomerId
    : await ensureStripeCustomer({
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
      });

  const baseUrl = resolveCheckoutBaseUrl(request.url);
  const portalSession = await createBillingPortalSession({
    customerId,
    returnUrl: `${baseUrl}/chat`,
  });

  if (!portalSession.url) {
    return buildErrorResponse({
      status: 502,
      field: "billing",
      message: "Billing portal is unavailable right now.",
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      url: portalSession.url,
    },
  });
}
