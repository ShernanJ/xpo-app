import { NextRequest, NextResponse } from "next/server";

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

interface FolderCreateRequest extends Record<string, unknown> {
  name?: unknown;
  color?: unknown;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "P2002"
  );
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const folders = await listFoldersForUser(session.user.id);
  return NextResponse.json({
    ok: true,
    data: {
      folders: folders.map(serializeFolder),
    },
  });
}

export async function POST(request: NextRequest) {
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
    scope: "creator:v2_folders",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many folder changes. Please wait before trying again.",
    },
    ip: {
      limit: 40,
      windowMs: 5 * 60 * 1000,
      message: "Too many folder changes from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<FolderCreateRequest>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const body = bodyResult.value;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : null;
  if (!name) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "name", message: "Group name is required." }] },
      { status: 400 },
    );
  }

  try {
    const folder = await createFolderForUser({
      userId: session.user.id,
      name,
      color,
    });

    return NextResponse.json({
      ok: true,
      data: {
        folder: serializeFolder(folder),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          ok: false,
          errors: [{ field: "name", message: "A group with this name already exists." }],
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
