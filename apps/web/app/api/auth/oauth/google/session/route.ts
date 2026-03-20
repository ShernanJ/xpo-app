import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GOOGLE_OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/oauth";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";
import { getSupabaseUserFromAccessToken } from "@/lib/auth/supabase";
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

interface GoogleOAuthSessionBody {
  accessToken?: unknown;
  state?: unknown;
}

function clearGoogleOauthStateCookie(response: NextResponse) {
  response.cookies.set({
    name: GOOGLE_OAUTH_STATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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

function resolveEmailDomain(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  return domain || null;
}

export async function POST(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimit = await consumeRateLimit({
    key: `auth:google_oauth_session:ip:${getRequestIp(request)}`,
    limit: 12,
    windowMs: 5 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many Google sign-in attempts. Please wait before trying again.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<GoogleOAuthSessionBody>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const accessToken =
    typeof bodyResult.value.accessToken === "string"
      ? bodyResult.value.accessToken.trim()
      : "";
  const state =
    typeof bodyResult.value.state === "string" ? bodyResult.value.state.trim() : "";
  const cookieStore = await cookies();
  const cookieState =
    cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)?.value?.trim() ?? "";

  if (!accessToken || !state || !cookieState || state !== cookieState) {
    const response = NextResponse.json(
      { ok: false, error: "Google sign-in expired. Please try again." },
      { status: 401 },
    );
    clearGoogleOauthStateCookie(response);
    return response;
  }

  try {
    const authResult = await getSupabaseUserFromAccessToken(accessToken);
    if (!authResult.ok) {
      const status =
        authResult.error.code === "missing_configuration"
          ? 500
          : authResult.error.code === "invalid_access_token"
            ? 401
            : 400;
      const response = NextResponse.json(
        { ok: false, error: authResult.error.message },
        { status },
      );
      clearGoogleOauthStateCookie(response);
      return response;
    }

    const appUser = await ensureAppUserForAuthIdentity({
      userId: authResult.data.userId,
      email: authResult.data.email,
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
    clearGoogleOauthStateCookie(response);
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
      event: "xpo_auth_google_succeeded",
      properties: {
        email_domain: resolveEmailDomain(appUser.email ?? ""),
        route: "/api/auth/oauth/google/session",
        login_method: "google",
      },
    });

    return response;
  } catch (error) {
    await capturePostHogServerException({
      request,
      distinctId: cookieState || null,
      error,
      properties: {
        route: "/api/auth/oauth/google/session",
      },
    });
    const response = NextResponse.json(
      { ok: false, error: "Could not complete Google sign-in right now." },
      { status: 500 },
    );
    clearGoogleOauthStateCookie(response);
    return response;
  }
}
