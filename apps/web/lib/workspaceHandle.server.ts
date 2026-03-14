import { NextResponse } from "next/server.js";

import type { AppSession } from "./auth/types.ts";
import { prisma } from "./db.ts";

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
  field: string;
  message: string;
  status: number;
}) {
  return NextResponse.json(
    {
      ok: false,
      code: args.code,
      errors: [{ field: args.field, message: args.message }],
    },
    { status: args.status },
  );
}

export async function listWorkspaceHandlesForUser(args: {
  userId: string;
  sessionActiveHandle?: string | null;
}): Promise<string[]> {
  const [userProfiles, onboardingRuns, chatThreads] = await Promise.all([
    prisma.voiceProfile.findMany({
      where: { userId: args.userId },
      select: { xHandle: true },
    }),
    prisma.onboardingRun.findMany({
      where: { userId: args.userId },
      select: { input: true },
    }),
    prisma.chatThread.findMany({
      where: {
        userId: args.userId,
        xHandle: {
          not: null,
        },
      },
      select: { xHandle: true },
    }),
  ]);

  const onboardingHandles = onboardingRuns
    .map((run) => {
      const input = run.input as { account?: string } | null;
      return normalizeWorkspaceHandle(input?.account ?? null);
    })
    .filter((value): value is string => Boolean(value));
  const profileHandles = userProfiles
    .map((profile) => normalizeWorkspaceHandle(profile.xHandle))
    .filter((value): value is string => Boolean(value));
  const threadHandles = chatThreads
    .map((thread) => normalizeWorkspaceHandle(thread.xHandle))
    .filter((value): value is string => Boolean(value));
  const sessionHandle = normalizeWorkspaceHandle(args.sessionActiveHandle ?? null);

  return Array.from(
    new Set([
      ...profileHandles,
      ...onboardingHandles,
      ...threadHandles,
      ...(sessionHandle ? [sessionHandle] : []),
    ]),
  );
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

  const attachedHandles = await listWorkspaceHandlesForUser({
    userId: args.session.user.id,
    sessionActiveHandle: args.session.user.activeXHandle,
  });

  if (!attachedHandles.includes(requestHandle)) {
    return {
      ok: false as const,
      response: buildWorkspaceHandleErrorResponse({
        code: "HANDLE_NOT_ATTACHED",
        field: "xHandle",
        message: "That X handle is not attached to this Xpo profile.",
        status: 404,
      }),
    };
  }

  return {
    ok: true as const,
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
