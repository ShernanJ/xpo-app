import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import { updateIndexedContentTitlesForThread } from "@/lib/content/contentHub";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import { findActiveTurnForThread } from "../../chat/_lib/control/routeTurnControl";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

function buildActiveTurnPayload(
  turn:
    | {
        id: string;
        threadId: string | null;
        status: string;
        progressStepId: string | null;
        progressLabel: string | null;
        progressExplanation: string | null;
        assistantMessageId: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    | null,
) {
  if (!turn) {
    return null;
  }

  return {
    turnId: turn.id,
    threadId: turn.threadId,
    status: turn.status,
    progressStepId: turn.progressStepId,
    progressLabel: turn.progressLabel,
    progressExplanation: turn.progressExplanation,
    assistantMessageId: turn.assistantMessageId,
    errorCode: turn.errorCode,
    errorMessage: turn.errorMessage,
    createdAt: turn.createdAt.toISOString(),
    updatedAt: turn.updatedAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId } = await params;
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }
    const messages = await prisma.chatMessage.findMany({
      where: { threadId: threadId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        data: true,
        createdAt: true,
      },
    });

    const feedbackByMessageId = new Map<string, "up" | "down">();
    if (messages.length > 0) {
      try {
        const feedbackRows = await prisma.chatMessageFeedback.findMany({
          where: {
            userId: session.user.id,
            messageId: {
              in: messages.map((message) => message.id),
            },
          },
          select: {
            messageId: true,
            value: true,
          },
        });
        for (const row of feedbackRows) {
          if (row.value === "up" || row.value === "down") {
            feedbackByMessageId.set(row.messageId, row.value);
          }
        }
      } catch (feedbackError) {
        // Keep thread history available even if feedback table isn't migrated yet.
        console.warn("GET thread feedback lookup skipped:", feedbackError);
      }
    }

    const responseMessages = messages.map((message) => ({
      ...message,
      feedbackValue: feedbackByMessageId.get(message.id) ?? null,
    }));
    const activeTurn = await findActiveTurnForThread({
      userId: session.user.id,
      threadId,
    });

    return NextResponse.json({
      ok: true,
      data: {
        messages: responseMessages,
        activeTurn: buildActiveTurnPayload(activeTurn),
      },
    });
  } catch (error) {
    console.error("GET thread history error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to fetch thread history." }] }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit({
    key: `creator:v2_thread_patch:user:${session.user.id}:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many thread updates. Please wait a moment before trying again.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId } = await params;
    const bodyResult = await parseJsonBody<{ title?: string }>(request, {
      maxBytes: 8 * 1024,
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const body = bodyResult.value;
    const title = typeof body.title === "string" ? body.title.trim() : null;

    if (!title) {
      return NextResponse.json({ ok: false, errors: [{ field: "title", message: "Title must be a valid string." }] }, { status: 400 });
    }

    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }

    const updatedThread = await prisma.chatThread.update({
      where: { id: threadId },
      data: { title },
    });

    await updateIndexedContentTitlesForThread({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
      title,
    });

    return NextResponse.json({ ok: true, data: { thread: updatedThread } });
  } catch (error) {
    console.error("PATCH thread title error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to update thread." }] }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit({
    key: `creator:v2_thread_delete:user:${session.user.id}:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many thread deletes. Please wait a moment before trying again.",
      extras: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId } = await params;
    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }

    await prisma.chatThread.delete({
      where: { id: threadId },
    });

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("DELETE thread error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to delete thread." }] }, { status: 500 });
  }
}
