"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

import {
  resolveThreadHistoryHydration,
  type ThreadHistoryMessageLike,
} from "./chatThreadHistoryState";

interface UseThreadHistoryHydrationOptions<TMessage extends ThreadHistoryMessageLike> {
  accountName: string | null;
  activeThreadId: string | null;
  activeStrategyInputs: unknown;
  activeToneInputs: unknown;
  context: unknown;
  contract: unknown;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  isSending: boolean;
  jumpThreadToBottomImmediately: () => void;
  searchParamsKey: string;
  setIsThreadHydrating: (value: boolean) => void;
  setMessages: (messages: TMessage[]) => void;
  shouldJumpToBottomAfterThreadSwitchRef: MutableRefObject<boolean>;
  threadCreatedInSessionRef: MutableRefObject<boolean>;
}

export function useThreadHistoryHydration<TMessage extends ThreadHistoryMessageLike>(
  options: UseThreadHistoryHydrationOptions<TMessage>,
) {
  const {
    accountName,
    activeThreadId,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    searchParamsKey,
    setIsThreadHydrating,
    setMessages,
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
          const data = await response.json();
          if (!isLatestRequest()) {
            return;
          }

          if (data.ok && data.data?.messages?.length > 0) {
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
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  ]);
}
