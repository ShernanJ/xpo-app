import { NextResponse } from "next/server";

import { requestSupabaseEmailCode } from "@/lib/auth/supabase";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface LoginBody {
  email?: unknown;
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

  const email =
    typeof bodyResult.value.email === "string"
      ? bodyResult.value.email.trim().toLowerCase()
      : "";

  if (!email) {
    return buildErrorResponse({
      status: 400,
      field: "auth",
      message: "Email is required.",
    });
  }

  const codeRequest = await requestSupabaseEmailCode(email, { createUser: true });
  if (!codeRequest.ok) {
    const status =
      codeRequest.error.code === "missing_configuration"
        ? 500
        : codeRequest.error.code === "rate_limited"
          ? 429
          : 400;
    return buildErrorResponse({
      status,
      field: "auth",
      message: codeRequest.error.message,
    });
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
