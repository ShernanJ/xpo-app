import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { issueExtensionApiToken } from "@/lib/extension/auth";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "extension:token",
    user: {
      limit: 6,
      windowMs: 10 * 60 * 1000,
      message: "Too many extension token requests. Please wait before creating another token.",
    },
    ip: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many extension token requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<{ name?: unknown } | null>(request, {
    maxBytes: 4 * 1024,
    allowEmpty: true,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value ?? {};

  const issued = await issueExtensionApiToken({
    userId: session.user.id,
    name: typeof body.name === "string" ? body.name : "xpo-companion",
  });

  return NextResponse.json({
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
  });
}
