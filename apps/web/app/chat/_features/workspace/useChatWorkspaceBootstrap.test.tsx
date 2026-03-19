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

function createSuccessfulResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: payload,
    }),
  } as Response;
}

function createSuccessfulBootstrapResponse(args: {
  context: unknown;
  contract: unknown;
}): Response {
  return createSuccessfulResponse({
    context: args.context,
    contract: args.contract,
  });
}

function createFailureResponse(args: {
  status: number;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID" | "PLAN_REQUIRED";
  message: string;
  data?: unknown;
}): Response {
  return {
    ok: false,
    status: args.status,
    json: async () => ({
      ok: false,
      code: args.code,
      errors: [{ message: args.message }],
      data: args.data,
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
  const applyBillingSnapshot = vi.fn();
  const onPlanRequired = vi.fn();
  const normalizeAccountHandle = (value: string) => value.trim().toLowerCase();

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
        requiresXAccountGate: false,
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

test("keeps loadWorkspace stable when bootstrap callbacks change identity", () => {
  const fetchWorkspace = vi.fn(async () =>
    createSuccessfulBootstrapResponse({
      context: { ok: true },
      contract: { ok: true },
    }),
  );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();

  const { result, rerender } = renderHook(
    ({
      applyBillingSnapshot,
      onPlanRequired,
      normalizeAccountHandle,
    }: {
      applyBillingSnapshot: (billing: unknown) => void;
      onPlanRequired: () => void;
      normalizeAccountHandle: (value: string) => string;
    }) =>
      useChatWorkspaceBootstrap<{ ok: boolean }, { ok: boolean }, StrategyInputs, ToneInputs>({
        accountName: "stanley",
        requiresXAccountGate: false,
        activeStrategyInputs: null,
        activeToneInputs: null,
        fetchWorkspace,
        setIsLoading,
        setIsWorkspaceInitializing,
        setErrorMessage,
        setContext,
        setContract,
        applyBillingSnapshot,
        onPlanRequired,
        normalizeAccountHandle,
      }),
    {
      initialProps: {
        applyBillingSnapshot: () => undefined,
        onPlanRequired: () => undefined,
        normalizeAccountHandle: (value: string) => value.trim().toLowerCase(),
      },
    },
  );

  const initialLoadWorkspace = result.current.loadWorkspace;

  rerender({
    applyBillingSnapshot: () => undefined,
    onPlanRequired: () => undefined,
    normalizeAccountHandle: (value: string) => value.trim().toLowerCase(),
  });

  expect(result.current.loadWorkspace).toBe(initialLoadWorkspace);
});

test("retries workspace bootstrap once after onboarding setup succeeds", async () => {
  const fetchWorkspace = vi
    .fn<UseChatWorkspaceBootstrapFetch>()
    .mockImplementationOnce(async () =>
      createFailureResponse({
        status: 404,
        code: "MISSING_ONBOARDING_RUN",
        message: "No onboarding run found.",
      }),
    )
    .mockImplementationOnce(async () =>
      createSuccessfulBootstrapResponse({
        context: { id: "context-1" },
        contract: { id: "contract-1" },
      }),
    );
  const onboardingFetch = vi.fn(async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        runId: "run-1",
      }),
    }) as Response,
  );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();
  const applyBillingSnapshot = vi.fn();
  const onPlanRequired = vi.fn();

  vi.stubGlobal("fetch", onboardingFetch);

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
      applyBillingSnapshot,
      onPlanRequired,
      normalizeAccountHandle: (value) => value.trim().toLowerCase(),
    }),
  );

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(fetchWorkspace).toHaveBeenCalledTimes(2);
  expect(onboardingFetch).toHaveBeenCalledTimes(1);
  expect(setContext).toHaveBeenCalledWith({ id: "context-1" });
  expect(setContract).toHaveBeenCalledWith({ id: "contract-1" });

  vi.unstubAllGlobals();
});

test("does not keep retrying onboarding setup after a plan-required failure", async () => {
  const billingSnapshot = { plan: "free" };
  const fetchWorkspace = vi
    .fn<UseChatWorkspaceBootstrapFetch>()
    .mockImplementation(async () =>
      createFailureResponse({
        status: 404,
        code: "MISSING_ONBOARDING_RUN",
        message: "No onboarding run found.",
      }),
    );
  const onboardingFetch = vi.fn(async () =>
    ({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        code: "PLAN_REQUIRED",
        errors: [{ message: "Upgrade required." }],
        data: {
          billing: billingSnapshot,
        },
      }),
    }) as Response,
  );
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn();
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();
  const applyBillingSnapshot = vi.fn();
  const onPlanRequired = vi.fn();

  vi.stubGlobal("fetch", onboardingFetch);

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
      applyBillingSnapshot,
      onPlanRequired,
      normalizeAccountHandle: (value) => value.trim().toLowerCase(),
    }),
  );

  await act(async () => {
    await result.current.loadWorkspace();
    await result.current.loadWorkspace();
  });

  expect(onboardingFetch).toHaveBeenCalledTimes(1);
  expect(applyBillingSnapshot).toHaveBeenCalledWith(billingSnapshot);
  expect(onPlanRequired).toHaveBeenCalledTimes(1);
  expect(setContext).not.toHaveBeenCalled();
  expect(setContract).not.toHaveBeenCalled();

  vi.unstubAllGlobals();
});

test("clears workspace initializing when a newer load overtakes onboarding setup", async () => {
  let currentWorkspaceInitializing = false;
  const onboardingFetchDeferred = Promise.withResolvers<Response>();
  const fetchWorkspace = vi
    .fn<UseChatWorkspaceBootstrapFetch>()
    .mockImplementationOnce(async () =>
      createFailureResponse({
        status: 404,
        code: "MISSING_ONBOARDING_RUN",
        message: "No onboarding run found.",
      }),
    )
    .mockImplementationOnce(async () =>
      createFailureResponse({
        status: 404,
        code: "MISSING_ONBOARDING_RUN",
        message: "No onboarding run found.",
      }),
    )
    .mockImplementationOnce(async () =>
      createSuccessfulBootstrapResponse({
        context: { id: "context-2" },
        contract: { id: "contract-2" },
      }),
    );
  const onboardingFetch = vi.fn(async () => onboardingFetchDeferred.promise);
  const setIsLoading = vi.fn();
  const setIsWorkspaceInitializing = vi.fn((value: boolean) => {
    currentWorkspaceInitializing = value;
  });
  const setErrorMessage = vi.fn();
  const setContext = vi.fn();
  const setContract = vi.fn();
  const applyBillingSnapshot = vi.fn();
  const onPlanRequired = vi.fn();

  vi.stubGlobal("fetch", onboardingFetch);

  const { result } = renderHook(() =>
    useChatWorkspaceBootstrap<{ id: string }, { id: string }, StrategyInputs, ToneInputs>({
      accountName: "stanley",
      requiresXAccountGate: false,
      activeStrategyInputs: null,
      activeToneInputs: null,
      fetchWorkspace,
      setIsLoading,
      setIsWorkspaceInitializing,
      setErrorMessage,
      setContext,
      setContract,
      applyBillingSnapshot,
      onPlanRequired,
      normalizeAccountHandle: (value) => value.trim().toLowerCase(),
    }),
  );

  let firstLoadPromise!: Promise<unknown>;
  await act(async () => {
    firstLoadPromise = result.current.loadWorkspace();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(onboardingFetch).toHaveBeenCalledTimes(1);
  expect(currentWorkspaceInitializing).toBe(true);

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(setContext).toHaveBeenCalledWith({ id: "context-2" });
  expect(setContract).toHaveBeenCalledWith({ id: "contract-2" });
  expect(currentWorkspaceInitializing).toBe(false);

  onboardingFetchDeferred.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      runId: "run-1",
    }),
  } as Response);

  await act(async () => {
    await firstLoadPromise;
  });

  expect(currentWorkspaceInitializing).toBe(false);

  vi.unstubAllGlobals();
});

type UseChatWorkspaceBootstrapFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
