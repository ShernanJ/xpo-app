import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { capturePostHogServerEvent } from "@/lib/posthog/server";
import { requireAllowedOrigin } from "@/lib/security/requestValidation";

export async function POST(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (session?.user?.id) {
    await capturePostHogServerEvent({
      request,
      distinctId: session.user.id,
      event: "xpo_auth_logout_completed",
      properties: {
        route: "/api/auth/logout",
      },
    });
  }
  return response;
}
