import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useChatRouteWorkspaceState } from "./useChatRouteWorkspaceState";

const navigationState = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  replace: vi.fn(),
  router: null as { replace: ReturnType<typeof vi.fn> } | null,
  search: "",
}));

navigationState.router = {
  replace: navigationState.replace,
};

vi.mock("next/navigation", () => ({
  useParams: () => navigationState.params,
  useRouter: () => navigationState.router,
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

beforeEach(() => {
  navigationState.params = {};
  navigationState.replace.mockReset();
  navigationState.search = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses the attached requested handle after validating it against the server", async () => {
  navigationState.search = "xHandle=growthmode";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            handles: ["stanley", "growthmode"],
            activeHandle: "stanley",
          },
        }),
      }) as Response,
    ),
  );

  const { result } = renderHook(() =>
    useChatRouteWorkspaceState({
      sessionHandle: "stanley",
      sessionUserId: "user_1",
      status: "authenticated",
    }),
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.isWorkspaceHandleValidating).toBe(false);
  expect(result.current.accountName).toBe("growthmode");
  expect(result.current.requiresXAccountGate).toBe(false);
  expect(navigationState.replace).not.toHaveBeenCalled();
});

test("redirects an unattached requested handle back to the active attached handle", async () => {
  navigationState.search = "xHandle=intruder";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            handles: ["stanley", "growthmode"],
            activeHandle: "growthmode",
          },
        }),
      }) as Response,
    ),
  );

  const { result } = renderHook(() =>
    useChatRouteWorkspaceState({
      sessionHandle: "stanley",
      sessionUserId: "user_1",
      status: "authenticated",
    }),
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.isWorkspaceHandleValidating).toBe(false);
  expect(result.current.accountName).toBe("growthmode");
  expect(result.current.requiresXAccountGate).toBe(false);
  expect(navigationState.replace).toHaveBeenCalledWith("/chat?xHandle=growthmode", {
    scroll: false,
  });
});

test("redirects to bare /chat when no attached active handle exists", async () => {
  navigationState.search = "xHandle=intruder";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            handles: [],
            activeHandle: null,
          },
        }),
      }) as Response,
    ),
  );

  const { result } = renderHook(() =>
    useChatRouteWorkspaceState({
      sessionHandle: null,
      sessionUserId: "user_1",
      status: "authenticated",
    }),
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(result.current.isWorkspaceHandleValidating).toBe(false);
  expect(result.current.accountName).toBeNull();
  expect(result.current.requiresXAccountGate).toBe(true);
  expect(navigationState.replace).toHaveBeenCalledWith("/chat", {
    scroll: false,
  });
});
