import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";
import { verifySupabaseEmailCode } from "@/lib/auth/supabase";
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

interface EmailCodeVerifyBody {
  email?: unknown;
  code?: unknown;
}

function resolveEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
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
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimit = await consumeRateLimit({
    key: `auth:email_code_verify:ip:${getRequestIp(request)}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many verification attempts. Please try again later.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<EmailCodeVerifyBody>(request, {
    maxBytes: 4 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code =
    typeof body.code === "string"
      ? body.code
        .trim()
        .replace(/\s+/g, "")
        .toUpperCase()
      : "";

  if (!email || !code) {
    return buildErrorResponse({
      status: 400,
      field: "auth",
      message: "Email and verification code are required.",
    });
  }

  try {
    const authResult = await verifySupabaseEmailCode(email, code);
    if (!authResult.ok) {
      const status =
        authResult.error.code === "missing_configuration"
          ? 500
          : authResult.error.code === "invalid_otp"
            ? 401
            : 400;
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
      event: "xpo_auth_email_code_verified",
      properties: {
        email_domain: resolveEmailDomain(appUser.email ?? email),
        route: "/api/auth/email-code/verify",
      },
    });
    return response;
  } catch (error) {
    await capturePostHogServerException({
      request,
      distinctId: `email:${email}`,
      error,
      properties: {
        email_domain: resolveEmailDomain(email),
        route: "/api/auth/email-code/verify",
      },
    });
    return buildErrorResponse({
      status: 500,
      field: "auth",
      message: "Could not verify your code right now.",
    });
  }
}
