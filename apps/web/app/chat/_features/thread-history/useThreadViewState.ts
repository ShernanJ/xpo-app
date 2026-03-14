"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

interface UseThreadViewStateOptions {
  activeThreadId: string | null;
  buildWorkspaceChatHref: (threadId?: string | null) => string;
  messagesLength: number;
  onBeforeThreadSwitch?: () => void;
  setActiveThreadId: (threadId: string) => void;
}

export function useThreadViewState(options: UseThreadViewStateOptions) {
  const {
    activeThreadId,
    buildWorkspaceChatHref,
    messagesLength,
    onBeforeThreadSwitch,
    setActiveThreadId,
  } = options;
  const [threadTransitionPhase, setThreadTransitionPhase] = useState<
    "idle" | "out" | "in"
  >("idle");
  const [isThreadHydrating, setIsThreadHydrating] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const threadScrollRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const threadTransitionOutTimeoutRef = useRef<number | null>(null);
  const threadTransitionInTimeoutRef = useRef<number | null>(null);
  const shouldJumpToBottomAfterThreadSwitchRef = useRef(false);

  const registerMessageRef = useCallback(
    (messageId: string, node: HTMLDivElement | null) => {
      messageRefs.current[messageId] = node;
    },
    [],
  );

  const scrollThreadToBottom = useCallback(() => {
    setShowScrollToLatest(false);
    window.requestAnimationFrame(() => {
      const node = threadScrollRef.current;
      if (!node) {
        return;
      }

      node.scrollTo({
        top: node.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const jumpThreadToBottomImmediately = useCallback(() => {
    const node = threadScrollRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
    setShowScrollToLatest(false);
  }, []);

  const scrollMessageIntoView = useCallback((messageId: string) => {
    window.requestAnimationFrame(() => {
      messageRefs.current[messageId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const switchToThreadWithTransition = useCallback(
    (nextThreadId: string) => {
      if (
        !nextThreadId ||
        nextThreadId === activeThreadId ||
        threadTransitionPhase === "out"
      ) {
        return;
      }

      if (threadTransitionOutTimeoutRef.current) {
        window.clearTimeout(threadTransitionOutTimeoutRef.current);
      }
      if (threadTransitionInTimeoutRef.current) {
        window.clearTimeout(threadTransitionInTimeoutRef.current);
      }

      onBeforeThreadSwitch?.();
      setIsThreadHydrating(true);
      shouldJumpToBottomAfterThreadSwitchRef.current = true;
      setThreadTransitionPhase("out");

      threadTransitionOutTimeoutRef.current = window.setTimeout(() => {
        setActiveThreadId(nextThreadId);
        window.history.pushState({}, "", buildWorkspaceChatHref(nextThreadId));
        setThreadTransitionPhase("in");

        threadTransitionInTimeoutRef.current = window.setTimeout(() => {
          setThreadTransitionPhase("idle");
        }, 280);
      }, 140);
    },
    [
      activeThreadId,
      buildWorkspaceChatHref,
      onBeforeThreadSwitch,
      setActiveThreadId,
      threadTransitionPhase,
    ],
  );

  useEffect(() => {
    return () => {
      if (threadTransitionOutTimeoutRef.current) {
        window.clearTimeout(threadTransitionOutTimeoutRef.current);
      }
      if (threadTransitionInTimeoutRef.current) {
        window.clearTimeout(threadTransitionInTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const node = threadScrollRef.current;
    if (!node) {
      return;
    }

    const updateScrollPosition = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      startTransition(() => {
        setShowScrollToLatest(distanceFromBottom > 140);
      });
    };

    updateScrollPosition();
    node.addEventListener("scroll", updateScrollPosition, { passive: true });
    window.requestAnimationFrame(updateScrollPosition);

    return () => {
      node.removeEventListener("scroll", updateScrollPosition);
    };
  }, [activeThreadId, messagesLength]);

  return {
    threadTransitionPhase,
    isThreadHydrating,
    setIsThreadHydrating,
    showScrollToLatest,
    threadScrollRef,
    messageRefs,
    registerMessageRef,
    shouldJumpToBottomAfterThreadSwitchRef,
    switchToThreadWithTransition,
    scrollThreadToBottom,
    jumpThreadToBottomImmediately,
    scrollMessageIntoView,
  };
}
