import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  type ContentHubContentType,
  listContentItemSummariesForWorkspace,
  serializeContentItemSummary,
} from "@/lib/content/contentHub";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

const VALID_CONTENT_STATUSES = new Set(["DRAFT", "PUBLISHED", "ARCHIVED", "ALL"]);
const VALID_CONTENT_TYPES = new Set<ContentHubContentType>([
  "posts_threads",
  "replies",
]);
const DEFAULT_CONTENT_PAGE_SIZE = 24;
const MAX_CONTENT_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim().toUpperCase() || "ALL";
  const contentType =
    (searchParams.get("contentType")?.trim().toLowerCase() as ContentHubContentType | null) ||
    "posts_threads";
  const cursor = searchParams.get("cursor")?.trim() || null;
  const requestedTake = Number.parseInt(searchParams.get("take")?.trim() || "", 10);
  const take =
    Number.isFinite(requestedTake) && requestedTake > 0
      ? Math.min(requestedTake, MAX_CONTENT_PAGE_SIZE)
      : DEFAULT_CONTENT_PAGE_SIZE;
  if (!VALID_CONTENT_STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "status", message: "Invalid content status filter." }] },
      { status: 400 },
    );
  }
  if (!VALID_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "contentType", message: "Invalid content type filter." }],
      },
      { status: 400 },
    );
  }

  const page = await listContentItemSummariesForWorkspace({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    status: status === "ALL" ? null : status,
    contentType,
    cursor,
    take,
    sortBy: "createdAt",
  });

  return NextResponse.json({
    ok: true,
    data: {
      items: page.items.map(serializeContentItemSummary),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    },
  });
}
