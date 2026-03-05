import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";
import {
  requestSupabaseEmailCode,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
} from "@/lib/auth/supabase";

interface LoginBody {
  email?: unknown;
  password?: unknown;
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

function isInvalidCredentialError(code: string): boolean {
  return code === "invalid_credentials";
}

function isEmailDeliveryError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("error sending confirmation email") ||
    normalized.includes("error sending magic link email")
  );
}

async function responseWithVerificationCode(email: string): Promise<NextResponse> {
  const codeRequest = await requestSupabaseEmailCode(email, { createUser: true });
  if (!codeRequest.ok) {
    const status = codeRequest.error.code === "missing_configuration" ? 500 : 400;
    return NextResponse.json({ ok: false, error: codeRequest.error.message }, { status });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "We sent a verification code to your email. Enter it below to continue.",
      code: "verification_code_required",
    },
    { status: 409 },
  );
}

async function responseWithEmailDeliveryError(email: string): Promise<NextResponse> {
  const codeRequest = await requestSupabaseEmailCode(email, { createUser: true });
  if (codeRequest.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "We sent a verification code to your email. Enter it below to continue.",
        code: "verification_code_required",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "Email delivery is not configured in Supabase. Configure Auth > Settings > SMTP, or disable Confirm Email for local testing.",
    },
    { status: 502 },
  );
}

export async function POST(request: Request) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }

  let authResult = await signInWithSupabasePassword(email, password);

  if (!authResult.ok && authResult.error.code === "email_confirmation_required") {
    return responseWithVerificationCode(email);
  }

  if (!authResult.ok && isInvalidCredentialError(authResult.error.code)) {
    const signUpResult = await signUpWithSupabasePassword(email, password);

    if (signUpResult.ok) {
      authResult = signUpResult;
    } else if (signUpResult.error.code === "email_confirmation_required") {
      return responseWithVerificationCode(email);
    } else if (isEmailDeliveryError(signUpResult.error.message)) {
      return responseWithEmailDeliveryError(email);
    } else if (signUpResult.error.code !== "user_exists") {
      return NextResponse.json({ ok: false, error: signUpResult.error.message }, { status: 500 });
    }
  }

  if (!authResult.ok) {
    const status = authResult.error.code === "missing_configuration" ? 500 : 401;
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
