import { NextResponse } from "next/server";

import { getServerSession, updateAppSessionUser } from "@/lib/auth/serverSession";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface SessionPatchBody {
  activeXHandle?: unknown;
  handle?: unknown;
}

function normalizeHandle(value: string): string | null {
  const normalized = value.replace(/^@/, "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function GET() {
  const session = await getServerSession();
  return NextResponse.json({ ok: true, session });
}

export async function PATCH(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return buildErrorResponse({
      status: 401,
      field: "auth",
      message: "Unauthorized.",
    });
  }

  const userRateLimit = await consumeRateLimit({
    key: `auth:session:user:${session.user.id}`,
    limit: 20,
    windowMs: 5 * 60 * 1000,
  });
  if (!userRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many session updates. Please wait before trying again.",
      extras: {
        retryAfterSeconds: userRateLimit.retryAfterSeconds,
      },
    });
  }

  const ipRateLimit = await consumeRateLimit({
    key: `auth:session:ip:${getRequestIp(request)}`,
    limit: 40,
    windowMs: 5 * 60 * 1000,
  });
  if (!ipRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many session updates from this network. Please wait before trying again.",
      extras: {
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<SessionPatchBody>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const activeXHandle =
    typeof body.activeXHandle === "string"
      ? normalizeHandle(body.activeXHandle)
      : body.activeXHandle === null
        ? null
        : undefined;
  const handle =
    typeof body.handle === "string"
      ? normalizeHandle(body.handle)
      : body.handle === null
        ? null
        : undefined;

  const nextSession = await updateAppSessionUser(session.user.id, {
    activeXHandle,
    handle,
  });

  return NextResponse.json({
    ok: true,
    session: nextSession,
  });
}
