"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { markHandleJustOnboarded } from "@/lib/chat/workspaceStartupSession";

import {
  type ChatWorkspaceStartupState,
  resolveWorkspaceBootstrapLoadState,
  type WorkspaceBootstrapResponseLike,
} from "./chatWorkspaceLoadState";

interface ValidationError {
  message: string;
}

interface WorkspaceLoadFailureLike {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID" | "SETUP_PENDING";
  retryable?: boolean;
  pollAfterMs?: number;
  errors: ValidationError[];
}

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
  persistedAt?: string;
}

interface OnboardingRunQueued {
  ok: true;
  status: "queued";
  jobId: string;
}

interface OnboardingRunFailure {
  ok: false;
  code?: "PLAN_REQUIRED";
  errors: ValidationError[];
  data?: {
    billing?: unknown;
  };
  status?: "failed";
}

interface OnboardingJobRunning {
  ok: true;
  status: "queued" | "running";
  jobId: string;
}

interface OnboardingJobCompleted extends OnboardingRunSuccess {
  status: "completed";
  jobId: string;
}

type OnboardingJobStatusResponse =
  | OnboardingJobRunning
  | OnboardingJobCompleted
  | OnboardingRunFailure;

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunQueued | OnboardingRunFailure;

interface WorkspaceLoadResult<TContextData, TContractData> {
  ok: boolean;
  contextData?: TContextData;
  contractData?: TContractData;
  backgroundSync?: {
    jobId: string;
    phase: "primer" | "archive";
  } | null;
}

type MissingOnboardingSetupResult = "succeeded" | "already_attempted" | "failed";
type MissingOnboardingSetupState = "in_progress" | "succeeded" | "failed";

const MAX_SETUP_PENDING_POLLS = 12;

function getNextSetupPendingDelayMs(pollAfterMs: number, attempt: number): number {
  return Math.max(500, Math.min(5000, pollAfterMs + attempt * 250));
}

interface UseChatWorkspaceBootstrapOptions<TContextData, TContractData, TStrategyInputs, TToneInputs> {
  accountName: string | null;
  requiresXAccountGate: boolean;
  activeStrategyInputs: TStrategyInputs | null;
  activeToneInputs: TToneInputs | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  setIsLoading: (value: boolean) => void;
  setIsWorkspaceInitializing: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setContext: (value: TContextData | null) => void;
  setContract: (value: TContractData | null) => void;
  applyBillingSnapshot: (billing: unknown) => void;
  onPlanRequired: () => void;
  normalizeAccountHandle: (value: string) => string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getFirstErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const errors = "errors" in payload ? payload.errors : undefined;
  if (!Array.isArray(errors)) {
    return fallback;
  }

  const [firstError] = errors as Array<{ message?: unknown }>;
  return typeof firstError?.message === "string" ? firstError.message : fallback;
}

export function useChatWorkspaceBootstrap<
  TContextData,
  TContractData,
  TStrategyInputs,
  TToneInputs,
>(options: UseChatWorkspaceBootstrapOptions<TContextData, TContractData, TStrategyInputs, TToneInputs>) {
  const {
    accountName,
    requiresXAccountGate,
    activeStrategyInputs,
    activeToneInputs,
    fetchWorkspace,
    setIsLoading,
    setIsWorkspaceInitializing,
    setErrorMessage,
    setContext,
    setContract,
    applyBillingSnapshot,
    onPlanRequired,
    normalizeAccountHandle,
  } = options;

  const missingOnboardingSetupStateRef = useRef<Map<string, MissingOnboardingSetupState>>(new Map());
  const activeStrategyInputsRef = useRef<TStrategyInputs | null>(activeStrategyInputs);
  const activeToneInputsRef = useRef<TToneInputs | null>(activeToneInputs);
  const activeWorkspaceLoadControllerRef = useRef<AbortController | null>(null);
  const workspaceLoadRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const [startupState, setStartupState] = useState<ChatWorkspaceStartupState>({
    status: "shell_loading",
  });
  const workspaceBootstrapCallbacksRef = useRef({
    applyBillingSnapshot,
    onPlanRequired,
    normalizeAccountHandle,
  });
  const [backgroundSync, setBackgroundSync] = useState<{
    jobId: string;
    phase: "primer" | "archive";
  } | null>(null);

  useEffect(() => {
    activeStrategyInputsRef.current = activeStrategyInputs;
  }, [activeStrategyInputs]);

  useEffect(() => {
    activeToneInputsRef.current = activeToneInputs;
  }, [activeToneInputs]);

  useEffect(() => {
    workspaceBootstrapCallbacksRef.current = {
      applyBillingSnapshot,
      onPlanRequired,
      normalizeAccountHandle,
    };
  }, [applyBillingSnapshot, normalizeAccountHandle, onPlanRequired]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activeWorkspaceLoadControllerRef.current?.abort();
      activeWorkspaceLoadControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setStartupState({
      status: "shell_loading",
    });
    setBackgroundSync(null);
  }, [accountName]);

  const runMissingOnboardingSetup = useCallback(async (
    requestId: number,
    signal: AbortSignal,
  ): Promise<MissingOnboardingSetupResult> => {
    const isLatestRequest = () =>
      isMountedRef.current &&
      workspaceLoadRequestIdRef.current === requestId &&
      !signal.aborted;
    const normalizedHandle =
      workspaceBootstrapCallbacksRef.current.normalizeAccountHandle(accountName ?? "");
    if (!normalizedHandle) {
      if (isLatestRequest()) {
        setErrorMessage("This account is not ready yet. Select a valid X handle first.");
      }
      return "failed";
    }

    const existingSetupState = missingOnboardingSetupStateRef.current.get(normalizedHandle);
    if (existingSetupState === "failed") {
      return "failed";
    }
    if (existingSetupState) {
      return "already_attempted";
    }
    missingOnboardingSetupStateRef.current.set(normalizedHandle, "in_progress");

    if (isLatestRequest()) {
      setIsWorkspaceInitializing(true);
      setErrorMessage(null);
    }

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          account: normalizedHandle,
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: { casing: "lowercase", risk: "safe" },
        }),
      });

      if (!isLatestRequest()) {
        return "failed";
      }

      const data = (await response.json().catch(() => null)) as OnboardingRunResponse | null;
      if (!response.ok || !data || !data.ok) {
        missingOnboardingSetupStateRef.current.set(normalizedHandle, "failed");
        if (data && !data.ok && data.data?.billing) {
          workspaceBootstrapCallbacksRef.current.applyBillingSnapshot(data.data.billing);
        }
        if (response.status === 403) {
          workspaceBootstrapCallbacksRef.current.onPlanRequired();
        }
        setStartupState({
          status: "error",
        });
        const errorText = getFirstErrorMessage(data, "Could not finish setup for this account.");
        setErrorMessage(errorText);
        return "failed";
      }

      if (response.status === 202 && "status" in data && data.status === "queued") {
        for (let attempt = 0; attempt < 90; attempt += 1) {
          if (attempt > 0) {
            await sleep(attempt === 1 ? 700 : 1500);
          }

          if (!isLatestRequest()) {
            return "failed";
          }

          const jobResponse = await fetch(`/api/onboarding/jobs/${data.jobId}`, {
            headers: {
              "Content-Type": "application/json",
            },
            method: "GET",
            signal,
          });

          if (!isLatestRequest()) {
            return "failed";
          }

          const jobData = (await jobResponse.json().catch(() => null)) as OnboardingJobStatusResponse | null;

          if (jobData?.ok && jobData.status === "completed") {
            missingOnboardingSetupStateRef.current.set(normalizedHandle, "succeeded");
            markHandleJustOnboarded(normalizedHandle);
            return "succeeded";
          }

          if (!jobData?.ok) {
            missingOnboardingSetupStateRef.current.set(normalizedHandle, "failed");
            setStartupState({
              status: "error",
            });
            setErrorMessage(
              getFirstErrorMessage(
                jobData,
                "Could not finish setting up this account automatically.",
              ),
            );
            return "failed";
          }

          if (!jobResponse.ok && jobData.status !== "running" && jobData.status !== "queued") {
            setErrorMessage("Could not finish setting up this account automatically.");
            return "failed";
          }
        }

        setErrorMessage(
          "Setup is taking longer than expected. Refresh chat in a few seconds.",
        );
        missingOnboardingSetupStateRef.current.set(normalizedHandle, "succeeded");
        setStartupState({
          status: "setup_timeout",
        });
        return "failed";
      }

      missingOnboardingSetupStateRef.current.set(normalizedHandle, "succeeded");
      markHandleJustOnboarded(normalizedHandle);
      return "succeeded";
    } catch (error) {
      if (!isLatestRequest()) {
        return "failed";
      }

      if (!(error instanceof DOMException && error.name === "AbortError")) {
        missingOnboardingSetupStateRef.current.set(normalizedHandle, "failed");
        setStartupState({
          status: "error",
        });
        setErrorMessage(
          "Could not finish setting up this account automatically. Run onboarding once, then reopen chat.",
        );
      }
      return "failed";
    } finally {
      if (isLatestRequest()) {
        setIsWorkspaceInitializing(false);
      }
    }
  }, [
    accountName,
    setErrorMessage,
    setIsWorkspaceInitializing,
  ]);

  const loadWorkspace = useCallback(
    async (
      overrides: TStrategyInputs | null = activeStrategyInputsRef.current,
      toneOverrides: TToneInputs | null = activeToneInputsRef.current,
    ): Promise<WorkspaceLoadResult<TContextData, TContractData>> => {
      const requestId = workspaceLoadRequestIdRef.current + 1;
      workspaceLoadRequestIdRef.current = requestId;
      activeWorkspaceLoadControllerRef.current?.abort();

      const isLatestRequest = (signal?: AbortSignal) =>
        isMountedRef.current &&
        workspaceLoadRequestIdRef.current === requestId &&
        !signal?.aborted;
      const assignActiveController = () => {
        const controller = new AbortController();
        activeWorkspaceLoadControllerRef.current = controller;
        return controller;
      };

      if (requiresXAccountGate) {
        if (isLatestRequest()) {
          setErrorMessage(null);
          setIsWorkspaceInitializing(false);
          setIsLoading(false);
          setBackgroundSync(null);
        }
        return { ok: false };
      }

      if (isLatestRequest()) {
        setIsWorkspaceInitializing(false);
      }
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const requestBody = {
          ...(overrides ?? {}),
          ...(toneOverrides ?? {}),
        };
        const runWorkspaceFetch = async (
          controller: AbortController,
          allowMissingOnboardingRecovery = true,
          pendingAttempt = 0,
        ): Promise<WorkspaceLoadResult<TContextData, TContractData>> => {
          const bootstrapResponse = await fetchWorkspace("/api/creator/workspace/bootstrap", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify(requestBody),
          });

          if (!isLatestRequest(controller.signal)) {
            return { ok: false };
          }

          const bootstrapData = (await bootstrapResponse.json()) as WorkspaceBootstrapResponseLike<
            TContextData,
            TContractData
          >;

          if (!isLatestRequest(controller.signal)) {
            return { ok: false };
          }

          const workspaceLoadState = resolveWorkspaceBootstrapLoadState({
            responseOk: bootstrapResponse.ok,
            status: bootstrapResponse.status,
            data: bootstrapData,
          });

          if (workspaceLoadState.status === "setup_pending") {
            if (isLatestRequest(controller.signal)) {
              setStartupState({
                status: "setup_pending",
                pollAfterMs: workspaceLoadState.pollAfterMs,
              });
              setErrorMessage(null);
            }

            if (allowMissingOnboardingRecovery) {
              const setupResult = await runMissingOnboardingSetup(requestId, controller.signal);
              if (!isLatestRequest(controller.signal)) {
                return { ok: false };
              }
              if (setupResult === "failed") {
                return { ok: false };
              }
            }

            if (pendingAttempt >= MAX_SETUP_PENDING_POLLS - 1) {
              if (isLatestRequest(controller.signal)) {
                setStartupState({
                  status: "setup_timeout",
                });
                setErrorMessage(null);
              }
              return { ok: false };
            }

            await sleep(getNextSetupPendingDelayMs(workspaceLoadState.pollAfterMs, pendingAttempt));
            if (!isLatestRequest(controller.signal)) {
              return { ok: false };
            }

            return runWorkspaceFetch(
              assignActiveController(),
              false,
              pendingAttempt + 1,
            );
          }

          if (workspaceLoadState.status === "error") {
            if (isLatestRequest(controller.signal)) {
              setStartupState({
                status: "error",
              });
              setErrorMessage(workspaceLoadState.errorMessage);
            }
            return { ok: false };
          }

          if (!isLatestRequest(controller.signal)) {
            return { ok: false };
          }

          const normalizedHandle =
            workspaceBootstrapCallbacksRef.current.normalizeAccountHandle(accountName ?? "");
          if (normalizedHandle) {
            missingOnboardingSetupStateRef.current.delete(normalizedHandle);
          }

          setStartupState({
            status: "workspace_ready",
          });
          setErrorMessage(null);
          setBackgroundSync(
            bootstrapData.ok ? bootstrapData.data.backgroundSync ?? null : null,
          );
          setContext(workspaceLoadState.contextData);
          setContract(workspaceLoadState.contractData);
          return {
            ok: true,
            backgroundSync:
              bootstrapData.ok ? bootstrapData.data.backgroundSync ?? null : null,
            contextData: workspaceLoadState.contextData,
            contractData: workspaceLoadState.contractData,
          };
        };

        return await runWorkspaceFetch(assignActiveController());
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return { ok: false };
        }

        if (isLatestRequest()) {
          setErrorMessage("Network error while loading the chat workspace.");
        }
        return { ok: false };
      } finally {
        if (workspaceLoadRequestIdRef.current === requestId) {
          activeWorkspaceLoadControllerRef.current = null;
          if (isMountedRef.current) {
            setIsWorkspaceInitializing(false);
            setIsLoading(false);
          }
        }
      }
    },
    [
      accountName,
      fetchWorkspace,
      requiresXAccountGate,
      runMissingOnboardingSetup,
      setContext,
      setContract,
      setErrorMessage,
      setIsLoading,
    ],
  );

  const clearMissingOnboardingAttempts = useCallback(() => {
    missingOnboardingSetupStateRef.current.clear();
  }, []);

  const retryWorkspaceStartup = useCallback(() => {
    setStartupState({
      status: "shell_loading",
    });
    setErrorMessage(null);
    void loadWorkspace();
  }, [loadWorkspace, setErrorMessage]);

  return {
    backgroundSync,
    loadWorkspace,
    clearMissingOnboardingAttempts,
    retryWorkspaceStartup,
    startupState,
  };
}
