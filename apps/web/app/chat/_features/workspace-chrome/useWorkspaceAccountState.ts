"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { markHandleJustOnboarded } from "@/lib/chat/workspaceStartupSession";
import type { XPublicProfile } from "@/lib/onboarding/types";

interface ValidationError {
  message: string;
}

interface BillingSnapshotLike {
  plan: "free" | "pro" | "lifetime";
  status: "active" | "past_due" | "canceled" | "blocked_fair_use";
  billingCycle: "monthly" | "annual" | "lifetime";
  creditsRemaining: number;
  creditLimit: number;
  creditCycleResetsAt: string;
  showFirstPricingModal: boolean;
  lowCreditWarning: boolean;
  criticalCreditWarning: boolean;
  fairUse: {
    softWarningThreshold: number;
    reviewThreshold: number;
    hardStopThreshold: number;
    isSoftWarning: boolean;
    isReviewLevel: boolean;
    isHardStopped: boolean;
  };
}

interface OnboardingPreviewSuccess {
  ok: true;
  account: string;
  preview: XPublicProfile | null;
}

interface OnboardingPreviewFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingPreviewResponse = OnboardingPreviewSuccess | OnboardingPreviewFailure;

interface OnboardingRunQueued {
  ok: true;
  status: "queued";
  jobId: string;
  account?: string;
}

interface OnboardingRunFailure {
  ok: false;
  code?: "PLAN_REQUIRED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotLike;
  };
}

interface OnboardingJobRunning {
  ok: true;
  status: "queued" | "running";
  jobId: string;
  account?: string;
}

interface OnboardingJobCompleted {
  ok: true;
  status: "completed";
  jobId: string;
  account?: string;
  runId: string;
  persistedAt?: string;
}

interface OnboardingJobFailed {
  ok: false;
  status?: "failed";
  errors: ValidationError[];
}

type OnboardingRunResponse = OnboardingRunQueued | OnboardingRunFailure;
type OnboardingJobStatusResponse =
  | OnboardingJobRunning
  | OnboardingJobCompleted
  | OnboardingJobFailed;

interface ScrapeCaptureDebugSuccess {
  ok: true;
  capture: unknown;
}

interface ScrapeCaptureDebugFailure {
  ok: false;
  error?: string;
  errors?: ValidationError[];
}

type ScrapeCaptureDebugResponse =
  | ScrapeCaptureDebugSuccess
  | ScrapeCaptureDebugFailure;

interface ScrapeDebugTelemetry {
  uniqueOriginalPostsCollected: number;
  totalRawPostCount: number;
  sessionId: string | null;
  rotatedSessionIds: string[];
  didRotateSession: boolean;
}

interface ScraperSessionRateLimitSnapshot {
  recentRequestCount: number;
  lastRequestAt: string | null;
  cooldownUntil: string | null;
}

interface ScraperSessionHealthEntry {
  id: string;
  rateLimit: ScraperSessionRateLimitSnapshot;
  health: {
    status:
      | "ok"
      | "budget_exhausted"
      | "cooldown_active"
      | "needs_verification"
      | "suspended"
      | "challenge_required"
      | "auth_blocked"
      | "error";
    message: string;
    checkedAt: string;
    sessionId: string;
    nextCursor: string | null;
    uniqueOriginalPostsCollected: number | null;
    totalRawPostCount: number | null;
  };
}

interface ScrapeSessionHealthSnapshot {
  account: string;
  checkedAt: string;
  defaultRateLimit: ScraperSessionRateLimitSnapshot;
  sessions: ScraperSessionHealthEntry[];
}

type ScrapeDebugAction = "recent_sync" | "deep_backfill" | "session_health";

interface ScrapeDebugActionSuccess {
  ok: true;
  action: ScrapeDebugAction;
  capture: unknown | null;
  notice: string;
  telemetry?: ScrapeDebugTelemetry | null;
  sessionHealth?: ScrapeSessionHealthSnapshot | null;
}

interface ScrapeDebugActionFailure {
  ok: false;
  error?: string;
  errors?: ValidationError[];
}

type ScrapeDebugActionResponse = ScrapeDebugActionSuccess | ScrapeDebugActionFailure;

function getValidationErrorMessage(
  payload:
    | {
        error?: string;
        errors?: ValidationError[];
      }
    | null
    | undefined,
  fallback: string,
): string {
  if (payload?.errors && Array.isArray(payload.errors) && payload.errors[0]?.message) {
    return payload.errors[0].message;
  }

  if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }

  return fallback;
}

export const CHAT_ONBOARDING_LOADING_STEPS = [
  "collecting the account...",
  "reading how they write...",
  "mapping the growth signals...",
  "building the workspace...",
  "locking in the new profile...",
] as const;

interface UseWorkspaceAccountStateOptions {
  accountName: string | null;
  requiresXAccountGate: boolean;
  normalizeAccountHandle: (value: string) => string;
  refreshSession: (data?: { activeXHandle?: string }) => Promise<unknown>;
  closeAccountMenu: () => void;
  setAvailableHandles: Dispatch<SetStateAction<string[]>>;
  buildChatWorkspaceUrl: (args: { xHandle?: string | null }) => string;
  applyBillingSnapshot: (billing: BillingSnapshotLike | null | undefined) => void;
  onOpenPricing: () => void;
  onErrorMessage: (message: string | null) => void;
  onLoadingChange: (value: boolean) => void;
}

export function useWorkspaceAccountState(options: UseWorkspaceAccountStateOptions) {
  const {
    accountName,
    requiresXAccountGate,
    normalizeAccountHandle,
    refreshSession,
    closeAccountMenu,
    setAvailableHandles,
    buildChatWorkspaceUrl,
    applyBillingSnapshot,
    onOpenPricing,
    onErrorMessage,
    onLoadingChange,
  } = options;

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountInput, setAddAccountInput] = useState("");
  const [addAccountPreview, setAddAccountPreview] = useState<XPublicProfile | null>(null);
  const [isAddAccountPreviewLoading, setIsAddAccountPreviewLoading] = useState(false);
  const [isAddAccountSubmitting, setIsAddAccountSubmitting] = useState(false);
  const [removingHandle, setRemovingHandle] = useState<string | null>(null);
  const [isScrapeDebugDialogOpen, setIsScrapeDebugDialogOpen] = useState(false);
  const [scrapeDebugHandle, setScrapeDebugHandle] = useState<string | null>(null);
  const [scrapeDebugCapture, setScrapeDebugCapture] = useState<unknown | null>(null);
  const [scrapeDebugTelemetry, setScrapeDebugTelemetry] = useState<ScrapeDebugTelemetry | null>(
    null,
  );
  const [scrapeDebugSessionHealth, setScrapeDebugSessionHealth] =
    useState<ScrapeSessionHealthSnapshot | null>(null);
  const [isScrapeDebugLoading, setIsScrapeDebugLoading] = useState(false);
  const [scrapeDebugActionInFlight, setScrapeDebugActionInFlight] =
    useState<ScrapeDebugAction | null>(null);
  const [scrapeDebugError, setScrapeDebugError] = useState<string | null>(null);
  const [scrapeDebugNotice, setScrapeDebugNotice] = useState<string | null>(null);
  const [addAccountLoadingStepIndex, setAddAccountLoadingStepIndex] = useState(0);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [readyAccountHandle, setReadyAccountHandle] = useState<string | null>(null);
  const showScrapeDebugControls = process.env.NODE_ENV !== "production";

  const normalizedAddAccount = useMemo(
    () => normalizeAccountHandle(addAccountInput),
    [addAccountInput, normalizeAccountHandle],
  );
  const hasValidAddAccountPreview =
    Boolean(addAccountPreview) &&
    normalizeAccountHandle(addAccountPreview?.username ?? "") === normalizedAddAccount;

  const pollOnboardingCompletion = useCallback(async (jobId: string) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 700 : 1500));

      const jobResponse = await fetch(`/api/onboarding/jobs/${jobId}`, {
        method: "GET",
      });
      const jobData = (await jobResponse.json().catch(() => null)) as
        | OnboardingJobStatusResponse
        | null;

      if (jobData?.ok && jobData.status === "completed") {
        return jobData;
      }

      if (!jobData?.ok) {
        throw new Error(
          getValidationErrorMessage(
            jobData && "ok" in jobData && !jobData.ok ? jobData : null,
            "Failed to add account.",
          ),
        );
      }

      if (!jobResponse.ok && jobData.status !== "running" && jobData.status !== "queued") {
        throw new Error("Failed to add account.");
      }
    }

    throw new Error(
      "We queued your onboarding job, but it is taking longer than expected. Please try again shortly.",
    );
  }, []);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    const url = new URL(window.location.href);
    const currentUrlHandle = normalizeAccountHandle(url.searchParams.get("xHandle") ?? "");
    if (currentUrlHandle === accountName) {
      return;
    }

    url.searchParams.set("xHandle", accountName);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [accountName, normalizeAccountHandle]);

  useEffect(() => {
    if (!isAddAccountSubmitting) {
      setAddAccountLoadingStepIndex(0);
      return;
    }

    setAddAccountLoadingStepIndex(0);
    const interval = window.setInterval(() => {
      setAddAccountLoadingStepIndex((current) =>
        Math.min(current + 1, CHAT_ONBOARDING_LOADING_STEPS.length - 1),
      );
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAddAccountSubmitting]);

  useEffect(() => {
    if (!isAddAccountModalOpen) {
      setAddAccountPreview(null);
      setIsAddAccountPreviewLoading(false);
      return;
    }

    const trimmed = addAccountInput.trim();
    if (!trimmed || trimmed.length < 2 || readyAccountHandle) {
      if (!readyAccountHandle) {
        setAddAccountPreview(null);
      }
      setIsAddAccountPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsAddAccountPreviewLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/onboarding/preview?account=${encodeURIComponent(trimmed)}`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        const text = await response.text();
        let data: OnboardingPreviewResponse | null = null;

        try {
          data = JSON.parse(text) as OnboardingPreviewResponse;
        } catch {
          data = null;
        }

        if (!response.ok || !data || !data.ok) {
          setAddAccountPreview(null);
          return;
        }

        setAddAccountPreview(data.preview);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setAddAccountPreview(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsAddAccountPreviewLoading(false);
        }
      }
    }, 650);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [addAccountInput, isAddAccountModalOpen, readyAccountHandle]);

  useEffect(() => {
    if (!requiresXAccountGate) {
      return;
    }

    setIsAddAccountModalOpen(true);
    setAddAccountInput("");
    setAddAccountPreview(null);
    setAddAccountError(null);
    setReadyAccountHandle(null);
    setIsAddAccountPreviewLoading(false);
    onErrorMessage(null);
    onLoadingChange(false);
  }, [onErrorMessage, onLoadingChange, requiresXAccountGate]);

  const openAddAccountModal = useCallback(() => {
    closeAccountMenu();
    setIsAddAccountModalOpen(true);
    setAddAccountError(null);
    setReadyAccountHandle(null);
  }, [closeAccountMenu]);

  const closeAddAccountModal = useCallback(() => {
    if (isAddAccountSubmitting || requiresXAccountGate) {
      return;
    }

    setIsAddAccountModalOpen(false);
    setAddAccountInput("");
    setAddAccountPreview(null);
    setAddAccountError(null);
    setReadyAccountHandle(null);
    setIsAddAccountPreviewLoading(false);
  }, [isAddAccountSubmitting, requiresXAccountGate]);

  const updateAddAccountInput = useCallback((value: string) => {
    setAddAccountInput(value);
    setAddAccountError(null);
  }, []);

  const switchActiveHandle = useCallback(
    async (handle: string) => {
      const normalizedHandle = normalizeAccountHandle(handle);
      if (!normalizedHandle || normalizedHandle === normalizeAccountHandle(accountName ?? "")) {
        return;
      }

      closeAccountMenu();
      onLoadingChange(true);
      onErrorMessage(null);

      try {
        const resp = await fetch("/api/creator/profile/handles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: normalizedHandle }),
        });
        if (!resp.ok) {
          throw new Error("Failed to switch handle");
        }

        await refreshSession({ activeXHandle: normalizedHandle });
        window.location.href = buildChatWorkspaceUrl({ xHandle: normalizedHandle });
      } catch (err) {
        console.error(err);
        onErrorMessage(`Could not switch to account @${normalizedHandle}`);
        onLoadingChange(false);
      }
    },
    [
      accountName,
      buildChatWorkspaceUrl,
      closeAccountMenu,
      normalizeAccountHandle,
      onErrorMessage,
      onLoadingChange,
      refreshSession,
    ],
  );

  const finalizeAddedAccount = useCallback(async () => {
    if (!readyAccountHandle) {
      return;
    }

    onLoadingChange(true);
    onErrorMessage(null);

    try {
      await refreshSession();
      closeAddAccountModal();
      window.location.href = buildChatWorkspaceUrl({ xHandle: readyAccountHandle });
    } catch (error) {
      console.error(error);
      onErrorMessage(`Could not switch to @${readyAccountHandle}`);
      onLoadingChange(false);
    }
  }, [
    buildChatWorkspaceUrl,
    closeAddAccountModal,
    onErrorMessage,
    onLoadingChange,
    readyAccountHandle,
    refreshSession,
  ]);

  const removeHandle = useCallback(
    async (handle: string) => {
      const normalizedHandle = normalizeAccountHandle(handle);
      const activeHandle = normalizeAccountHandle(accountName ?? "");

      if (!normalizedHandle || normalizedHandle === activeHandle) {
        return;
      }

      setRemovingHandle(normalizedHandle);
      onErrorMessage(null);

      try {
        const response = await fetch("/api/creator/profile/handles", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ handle: normalizedHandle }),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              data?: {
                handles?: string[];
              };
            }
          | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `Could not remove @${normalizedHandle}.`);
        }

        setAvailableHandles(payload.data?.handles ?? []);
      } catch (error) {
        console.error(error);
        onErrorMessage(
          error instanceof Error ? error.message : `Could not remove @${normalizedHandle}.`,
        );
      } finally {
        setRemovingHandle(null);
      }
    },
    [accountName, normalizeAccountHandle, onErrorMessage, setAvailableHandles],
  );

  const reloadScrapeDebugCapture = useCallback(async () => {
    if (!showScrapeDebugControls || !scrapeDebugHandle) {
      return;
    }

    setIsScrapeDebugLoading(true);
    setScrapeDebugError(null);

    try {
      const response = await window.fetch(
        `/api/creator/profile/scrape?xHandle=${encodeURIComponent(scrapeDebugHandle)}`,
      );
      const payload = (await response.json().catch(() => null)) as ScrapeCaptureDebugResponse | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(
            getValidationErrorMessage(
              payload && "ok" in payload && !payload.ok ? payload : null,
              `Could not load scrape capture for @${scrapeDebugHandle}.`,
            ),
          );
        }

      setScrapeDebugCapture(payload.capture);
    } catch (error) {
      console.error(error);
      setScrapeDebugCapture(null);
      setScrapeDebugError(
        error instanceof Error
          ? error.message
          : `Could not load scrape capture for @${scrapeDebugHandle}.`,
      );
    } finally {
      setIsScrapeDebugLoading(false);
    }
  }, [scrapeDebugHandle, showScrapeDebugControls]);

  useEffect(() => {
    if (!isScrapeDebugDialogOpen || !scrapeDebugHandle) {
      return;
    }

    void reloadScrapeDebugCapture();
  }, [isScrapeDebugDialogOpen, reloadScrapeDebugCapture, scrapeDebugHandle]);

  const openScrapeDebug = useCallback(
    (handle: string) => {
      if (!showScrapeDebugControls) {
        return;
      }

      const normalizedHandle = normalizeAccountHandle(handle);
      if (!normalizedHandle) {
        return;
      }

      setScrapeDebugHandle(normalizedHandle);
      setScrapeDebugCapture(null);
      setScrapeDebugTelemetry(null);
      setScrapeDebugSessionHealth(null);
      setScrapeDebugError(null);
      setScrapeDebugNotice(null);
      setIsScrapeDebugDialogOpen(true);
    },
    [normalizeAccountHandle, showScrapeDebugControls],
  );

  const closeScrapeDebug = useCallback((open: boolean) => {
    setIsScrapeDebugDialogOpen(open);
    if (open) {
      return;
    }

    setScrapeDebugActionInFlight(null);
    setScrapeDebugTelemetry(null);
    setScrapeDebugSessionHealth(null);
    setScrapeDebugError(null);
    setScrapeDebugNotice(null);
  }, []);

  const runScrapeDebugAction = useCallback(
    async (action: ScrapeDebugAction) => {
      if (!showScrapeDebugControls || !scrapeDebugHandle) {
        return;
      }

      setScrapeDebugActionInFlight(action);
      setScrapeDebugError(null);
      setScrapeDebugNotice(null);

      try {
        const response = await window.fetch("/api/creator/profile/scrape/debug", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            xHandle: scrapeDebugHandle,
          }),
        });
        const payload = (await response.json().catch(() => null)) as ScrapeDebugActionResponse | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(
            getValidationErrorMessage(
              payload && "ok" in payload && !payload.ok ? payload : null,
              `Could not run ${action} for @${scrapeDebugHandle}.`,
            ),
          );
        }

        setScrapeDebugCapture(payload.capture);
        setScrapeDebugTelemetry(payload.telemetry ?? null);
        setScrapeDebugSessionHealth(payload.sessionHealth ?? null);
        setScrapeDebugNotice(payload.notice);
      } catch (error) {
        console.error(error);
        setScrapeDebugError(
          error instanceof Error
            ? error.message
            : `Could not run ${action} for @${scrapeDebugHandle}.`,
        );
      } finally {
        setScrapeDebugActionInFlight(null);
      }
    },
    [scrapeDebugHandle, showScrapeDebugControls],
  );

  const runRecentScrapeDebugSync = useCallback(async () => {
    await runScrapeDebugAction("recent_sync");
  }, [runScrapeDebugAction]);

  const runDeepBackfillDebug = useCallback(async () => {
    await runScrapeDebugAction("deep_backfill");
  }, [runScrapeDebugAction]);

  const runScrapeSessionHealthCheck = useCallback(async () => {
    await runScrapeDebugAction("session_health");
  }, [runScrapeDebugAction]);

  const handleAddAccountSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (readyAccountHandle) {
        await finalizeAddedAccount();
        return;
      }

      if (!normalizedAddAccount) {
        setAddAccountError("Enter an X username first.");
        return;
      }

      if (normalizedAddAccount === accountName) {
        setAddAccountError("That account is already active.");
        return;
      }

      if (isAddAccountPreviewLoading) {
        setAddAccountError("Wait for the profile preview to finish loading.");
        return;
      }

      if (!hasValidAddAccountPreview) {
        setAddAccountError("Enter an active X account that resolves in preview first.");
        return;
      }

      setIsAddAccountSubmitting(true);
      setAddAccountError(null);

      try {
        const startedAt = Date.now();
        const response = await fetch("/api/onboarding/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: normalizedAddAccount,
            goal: "followers",
            timeBudgetMinutes: 30,
            tone: { casing: "lowercase", risk: "safe" },
          }),
        });

        const data = (await response.json()) as OnboardingRunResponse;

        if (!response.ok || !data.ok || !("status" in data) || data.status !== "queued") {
          if (!data.ok && data.data?.billing) {
            applyBillingSnapshot(data.data.billing);
          }
          if (response.status === 403) {
            onOpenPricing();
          }
          throw new Error(
            !data.ok ? (data.errors[0]?.message ?? "Failed to add account.") : "Failed to add account.",
          );
        }

        await pollOnboardingCompletion(data.jobId);

        const remainingDelay = Math.max(0, 2600 - (Date.now() - startedAt));
        if (remainingDelay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
        }

        setAvailableHandles((current) =>
          current.includes(normalizedAddAccount) ? current : [...current, normalizedAddAccount],
        );
        markHandleJustOnboarded(normalizedAddAccount);
        setReadyAccountHandle(normalizedAddAccount);
      } catch (error) {
        console.error(error);
        setAddAccountError(
          error instanceof Error ? error.message : "Failed to analyze account. Please try again.",
        );
      } finally {
        setIsAddAccountSubmitting(false);
      }
    },
    [
      accountName,
      applyBillingSnapshot,
      finalizeAddedAccount,
      hasValidAddAccountPreview,
      isAddAccountPreviewLoading,
      normalizedAddAccount,
      onOpenPricing,
      pollOnboardingCompletion,
      readyAccountHandle,
      setAvailableHandles,
    ],
  );

  return {
    isAddAccountModalOpen,
    addAccountInput,
    addAccountPreview,
    isAddAccountPreviewLoading,
    isAddAccountSubmitting,
    addAccountLoadingStepIndex,
    addAccountError,
    readyAccountHandle,
    normalizedAddAccount,
    hasValidAddAccountPreview,
    loadingSteps: CHAT_ONBOARDING_LOADING_STEPS,
    removingHandle,
    showScrapeDebugControls,
    isScrapeDebugDialogOpen,
    scrapeDebugHandle,
    scrapeDebugCapture,
    scrapeDebugTelemetry,
    scrapeDebugSessionHealth,
    isScrapeDebugLoading,
    scrapeDebugActionInFlight,
    scrapeDebugError,
    scrapeDebugNotice,
    switchActiveHandle,
    removeHandle,
    openScrapeDebug,
    setScrapeDebugDialogOpen: closeScrapeDebug,
    reloadScrapeDebugCapture,
    runRecentScrapeDebugSync,
    runDeepBackfillDebug,
    runScrapeSessionHealthCheck,
    openAddAccountModal,
    closeAddAccountModal,
    handleAddAccountSubmit,
    updateAddAccountInput,
  };
}
