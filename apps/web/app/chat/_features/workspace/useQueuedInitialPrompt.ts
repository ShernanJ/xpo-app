"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearQueuedInitialPrompt,
  readQueuedInitialPrompt,
  type QueuedInitialPrompt,
  type QueuedInitialPromptSource,
  writeQueuedInitialPrompt,
} from "@/lib/chat/workspaceStartupSession";

interface UseQueuedInitialPromptOptions {
  accountName: string | null;
  canAutoSend: boolean;
  onInlineNotice: (value: string | null) => void;
  submitPrompt: (prompt: string) => Promise<void>;
}

interface QueueInitialPromptResult {
  status: "queued" | "already_queued" | "ignored";
  queuedPrompt: QueuedInitialPrompt | null;
}

export function useQueuedInitialPrompt(options: UseQueuedInitialPromptOptions) {
  const { accountName, canAutoSend, onInlineNotice, submitPrompt } = options;
  const [queuedInitialPrompt, setQueuedInitialPrompt] = useState<QueuedInitialPrompt | null>(null);
  const autoSendPromptIdRef = useRef<string | null>(null);

  useEffect(() => {
    const storedPrompt = readQueuedInitialPrompt(accountName);
    setQueuedInitialPrompt(storedPrompt);
    autoSendPromptIdRef.current = null;

    if (storedPrompt) {
      onInlineNotice(
        "Your first prompt is queued. It'll send automatically when setup finishes.",
      );
      return;
    }

    onInlineNotice(null);
  }, [accountName, onInlineNotice]);

  useEffect(() => {
    if (!canAutoSend || !queuedInitialPrompt || !accountName) {
      return;
    }

    if (autoSendPromptIdRef.current === queuedInitialPrompt.createdAt) {
      return;
    }

    autoSendPromptIdRef.current = queuedInitialPrompt.createdAt;
    const queuedPrompt = queuedInitialPrompt;

    clearQueuedInitialPrompt(accountName);
    setQueuedInitialPrompt(null);

    void (async () => {
      onInlineNotice("Sending your queued first prompt...");
      try {
        await submitPrompt(queuedPrompt.prompt);
      } finally {
        onInlineNotice(null);
        autoSendPromptIdRef.current = null;
      }
    })();
  }, [accountName, canAutoSend, onInlineNotice, queuedInitialPrompt, submitPrompt]);

  const queueInitialPrompt = useCallback((
    prompt: string,
    source: QueuedInitialPromptSource,
  ): QueueInitialPromptResult => {
    const trimmedPrompt = prompt.trim();
    if (!accountName || !trimmedPrompt) {
      return {
        status: "ignored",
        queuedPrompt: null,
      };
    }

    const existingPrompt = queuedInitialPrompt ?? readQueuedInitialPrompt(accountName);
    if (existingPrompt) {
      onInlineNotice(
        "Your first prompt is already queued. It'll send automatically when setup finishes.",
      );
      setQueuedInitialPrompt(existingPrompt);
      return {
        status: "already_queued",
        queuedPrompt: existingPrompt,
      };
    }

    const nextPrompt = writeQueuedInitialPrompt({
      handle: accountName,
      prompt: trimmedPrompt,
      source,
      createdAt: new Date().toISOString(),
    });

    if (!nextPrompt) {
      return {
        status: "ignored",
        queuedPrompt: null,
      };
    }

    setQueuedInitialPrompt(nextPrompt);
    onInlineNotice(
      "Setup is still finishing. I'll send this automatically as soon as your workspace is ready.",
    );
    return {
      status: "queued",
      queuedPrompt: nextPrompt,
    };
  }, [accountName, onInlineNotice, queuedInitialPrompt]);

  const clearQueuedPrompt = useCallback(() => {
    clearQueuedInitialPrompt(accountName);
    setQueuedInitialPrompt(null);
    autoSendPromptIdRef.current = null;
  }, [accountName]);

  return {
    queuedInitialPrompt,
    hasQueuedInitialPrompt: Boolean(queuedInitialPrompt),
    queueInitialPrompt,
    clearQueuedPrompt,
  };
}
