import { beforeEach, describe, expect, test, vi } from "vitest";

import { DELETE, PATCH } from "./route";
import { getServerSession } from "@/lib/auth/serverSession";
import {
  deleteFolderForUser,
  findFolderForUser,
  renameFolderForUser,
} from "@/lib/content/contentHub";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/content/contentHub", () => ({
  deleteFolderForUser: vi.fn(),
  findFolderForUser: vi.fn(),
  renameFolderForUser: vi.fn(),
  serializeFolder: vi.fn((folder) => folder),
}));

vi.mock("@/lib/security/requestValidation", () => ({
  enforceSessionMutationRateLimit: vi.fn(async () => null),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(() => null),
}));

function buildRequest(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
  return new Request("https://example.com/api/creator/v2/folders/folder_existing", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.com",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

describe("creator/v2/folders/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("PATCH rejects unauthorized requests", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await PATCH(buildRequest("PATCH", { name: "Renamed" }), {
      params: Promise.resolve({ id: "folder_existing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "auth", message: "Unauthorized" }],
    });
  });

  test("PATCH rejects empty group names", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(requireAllowedOrigin).mockReturnValue(null);
    vi.mocked(enforceSessionMutationRateLimit).mockResolvedValue(null);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        name: "   ",
      },
      rawText: '{"name":"   "}',
    });

    const response = await PATCH(buildRequest("PATCH", { name: "   " }), {
      params: Promise.resolve({ id: "folder_existing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "name", message: "Group name is required." }],
    });
  });

  test("PATCH rejects unknown groups", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(requireAllowedOrigin).mockReturnValue(null);
    vi.mocked(enforceSessionMutationRateLimit).mockResolvedValue(null);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        name: "Renamed",
      },
      rawText: '{"name":"Renamed"}',
    });
    vi.mocked(findFolderForUser).mockResolvedValue(null);

    const response = await PATCH(buildRequest("PATCH", { name: "Renamed" }), {
      params: Promise.resolve({ id: "folder_missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "id", message: "Group not found." }],
    });
  });

  test("PATCH rejects duplicate group names", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(requireAllowedOrigin).mockReturnValue(null);
    vi.mocked(enforceSessionMutationRateLimit).mockResolvedValue(null);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        name: "Launch",
      },
      rawText: '{"name":"Launch"}',
    });
    vi.mocked(findFolderForUser).mockResolvedValue({
      id: "folder_existing",
      userId: "user_1",
      name: "Original",
      color: null,
      createdAt: new Date("2026-03-17T10:00:00.000Z"),
      itemCount: 2,
    });
    vi.mocked(renameFolderForUser).mockRejectedValue({
      code: "P2002",
    });

    const response = await PATCH(buildRequest("PATCH", { name: "Launch" }), {
      params: Promise.resolve({ id: "folder_existing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "name", message: "A group with this name already exists." }],
    });
  });

  test("DELETE returns the deleted group payload for the authenticated owner", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(requireAllowedOrigin).mockReturnValue(null);
    vi.mocked(enforceSessionMutationRateLimit).mockResolvedValue(null);
    vi.mocked(deleteFolderForUser).mockResolvedValue({
      id: "folder_existing",
      name: "Launch",
      itemCount: 4,
    });

    const response = await DELETE(buildRequest("DELETE"), {
      params: Promise.resolve({ id: "folder_existing" }),
    });
    const payload = await response.json();

    expect(deleteFolderForUser).toHaveBeenCalledWith({
      userId: "user_1",
      folderId: "folder_existing",
    });
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        folder: {
          id: "folder_existing",
          name: "Launch",
          itemCount: 4,
        },
      },
    });
  });
});
