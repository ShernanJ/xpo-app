import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";
import {
  capturePostHogServerEvent,
  capturePostHogServerException,
  identifyPostHogServerUser,
} from "@/lib/posthog/server";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
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

function resolveEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

async function responseWithVerificationCode(email: string): Promise<NextResponse> {
  const codeRequest = await requestSupabaseEmailCode(email, { createUser: true });
  if (!codeRequest.ok && codeRequest.error.code !== "rate_limited") {
    const status = codeRequest.error.code === "missing_configuration" ? 500 : 400;
    return NextResponse.json({ ok: false, error: codeRequest.error.message }, { status });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        codeRequest.ok
          ? "We sent a verification code to your email. Enter it below to continue."
          : "A verification code was just sent. Enter it below to continue.",
      code: "verification_code_required",
    },
    { status: 409 },
  );
}

async function responseWithEmailDeliveryError(email: string): Promise<NextResponse> {
  const codeRequest = await requestSupabaseEmailCode(email, { createUser: true });
  if (codeRequest.ok || codeRequest.error.code === "rate_limited") {
    return NextResponse.json(
      {
        ok: false,
        error:
          codeRequest.ok
            ? "We sent a verification code to your email. Enter it below to continue."
            : "A verification code was just sent. Enter it below to continue.",
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
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimit = await consumeRateLimit({
    key: `auth:login:ip:${getRequestIp(request)}`,
    limit: 12,
    windowMs: 5 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many login attempts. Please wait before trying again.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<LoginBody>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return buildErrorResponse({
      status: 400,
      field: "auth",
      message: "Email and password are required.",
    });
  }

  try {
    let createdNewAccount = false;
    let authResult = await signInWithSupabasePassword(email, password);

    if (!authResult.ok && authResult.error.code === "email_confirmation_required") {
      return responseWithVerificationCode(email);
    }

    if (!authResult.ok && isInvalidCredentialError(authResult.error.code)) {
      const signUpResult = await signUpWithSupabasePassword(email, password);

      if (signUpResult.ok) {
        createdNewAccount = true;
        authResult = signUpResult;
      } else if (signUpResult.error.code === "email_confirmation_required") {
        return responseWithVerificationCode(email);
      } else if (isEmailDeliveryError(signUpResult.error.message)) {
        return responseWithEmailDeliveryError(email);
      } else if (signUpResult.error.code !== "user_exists") {
        return buildErrorResponse({
          status: 500,
          field: "auth",
          message: signUpResult.error.message,
        });
      }
    }

    if (!authResult.ok) {
      const status = authResult.error.code === "missing_configuration" ? 500 : 401;
      return buildErrorResponse({
        status,
        field: "auth",
        message: authResult.error.message,
      });
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
    await identifyPostHogServerUser({
      request,
      distinctId: appUser.id,
      properties: {
        email: appUser.email,
        handle: appUser.handle,
        active_x_handle: appUser.activeXHandle,
      },
    });
    await capturePostHogServerEvent({
      request,
      distinctId: appUser.id,
      event: "xpo_auth_login_succeeded",
      properties: {
        email_domain: resolveEmailDomain(appUser.email ?? email),
        is_new_account: createdNewAccount,
        login_method: createdNewAccount ? "signup_password" : "password",
      },
    });
    return response;
  } catch (error) {
    console.error("Unexpected auth login error:", error);
    await capturePostHogServerException({
      request,
      error,
      properties: {
        email_domain: resolveEmailDomain(email),
        route: "/api/auth/login",
      },
    });
    return buildErrorResponse({
      status: 500,
      field: "auth",
      message: "Login failed due to a server issue. Please try again.",
    });
  }
}
