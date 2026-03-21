import { NextResponse } from "next/server.js";

import type { AppSession } from "./auth/types.ts";
import { prisma } from "./db.ts";
import { readWorkspaceHandleStateForUser } from "./userHandles.server.ts";

import {
  getWorkspaceHandleFromRequest,
  normalizeWorkspaceHandle,
} from "./workspaceHandle.ts";

type WorkspaceHandleFailureCode =
  | "HANDLE_REQUIRED"
  | "HANDLE_NOT_ATTACHED"
  | "THREAD_HANDLE_MISMATCH";

function buildWorkspaceHandleErrorResponse(args: {
  code: WorkspaceHandleFailureCode;
  data?: Record<string, unknown>;
  field: string;
  message: string;
  status: number;
}) {
  return NextResponse.json(
    {
      ok: false,
      code: args.code,
      ...(args.data ? { data: args.data } : {}),
      errors: [{ field: args.field, message: args.message }],
    },
    { status: args.status },
  );
}

export async function listWorkspaceHandlesForUser(args: {
  userId: string;
  sessionActiveHandle?: string | null;
}): Promise<string[]> {
  const state = await readWorkspaceHandleStateForUser(args);
  return state.handles;
}

export async function resolveWorkspaceHandleForRequest(args: {
  request: Request;
  session: AppSession;
  bodyHandle?: string | null | undefined;
  allowSessionFallback?: boolean;
}) {
  const requestHandle =
    getWorkspaceHandleFromRequest(args.request) ||
    normalizeWorkspaceHandle(args.bodyHandle ?? null) ||
    (args.allowSessionFallback
      ? normalizeWorkspaceHandle(args.session.user.activeXHandle ?? null)
      : null);

  if (!requestHandle) {
    return {
      ok: false as const,
      response: buildWorkspaceHandleErrorResponse({
        code: "HANDLE_REQUIRED",
        field: "xHandle",
        message: "A workspace X handle is required for this request.",
        status: 400,
      }),
    };
  }

  const handleState = await readWorkspaceHandleStateForUser({
    userId: args.session.user.id,
    sessionActiveHandle: args.session.user.activeXHandle,
  });
  const attachedHandles = handleState.handles;

  if (!attachedHandles.includes(requestHandle)) {
    return {
      ok: false as const,
      response: buildWorkspaceHandleErrorResponse({
        code: "HANDLE_NOT_ATTACHED",
        data: {
          fallbackHandle: handleState.activeHandle,
          requestedHandle: requestHandle,
        },
        field: "xHandle",
        message: "That X handle is not attached to this Xpo profile.",
        status: 404,
      }),
    };
  }

  return {
    ok: true as const,
    activeHandle: handleState.activeHandle,
    xHandle: requestHandle,
    attachedHandles,
  };
}

export async function resolveOwnedThreadForWorkspace(args: {
  threadId: string;
  userId: string;
  xHandle: string;
}) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: args.threadId },
  });

  if (!thread || thread.userId !== args.userId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized." }] },
        { status: 404 },
      ),
    };
  }

  const threadHandle = normalizeWorkspaceHandle(thread.xHandle);
  if (!threadHandle || threadHandle !== args.xHandle) {
    return {
      ok: false as const,
      response: buildWorkspaceHandleErrorResponse({
        code: "THREAD_HANDLE_MISMATCH",
        field: "threadId",
        message: "This thread belongs to a different X handle.",
        status: 409,
      }),
    };
  }

  return {
    ok: true as const,
    thread,
  };
}
