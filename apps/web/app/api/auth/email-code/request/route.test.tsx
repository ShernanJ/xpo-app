import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestSupabaseEmailCode: vi.fn(),
  capturePostHogServerEvent: vi.fn(),
  capturePostHogServerException: vi.fn(),
  consumeRateLimit: vi.fn(),
  getRequestIp: vi.fn(),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(),
}));

vi.mock("@/lib/auth/supabase", () => ({
  requestSupabaseEmailCode: mocks.requestSupabaseEmailCode,
}));

vi.mock("@/lib/posthog/server", () => ({
  capturePostHogServerEvent: mocks.capturePostHogServerEvent,
  capturePostHogServerException: mocks.capturePostHogServerException,
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

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeRateLimit.mockResolvedValue({ ok: true });
  mocks.getRequestIp.mockReturnValue("127.0.0.1");
  mocks.parseJsonBody.mockResolvedValue({
    ok: true,
    value: {
      email: "stan@example.com",
    },
  });
  mocks.requireAllowedOrigin.mockReturnValue(null);
  mocks.capturePostHogServerEvent.mockResolvedValue(undefined);
  mocks.capturePostHogServerException.mockResolvedValue(undefined);
});

describe("POST /api/auth/email-code/request", () => {
  test("returns 500 for upstream delivery failures", async () => {
    mocks.requestSupabaseEmailCode.mockResolvedValue({
      ok: false,
      error: {
        code: "delivery_failed",
        message: "Error sending confirmation email",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/auth/email-code/request", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "stan@example.com",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      ok: false,
      code: "delivery_failed",
      errors: [{ field: "email", message: "Error sending confirmation email" }],
    });
  });
});
