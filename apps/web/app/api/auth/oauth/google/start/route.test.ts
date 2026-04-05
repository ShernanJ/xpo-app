import { beforeEach, describe, expect, test, vi } from "vitest";

const randomBytesMock = vi.hoisted(() => vi.fn());

vi.mock("crypto", () => ({
  randomBytes: randomBytesMock,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  randomBytesMock.mockReturnValue({
    toString: () => "test_state_123",
  });
});

describe("GET /api/auth/oauth/google/start", () => {
  test("builds the callback URL from the incoming request host", async () => {
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalAppUrl = process.env.APP_URL;
    const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.APP_URL = "https://xpo.lol";
    process.env.NEXT_PUBLIC_APP_URL = "https://xpo.lol";

    try {
      const response = await GET(
        new Request("https://www.xpo.lol/api/auth/oauth/google/start?callbackUrl=%2Fchat"),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("set-cookie")).toContain("sx_google_oauth_state=test_state_123");

      const location = response.headers.get("location");
      expect(location).toBeTruthy();

      const authorizeUrl = new URL(location!);
      expect(authorizeUrl.origin).toBe("https://example.supabase.co");

      const redirectTo = authorizeUrl.searchParams.get("redirect_to");
      expect(redirectTo).toBe("https://www.xpo.lol/auth/callback/google?callbackUrl=%2Fchat&state=test_state_123");
    } finally {
      if (originalSupabaseUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = originalSupabaseUrl;
      }

      if (originalAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = originalAppUrl;
      }

      if (originalPublicAppUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
      }
    }
  });
});
