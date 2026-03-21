"use client";

import { useEffect, useRef, useState } from "react";

import { chatProviderStorageKey, showDevTools, type ChatProviderPreference } from "./chatPageViewState";

interface BackfillJobStatusResponse {
  ok: true;
  job: {
    jobId: string;
    status: "pending" | "processing" | "completed" | "failed";
    lastError: string | null;
    nextJobId?: string | null;
    phase?: "primer" | "archive" | null;
  } | null;
}

interface UseChatRuntimeStateOptions {
  backfillJobId: string;
  messagesLength: number;
  loadWorkspace: () => Promise<unknown>;
}

export function useChatRuntimeState(options: UseChatRuntimeStateOptions) {
  const { backfillJobId, messagesLength, loadWorkspace } = options;
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);
  const [activeBackfillJobId, setActiveBackfillJobId] = useState(backfillJobId);
  const loadWorkspaceRef = useRef(loadWorkspace);
  const [providerPreference] = useState<ChatProviderPreference>(() => {
    if (typeof window === "undefined" || !showDevTools) {
      return "groq";
    }

    const storedValue = window.localStorage.getItem(chatProviderStorageKey);
    return storedValue === "openai" || storedValue === "groq" ? storedValue : "groq";
  });

  useEffect(() => {
    loadWorkspaceRef.current = loadWorkspace;
  }, [loadWorkspace]);

  useEffect(() => {
    setActiveBackfillJobId(backfillJobId);
  }, [backfillJobId]);

  useEffect(() => {
    if (!isLeavingHero || messagesLength === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLeavingHero(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLeavingHero, messagesLength]);

  useEffect(() => {
    if (!activeBackfillJobId) {
      return;
    }

    let cancelled = false;
    let finished = false;

    async function pollBackfillJob() {
      if (finished) {
        return;
      }

      try {
        const response = await fetch(
          `/api/onboarding/backfill/jobs?jobId=${encodeURIComponent(activeBackfillJobId)}`,
          { method: "GET" },
        );

        if (!response.ok) {
          return;
        }

        const data: BackfillJobStatusResponse = await response.json();
        const job = data.job;
        if (!job || cancelled) {
          return;
        }

        if (job.status === "pending") {
          setBackfillNotice(
            job.phase === "archive"
              ? "Background archive is queued."
              : "Background backfill is queued.",
          );
          return;
        }

        if (job.status === "processing") {
          setBackfillNotice(
            job.phase === "archive"
              ? "Background archive is deepening the model."
              : "Background backfill is deepening the model.",
          );
          return;
        }

        if (job.status === "failed") {
          setBackfillNotice(
            job.lastError
              ? `Background backfill failed: ${job.lastError}`
              : "Background backfill failed.",
          );
          finished = true;
          return;
        }

        if (job.nextJobId) {
          setBackfillNotice("Background sync is continuing with deeper archive chunks.");
          setActiveBackfillJobId(job.nextJobId);
          return;
        }

        setBackfillNotice("Background backfill completed. Context refreshed.");
        finished = true;
        await loadWorkspaceRef.current();
      } catch {
        // Keep polling on transient failures.
      }
    }

    void pollBackfillJob();
    const intervalId = window.setInterval(() => {
      void pollBackfillJob();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeBackfillJobId]);

  useEffect(() => {
    if (!showDevTools) {
      return;
    }

    window.localStorage.setItem(chatProviderStorageKey, providerPreference);
  }, [providerPreference]);

  return {
    backfillNotice,
    isLeavingHero,
    providerPreference,
    setBackfillNotice,
    setIsLeavingHero,
  };
}
