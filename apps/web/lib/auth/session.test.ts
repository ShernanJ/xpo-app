import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    jwtVerify: mocks.jwtVerify,
  };
});

import { verifySessionToken } from "./session";

describe("verifySessionToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-secret";
  });

  test("returns a normalized session payload for valid claims", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        userId: "user_123",
        email: "stan@example.com",
      },
    });

    await expect(verifySessionToken("token")).resolves.toEqual({
      userId: "user_123",
      email: "stan@example.com",
    });
  });

  test("returns null when the token payload has a non-string user id", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        userId: { nested: "bad" },
        email: "stan@example.com",
      },
    });

    await expect(verifySessionToken("token")).resolves.toBeNull();
  });
});
