"use client";

import { useCallback, useEffect, useRef } from "react";

import { resolveWorkspaceLoadState } from "./chatWorkspaceLoadState";

interface ValidationError {
  message: string;
}

interface WorkspaceLoadFailureLike {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
  errors: ValidationError[];
}

interface WorkspaceLoadSuccessLike<TData> {
  ok: true;
  data: TData;
}

type WorkspaceLoadResponseLike<TData> =
  | WorkspaceLoadSuccessLike<TData>
  | WorkspaceLoadFailureLike;

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
    billing?: unknown;
  };
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

interface WorkspaceLoadResult<TContextData, TContractData> {
  ok: boolean;
  contextData?: TContextData;
  contractData?: TContractData;
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
  ): Promise<boolean> => {
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
      return false;
    }

    if (missingOnboardingSetupAttemptedRef.current.has(normalizedHandle)) {
      if (isLatestRequest()) {
        setErrorMessage(
          "Setup for this account is still incomplete. Try refreshing chat in a few seconds.",
        );
      }
      return false;
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
        return false;
      }

      const data = (await response.json().catch(() => null)) as OnboardingRunResponse | null;
      if (!response.ok || !data || !data.ok) {
        if (data && !data.ok && data.data?.billing) {
          workspaceBootstrapCallbacksRef.current.applyBillingSnapshot(data.data.billing);
        }
        if (response.status === 403) {
          workspaceBootstrapCallbacksRef.current.onPlanRequired();
        }
        const errorText =
          data && !data.ok
            ? (data.errors[0]?.message ?? "Could not finish setup for this account.")
            : "Could not finish setup for this account.";
        setErrorMessage(errorText);
        return false;
      }

      return true;
    } catch (error) {
      if (!isLatestRequest()) {
        return false;
      }

      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setErrorMessage(
          "Could not finish setting up this account automatically. Run onboarding once, then reopen chat.",
        );
      }
      return false;
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
        ): Promise<WorkspaceLoadResult<TContextData, TContractData>> => {
          const [contextResponse, contractResponse] = await Promise.all([
            fetchWorkspace("/api/creator/context", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              signal: controller.signal,
              body: JSON.stringify(requestBody),
            }),
            fetchWorkspace("/api/creator/generation-contract", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              signal: controller.signal,
              body: JSON.stringify(requestBody),
            }),
          ]);

          if (!isLatestRequest(controller.signal)) {
            return { ok: false };
          }

          const contextData = (await contextResponse.json()) as WorkspaceLoadResponseLike<
            TContextData
          >;
          const contractData = (await contractResponse.json()) as WorkspaceLoadResponseLike<
            TContractData
          >;

          if (!isLatestRequest(controller.signal)) {
            return { ok: false };
          }

          const workspaceLoadState = resolveWorkspaceLoadState({
            contextResponseOk: contextResponse.ok,
            contextStatus: contextResponse.status,
            contextData,
            contractResponseOk: contractResponse.ok,
            contractStatus: contractResponse.status,
            contractData,
          });

          if (workspaceLoadState.status === "retry_after_onboarding") {
            const didSetup = await runMissingOnboardingSetup(requestId, controller.signal);
            if (!didSetup || !isLatestRequest(controller.signal)) {
              return { ok: false };
            }

            return runWorkspaceFetch(assignActiveController());
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
