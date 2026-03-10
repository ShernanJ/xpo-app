import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getServerSession } from "@/lib/auth/serverSession";
import { prisma } from "@/lib/db";
import { isMissingSourceMaterialAssetTableError } from "@/lib/agent-v2/orchestrator/prismaGuards";
import {
  serializeSourceMaterialAsset,
} from "@/lib/agent-v2/orchestrator/sourceMaterials";
import {
  getActiveHandle,
  parseCreateSourceMaterialBody,
} from "./route.logic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const xHandle = getActiveHandle(session);
  if (!xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "xHandle", message: "No active X profile selected." }] },
      { status: 400 },
    );
  }

  try {
    const assets = await prisma.sourceMaterialAsset.findMany({
      where: {
        userId: session.user.id,
        xHandle,
      },
      orderBy: [
        { verified: "desc" },
        { lastUsedAt: "desc" },
        { updatedAt: "desc" },
      ],
    });

    return NextResponse.json({
      ok: true,
      data: {
        assets: assets.map(serializeSourceMaterialAsset),
      },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json({
        ok: true,
        data: { assets: [] },
      });
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const xHandle = getActiveHandle(session);
  if (!xHandle) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "xHandle", message: "No active X profile selected." }] },
      { status: 400 },
    );
  }

  let body: { asset?: unknown };
  try {
    body = (await request.json()) as { asset?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const parsed = parseCreateSourceMaterialBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "asset", message: "Invalid source material payload." }] },
      { status: 400 },
    );
  }

  const asset = parsed.asset;

  let created;
  try {
    created = await prisma.sourceMaterialAsset.create({
      data: {
        userId: session.user.id,
        xHandle,
        type: asset.type,
        title: asset.title,
        tags: asset.tags as unknown as Prisma.InputJsonValue,
        verified: asset.verified,
        claims: asset.claims as unknown as Prisma.InputJsonValue,
        snippets: asset.snippets as unknown as Prisma.InputJsonValue,
        doNotClaim: asset.doNotClaim as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isMissingSourceMaterialAssetTableError(error)) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "asset", message: "Source material storage is not available yet." }] },
        { status: 503 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    ok: true,
    data: {
      asset: serializeSourceMaterialAsset(created),
    },
  });
}
