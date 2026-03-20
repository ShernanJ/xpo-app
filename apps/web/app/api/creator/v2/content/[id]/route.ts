import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  type ContentHubContentType,
  findContentItemForWorkspace,
  findFolderForUser,
  serializeContentItem,
  updateContentItemById,
} from "@/lib/content/contentHub";
import { Prisma, type PostStatus } from "@/lib/generated/prisma/client";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

interface ContentPatchRequest extends Record<string, unknown> {
  status?: unknown;
  folderId?: unknown;
}

const VALID_CONTENT_STATUSES = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const VALID_CONTENT_TYPES = new Set<ContentHubContentType>([
  "posts_threads",
  "replies",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const contentType =
    (request.nextUrl.searchParams.get("contentType")?.trim().toLowerCase() as
      | ContentHubContentType
      | null) || "posts_threads";
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "contentType", message: "Invalid content type filter." }],
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  const item = await findContentItemForWorkspace({
    id,
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    contentType,
  });
  if (!item) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "id", message: "Content item not found." }] },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      item: serializeContentItem(item),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_content_item",
    user: {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      message: "Too many content updates. Please wait before trying again.",
    },
    ip: {
      limit: 60,
      windowMs: 5 * 60 * 1000,
      message: "Too many content updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<ContentPatchRequest>(request, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const contentType =
    (request.nextUrl.searchParams.get("contentType")?.trim().toLowerCase() as
      | ContentHubContentType
      | null) || "posts_threads";
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "contentType", message: "Invalid content type filter." }],
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  const item = await findContentItemForWorkspace({
    id,
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    contentType,
  });
  if (!item) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "id", message: "Content item not found." }] },
      { status: 404 },
    );
  }

  const body = bodyResult.value;
  const nextStatus =
    typeof body.status === "string"
      ? (body.status.trim().toUpperCase() as PostStatus)
      : undefined;
  if (nextStatus !== undefined && !VALID_CONTENT_STATUSES.has(nextStatus)) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "status", message: "Invalid content status." }] },
      { status: 400 },
    );
  }

  let folderId: string | null | undefined;
  if (body.folderId !== undefined) {
    folderId =
      typeof body.folderId === "string" && body.folderId.trim()
        ? body.folderId.trim()
        : null;
    if (folderId) {
      const folder = await findFolderForUser({
        userId: session.user.id,
        folderId,
      });
      if (!folder) {
        return NextResponse.json(
          { ok: false, errors: [{ field: "folderId", message: "Folder not found." }] },
          { status: 404 },
        );
      }
    }
  }

  if (nextStatus === undefined && folderId === undefined) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "No content changes were provided." }] },
      { status: 400 },
    );
  }

  const now = new Date();
  const updated = await updateContentItemById({
    id: item.id,
    data: {
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
      ...(nextStatus === "PUBLISHED"
        ? {
            postedAt: item.postedAt ? undefined : now,
            ...(item.reviewStatus === "posted" || item.reviewStatus === "observed"
              ? {}
              : { reviewStatus: "posted" }),
          }
        : {}),
      ...(nextStatus === "DRAFT"
        ? {
            publishedTweetId: null,
            postedAt: null,
            observedAt: null,
            observedMetrics: Prisma.JsonNull,
            reviewStatus: "pending",
          }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      item: serializeContentItem(updated),
    },
  });
}
