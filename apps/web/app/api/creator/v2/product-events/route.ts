import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { recordProductEvent } from "@/lib/productEvents";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

interface ProductEventRequest extends Record<string, unknown> {
  eventType?: unknown;
  threadId?: unknown;
  messageId?: unknown;
  candidateId?: unknown;
  properties?: unknown;
}

export async function POST(request: NextRequest) {
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

  let body: ProductEventRequest;
  try {
    body = (await request.json()) as ProductEventRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

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
