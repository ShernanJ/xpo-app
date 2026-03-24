import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  finalizeDraftPublishForWorkspace,
  parseDraftPublishRequest,
} from "@/lib/content/publishFinalization";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
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
    scope: "draft_publish",
    user: {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: "Too many publish updates. Please wait before trying again.",
    },
    ip: {
      limit: 60,
      windowMs: 5 * 60 * 1000,
      message: "Too many publish updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<Record<string, unknown>>(request, {
    maxBytes: 64 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = parseDraftPublishRequest(bodyResult.value);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: parsed.field, message: parsed.message }] },
      { status: 400 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const { draftId } = await params;
  const result = await finalizeDraftPublishForWorkspace({
    id: draftId,
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    finalPublishedText: parsed.data.finalPublishedText,
    publishedTweetId: parsed.data.publishedTweetId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: result.field, message: result.message }] },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true });
}
