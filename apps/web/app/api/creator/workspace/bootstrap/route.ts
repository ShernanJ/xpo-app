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

const SETUP_PENDING_POLL_AFTER_MS = 1200;

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
    if (snapshot.code === "MISSING_ONBOARDING_RUN") {
      return NextResponse.json(
        {
          ok: false,
          code: "SETUP_PENDING",
          retryable: true,
          pollAfterMs: SETUP_PENDING_POLL_AFTER_MS,
          errors: [
            {
              field: "xHandle",
              message: "Setup is still finishing for this account.",
            },
          ],
        },
        { status: 202 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: snapshot.code,
        errors: [{ field: "xHandle", message: snapshot.message }],
      },
      { status: 409 },
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
