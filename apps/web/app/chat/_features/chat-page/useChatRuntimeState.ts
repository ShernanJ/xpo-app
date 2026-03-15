"use client";

import { useEffect, useState } from "react";

import {
  HERO_EXIT_TRANSITION_MS,
  chatProviderStorageKey,
  showDevTools,
  type ChatProviderPreference,
} from "./chatPageViewState";

interface BackfillJobStatusResponse {
  ok: true;
  job: {
    jobId: string;
    status: "pending" | "processing" | "completed" | "failed";
    lastError: string | null;
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
  const [providerPreference] = useState<ChatProviderPreference>(() => {
    if (typeof window === "undefined" || !showDevTools) {
      return "groq";
    }

    const storedValue = window.localStorage.getItem(chatProviderStorageKey);
    return storedValue === "openai" || storedValue === "groq" ? storedValue : "groq";
  });

  useEffect(() => {
    if (!isLeavingHero || messagesLength === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLeavingHero(false);
    }, HERO_EXIT_TRANSITION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLeavingHero, messagesLength]);

  useEffect(() => {
    if (!backfillJobId) {
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
          `/api/onboarding/backfill/jobs?jobId=${encodeURIComponent(backfillJobId)}`,
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
          setBackfillNotice("Background backfill is queued.");
          return;
        }

        if (job.status === "processing") {
          setBackfillNotice("Background backfill is deepening the model.");
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

        setBackfillNotice("Background backfill completed. Context refreshed.");
        await loadWorkspace();
        finished = true;
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
  }, [backfillJobId, loadWorkspace]);

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
