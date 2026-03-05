import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json({ ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized" }] }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { threadId: threadId },
      orderBy: { createdAt: "asc" },
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

    return NextResponse.json({ ok: true, data: { thread, messages: responseMessages } });
  } catch (error) {
    console.error("GET thread history error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to fetch thread history." }] }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : null;

    if (!title) {
      return NextResponse.json({ ok: false, errors: [{ field: "title", message: "Title must be a valid string." }] }, { status: 400 });
    }

    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json({ ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized" }] }, { status: 404 });
    }

    const updatedThread = await prisma.chatThread.update({
      where: { id: threadId },
      data: { title },
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
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json({ ok: false, errors: [{ field: "threadId", message: "Thread not found or unauthorized" }] }, { status: 404 });
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
