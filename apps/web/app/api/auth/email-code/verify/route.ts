import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";
import { verifySupabaseEmailCode } from "@/lib/auth/supabase";

interface EmailCodeVerifyBody {
  email?: unknown;
  code?: unknown;
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function POST(request: Request) {
  let body: EmailCodeVerifyBody;

  try {
    body = (await request.json()) as EmailCodeVerifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code =
    typeof body.code === "string"
      ? body.code
        .trim()
        .replace(/\s+/g, "")
        .toUpperCase()
      : "";

  if (!email || !code) {
    return NextResponse.json(
      { ok: false, error: "Email and verification code are required." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const authResult = await verifySupabaseEmailCode(email, code, {
    isSignUpHint: !existingUser,
  });
  if (!authResult.ok) {
    const status =
      authResult.error.code === "missing_configuration"
        ? 500
        : authResult.error.code === "invalid_otp"
          ? 401
          : 400;
    return NextResponse.json({ ok: false, error: authResult.error.message }, { status });
  }

  const appUser = await ensureAppUserForAuthIdentity({
    userId: authResult.data.userId,
    email: authResult.data.email ?? email,
  });

  const sessionToken = await createSessionToken({
    userId: appUser.id,
    email: appUser.email,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: appUser.id,
      email: appUser.email,
      handle: appUser.handle,
      activeXHandle: appUser.activeXHandle,
    },
  });
  setSessionCookie(response, sessionToken);
  return response;
}
