import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth/serverSession";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import { createConversationMemory } from "@/lib/agent-v2/memory/memoryStore";
import {
  enforceSessionMutationRateLimit,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  try {
    const threads = await prisma.chatThread.findMany({
      where: {
        userId: session.user.id,
        xHandle: workspaceHandle.xHandle,
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
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, errors: [{ field: "auth", message: "Unauthorized" }] }, { status: 401 });
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
    scope: "creator:v2_threads",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many thread creations. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many thread creations from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const thread = await prisma.chatThread.create({
      data: {
        userId: session.user.id,
        xHandle: workspaceHandle.xHandle,
        title: "New Chat",
      }
    });

    await createConversationMemory({
      threadId: thread.id,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true, data: { thread } });
  } catch (error) {
    console.error("POST threads error:", error);
    return NextResponse.json({ ok: false, errors: [{ field: "server", message: "Failed to create thread." }] }, { status: 500 });
  }
}
