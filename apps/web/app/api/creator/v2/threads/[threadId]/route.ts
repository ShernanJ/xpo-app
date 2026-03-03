import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getServerSession(authOptions);
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

    return NextResponse.json({ ok: true, data: { thread, messages } });
  } catch (error) {
    console.error("GET thread history error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to fetch thread history." }] }, { status: 500 });
  }
}
