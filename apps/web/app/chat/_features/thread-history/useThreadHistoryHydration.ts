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

const ACTIVE_TURN_POLL_MS = 3000;
const ACTIVE_TURN_UNCHANGED_POLL_MS = 4500;
const HIDDEN_TAB_POLL_MS = 10000;
const POLL_JITTER_MS = 250;

function isTurnStillActive(status: ChatActiveTurn["status"]): boolean {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

function buildTurnProgressSignature(turn: ChatActiveTurn | null): string {
  if (!turn) {
    return "none";
  }

  return [
    turn.status,
    turn.progressStepId || "",
    turn.progressLabel || "",
    turn.progressExplanation || "",
    turn.assistantMessageId || "",
    turn.errorCode || "",
    turn.errorMessage || "",
  ].join("|");
}

function resolveTurnPollDelay(unchanged: boolean): number {
  const isHidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";
  const baseDelay = isHidden
    ? HIDDEN_TAB_POLL_MS
    : unchanged
      ? ACTIVE_TURN_UNCHANGED_POLL_MS
      : ACTIVE_TURN_POLL_MS;

  return baseDelay + Math.floor(Math.random() * POLL_JITTER_MS);
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
            if (
              activeTurn?.threadId === activeThreadId &&
              isTurnStillActive(activeTurn.status)
            ) {
              setActiveTurn(activeTurn);
              setStatusMessage(
                activeTurn.progressLabel ||
                  "A previous reply is still running in this chat.",
              );
            } else {
              setActiveTurn(null);
              setStatusMessage(null);
            }
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
          return { shouldContinue: true, unchanged: true };
        }

        const data = (await response.json()) as TurnStatusRouteResponse;
        const nextTurn = data.data?.turn ?? null;
        if (cancelled || !nextTurn) {
          return { shouldContinue: true, unchanged: true };
        }

        const unchanged =
          buildTurnProgressSignature(activeTurn) ===
          buildTurnProgressSignature(nextTurn);

        if (isTurnStillActive(nextTurn.status)) {
          setActiveTurn(nextTurn);
          setStatusMessage(
            nextTurn.progressLabel || "A previous reply is still running in this chat.",
          );
          return { shouldContinue: true, unchanged };
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
        return { shouldContinue: false, unchanged: false };
      } catch {
        // Keep polling on transient failures.
        return { shouldContinue: true, unchanged: true };
      }
    }

    const activeTurnId = activeTurn?.turnId;
    if (!activeTurnId) {
      return;
    }

    let timeoutId: number | null = null;
    const scheduleNextPoll = (unchanged: boolean) => {
      timeoutId = window.setTimeout(() => {
        void pollTurnStatus(activeTurnId).then((result) => {
          if (cancelled || !result?.shouldContinue) {
            return;
          }

          scheduleNextPoll(result.unchanged);
        });
      }, resolveTurnPollDelay(unchanged));
    };

    void pollTurnStatus(activeTurnId).then((result) => {
      if (cancelled || !result?.shouldContinue) {
        return;
      }

      scheduleNextPoll(result.unchanged);
    });

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeThreadId, activeTurn, setActiveTurn, setMessages, setStatusMessage]);
}
