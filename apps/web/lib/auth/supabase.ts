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

interface SupabaseAuthUserResponse {
  user?: {
    id?: string;
    email?: string | null;
  } | null;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  msg?: string;
}

export interface SupabaseAuthSuccess {
  userId: string;
  email: string | null;
}

export type SupabaseAuthErrorCode =
  | "invalid_credentials"
  | "invalid_otp"
  | "user_exists"
  | "email_confirmation_required"
  | "missing_configuration"
  | "request_failed";

export interface SupabaseAuthError {
  code: SupabaseAuthErrorCode;
  message: string;
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

  if (normalized.includes("invalid login credentials")) {
    return { code: "invalid_credentials", message: "Invalid email or password." };
  }

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

  if (normalized.includes("user already registered")) {
    return { code: "user_exists", message: "An account already exists for this email." };
  }

  if (normalized.includes("email not confirmed")) {
    return {
      code: "email_confirmation_required",
      message: "Please verify your email before signing in.",
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
  payload: SupabaseAuthTokenResponse | SupabaseAuthUserResponse,
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

export async function signInWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ ok: true; data: SupabaseAuthSuccess } | { ok: false; error: SupabaseAuthError }> {
  try {
    const payload = await supabaseAuthRequest<SupabaseAuthTokenResponse>(
      "/token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    return { ok: true, data: parseTokenResponse(payload) };
  } catch (error) {
    return { ok: false, error: asSupabaseAuthError(error) };
  }
}

export async function signUpWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ ok: true; data: SupabaseAuthSuccess } | { ok: false; error: SupabaseAuthError }> {
  try {
    const payload = await supabaseAuthRequest<SupabaseAuthUserResponse>("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!payload.user?.id || !payload.access_token) {
      return {
        ok: false,
        error: {
          code: "email_confirmation_required",
          message: "Please verify your email before signing in.",
        },
      };
    }

    return { ok: true, data: parseTokenResponse(payload) };
  } catch (error) {
    return { ok: false, error: asSupabaseAuthError(error) };
  }
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
  const verificationTypes = ["email", "signup", "magiclink"] as const;
  let lastOtpError: SupabaseAuthError | null = null;

  for (const type of verificationTypes) {
    try {
      const payload = await supabaseAuthRequest<
        SupabaseAuthTokenResponse | SupabaseAuthUserResponse
      >("/verify", {
        method: "POST",
        body: JSON.stringify({ email, token, type }),
      });
      return { ok: true, data: parseTokenResponse(payload) };
    } catch (error) {
      const parsedError = asSupabaseAuthError(error);
      if (parsedError.code === "invalid_otp") {
        lastOtpError = parsedError;
        continue;
      }
      return { ok: false, error: parsedError };
    }
  }

  return {
    ok: false,
    error:
      lastOtpError ?? {
        code: "invalid_otp",
        message: "Invalid or expired verification code.",
      },
  };
}
