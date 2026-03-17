import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET, POST } from "./route";
import { getServerSession } from "@/lib/auth/serverSession";
import {
  createFolderForUser,
  listFoldersForUser,
  serializeFolder,
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
  createFolderForUser: vi.fn(),
  listFoldersForUser: vi.fn(),
  serializeFolder: vi.fn((folder) => folder),
}));

vi.mock("@/lib/security/requestValidation", () => ({
  enforceSessionMutationRateLimit: vi.fn(async () => null),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(() => null),
}));

describe("creator/v2/folders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("GET includes folder itemCount in the serialized response", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(listFoldersForUser).mockResolvedValue([
      {
        id: "folder_1",
        userId: "user_1",
        name: "Launch",
        color: null,
        createdAt: new Date("2026-03-17T10:00:00.000Z"),
        itemCount: 3,
      },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(serializeFolder).toHaveBeenCalled();
    expect(payload).toEqual({
      ok: true,
      data: {
        folders: [
          expect.objectContaining({
            id: "folder_1",
            name: "Launch",
            itemCount: 3,
          }),
        ],
      },
    });
  });

  test("POST returns a friendly duplicate group validation error", async () => {
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
    vi.mocked(createFolderForUser).mockRejectedValue({
      code: "P2002",
    });

    const request = new Request("https://example.com/api/creator/v2/folders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
      },
      body: JSON.stringify({ name: "Launch" }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "name", message: "A group with this name already exists." }],
    });
  });
});
