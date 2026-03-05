import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/authOptions";
import { getBillingStateForUser } from "@/lib/billing/entitlements";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const state = await getBillingStateForUser(session.user.id);
  return NextResponse.json({
    ok: true,
    data: state,
  });
}
