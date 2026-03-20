import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  consumeRateLimit: vi.fn(),
  getRequestIp: vi.fn(),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(),
  createSessionToken: vi.fn(),
  ensureAppUserForAuthIdentity: vi.fn(),
  getSupabaseUserFromAccessToken: vi.fn(),
  identifyPostHogServerUser: vi.fn(),
  capturePostHogServerEvent: vi.fn(),
  capturePostHogServerException: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookiesGet,
  }),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock("@/lib/security/requestValidation", () => ({
  buildErrorResponse: (args: {
    status: number;
    field: string;
    message: string;
    extras?: Record<string, unknown>;
  }) =>
    Response.json(
      {
        ok: false,
        errors: [{ field: args.field, message: args.message }],
        ...(args.extras ?? {}),
      },
      { status: args.status },
    ),
  getRequestIp: mocks.getRequestIp,
  parseJsonBody: mocks.parseJsonBody,
  requireAllowedOrigin: mocks.requireAllowedOrigin,
}));

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "sx_session",
  SESSION_MAX_AGE_SECONDS: 60,
  createSessionToken: mocks.createSessionToken,
}));

vi.mock("@/lib/auth/serverSession", () => ({
  AuthIdentityConflictError: class AuthIdentityConflictError extends Error {
    readonly code = "AUTH_IDENTITY_CONFLICT";
    readonly existingEmail = "existing@example.com";
    readonly incomingEmail = "incoming@example.com";
  },
  ensureAppUserForAuthIdentity: mocks.ensureAppUserForAuthIdentity,
}));

vi.mock("@/lib/auth/supabase", () => ({
  getSupabaseUserFromAccessToken: mocks.getSupabaseUserFromAccessToken,
}));

vi.mock("@/lib/posthog/server", () => ({
  identifyPostHogServerUser: mocks.identifyPostHogServerUser,
  capturePostHogServerEvent: mocks.capturePostHogServerEvent,
  capturePostHogServerException: mocks.capturePostHogServerException,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookiesGet.mockReturnValue({ value: "state_123" });
  mocks.consumeRateLimit.mockResolvedValue({ ok: true });
  mocks.getRequestIp.mockReturnValue("127.0.0.1");
  mocks.parseJsonBody.mockResolvedValue({
    ok: true,
    value: {
      accessToken: "access_token_123",
      state: "state_123",
    },
  });
  mocks.requireAllowedOrigin.mockReturnValue(null);
  mocks.createSessionToken.mockResolvedValue("session_token");
  mocks.ensureAppUserForAuthIdentity.mockResolvedValue({
    id: "user_123",
    email: "stan@example.com",
    handle: "stan",
    activeXHandle: "stan",
  });
  mocks.getSupabaseUserFromAccessToken.mockResolvedValue({
    ok: true,
    data: {
      userId: "user_123",
      email: "stan@example.com",
    },
  });
  mocks.identifyPostHogServerUser.mockResolvedValue(undefined);
  mocks.capturePostHogServerEvent.mockResolvedValue(undefined);
  mocks.capturePostHogServerException.mockResolvedValue(undefined);
});

describe("POST /api/auth/oauth/google/session", () => {
  test("returns success without waiting for PostHog to settle", async () => {
    const never = new Promise<void>(() => {});
    mocks.identifyPostHogServerUser.mockReturnValue(never);
    mocks.capturePostHogServerEvent.mockReturnValue(never);

    const result = await Promise.race([
      POST(
        new Request("http://localhost/api/auth/oauth/google/session", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            accessToken: "access_token_123",
            state: "state_123",
          }),
        }),
      ).then(async (response) => ({
        kind: "response" as const,
        status: response.status,
        payload: await response.json(),
      })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        setTimeout(() => {
          resolve({ kind: "timeout" });
        }, 25);
      }),
    ]);

    expect(result).not.toEqual({ kind: "timeout" });
    expect(result.kind).toBe("response");
    if (result.kind !== "response") {
      throw new Error("Google OAuth session route did not finish.");
    }

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({
      ok: true,
      user: {
        id: "user_123",
        email: "stan@example.com",
        handle: "stan",
        activeXHandle: "stan",
      },
    });
    expect(mocks.identifyPostHogServerUser).toHaveBeenCalledTimes(1);
    expect(mocks.capturePostHogServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.capturePostHogServerException).not.toHaveBeenCalled();
  });
});
