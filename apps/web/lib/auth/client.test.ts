import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/posthog/client", () => ({
  buildPostHogHeaders: (headers?: HeadersInit) => headers ?? {},
  identifyPostHogUser: vi.fn(),
  resetPostHogUser: vi.fn(),
}));

import { requestEmailCode, verifyEmailCode } from "./client";

describe("auth client error parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("uses structured API validation errors for email-code requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          ok: false,
          code: "delivery_failed",
          errors: [{ field: "email", message: "Error sending confirmation email" }],
        },
        { status: 500 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestEmailCode({ email: "stan@example.com" });

    expect(result).toEqual({
      ok: false,
      status: 500,
      code: "delivery_failed",
      error: "Error sending confirmation email",
      user: undefined,
    });
  });

  test("uses structured API validation errors for email-code verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          ok: false,
          code: "invalid_otp",
          errors: [{ field: "auth", message: "Invalid or expired verification code." }],
        },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyEmailCode({
      email: "stan@example.com",
      code: "123456",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "invalid_otp",
      error: "Invalid or expired verification code.",
      user: undefined,
    });
  });
});
