import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { ensureBillingEntitlement } from "@/lib/billing/entitlements";
import {
  createBillingPortalSession,
  ensureStripeCustomer,
  resolveCheckoutBaseUrl,
} from "@/lib/billing/stripe";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

export async function POST(request: NextRequest) {
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

  return NextResponse.json({
    ok: true,
    data: {
      url: portalSession.url,
    },
  });
}
