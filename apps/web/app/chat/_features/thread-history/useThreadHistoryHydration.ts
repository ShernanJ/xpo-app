"use client";

import { useEffect, type MutableRefObject } from "react";

import {
  resolveThreadHistoryHydration,
  type ThreadHistoryMessageLike,
} from "./chatThreadHistoryState";

interface UseThreadHistoryHydrationOptions<TMessage extends ThreadHistoryMessageLike> {
  accountName: string | null;
  activeThreadId: string | null;
  activeContentFocus: unknown;
  activeStrategyInputs: unknown;
  activeToneInputs: unknown;
  context: unknown;
  contract: unknown;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  isSending: boolean;
  jumpThreadToBottomImmediately: () => void;
  messagesLength: number;
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
    activeContentFocus,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    messagesLength,
    searchParamsKey,
    setIsThreadHydrating,
    setMessages,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  } = options;

  useEffect(() => {
    if (
      !context ||
      !contract ||
      isSending ||
      !activeStrategyInputs ||
      !activeToneInputs
    ) {
      return;
    }

    async function initializeThread() {
      if (activeThreadId) {
        if (threadCreatedInSessionRef.current) {
          setIsThreadHydrating(false);
          return;
        }

        try {
          const response = await fetchWorkspace(`/api/creator/v2/threads/${activeThreadId}`);
          const data = await response.json();
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
                  jumpThreadToBottomImmediately();
                });
              });
            }

            setIsThreadHydrating(false);
            return;
          }
        } catch (error) {
          console.error("Failed to fetch historical messages", error);
        }
      }

      shouldJumpToBottomAfterThreadSwitchRef.current = false;
      setIsThreadHydrating(false);
    }

    void initializeThread();
  }, [
    accountName,
    activeContentFocus,
    activeStrategyInputs,
    activeThreadId,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    messagesLength,
    searchParamsKey,
    setIsThreadHydrating,
    setMessages,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  ]);
}
