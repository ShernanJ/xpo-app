"use client";

import { useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";

import {
  buildChatWorkspaceUrl,
  buildWorkspaceHandleHeaders,
} from "@/lib/workspaceHandle";

import { normalizeAccountHandle } from "../chat-page/chatPageViewState";
import { resolveWorkspaceHandle } from "./chatWorkspaceState";

interface UseChatRouteWorkspaceStateOptions {
  sessionHandle: string | null;
  sessionUserId: string | null | undefined;
  status: string;
}

export function useChatRouteWorkspaceState(
  options: UseChatRouteWorkspaceStateOptions,
) {
  const { sessionHandle, sessionUserId, status } = options;
  const searchParams = useSearchParams();
  const params = useParams();
  const threadIdRaw = params?.threadId as string | string[] | undefined;

  const searchParamsKey = searchParams.toString();
  const searchHandle = searchParams.get("xHandle");
  const searchThreadId = searchParams.get("threadId")?.trim() ?? null;
  const threadIdParam =
    (Array.isArray(threadIdRaw) ? threadIdRaw[0]?.trim() : threadIdRaw?.trim()) ??
    searchThreadId ??
    null;
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";
  const billingQueryStatus = searchParams.get("billing")?.trim() ?? "";
  const billingQuerySessionId = searchParams.get("session_id")?.trim() ?? "";

  const accountName = useMemo(
    () =>
      resolveWorkspaceHandle({
        searchHandle,
        sessionHandle,
      }),
    [searchHandle, sessionHandle],
  );
  const requiresXAccountGate = status === "authenticated" && !accountName;
  const sourceMaterialsBootstrapKey = useMemo(() => {
    const normalizedHandle = normalizeAccountHandle(accountName ?? "");
    const accountKey = normalizedHandle || sessionUserId?.trim() || "default";
    return `xpo:stories-proof-bootstrap:${accountKey}`;
  }, [accountName, sessionUserId]);
  const buildWorkspaceHeaders = useCallback(
    (headers?: HeadersInit) => buildWorkspaceHandleHeaders(accountName, headers),
    [accountName],
  );
  const fetchWorkspace = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        headers: buildWorkspaceHeaders(init?.headers),
      }),
    [buildWorkspaceHeaders],
  );
  const buildWorkspaceChatHref = useCallback(
    (threadId?: string | null) => buildChatWorkspaceUrl({ threadId, xHandle: accountName }),
    [accountName],
  );

  return {
    accountName,
    backfillJobId,
    billingQuerySessionId,
    billingQueryStatus,
    buildWorkspaceChatHref,
    fetchWorkspace,
    requiresXAccountGate,
    searchParamsKey,
    sourceMaterialsBootstrapKey,
    threadIdParam,
  };
}
