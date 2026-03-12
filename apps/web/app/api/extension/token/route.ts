import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { issueExtensionApiToken } from "@/lib/extension/auth";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: { name?: unknown } = {};

  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    body = {};
  }

  const issued = await issueExtensionApiToken({
    userId: session.user.id,
    name: typeof body.name === "string" ? body.name : "xpo-companion",
  });

  return NextResponse.json({
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
  });
}
