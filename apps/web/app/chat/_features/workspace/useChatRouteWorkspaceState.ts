"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import {
  buildChatWorkspaceUrl,
  buildWorkspaceHandleHeaders,
} from "@/lib/workspaceHandle";
import { buildPostHogHeaders } from "@/lib/posthog/client";

import { normalizeAccountHandle } from "../chat-page/chatPageViewState";
import { resolveWorkspaceHandle } from "./chatWorkspaceState";

interface UseChatRouteWorkspaceStateOptions {
  sessionHandle: string | null;
  sessionUserId: string | null | undefined;
  status: string;
}

interface CreatorHandlesResponse {
  ok: boolean;
  data?: {
    activeHandle?: string | null;
    handles?: string[];
  };
}

export function useChatRouteWorkspaceState(
  options: UseChatRouteWorkspaceStateOptions,
) {
  const { sessionHandle, sessionUserId, status } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const threadIdRaw = params?.threadId as string | string[] | undefined;

  const searchParamsKey = searchParams.toString();
  const searchHandle = searchParams.get("xHandle");
  const searchThreadId = searchParams.get("threadId")?.trim() ?? null;
  const messageIdParam = searchParams.get("messageId")?.trim() ?? null;
  const threadIdParam =
    (Array.isArray(threadIdRaw) ? threadIdRaw[0]?.trim() : threadIdRaw?.trim()) ??
    searchThreadId ??
    null;
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";
  const billingQueryStatus = searchParams.get("billing")?.trim() ?? "";
  const billingQuerySessionId = searchParams.get("session_id")?.trim() ?? "";
  const requestedModal = searchParams.get("modal")?.trim() ?? "";
  const normalizedSearchHandle = normalizeAccountHandle(searchHandle ?? "");
  const normalizedSessionHandle = normalizeAccountHandle(sessionHandle ?? "");
  const [validatedAccountName, setValidatedAccountName] = useState<string | null>(
    status === "authenticated" ? null : normalizedSearchHandle || normalizedSessionHandle || null,
  );
  const [isHandleValidationResolved, setIsHandleValidationResolved] = useState(
    status !== "authenticated",
  );

  useEffect(() => {
    if (status !== "authenticated" || !sessionUserId) {
      setValidatedAccountName(
        resolveWorkspaceHandle({
          searchHandle,
          sessionHandle,
        }),
      );
      setIsHandleValidationResolved(status !== "loading");
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    setIsHandleValidationResolved(false);

    const redirectToFallback = (fallbackHandle: string | null) => {
      const nextUrl = buildChatWorkspaceUrl({ xHandle: fallbackHandle });
      router.replace(nextUrl, { scroll: false });
    };

    fetch("/api/creator/profile/handles", {
      method: "GET",
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<CreatorHandlesResponse>)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        const handles = Array.isArray(payload.data?.handles)
          ? payload.data.handles.map((handle) => normalizeAccountHandle(handle)).filter(Boolean)
          : [];
        const activeHandle = normalizeAccountHandle(payload.data?.activeHandle ?? "");
        const nextActiveHandle = handles.includes(activeHandle) ? activeHandle : null;

        if (normalizedSearchHandle && !handles.includes(normalizedSearchHandle)) {
          setValidatedAccountName(nextActiveHandle);
          setIsHandleValidationResolved(true);
          redirectToFallback(nextActiveHandle);
          return;
        }

        setValidatedAccountName(normalizedSearchHandle || nextActiveHandle || null);
        setIsHandleValidationResolved(true);
      })
      .catch((error) => {
        if (!isActive || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        const fallbackHandle = normalizedSessionHandle || null;
        if (normalizedSearchHandle && normalizedSearchHandle !== fallbackHandle) {
          redirectToFallback(fallbackHandle);
        }
        setValidatedAccountName(fallbackHandle);
        setIsHandleValidationResolved(true);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    normalizedSearchHandle,
    normalizedSessionHandle,
    router,
    searchHandle,
    sessionHandle,
    sessionUserId,
    status,
  ]);

  const accountName = validatedAccountName;
  const isWorkspaceHandleValidating =
    status === "authenticated" && !isHandleValidationResolved;
  const requiresXAccountGate =
    status === "authenticated" &&
    isHandleValidationResolved &&
    !accountName;
  const sourceMaterialsBootstrapKey = useMemo(() => {
    const normalizedHandle = normalizeAccountHandle(accountName ?? "");
    const accountKey = normalizedHandle || sessionUserId?.trim() || "default";
    return `xpo:stories-proof-bootstrap:${accountKey}`;
  }, [accountName, sessionUserId]);
  const buildWorkspaceHeaders = useCallback(
    (headers?: HeadersInit) =>
      buildPostHogHeaders(buildWorkspaceHandleHeaders(accountName, headers)),
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
    isWorkspaceHandleValidating,
    messageIdParam,
    requiresXAccountGate,
    requestedModal,
    searchParamsKey,
    sourceMaterialsBootstrapKey,
    threadIdParam,
  };
}
