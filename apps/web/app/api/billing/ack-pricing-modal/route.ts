import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import {
  getBillingStateForUser,
  markPricingModalSeen,
} from "@/lib/billing/entitlements";
import { isMonetizationEnabled } from "@/lib/billing/monetization";

export async function POST() {
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

  await markPricingModalSeen(session.user.id);
  const state = await getBillingStateForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    data: state,
  });
}
