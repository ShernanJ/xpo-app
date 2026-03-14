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

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
  persistedAt?: string;
}

interface OnboardingRunFailure {
  ok: false;
  code?: "PLAN_REQUIRED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotLike;
  };
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

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
  const [addAccountLoadingStepIndex, setAddAccountLoadingStepIndex] = useState(0);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [readyAccountHandle, setReadyAccountHandle] = useState<string | null>(null);

  const normalizedAddAccount = useMemo(
    () => normalizeAccountHandle(addAccountInput),
    [addAccountInput, normalizeAccountHandle],
  );
  const hasValidAddAccountPreview =
    Boolean(addAccountPreview) &&
    normalizeAccountHandle(addAccountPreview?.username ?? "") === normalizedAddAccount;

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

        if (!response.ok || !data.ok) {
          if (!data.ok && data.data?.billing) {
            applyBillingSnapshot(data.data.billing);
          }
          if (response.status === 403) {
            onOpenPricing();
          }
          throw new Error(
            data.ok ? "Failed to add account." : (data.errors[0]?.message ?? "Failed to add account."),
          );
        }

        const remainingDelay = Math.max(0, 2600 - (Date.now() - startedAt));
        if (remainingDelay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
        }

        setAvailableHandles((current) =>
          current.includes(normalizedAddAccount) ? current : [...current, normalizedAddAccount],
        );
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
    switchActiveHandle,
    openAddAccountModal,
    closeAddAccountModal,
    handleAddAccountSubmit,
    updateAddAccountInput,
  };
}
