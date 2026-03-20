import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  loadCreatorWorkspaceSnapshot: vi.fn(),
  enforceSessionMutationRateLimit: vi.fn(),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(),
  resolveWorkspaceHandleForRequest: vi.fn(),
}));

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/creator/workspaceSnapshot", () => ({
  loadCreatorWorkspaceSnapshot: mocks.loadCreatorWorkspaceSnapshot,
}));

vi.mock("@/lib/security/requestValidation", () => ({
  enforceSessionMutationRateLimit: mocks.enforceSessionMutationRateLimit,
  parseJsonBody: mocks.parseJsonBody,
  requireAllowedOrigin: mocks.requireAllowedOrigin,
}));

vi.mock("@/lib/workspaceHandle.server", () => ({
  resolveWorkspaceHandleForRequest: mocks.resolveWorkspaceHandleForRequest,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAllowedOrigin.mockReturnValue(null);
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: "user_1",
    },
  });
  mocks.enforceSessionMutationRateLimit.mockResolvedValue(null);
  mocks.parseJsonBody.mockResolvedValue({
    ok: true,
    value: {
      goal: "followers",
    },
  });
  mocks.resolveWorkspaceHandleForRequest.mockResolvedValue({
    ok: true,
    xHandle: "stan",
  });
});

describe("POST /api/creator/workspace/bootstrap", () => {
  test("returns a retryable setup-pending response for new handles", async () => {
    mocks.loadCreatorWorkspaceSnapshot.mockResolvedValue({
      ok: false,
      code: "MISSING_ONBOARDING_RUN",
      message: "No onboarding run found for this handle.",
    });

    const response = await POST(
      new Request("http://localhost/api/creator/workspace/bootstrap", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: "followers",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual({
      ok: false,
      code: "SETUP_PENDING",
      retryable: true,
      pollAfterMs: 1200,
      errors: [
        {
          field: "xHandle",
          message: "Setup is still finishing for this account.",
        },
      ],
    });
  });
});
