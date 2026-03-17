import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  const { assetId } = await params;
  const variant = request.nextUrl.searchParams.get("variant");
  const asset = await prisma.chatMediaAsset.findFirst({
    where: {
      id: assetId,
      userId: session.user.id,
    },
    select: {
      bytes: true,
      mimeType: true,
      previewBytes: true,
      previewMimeType: true,
    },
  });

  if (!asset) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "assetId", message: "Image not found." }] },
      { status: 404 },
    );
  }

  const bytes =
    variant === "preview" && asset.previewBytes
      ? asset.previewBytes
      : asset.bytes;
  const mimeType =
    variant === "preview" && asset.previewBytes
      ? asset.previewMimeType || asset.mimeType
      : asset.mimeType;

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
