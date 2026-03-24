import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "./route";
import { getServerSession } from "@/lib/auth/serverSession";
import { finalizeDraftPublishForWorkspace } from "@/lib/content/publishFinalization";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

vi.mock("@/lib/auth/serverSession", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/content/publishFinalization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/content/publishFinalization")>(
    "@/lib/content/publishFinalization",
  );

  return {
    ...actual,
    finalizeDraftPublishForWorkspace: vi.fn(),
  };
});

vi.mock("@/lib/security/requestValidation", () => ({
  enforceSessionMutationRateLimit: vi.fn(async () => null),
  parseJsonBody: vi.fn(),
  requireAllowedOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/workspaceHandle.server", () => ({
  resolveWorkspaceHandleForRequest: vi.fn(),
}));

function buildRequest(body?: Record<string, unknown>) {
  return new Request("https://example.com/api/drafts/draft_1/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.com",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

describe("api/drafts/[draftId]/publish route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowedOrigin).mockReturnValue(null);
    vi.mocked(enforceSessionMutationRateLimit).mockResolvedValue(null);
    vi.mocked(resolveWorkspaceHandleForRequest).mockResolvedValue({
      ok: true,
      activeHandle: "standev",
      attachedHandles: ["standev"],
      xHandle: "standev",
    });
  });

  test("returns 401 for unauthenticated requests", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(buildRequest({ finalPublishedText: "Published post" }), {
      params: Promise.resolve({ draftId: "draft_1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "auth", message: "Unauthorized" }],
    });
  });

  test("returns 400 for blank finalPublishedText", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        finalPublishedText: "   ",
      },
      rawText: '{"finalPublishedText":"   "}',
    });

    const response = await POST(buildRequest({ finalPublishedText: "   " }), {
      params: Promise.resolve({ draftId: "draft_1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "finalPublishedText", message: "Final published text is required." }],
    });
    expect(finalizeDraftPublishForWorkspace).not.toHaveBeenCalled();
  });

  test("returns 404 when the draft is out of scope for the workspace", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        finalPublishedText: "Published post",
      },
      rawText: '{"finalPublishedText":"Published post"}',
    });
    vi.mocked(finalizeDraftPublishForWorkspace).mockResolvedValue({
      ok: false,
      status: 404,
      field: "id",
      message: "Draft not found.",
    });

    const response = await POST(buildRequest({ finalPublishedText: "Published post" }), {
      params: Promise.resolve({ draftId: "draft_missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "id", message: "Draft not found." }],
    });
  });

  test("returns 409 when the draft is no longer publishable", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        finalPublishedText: "Published post",
      },
      rawText: '{"finalPublishedText":"Published post"}',
    });
    vi.mocked(finalizeDraftPublishForWorkspace).mockResolvedValue({
      ok: false,
      status: 409,
      field: "status",
      message: "Only draft items can be published.",
    });

    const response = await POST(buildRequest({ finalPublishedText: "Published post" }), {
      params: Promise.resolve({ draftId: "draft_1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      ok: false,
      errors: [{ field: "status", message: "Only draft items can be published." }],
    });
  });

  test("returns 200 after a successful publish finalization", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user_1",
        activeXHandle: "standev",
      },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(parseJsonBody).mockResolvedValue({
      ok: true,
      value: {
        finalPublishedText: "Published post",
      },
      rawText: '{"finalPublishedText":"Published post"}',
    });
    vi.mocked(finalizeDraftPublishForWorkspace).mockResolvedValue({
      ok: true,
      draftId: "draft_1",
      isZeroDelta: false,
      publishedAt: new Date("2026-03-23T12:00:00.000Z"),
    });

    const response = await POST(buildRequest({ finalPublishedText: "Published post" }), {
      params: Promise.resolve({ draftId: "draft_1" }),
    });
    const payload = await response.json();

    expect(finalizeDraftPublishForWorkspace).toHaveBeenCalledWith({
      id: "draft_1",
      userId: "user_1",
      xHandle: "standev",
      finalPublishedText: "Published post",
      publishedTweetId: undefined,
    });
    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
  });
});
