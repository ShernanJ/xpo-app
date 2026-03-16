import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { recordProductEvent } from "@/lib/productEvents";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface ProductEventRequest extends Record<string, unknown> {
  eventType?: unknown;
  threadId?: unknown;
  messageId?: unknown;
  candidateId?: unknown;
  properties?: unknown;
}

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

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_product_events",
    user: {
      limit: 120,
      windowMs: 60 * 1000,
      message: "Too many product events. Please wait before sending more.",
    },
    ip: {
      limit: 300,
      windowMs: 60 * 1000,
      message: "Too many product events from this network. Please wait before sending more.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }
  const bodyResult = await parseJsonBody<ProductEventRequest>(request, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const eventType =
    typeof body.eventType === "string" ? body.eventType.trim() : "";
  if (!eventType) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "eventType", message: "An event type is required." }] },
      { status: 400 },
    );
  }

  await recordProductEvent({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    threadId: typeof body.threadId === "string" ? body.threadId : null,
    messageId: typeof body.messageId === "string" ? body.messageId : null,
    candidateId: typeof body.candidateId === "string" ? body.candidateId : null,
    eventType,
    properties:
      body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
        ? (body.properties as Record<string, unknown>)
        : {},
  });

  return NextResponse.json({ ok: true });
}
