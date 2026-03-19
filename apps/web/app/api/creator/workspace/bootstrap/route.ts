import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { loadCreatorWorkspaceSnapshot } from "@/lib/creator/workspaceSnapshot";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

interface CreatorWorkspaceBootstrapRequest extends Record<string, unknown> {
  runId?: unknown;
}

export async function POST(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "auth", message: "Unauthorized" }],
      },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:workspace_bootstrap",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many workspace bootstrap requests. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message:
        "Too many workspace bootstrap requests from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<CreatorWorkspaceBootstrapRequest>(request, {
    maxBytes: 16 * 1024,
    field: "runId",
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const snapshot = await loadCreatorWorkspaceSnapshot({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    input: body,
  });
  if (!snapshot.ok) {
    const status = snapshot.code === "MISSING_ONBOARDING_RUN" ? 404 : 409;
    return NextResponse.json(
      {
        ok: false,
        code: snapshot.code,
        errors: [{ field: "auth", message: snapshot.message }],
      },
      { status },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        context: snapshot.contextData,
        contract: snapshot.contractData,
      },
    },
    { status: 200 },
  );
}
