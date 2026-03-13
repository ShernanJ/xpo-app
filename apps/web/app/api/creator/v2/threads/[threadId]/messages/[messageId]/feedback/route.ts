import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { prisma } from "@/lib/db";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";

interface MessageFeedbackRequest extends Record<string, unknown> {
  value?: unknown;
}

type MessageFeedbackValue = "up" | "down";

interface MessageFeedbackRecord {
  id: string;
  userId: string;
  threadId: string;
  messageId: string;
  value: MessageFeedbackValue;
  createdAt: Date;
  updatedAt: Date;
}

async function resolveOwnedAssistantMessage(args: {
  threadId: string;
  messageId: string;
  userId: string;
  xHandle: string;
}): Promise<
  | { ok: true; threadId: string; messageId: string }
  | { ok: false; response: NextResponse }
> {
  const ownedThread = await resolveOwnedThreadForWorkspace({
    threadId: args.threadId,
    userId: args.userId,
    xHandle: args.xHandle,
  });
  if (!ownedThread.ok) {
    return ownedThread;
  }
  const thread = ownedThread.thread;

  const message = await prisma.chatMessage.findUnique({
    where: { id: args.messageId },
    select: { id: true, threadId: true, role: true },
  });

  if (!message || message.threadId !== args.threadId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, errors: [{ field: "messageId", message: "Message not found." }] },
        { status: 404 },
      ),
    };
  }

  if (message.role !== "assistant") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          errors: [{ field: "messageId", message: "Feedback can only be attached to assistant messages." }],
        },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    threadId: thread.id,
    messageId: message.id,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  let body: MessageFeedbackRequest;

  try {
    body = (await request.json()) as MessageFeedbackRequest;
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "body", message: "Request body must be valid JSON." }] },
      { status: 400 },
    );
  }

  const value = body.value === "up" || body.value === "down" ? body.value : null;
  if (!value) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "value", message: "Feedback value must be either 'up' or 'down'." }] },
      { status: 400 },
    );
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId, messageId } = await params;
    const ownership = await resolveOwnedAssistantMessage({
      threadId,
      messageId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    const feedbackDelegate = (
      prisma as unknown as {
        chatMessageFeedback?: {
          upsert: (args: unknown) => Promise<MessageFeedbackRecord>;
        };
      }
    ).chatMessageFeedback;

    let feedback: MessageFeedbackRecord;
    if (feedbackDelegate?.upsert) {
      feedback = await feedbackDelegate.upsert({
        where: {
          userId_messageId: {
            userId: session.user.id,
            messageId: ownership.messageId,
          },
        },
        update: {
          value,
          threadId: ownership.threadId,
        },
        create: {
          userId: session.user.id,
          threadId: ownership.threadId,
          messageId: ownership.messageId,
          value,
        },
        select: {
          id: true,
          userId: true,
          threadId: true,
          messageId: true,
          value: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else {
      const fallbackId = `cfb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const rows = await prisma.$queryRaw<MessageFeedbackRecord[]>`
        INSERT INTO "ChatMessageFeedback" (
          "id",
          "userId",
          "threadId",
          "messageId",
          "value",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${fallbackId},
          ${session.user.id},
          ${ownership.threadId},
          ${ownership.messageId},
          CAST(${value} AS "ChatMessageFeedbackValue"),
          NOW(),
          NOW()
        )
        ON CONFLICT ("userId", "messageId")
        DO UPDATE SET
          "value" = EXCLUDED."value",
          "threadId" = EXCLUDED."threadId",
          "updatedAt" = NOW()
        RETURNING
          "id",
          "userId",
          "threadId",
          "messageId",
          "value",
          "createdAt",
          "updatedAt"
      `;
      const firstRow = rows[0];
      if (!firstRow) {
        throw new Error("feedback upsert returned no rows");
      }
      feedback = firstRow;
    }

    return NextResponse.json({
      ok: true,
      data: { feedback },
    });
  } catch (error) {
    console.error("POST message feedback error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to save message feedback." }] },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized" }] },
      { status: 401 },
    );
  }

  try {
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request: _request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId, messageId } = await params;
    const ownership = await resolveOwnedAssistantMessage({
      threadId,
      messageId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    const feedbackDelegate = (
      prisma as unknown as {
        chatMessageFeedback?: {
          deleteMany: (args: unknown) => Promise<unknown>;
        };
      }
    ).chatMessageFeedback;

    if (feedbackDelegate?.deleteMany) {
      await feedbackDelegate.deleteMany({
        where: {
          userId: session.user.id,
          threadId: ownership.threadId,
          messageId: ownership.messageId,
        },
      });
    } else {
      await prisma.$executeRaw`
        DELETE FROM "ChatMessageFeedback"
        WHERE "userId" = ${session.user.id}
          AND "threadId" = ${ownership.threadId}
          AND "messageId" = ${ownership.messageId}
      `;
    }

    return NextResponse.json({
      ok: true,
      data: {
        messageId: ownership.messageId,
        cleared: true,
      },
    });
  } catch (error) {
    console.error("DELETE message feedback error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to clear message feedback." }] },
      { status: 500 },
    );
  }
}
