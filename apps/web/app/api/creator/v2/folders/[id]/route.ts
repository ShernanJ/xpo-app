import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  deleteFolderForUser,
  findFolderForUser,
  renameFolderForUser,
  serializeFolder,
} from "@/lib/content/contentHub";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface FolderPatchRequest extends Record<string, unknown> {
  name?: unknown;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireOwnedFolder(args: {
  userId: string;
  folderId: string;
}) {
  return findFolderForUser({
    userId: args.userId,
    folderId: args.folderId,
  });
}

async function enforceFolderMutationGuards(request: NextRequest, userId: string) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  return enforceSessionMutationRateLimit(request, {
    userId,
    scope: "creator:v2_folders",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many group changes. Please wait before trying again.",
    },
    ip: {
      limit: 40,
      windowMs: 5 * 60 * 1000,
      message: "Too many group changes from this network. Please wait before trying again.",
    },
  });
}

export async function PATCH(
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

  const guardError = await enforceFolderMutationGuards(request, session.user.id);
  if (guardError) {
    return guardError;
  }

  const bodyResult = await parseJsonBody<FolderPatchRequest>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const name = typeof bodyResult.value.name === "string" ? bodyResult.value.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "name", message: "Group name is required." }] },
      { status: 400 },
    );
  }

  const { id } = await params;
  const existingFolder = await requireOwnedFolder({
    userId: session.user.id,
    folderId: id,
  });
  if (!existingFolder) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "id", message: "Group not found." }] },
      { status: 404 },
    );
  }

  try {
    const folder = await renameFolderForUser({
      folderId: existingFolder.id,
      name,
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

export async function DELETE(
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

  const guardError = await enforceFolderMutationGuards(request, session.user.id);
  if (guardError) {
    return guardError;
  }

  const { id } = await params;
  const deletedFolder = await deleteFolderForUser({
    userId: session.user.id,
    folderId: id,
  });
  if (!deletedFolder) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "id", message: "Group not found." }] },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      folder: deletedFolder,
    },
  });
}
