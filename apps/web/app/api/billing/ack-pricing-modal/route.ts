import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import {
  getBillingStateForUser,
  markPricingModalSeen,
} from "@/lib/billing/entitlements";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import {
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
    scope: "billing:ack_pricing_modal",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many pricing acknowledgements. Please wait before trying again.",
    },
    ip: {
      limit: 60,
      windowMs: 5 * 60 * 1000,
      message: "Too many pricing acknowledgements from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  await markPricingModalSeen(session.user.id);
  const state = await getBillingStateForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    data: state,
  });
}
