import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useChatWorkspaceBootstrap } from "./useChatWorkspaceBootstrap";

interface StrategyInputs {
  goal: string;
}

interface ToneInputs {
  tone: string;
}

interface BootstrapHookProps {
  activeStrategyInputs: StrategyInputs | null;
  activeToneInputs: ToneInputs | null;
}

function createSuccessfulBootstrapResponse(args: {
  context: unknown;
  contract: unknown;
}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: {
        context: args.context,
        contract: args.contract,
      },
    }),
  } as Response;
}

function createSetupPendingResponse(pollAfterMs = 1200): Response {
  return {
    ok: false,
    status: 202,
    json: async () => ({
      ok: false,
      code: "SETUP_PENDING",
      retryable: true,
      pollAfterMs,
      errors: [{ message: "Setup is still finishing for this account." }],
    }),
  } as Response;
}

function createFailureResponse(args: {
  status: number;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
  message: string;
}): Response {
  return {
    ok: false,
    status: args.status,
    json: async () => ({
      ok: false,
      code: args.code,
      errors: [{ message: args.message }],
    }),
  } as Response;
}

test("keeps loadWorkspace stable while reading the latest strategy and tone inputs", async () => {
  const fetchWorkspace = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      createSuccessfulBootstrapResponse({
        context: {
          requestBody: JSON.parse(String(init?.body ?? "{}")),
        },
        contract: {
          requestBody: JSON.parse(String(init?.body ?? "{}")),
        },
      }),
  );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();

  const { result, rerender } = renderHook<
    ReturnType<
      typeof useChatWorkspaceBootstrap<
        { requestBody: Record<string, unknown> },
        { requestBody: Record<string, unknown> },
        StrategyInputs,
        ToneInputs
      >
    >,
    BootstrapHookProps
  >(
    ({ activeStrategyInputs, activeToneInputs }: BootstrapHookProps) =>
      useChatWorkspaceBootstrap<
        { requestBody: Record<string, unknown> },
        { requestBody: Record<string, unknown> },
        StrategyInputs,
        ToneInputs
      >({
        accountName: "stanley",
        isWorkspaceHandleValidating: false,
        requiresXAccountGate: false,
        activeStrategyInputs,
        activeToneInputs,
        fetchWorkspace,
        setIsLoading,
        setIsWorkspaceInitializing,
        setErrorMessage,
        setContext,
        setContract,
      }),
    {
      initialProps: {
        activeStrategyInputs: null,
        activeToneInputs: null,
      } satisfies BootstrapHookProps,
    },
  );

  const initialLoadWorkspace = result.current.loadWorkspace;
  const activeStrategyInputs = { goal: "followers" };
  const activeToneInputs = { tone: "bold" };

  rerender({
    activeStrategyInputs,
    activeToneInputs,
  } satisfies BootstrapHookProps);

  expect(result.current.loadWorkspace).toBe(initialLoadWorkspace);

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(fetchWorkspace).toHaveBeenCalledTimes(1);
  expect(fetchWorkspace).toHaveBeenNthCalledWith(
    1,
    "/api/creator/workspace/bootstrap",
    expect.objectContaining({
      body: JSON.stringify({
        ...activeStrategyInputs,
        ...activeToneInputs,
      }),
    }),
  );
  expect(setContext).toHaveBeenCalledWith({
    requestBody: {
      ...activeStrategyInputs,
      ...activeToneInputs,
    },
  });
  expect(setContract).toHaveBeenCalledWith({
    requestBody: {
      ...activeStrategyInputs,
      ...activeToneInputs,
    },
  });
});

test("does not bootstrap while the workspace handle is still validating", async () => {
  const fetchWorkspace = vi.fn<UseChatWorkspaceBootstrapFetch>();
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: null,
      isWorkspaceHandleValidating: true,
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
    }),
  );

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(fetchWorkspace).not.toHaveBeenCalled();
  expect(setContext).not.toHaveBeenCalled();
  expect(setContract).not.toHaveBeenCalled();
});

test("retries workspace bootstrap while setup is pending and never calls onboarding directly", async () => {
  const fetchWorkspace = vi
    .fn<UseChatWorkspaceBootstrapFetch>()
    .mockImplementationOnce(async () => createSetupPendingResponse(900))
    .mockImplementationOnce(async () =>
      createSuccessfulBootstrapResponse({
        context: { id: "context-queued" },
        contract: { id: "contract-queued" },
      }),
    );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();
  const globalFetch = vi.fn();

  vi.useFakeTimers();
  vi.stubGlobal("fetch", globalFetch);

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      isWorkspaceHandleValidating: false,
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
    }),
  );

  await act(async () => {
    const loadPromise = result.current.loadWorkspace();
    await vi.runAllTimersAsync();
    await loadPromise;
  });

  expect(fetchWorkspace).toHaveBeenCalledTimes(2);
  expect(globalFetch).not.toHaveBeenCalled();
  expect(setContext).toHaveBeenCalledWith({ id: "context-queued" });
  expect(setContract).toHaveBeenCalledWith({ id: "contract-queued" });

  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("clears workspace initializing when a newer load overtakes setup pending polling", async () => {
  let currentWorkspaceInitializing = false;
  const firstResponseDeferred = Promise.withResolvers<Response>();
  const fetchWorkspace = vi
    .fn<UseChatWorkspaceBootstrapFetch>()
    .mockImplementationOnce(async () => firstResponseDeferred.promise)
    .mockImplementationOnce(async () =>
      createSuccessfulBootstrapResponse({
        context: { id: "context-2" },
        contract: { id: "contract-2" },
      }),
    );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn((value: boolean) => {
    currentWorkspaceInitializing = value;
  });
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      isWorkspaceHandleValidating: false,
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
    }),
  );

  let firstLoadPromise!: Promise<unknown>;
  await act(async () => {
    firstLoadPromise = result.current.loadWorkspace();
    await Promise.resolve();
  });

  firstResponseDeferred.resolve(createSetupPendingResponse(900));

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(setContext).toHaveBeenCalledWith({ id: "context-2" });
  expect(setContract).toHaveBeenCalledWith({ id: "contract-2" });
  expect(currentWorkspaceInitializing).toBe(false);

  await act(async () => {
    await firstLoadPromise;
  });

  expect(currentWorkspaceInitializing).toBe(false);
});

test("surfaces bootstrap errors without attempting onboarding recovery", async () => {
  const fetchWorkspace = vi.fn<UseChatWorkspaceBootstrapFetch>(async () =>
    createFailureResponse({
      status: 409,
      code: "ONBOARDING_SOURCE_INVALID",
      message: "Workspace bootstrap failed.",
    }),
  );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();
  const globalFetch = vi.fn();

  vi.stubGlobal("fetch", globalFetch);

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      isWorkspaceHandleValidating: false,
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
    }),
  );

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(globalFetch).not.toHaveBeenCalled();
  expect(setErrorMessage).toHaveBeenCalledWith("Workspace bootstrap failed.");
  expect(setContext).not.toHaveBeenCalled();
  expect(setContract).not.toHaveBeenCalled();

  vi.unstubAllGlobals();
});

type UseChatWorkspaceBootstrapFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
