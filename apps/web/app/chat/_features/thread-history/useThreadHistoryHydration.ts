"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

import type { ChatActiveTurn } from "../chat-page/chatPageTypes";
import {
  resolveThreadHistoryHydration,
  type ThreadHistoryMessageLike,
} from "./chatThreadHistoryState";

interface UseThreadHistoryHydrationOptions<TMessage extends ThreadHistoryMessageLike> {
  accountName: string | null;
  activeTurn: ChatActiveTurn | null;
  activeThreadId: string | null;
  activeStrategyInputs: unknown;
  activeToneInputs: unknown;
  context: unknown;
  contract: unknown;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  isSending: boolean;
  jumpThreadToBottomImmediately: () => void;
  searchParamsKey: string;
  setActiveTurn: (turn: ChatActiveTurn | null) => void;
  setIsThreadHydrating: (value: boolean) => void;
  setMessages: (messages: TMessage[]) => void;
  setStatusMessage: (value: string | null) => void;
  shouldJumpToBottomAfterThreadSwitchRef: MutableRefObject<boolean>;
  threadCreatedInSessionRef: MutableRefObject<boolean>;
}

interface ThreadHistoryRouteResponse<TMessage extends ThreadHistoryMessageLike> {
  ok?: boolean;
  data?: {
    messages?: Array<{
      id: string;
      role: TMessage["role"];
      content: string;
      createdAt?: unknown;
      threadId?: unknown;
      feedbackValue?: unknown;
      data?: Partial<TMessage> | null;
    }>;
    activeTurn?: ChatActiveTurn | null;
  };
}

interface TurnStatusRouteResponse {
  ok?: boolean;
  data?: {
    turn?: ChatActiveTurn | null;
  };
}

function isTurnStillActive(status: ChatActiveTurn["status"]): boolean {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

export function useThreadHistoryHydration<TMessage extends ThreadHistoryMessageLike>(
  options: UseThreadHistoryHydrationOptions<TMessage>,
) {
  const {
    accountName,
    activeTurn,
    activeThreadId,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    searchParamsKey,
    setActiveTurn,
    setIsThreadHydrating,
    setMessages,
    setStatusMessage,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  } = options;
  const fetchWorkspaceRef = useRef(fetchWorkspace);
  const jumpThreadToBottomImmediatelyRef = useRef(jumpThreadToBottomImmediately);
  const latestHydrationRequestIdRef = useRef(0);
  const activeHydrationControllerRef = useRef<AbortController | null>(null);
  const hasHydrationPrerequisites = useMemo(
    () =>
      Boolean(
        context &&
          contract &&
          !isSending &&
          activeStrategyInputs &&
          activeToneInputs,
      ),
    [activeStrategyInputs, activeToneInputs, context, contract, isSending],
  );

  useEffect(() => {
    fetchWorkspaceRef.current = fetchWorkspace;
  }, [fetchWorkspace]);

  useEffect(() => {
    jumpThreadToBottomImmediatelyRef.current = jumpThreadToBottomImmediately;
  }, [jumpThreadToBottomImmediately]);

  useEffect(() => {
    return () => {
      activeHydrationControllerRef.current?.abort();
      activeHydrationControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrationPrerequisites) {
      return;
    }

    const requestId = latestHydrationRequestIdRef.current + 1;
    latestHydrationRequestIdRef.current = requestId;
    activeHydrationControllerRef.current?.abort();
    const controller = new AbortController();
    activeHydrationControllerRef.current = controller;
    let cancelled = false;
    const isLatestRequest = () =>
      !cancelled &&
      !controller.signal.aborted &&
      latestHydrationRequestIdRef.current === requestId;

    async function initializeThread() {
      if (activeThreadId) {
        if (threadCreatedInSessionRef.current) {
          if (isLatestRequest()) {
            setActiveTurn(null);
            setStatusMessage(null);
            setIsThreadHydrating(false);
          }
          return;
        }

        try {
          const response = await fetchWorkspaceRef.current(
            `/api/creator/v2/threads/${activeThreadId}`,
            {
              signal: controller.signal,
            },
          );
          const data = (await response.json()) as ThreadHistoryRouteResponse<TMessage>;
          if (!isLatestRequest()) {
            return;
          }

          const nextActiveTurn = data.data?.activeTurn ?? null;
          setActiveTurn(nextActiveTurn);
          setStatusMessage(
            nextActiveTurn
              ? nextActiveTurn.progressLabel || "A previous reply is still running in this chat."
              : null,
          );

          if (data.ok && Array.isArray(data.data?.messages) && data.data.messages.length > 0) {
            const hydration = resolveThreadHistoryHydration<TMessage>({
              rawMessages: data.data.messages,
              activeThreadId,
              shouldJumpToBottomAfterSwitch:
                shouldJumpToBottomAfterThreadSwitchRef.current,
            });
            setMessages(hydration.messages);

            if (hydration.shouldJumpToBottom) {
              shouldJumpToBottomAfterThreadSwitchRef.current = false;
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  if (!isLatestRequest()) {
                    return;
                  }

                  jumpThreadToBottomImmediatelyRef.current();
                });
              });
            }

            setIsThreadHydrating(false);
            return;
          }
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("Failed to fetch historical messages", error);
          }
        }
      }

      if (!isLatestRequest()) {
        return;
      }

      setActiveTurn(null);
      setStatusMessage(null);
      shouldJumpToBottomAfterThreadSwitchRef.current = false;
      setIsThreadHydrating(false);
    }

    void initializeThread();

    return () => {
      cancelled = true;
      controller.abort();
      if (latestHydrationRequestIdRef.current === requestId) {
        activeHydrationControllerRef.current = null;
      }
    };
  }, [
    accountName,
    activeThreadId,
    hasHydrationPrerequisites,
    searchParamsKey,
    setIsThreadHydrating,
    setMessages,
    setActiveTurn,
    setStatusMessage,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      setActiveTurn(null);
      setStatusMessage(null);
      return;
    }

    let cancelled = false;

    async function refreshThreadHistory() {
      const response = await fetchWorkspaceRef.current(
        `/api/creator/v2/threads/${activeThreadId}`,
      );
      const data = (await response.json()) as ThreadHistoryRouteResponse<TMessage>;
      if (cancelled || !data.ok || !Array.isArray(data.data?.messages)) {
        return;
      }

      const hydration = resolveThreadHistoryHydration<TMessage>({
        rawMessages: data.data.messages,
        activeThreadId,
        shouldJumpToBottomAfterSwitch: false,
      });
      setMessages(hydration.messages);
      setActiveTurn(data.data?.activeTurn ?? null);
      setStatusMessage(null);
    }

    async function pollTurnStatus(turnId: string) {
      try {
        const response = await fetchWorkspaceRef.current(
          `/api/creator/v2/chat/turns/${encodeURIComponent(turnId)}`,
        );
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as TurnStatusRouteResponse;
        const nextTurn = data.data?.turn ?? null;
        if (cancelled || !nextTurn) {
          return;
        }

        if (isTurnStillActive(nextTurn.status)) {
          setActiveTurn(nextTurn);
          setStatusMessage(
            nextTurn.progressLabel || "A previous reply is still running in this chat.",
          );
          return;
        }

        if (nextTurn.status === "failed") {
          setStatusMessage(
            nextTurn.errorMessage || "A background reply stopped before it could finish.",
          );
        } else if (nextTurn.status === "cancelled") {
          setStatusMessage("The previous reply was cancelled.");
        }

        setActiveTurn(null);
        await refreshThreadHistory();
      } catch {
        // Keep polling on transient failures.
      }
    }

    const activeTurnId = activeTurn?.turnId;
    if (!activeTurnId) {
      return;
    }

    void pollTurnStatus(activeTurnId);
    const intervalId = window.setInterval(() => {
      void pollTurnStatus(activeTurnId);
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeThreadId, activeTurn, setActiveTurn, setMessages, setStatusMessage]);
}
