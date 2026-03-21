"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ChatWorkspaceStartupState,
  resolveWorkspaceBootstrapLoadState,
  type WorkspaceBootstrapResponseLike,
} from "./chatWorkspaceLoadState";

interface WorkspaceLoadResult<TContextData, TContractData> {
  ok: boolean;
  contextData?: TContextData;
  contractData?: TContractData;
  backgroundSync?: {
    jobId: string;
    phase: "primer" | "archive";
  } | null;
}

const MAX_SETUP_PENDING_POLLS = 12;

function getNextSetupPendingDelayMs(pollAfterMs: number, attempt: number): number {
  return Math.max(500, Math.min(5000, pollAfterMs + attempt * 250));
}

interface UseChatWorkspaceBootstrapOptions<TContextData, TContractData, TStrategyInputs, TToneInputs> {
  accountName: string | null;
  isWorkspaceHandleValidating: boolean;
  requiresXAccountGate: boolean;
  activeStrategyInputs: TStrategyInputs | null;
  activeToneInputs: TToneInputs | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  setIsLoading: (value: boolean) => void;
  setIsWorkspaceInitializing: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setContext: (value: TContextData | null) => void;
  setContract: (value: TContractData | null) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useChatWorkspaceBootstrap<
  TContextData,
  TContractData,
  TStrategyInputs,
  TToneInputs,
>(options: UseChatWorkspaceBootstrapOptions<TContextData, TContractData, TStrategyInputs, TToneInputs>) {
  const {
    accountName,
    isWorkspaceHandleValidating,
    requiresXAccountGate,
    activeStrategyInputs,
    activeToneInputs,
    fetchWorkspace,
    setIsLoading,
    setIsWorkspaceInitializing,
    setErrorMessage,
    setContext,
    setContract,
  } = options;

  const activeStrategyInputsRef = useRef<TStrategyInputs | null>(activeStrategyInputs);
  const activeToneInputsRef = useRef<TToneInputs | null>(activeToneInputs);
  const activeWorkspaceLoadControllerRef = useRef<AbortController | null>(null);
  const workspaceLoadRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const [startupState, setStartupState] = useState<ChatWorkspaceStartupState>({
    status: "shell_loading",
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

      if (isWorkspaceHandleValidating) {
        if (isLatestRequest()) {
          setErrorMessage(null);
          setIsWorkspaceInitializing(false);
          setIsLoading(true);
          setBackgroundSync(null);
        }
        return { ok: false };
      }

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
              setIsWorkspaceInitializing(true);
              setErrorMessage(null);
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
      isWorkspaceHandleValidating,
      requiresXAccountGate,
      setContext,
      setContract,
      setErrorMessage,
      setIsLoading,
    ],
  );

  const clearMissingOnboardingAttempts = useCallback(() => {
    return;
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
