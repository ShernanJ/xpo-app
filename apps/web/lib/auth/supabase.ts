interface SupabaseAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string | null;
  } | null;
  error?: string;
  error_description?: string;
  msg?: string;
}

export interface SupabaseAuthSuccess {
  userId: string;
  email: string | null;
}

export type SupabaseAuthErrorCode =
  | "invalid_otp"
  | "invalid_access_token"
  | "rate_limited"
  | "missing_configuration"
  | "request_failed";

export interface SupabaseAuthError {
  code: SupabaseAuthErrorCode;
  message: string;
}

interface SupabaseAuthUserProfileResponse {
  id?: string;
  email?: string | null;
}

class SupabaseAuthRequestError extends Error {
  code: SupabaseAuthErrorCode;

  constructor(error: SupabaseAuthError) {
    super(error.message);
    this.code = error.code;
    this.name = "SupabaseAuthRequestError";
  }
}

function getSupabaseAuthConfig(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
  }

  return { url, anonKey };
}

function deriveSupabaseError(data: unknown, fallback: string): SupabaseAuthError {
  const payload =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw =
    (typeof payload.error_description === "string" && payload.error_description) ||
    (typeof payload.error === "string" && payload.error) ||
    (typeof payload.msg === "string" && payload.msg) ||
    fallback;
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("otp") &&
    (normalized.includes("invalid") || normalized.includes("expired"))
  ) {
    return { code: "invalid_otp", message: "Invalid or expired verification code." };
  }

  if (
    normalized.includes("token has expired") ||
    normalized.includes("token is invalid") ||
    normalized.includes("invalid token")
  ) {
    return { code: "invalid_otp", message: "Invalid or expired verification code." };
  }

  if (
    normalized.includes("too many") ||
    normalized.includes("rate limit") ||
    normalized.includes("request this after") ||
    (normalized.includes("after") && normalized.includes("seconds"))
  ) {
    return {
      code: "rate_limited",
      message: "A verification code was just sent. Please wait a moment before requesting another one.",
    };
  }

  return { code: "request_failed", message: raw };
}

async function supabaseAuthRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { url, anonKey } = getSupabaseAuthConfig();
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...(init.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !data) {
    throw new SupabaseAuthRequestError(
      deriveSupabaseError(data, "Supabase auth request failed."),
    );
  }

  return data;
}

async function supabaseAuthRequestWithoutBody(path: string, init: RequestInit): Promise<void> {
  const { url, anonKey } = getSupabaseAuthConfig();
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      ...(init.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new SupabaseAuthRequestError(
      deriveSupabaseError(data, "Supabase auth request failed."),
    );
  }
}

function parseTokenResponse(
  payload: SupabaseAuthTokenResponse,
): SupabaseAuthSuccess {
  const userId = payload.user?.id?.trim();
  if (!userId) {
    throw new Error("Supabase did not return a user id.");
  }

  return {
    userId,
    email: payload.user?.email ?? null,
  };
}

function asSupabaseAuthError(error: unknown): SupabaseAuthError {
  if (
    error instanceof SupabaseAuthRequestError &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (
    error instanceof Error &&
    error.message.includes("SUPABASE_URL and SUPABASE_ANON_KEY")
  ) {
    return {
      code: "missing_configuration",
      message: error.message,
    };
  }

  return {
    code: "request_failed",
    message: error instanceof Error ? error.message : "Supabase auth request failed.",
  };
}

export async function requestSupabaseEmailCode(
  email: string,
  options?: { createUser?: boolean },
): Promise<{ ok: true } | { ok: false; error: SupabaseAuthError }> {
  try {
    await supabaseAuthRequestWithoutBody("/otp", {
      method: "POST",
      body: JSON.stringify({
        email,
        create_user: options?.createUser ?? true,
      }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: asSupabaseAuthError(error) };
  }
}

export async function verifySupabaseEmailCode(
  email: string,
  token: string,
): Promise<{ ok: true; data: SupabaseAuthSuccess } | { ok: false; error: SupabaseAuthError }> {
  try {
    const payload = await supabaseAuthRequest<SupabaseAuthTokenResponse>("/verify", {
      method: "POST",
      body: JSON.stringify({ email, token, type: "email" }),
    });
    return { ok: true, data: parseTokenResponse(payload) };
  } catch (error) {
    return { ok: false, error: asSupabaseAuthError(error) };
  }
}

export async function getSupabaseUserFromAccessToken(
  accessToken: string,
): Promise<{ ok: true; data: SupabaseAuthSuccess } | { ok: false; error: SupabaseAuthError }> {
  try {
    const { url, anonKey } = getSupabaseAuthConfig();
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | SupabaseAuthUserProfileResponse
      | Record<string, unknown>
      | null;

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: {
          code: "invalid_access_token",
          message: "Google sign-in expired. Please try again.",
        },
      };
    }

    if (!response.ok || !payload) {
      throw new SupabaseAuthRequestError(
        deriveSupabaseError(payload, "Supabase auth request failed."),
      );
    }

    return {
      ok: true,
      data: parseTokenResponse({
        user: {
          id: payload.id,
          email: payload.email ?? null,
        },
      }),
    };
  } catch (error) {
    return { ok: false, error: asSupabaseAuthError(error) };
  }
}
