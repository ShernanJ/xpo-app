import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { requestSupabaseEmailCode } from "./supabase";

describe("requestSupabaseEmailCode", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalSupabaseAnonKey === undefined) {
      delete process.env.SUPABASE_ANON_KEY;
    } else {
      process.env.SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    }
  });

  test("normalizes upstream email delivery failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "Error sending confirmation email",
        },
        { status: 500 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSupabaseEmailCode("stan@example.com", {
      createUser: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/otp",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "delivery_failed",
        message: "Error sending confirmation email",
      },
    });
  });
});
