const DEFAULT_POST_LOGIN_DESTINATION = "/chat";

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "sx_google_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function normalizeAuthCallbackUrl(
  value: string | null | undefined,
  fallback = DEFAULT_POST_LOGIN_DESTINATION,
): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.startsWith("/") ? trimmed : fallback;
}

export function normalizePostLoginXHandle(
  value: string | null | undefined,
): string | null {
  const normalized = (value ?? "").trim().replace(/^@/, "").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function buildGoogleOAuthStartPath(args?: {
  callbackUrl?: string | null;
  xHandle?: string | null;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set(
    "callbackUrl",
    normalizeAuthCallbackUrl(args?.callbackUrl),
  );

  const normalizedHandle = normalizePostLoginXHandle(args?.xHandle);
  if (normalizedHandle) {
    searchParams.set("xHandle", normalizedHandle);
  }

  return `/api/auth/oauth/google/start?${searchParams.toString()}`;
}

export function resolveAppOrigin(request: Request): string {
  const requestOrigin = new URL(request.url).origin.trim();
  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, "");
  }

  const configuredOrigin =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  return configuredOrigin.replace(/\/+$/, "");
}
