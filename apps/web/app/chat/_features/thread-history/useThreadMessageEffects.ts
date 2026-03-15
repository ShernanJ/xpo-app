"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolvePrimaryDraftRevealKey } from "../draft-editor/chatDraftPreviewState";
import type { DraftPreviewMessageLike } from "../draft-editor/chatDraftPreviewState";
import {
  hasActiveDraftReveal,
  messageHasDraftOutput,
} from "./draftRevealState";

const DRAFT_REVEAL_DURATION_MS = 1250;

interface ThreadMessageEffectsMessageLike extends DraftPreviewMessageLike {
  content: string;
}

export function useThreadMessageEffects<
  TMessage extends ThreadMessageEffectsMessageLike,
>(messages: TMessage[]) {
  const [typedAssistantLengths, setTypedAssistantLengths] = useState<
    Record<string, number>
  >({});
  const [activeDraftRevealByMessageId, setActiveDraftRevealByMessageId] = useState<
    Record<string, string>
  >({});
  const [revealedDraftMessageIds, setRevealedDraftMessageIds] = useState<
    Record<string, boolean>
  >({});

  const draftRevealTimeoutsRef = useRef<Record<string, number>>({});
  const typedAssistantLengthsRef = useRef<Record<string, number>>({});
  const hasHydratedDraftRevealRef = useRef(false);

  const resetDraftRevealState = useCallback(() => {
    setActiveDraftRevealByMessageId({});
    setRevealedDraftMessageIds({});
  }, []);

  const hydrateDraftRevealState = useCallback((nextMessages: TMessage[]) => {
    const hydratedIds = Object.fromEntries(
      nextMessages
        .filter(
          (message) => message.role === "assistant" && messageHasDraftOutput(message),
        )
        .map((message) => [message.id, true]),
    );
    setRevealedDraftMessageIds(hydratedIds);
  }, []);

  const activateDraftReveal = useCallback((message: TMessage) => {
    const primaryKey = resolvePrimaryDraftRevealKey(message);
    setActiveDraftRevealByMessageId((current) => ({
      ...current,
      [message.id]: primaryKey,
    }));
    draftRevealTimeoutsRef.current[message.id] = window.setTimeout(() => {
      setActiveDraftRevealByMessageId((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
      setRevealedDraftMessageIds((current) => ({
        ...current,
        [message.id]: true,
      }));
      delete draftRevealTimeoutsRef.current[message.id];
    }, DRAFT_REVEAL_DURATION_MS);
  }, []);

  useEffect(() => {
    typedAssistantLengthsRef.current = typedAssistantLengths;
  }, [typedAssistantLengths]);

  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.length > 0);

    if (!latestAssistantMessage) {
      return;
    }

    const targetLength = latestAssistantMessage.content.length;
    const currentLength = typedAssistantLengthsRef.current[latestAssistantMessage.id];

    if (currentLength !== undefined && currentLength >= targetLength) {
      return;
    }

    const interval = window.setInterval(() => {
      setTypedAssistantLengths((current) => {
        const latest = current[latestAssistantMessage.id] ?? 0;
        if (latest >= targetLength) {
          window.clearInterval(interval);
          return current;
        }

        const remaining = targetLength - latest;
        const step = remaining > 90 ? 8 : remaining > 40 ? 5 : 3;

        return {
          ...current,
          [latestAssistantMessage.id]: Math.min(targetLength, latest + step),
        };
      });
    }, 18);

    return () => {
      window.clearInterval(interval);
    };
  }, [messages]);

  useEffect(() => {
    return () => {
      Object.values(draftRevealTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      draftRevealTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      Object.values(draftRevealTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      draftRevealTimeoutsRef.current = {};
      const hadHydratedRevealState = hasHydratedDraftRevealRef.current;
      hasHydratedDraftRevealRef.current = false;
      if (
        hadHydratedRevealState ||
        Object.keys(activeDraftRevealByMessageId).length > 0 ||
        Object.keys(revealedDraftMessageIds).length > 0
      ) {
        const resetTimeoutId = window.setTimeout(() => {
          resetDraftRevealState();
        }, 0);
        return () => {
          window.clearTimeout(resetTimeoutId);
        };
      }
      return;
    }

    if (!hasHydratedDraftRevealRef.current) {
      hasHydratedDraftRevealRef.current = true;
      const hydrateTimeoutId = window.setTimeout(() => {
        hydrateDraftRevealState(messages);
      }, 0);
      return () => {
        window.clearTimeout(hydrateTimeoutId);
      };
    }

    const nextRevealCandidate = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          messageHasDraftOutput(message) &&
          !revealedDraftMessageIds[message.id] &&
          !hasActiveDraftReveal(activeDraftRevealByMessageId, message.id) &&
          !draftRevealTimeoutsRef.current[message.id],
      );

    if (!nextRevealCandidate) {
      return;
    }

    activateDraftReveal(nextRevealCandidate);
  }, [
    activeDraftRevealByMessageId,
    activateDraftReveal,
    hydrateDraftRevealState,
    messages,
    resetDraftRevealState,
    revealedDraftMessageIds,
  ]);

  return {
    typedAssistantLengths,
    setTypedAssistantLengths,
    activeDraftRevealByMessageId,
    setActiveDraftRevealByMessageId,
    revealedDraftMessageIds,
    setRevealedDraftMessageIds,
  };
}
