import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useChatWorkspaceBootstrap } from "./useChatWorkspaceBootstrap";

interface StrategyInputs {
  goal: string;
}

interface ToneInputs {
  tone: string;
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

test("keeps loadWorkspace stable while reading the latest strategy and tone inputs", async () => {
  const fetchWorkspace = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      createSuccessfulResponse({
        requestBody: JSON.parse(String(init?.body ?? "{}")),
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

  const { result, rerender } = renderHook(
    ({
      activeStrategyInputs,
      activeToneInputs,
    }: {
      activeStrategyInputs: StrategyInputs | null;
      activeToneInputs: ToneInputs | null;
    }) =>
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
      },
    },
  );

  const initialLoadWorkspace = result.current.loadWorkspace;
  const activeStrategyInputs = { goal: "followers" };
  const activeToneInputs = { tone: "bold" };

  rerender({
    activeStrategyInputs,
    activeToneInputs,
  });

  expect(result.current.loadWorkspace).toBe(initialLoadWorkspace);

  await act(async () => {
    await result.current.loadWorkspace();
  });

  expect(fetchWorkspace).toHaveBeenCalledTimes(2);
  expect(fetchWorkspace).toHaveBeenNthCalledWith(
    1,
    "/api/creator/context",
    expect.objectContaining({
      body: JSON.stringify({
        ...activeStrategyInputs,
        ...activeToneInputs,
      }),
    }),
  );
  expect(fetchWorkspace).toHaveBeenNthCalledWith(
    2,
    "/api/creator/generation-contract",
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
