import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
  normalizeAuthCallbackUrl,
  normalizePostLoginXHandle,
  resolveAppOrigin,
} from "@/lib/auth/oauth";

function getSupabaseAuthConfig(): { url: string } {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!url) {
    throw new Error("SUPABASE_URL must be configured.");
  }

  return { url };
}

function buildLoginRedirectUrl(request: Request, message: string): URL {
  const loginUrl = new URL("/login", resolveAppOrigin(request));
  loginUrl.searchParams.set("authError", message);
  return loginUrl;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const callbackUrl = normalizeAuthCallbackUrl(
      requestUrl.searchParams.get("callbackUrl"),
    );
    const xHandle = normalizePostLoginXHandle(
      requestUrl.searchParams.get("xHandle"),
    );
    const state = randomBytes(24).toString("base64url");
    const redirectTo = new URL("/auth/callback/google", resolveAppOrigin(request));
    redirectTo.searchParams.set("callbackUrl", callbackUrl);
    redirectTo.searchParams.set("state", state);
    if (xHandle) {
      redirectTo.searchParams.set("xHandle", xHandle);
    }

    const authorizeUrl = new URL(`${getSupabaseAuthConfig().url}/auth/v1/authorize`);
    authorizeUrl.searchParams.set("provider", "google");
    authorizeUrl.searchParams.set("redirect_to", redirectTo.toString());

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set({
      name: GOOGLE_OAUTH_STATE_COOKIE_NAME,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Could not start Google OAuth:", error);
    return NextResponse.redirect(
      buildLoginRedirectUrl(
        request,
        "Google sign-in is not configured yet. Please try email instead.",
      ),
    );
  }
}
