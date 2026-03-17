import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  listContentItemsForWorkspace,
  serializeContentItem,
} from "@/lib/content/contentHub";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

const VALID_CONTENT_STATUSES = new Set(["DRAFT", "PUBLISHED", "ARCHIVED", "ALL"]);

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
  if (!VALID_CONTENT_STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "status", message: "Invalid content status filter." }] },
      { status: 400 },
    );
  }

  const items = await listContentItemsForWorkspace({
    userId: session.user.id,
    xHandle: workspaceHandle.xHandle,
    status: status === "ALL" ? null : status,
    sortBy: "createdAt",
  });

  return NextResponse.json({
    ok: true,
    data: {
      items: items.map(serializeContentItem),
    },
  });
}
