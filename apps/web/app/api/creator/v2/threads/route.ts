import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const xHandle = searchParams.get("xHandle");

  try {
    const threads = await prisma.chatThread.findMany({
      where: {
        userId: session.user.id,
        ...(xHandle ? { xHandle } : {}) // Filter by specific account context if provided
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      }
    });

    return NextResponse.json({ ok: true, data: { threads } });
  } catch (error) {
    console.error("GET threads error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to fetch threads." }] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  let body: { xHandle?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const thread = await prisma.chatThread.create({
      data: {
        userId: session.user.id,
        xHandle: body.xHandle || null,
        title: "New Chat",
      }
    });

    // Automatically create a Memory object linked to this thread so the agent can store state
    await prisma.conversationMemory.create({
      data: {
        threadId: thread.id,
        userId: session.user.id,
        activeConstraints: [],
      }
    });

    return NextResponse.json({ ok: true, data: { thread } });
  } catch (error) {
    console.error("POST threads error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to create thread." }] }, { status: 500 });
  }
}
