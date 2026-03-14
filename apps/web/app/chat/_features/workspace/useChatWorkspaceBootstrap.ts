"use client";

import { useCallback, useRef } from "react";

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

  const runMissingOnboardingSetup = useCallback(async (): Promise<boolean> => {
    const normalizedHandle = normalizeAccountHandle(accountName ?? "");
    if (!normalizedHandle) {
      setErrorMessage("This account is not ready yet. Select a valid X handle first.");
      return false;
    }

    if (missingOnboardingSetupAttemptedRef.current.has(normalizedHandle)) {
      setErrorMessage(
        "Setup for this account is still incomplete. Try refreshing chat in a few seconds.",
      );
      return false;
    }
    missingOnboardingSetupAttemptedRef.current.add(normalizedHandle);

    setIsWorkspaceInitializing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: normalizedHandle,
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: { casing: "lowercase", risk: "safe" },
        }),
      });

      const data = (await response.json().catch(() => null)) as OnboardingRunResponse | null;
      if (!response.ok || !data || !data.ok) {
        if (data && !data.ok && data.data?.billing) {
          applyBillingSnapshot(data.data.billing);
        }
        if (response.status === 403) {
          onPlanRequired();
        }
        const errorText =
          data && !data.ok
            ? (data.errors[0]?.message ?? "Could not finish setup for this account.")
            : "Could not finish setup for this account.";
        missingOnboardingSetupAttemptedRef.current.delete(normalizedHandle);
        setErrorMessage(errorText);
        return false;
      }

      return true;
    } catch {
      missingOnboardingSetupAttemptedRef.current.delete(normalizedHandle);
      setErrorMessage(
        "Could not finish setting up this account automatically. Run onboarding once, then reopen chat.",
      );
      return false;
    } finally {
      setIsWorkspaceInitializing(false);
    }
  }, [
    accountName,
    applyBillingSnapshot,
    normalizeAccountHandle,
    onPlanRequired,
    setErrorMessage,
    setIsWorkspaceInitializing,
  ]);

  const loadWorkspace = useCallback(
    async (
      overrides: TStrategyInputs | null = activeStrategyInputs,
      toneOverrides: TToneInputs | null = activeToneInputs,
    ): Promise<WorkspaceLoadResult<TContextData, TContractData>> => {
      if (requiresXAccountGate) {
        setErrorMessage(null);
        setIsLoading(false);
        return { ok: false };
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const requestBody = {
          ...(overrides ?? {}),
          ...(toneOverrides ?? {}),
        };

        const [contextResponse, contractResponse] = await Promise.all([
          fetchWorkspace("/api/creator/context", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
          fetchWorkspace("/api/creator/generation-contract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
        ]);

        const contextData = (await contextResponse.json()) as WorkspaceLoadResponseLike<
          TContextData
        >;
        const contractData = (await contractResponse.json()) as WorkspaceLoadResponseLike<
          TContractData
        >;

        const workspaceLoadState = resolveWorkspaceLoadState({
          contextResponseOk: contextResponse.ok,
          contextStatus: contextResponse.status,
          contextData,
          contractResponseOk: contractResponse.ok,
          contractStatus: contractResponse.status,
          contractData,
        });

        if (workspaceLoadState.status === "retry_after_onboarding") {
          const didSetup = await runMissingOnboardingSetup();
          if (didSetup) {
            return await loadWorkspace(overrides, toneOverrides);
          }
          return { ok: false };
        }

        if (workspaceLoadState.status === "error") {
          setErrorMessage(workspaceLoadState.errorMessage);
          return { ok: false };
        }

        setContext(workspaceLoadState.contextData);
        setContract(workspaceLoadState.contractData);
        return {
          ok: true,
          contextData: workspaceLoadState.contextData,
          contractData: workspaceLoadState.contractData,
        };
      } catch {
        setErrorMessage("Network error while loading the chat workspace.");
        return { ok: false };
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeStrategyInputs,
      activeToneInputs,
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
