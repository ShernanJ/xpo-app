"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  resolveWorkspaceBootstrapLoadState,
  type WorkspaceBootstrapResponseLike,
} from "./chatWorkspaceLoadState";

interface ValidationError {
  message: string;
}

interface WorkspaceLoadFailureLike {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
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
}

type MissingOnboardingSetupResult = "succeeded" | "already_attempted" | "failed";

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

  const missingOnboardingSetupAttemptedRef = useRef<Set<string>>(new Set());
  const activeStrategyInputsRef = useRef<TStrategyInputs | null>(activeStrategyInputs);
  const activeToneInputsRef = useRef<TToneInputs | null>(activeToneInputs);
  const activeWorkspaceLoadControllerRef = useRef<AbortController | null>(null);
  const workspaceLoadRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const workspaceBootstrapCallbacksRef = useRef({
    applyBillingSnapshot,
    onPlanRequired,
    normalizeAccountHandle,
  });

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

    if (missingOnboardingSetupAttemptedRef.current.has(normalizedHandle)) {
      return "already_attempted";
    }
    missingOnboardingSetupAttemptedRef.current.add(normalizedHandle);

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
        if (data && !data.ok && data.data?.billing) {
          workspaceBootstrapCallbacksRef.current.applyBillingSnapshot(data.data.billing);
        }
        if (response.status === 403) {
          workspaceBootstrapCallbacksRef.current.onPlanRequired();
        }
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
            return "succeeded";
          }

          if (!jobData?.ok) {
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
        return "failed";
      }

      return "succeeded";
    } catch (error) {
      if (!isLatestRequest()) {
        return "failed";
      }

      if (!(error instanceof DOMException && error.name === "AbortError")) {
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

          if (workspaceLoadState.status === "retry_after_onboarding") {
            if (!allowMissingOnboardingRecovery) {
              if (isLatestRequest(controller.signal)) {
                setErrorMessage(
                  "Setup for this account is still incomplete. Try refreshing chat in a few seconds.",
                );
              }
              return { ok: false };
            }

            const setupResult = await runMissingOnboardingSetup(requestId, controller.signal);
            if (!isLatestRequest(controller.signal)) {
              return { ok: false };
            }
            if (setupResult === "failed") {
              return { ok: false };
            }

            return runWorkspaceFetch(assignActiveController(), false);
          }

          if (workspaceLoadState.status === "error") {
            if (isLatestRequest(controller.signal)) {
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
            missingOnboardingSetupAttemptedRef.current.delete(normalizedHandle);
          }

          setContext(workspaceLoadState.contextData);
          setContract(workspaceLoadState.contractData);
          return {
            ok: true,
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
    missingOnboardingSetupAttemptedRef.current.clear();
  }, []);

  return {
    loadWorkspace,
    clearMissingOnboardingAttempts,
  };
}
