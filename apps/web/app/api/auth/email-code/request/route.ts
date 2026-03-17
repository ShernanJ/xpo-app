import { NextResponse } from "next/server";

import { requestSupabaseEmailCode } from "@/lib/auth/supabase";
import {
  capturePostHogServerEvent,
  capturePostHogServerException,
} from "@/lib/posthog/server";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface EmailCodeRequestBody {
  email?: unknown;
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
    key: `auth:email_code_request:ip:${getRequestIp(request)}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many verification code requests. Please try again later.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<EmailCodeRequestBody>(request, {
    maxBytes: 4 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return buildErrorResponse({
      status: 400,
      field: "email",
      message: "Email is required.",
    });
  }

  try {
    const result = await requestSupabaseEmailCode(email, { createUser: true });
    if (!result.ok) {
      const status =
        result.error.code === "missing_configuration"
          ? 500
          : result.error.code === "rate_limited"
            ? 429
            : 400;
      return buildErrorResponse({
        status,
        field: "email",
        message: result.error.message,
      });
    }

    await capturePostHogServerEvent({
      request,
      distinctId: `email:${email}`,
      event: "xpo_auth_email_code_requested",
      properties: {
        email_domain: resolveEmailDomain(email),
        route: "/api/auth/email-code/request",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await capturePostHogServerException({
      request,
      distinctId: `email:${email}`,
      error,
      properties: {
        email_domain: resolveEmailDomain(email),
        route: "/api/auth/email-code/request",
      },
    });
    return buildErrorResponse({
      status: 500,
      field: "email",
      message: "Could not send a verification code right now.",
    });
  }
}
