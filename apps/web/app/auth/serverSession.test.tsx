import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  prismaUserFindUnique: vi.fn(),
  prismaUserCreate: vi.fn(),
  prismaUserUpdate: vi.fn(),
  verifySessionToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookiesGet,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.prismaUserFindUnique,
      create: mocks.prismaUserCreate,
      update: mocks.prismaUserUpdate,
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "sx_session",
  verifySessionToken: mocks.verifySessionToken,
}));

import { AuthIdentityConflictError, ensureAppUserForAuthIdentity } from "@/lib/auth/serverSession";

const existingUser = {
  id: "user_existing",
  name: "Stan",
  email: "stan@gmail.com",
  handle: "stan",
  activeXHandle: "stan",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookiesGet.mockReturnValue(undefined);
  mocks.verifySessionToken.mockResolvedValue(null);
});

describe("ensureAppUserForAuthIdentity", () => {
  test("reuses an existing app user when the email already exists under another auth id", async () => {
    mocks.prismaUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser);

    const result = await ensureAppUserForAuthIdentity({
      userId: "google_auth_user",
      email: "Stan@Gmail.com",
    });

    expect(result).toEqual(existingUser);
    expect(mocks.prismaUserCreate).not.toHaveBeenCalled();
    expect(mocks.prismaUserUpdate).not.toHaveBeenCalled();
    expect(mocks.prismaUserFindUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "google_auth_user" },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        activeXHandle: true,
      },
    });
    expect(mocks.prismaUserFindUnique).toHaveBeenNthCalledWith(2, {
      where: { email: "stan@gmail.com" },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        activeXHandle: true,
      },
    });
  });

  test("creates a new app user when the identity is new", async () => {
    mocks.prismaUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.prismaUserCreate.mockResolvedValue({
      ...existingUser,
      id: "google_auth_user",
      email: "stan@gmail.com",
    });

    const result = await ensureAppUserForAuthIdentity({
      userId: "google_auth_user",
      email: "stan@gmail.com",
    });

    expect(result).toEqual({
      ...existingUser,
      id: "google_auth_user",
      email: "stan@gmail.com",
    });
    expect(mocks.prismaUserCreate).toHaveBeenCalledWith({
      data: {
        id: "google_auth_user",
        email: "stan@gmail.com",
      },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        activeXHandle: true,
      },
    });
  });

  test("throws when an existing auth identity is already bound to a different email", async () => {
    mocks.prismaUserFindUnique.mockResolvedValueOnce(existingUser);

    await expect(
      ensureAppUserForAuthIdentity({
        userId: "user_existing",
        email: "kiritoswaggerman@gmail.com",
      }),
    ).rejects.toBeInstanceOf(AuthIdentityConflictError);

    expect(mocks.prismaUserUpdate).not.toHaveBeenCalled();
    expect(mocks.prismaUserCreate).not.toHaveBeenCalled();
  });
});
