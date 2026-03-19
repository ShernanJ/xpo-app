import { NextResponse } from "next/server.js";

import { listWorkspaceHandlesForUser } from "../workspaceHandle.server.ts";
import {
  getWorkspaceHandleFromRequest,
  normalizeWorkspaceHandle,
} from "../workspaceHandle.ts";

export interface ExtensionHandleResolutionSuccess {
  ok: true;
  xHandle: string;
  attachedHandles: string[];
}

export interface ExtensionHandleResolutionFailure {
  ok: false;
  status: number;
  field: string;
  message: string;
  attachedHandles: string[];
}

export type ExtensionHandleResolution =
  | ExtensionHandleResolutionSuccess
  | ExtensionHandleResolutionFailure;

interface ExtensionHandleAccessArgs {
  userId: string;
  requestedHandle: string | null | undefined;
  attachedHandles?: string[];
  activeXHandle?: string | null;
}

export function buildExtensionHandleErrorResponse(args: {
  status: number;
  field?: string;
  message: string;
}) {
  return NextResponse.json(
    {
      ok: false,
      errors: [{ field: args.field ?? "xHandle", message: args.message }],
    },
    { status: args.status },
  );
}

export async function listExtensionHandlesForUser(args: {
  userId: string;
  activeXHandle?: string | null;
}) {
  return listWorkspaceHandlesForUser({
    userId: args.userId,
    sessionActiveHandle: args.activeXHandle,
  });
}

export async function resolveExtensionHandleAccess(
  args: ExtensionHandleAccessArgs,
): Promise<ExtensionHandleResolution> {
  const requestedHandle = normalizeWorkspaceHandle(args.requestedHandle);

  if (!requestedHandle) {
    return {
      ok: false,
      status: 400,
      field: "xHandle",
      message: "A workspace X handle is required for this request.",
      attachedHandles: args.attachedHandles ?? [],
    };
  }

  const attachedHandles =
    args.attachedHandles ??
    (await listExtensionHandlesForUser({
      userId: args.userId,
      activeXHandle: args.activeXHandle,
    }));

  if (!attachedHandles.includes(requestedHandle)) {
    return {
      ok: false,
      status: 404,
      field: "xHandle",
      message: "That X handle is not attached to this Xpo profile.",
      attachedHandles,
    };
  }

  return {
    ok: true,
    xHandle: requestedHandle,
    attachedHandles,
  };
}

export async function resolveExtensionHandleForRequest(args: {
  request: Request;
  userId: string;
  requestedHandle?: string | null | undefined;
  attachedHandles?: string[];
  activeXHandle?: string | null;
}) {
  const requestHandle =
    getWorkspaceHandleFromRequest(args.request) ||
    normalizeWorkspaceHandle(args.requestedHandle ?? null);

  return resolveExtensionHandleAccess({
    userId: args.userId,
    requestedHandle: requestHandle,
    attachedHandles: args.attachedHandles,
    activeXHandle: args.activeXHandle,
  });
}
