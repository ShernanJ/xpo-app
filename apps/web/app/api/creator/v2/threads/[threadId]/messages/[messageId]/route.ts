import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { authOptions } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db";

interface DraftMessagePatchRequest extends Record<string, unknown> {
  draftVersions?: unknown;
  activeDraftVersionId?: unknown;
  draft?: unknown;
  drafts?: unknown;
  draftArtifacts?: unknown;
  revisionChainId?: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: DraftMessagePatchRequest;

  try {
    body = (await request.json()) as DraftMessagePatchRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const activeDraftVersionId =
    typeof body.activeDraftVersionId === "string" ? body.activeDraftVersionId.trim() : "";
  const draft = typeof body.draft === "string" ? body.draft : "";
  const draftVersions = Array.isArray(body.draftVersions) ? body.draftVersions : null;
  const drafts = Array.isArray(body.drafts) ? body.drafts : null;
  const draftArtifacts = Array.isArray(body.draftArtifacts) ? body.draftArtifacts : null;
  const revisionChainId =
    typeof body.revisionChainId === "string" ? body.revisionChainId.trim() : "";

  if (!activeDraftVersionId || !draft || !draftVersions || !drafts || !draftArtifacts) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "payload", message: "Draft version payload is incomplete." }],
      },
      { status: 400 },
    );
  }

  try {
    const { threadId, messageId } = await params;

    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized." }] },
        { status: 404 },
      );
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.threadId !== threadId) {
      return NextResponse.json(
        { ok: false, errors: [{ field: "messageId", message: "Message not found." }] },
        { status: 404 },
      );
    }

    const existingData =
      message.data && typeof message.data === "object" && !Array.isArray(message.data)
        ? (message.data as Prisma.JsonObject)
        : {};

    const nextData = {
      ...existingData,
      draftVersions: draftVersions as unknown as Prisma.JsonValue,
      activeDraftVersionId,
      draft,
      drafts: drafts as unknown as Prisma.JsonValue,
      draftArtifacts: draftArtifacts as unknown as Prisma.JsonValue,
      ...(revisionChainId ? { revisionChainId } : {}),
    } as Prisma.InputJsonValue;

    const updatedMessage = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        data: nextData,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        message: updatedMessage,
      },
    });
  } catch (error) {
    console.error("PATCH thread message error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to update message." }] },
      { status: 500 },
    );
  }
}
