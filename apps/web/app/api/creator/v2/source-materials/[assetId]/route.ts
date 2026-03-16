import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getServerSession } from "@/lib/auth/serverSession";
import { prisma } from "@/lib/db";
import { isMissingSourceMaterialAssetTableError } from "@/lib/agent-v2/persistence/prismaGuards";
import {
  serializeSourceMaterialAsset,
} from "@/lib/agent-v2/grounding/sourceMaterials";
import {
  getActiveHandle,
  parsePatchSourceMaterialBody,
} from "../route.logic";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
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

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_source_material_asset",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many source material updates. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many source material updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<{ asset?: unknown }>(request, {
    maxBytes: 64 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const parsed = parsePatchSourceMaterialBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "asset", message: "Invalid source material patch payload." }] },
      { status: 400 },
    );
  }

  const { assetId } = await params;
  let existing;
  try {
    existing = await prisma.sourceMaterialAsset.findUnique({
      where: { id: assetId },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "assetId", message: "Source material storage is not available yet." }] },
        { status: 503 },
      );
    }

    throw error;
  }

  if (!existing || existing.userId !== session.user.id || existing.xHandle !== workspaceHandle.xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "assetId", message: "Source material not found." }] },
      { status: 404 },
    );
  }

  const patch = parsed.asset;
  let updated;
  try {
    updated = await prisma.sourceMaterialAsset.update({
      where: { id: assetId },
      data: {
        ...(patch.type ? { type: patch.type } : {}),
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.tags ? { tags: patch.tags as unknown as Prisma.InputJsonValue } : {}),
        ...(typeof patch.verified === "boolean" ? { verified: patch.verified } : {}),
        ...(patch.claims ? { claims: patch.claims as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.snippets ? { snippets: patch.snippets as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.doNotClaim
          ? { doNotClaim: patch.doNotClaim as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "assetId", message: "Source material storage is not available yet." }] },
        { status: 503 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    ok: true,
    data: {
      asset: serializeSourceMaterialAsset(updated),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
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

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_source_material_asset_delete",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many source material deletions. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many source material deletions from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const { assetId } = await params;
  let existing;
  try {
    existing = await prisma.sourceMaterialAsset.findUnique({
      where: { id: assetId },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "assetId", message: "Source material storage is not available yet." }] },
        { status: 503 },
      );
    }

    throw error;
  }

  if (!existing || existing.userId !== session.user.id || existing.xHandle !== workspaceHandle.xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "assetId", message: "Source material not found." }] },
      { status: 404 },
    );
  }

  try {
    await prisma.sourceMaterialAsset.delete({
      where: { id: assetId },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "assetId", message: "Source material storage is not available yet." }] },
        { status: 503 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    ok: true,
    data: {
      deletedId: assetId,
    },
  });
}
