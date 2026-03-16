import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { V2ConversationMemory } from "@/lib/agent-v2/contracts/chat";
import {
  buildConversationMemoryResetInput,
  buildConversationMemoryUpdateInputFromSnapshot,
  createConversationMemorySnapshot,
} from "@/lib/agent-v2/memory/memoryStore";
import {
  resolveOwnedThreadForWorkspace,
  resolveWorkspaceHandleForRequest,
} from "@/lib/workspaceHandle.server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

interface DraftMessagePatchRequest extends Record<string, unknown> {
  draftVersions?: unknown;
  activeDraftVersionId?: unknown;
  draft?: unknown;
  drafts?: unknown;
  draftArtifacts?: unknown;
  draftBundle?: unknown;
  revisionChainId?: unknown;
}

const DEFAULT_THREAD_TITLE = "New Chat";

function parseStoredAssistantMemory(value: unknown): V2ConversationMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { memory?: unknown };
  if (!record.memory || typeof record.memory !== "object" || Array.isArray(record.memory)) {
    return null;
  }

  return createConversationMemorySnapshot(record.memory as Record<string, unknown>);
}

function parseStoredThreadTitle(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { threadTitle?: unknown };
  return typeof record.threadTitle === "string" && record.threadTitle.trim()
    ? record.threadTitle.trim()
    : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
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

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_thread_message",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many message updates. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many message updates from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }
  const bodyResult = await parseJsonBody<DraftMessagePatchRequest>(request, {
    maxBytes: 128 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const activeDraftVersionId =
    typeof body.activeDraftVersionId === "string" ? body.activeDraftVersionId.trim() : "";
  const draft = typeof body.draft === "string" ? body.draft : "";
  const draftVersions = Array.isArray(body.draftVersions) ? body.draftVersions : null;
  const drafts = Array.isArray(body.drafts) ? body.drafts : null;
  const draftArtifacts = Array.isArray(body.draftArtifacts) ? body.draftArtifacts : null;
  const draftBundle =
    body.draftBundle && typeof body.draftBundle === "object" && !Array.isArray(body.draftBundle)
      ? body.draftBundle
      : null;
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
    const workspaceHandle = await resolveWorkspaceHandleForRequest({
      request,
      session,
    });
    if (!workspaceHandle.ok) {
      return workspaceHandle.response;
    }

    const { threadId, messageId } = await params;

    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
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
      ...(draftBundle ? { draftBundle: draftBundle as Prisma.JsonObject } : {}),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
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

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:v2_thread_message_delete",
    user: {
      limit: 20,
      windowMs: 5 * 60 * 1000,
      message: "Too many message deletions. Please wait before trying again.",
    },
    ip: {
      limit: 50,
      windowMs: 5 * 60 * 1000,
      message: "Too many message deletions from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
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

    const ownedThread = await resolveOwnedThreadForWorkspace({
      threadId,
      userId: session.user.id,
      xHandle: workspaceHandle.xHandle,
    });
    if (!ownedThread.ok) {
      return ownedThread.response;
    }

    const result = await prisma.$transaction(async (tx) => {
      const threadMessages = await tx.chatMessage.findMany({
        where: { threadId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          role: true,
          data: true,
        },
      });

      const rewindIndex = threadMessages.findIndex((message) => message.id === messageId);
      if (rewindIndex === -1) {
        return {
          kind: "not_found" as const,
        };
      }

      const deletedMessages = threadMessages.slice(rewindIndex);
      const survivingMessages = threadMessages.slice(0, rewindIndex);
      const deletedMessageIds = deletedMessages.map((message) => message.id);
      const latestSurvivingAssistant = [...survivingMessages]
        .reverse()
        .find((message) => message.role === "assistant");
      const restoredMemory = latestSurvivingAssistant
        ? parseStoredAssistantMemory(latestSurvivingAssistant.data)
        : null;
      const restoredTitle =
        (latestSurvivingAssistant
          ? parseStoredThreadTitle(latestSurvivingAssistant.data)
          : null) ?? DEFAULT_THREAD_TITLE;

      await tx.chatMessage.deleteMany({
        where: {
          id: {
            in: deletedMessageIds,
          },
        },
      });

      const existingMemory = await tx.conversationMemory.findFirst({
        where: { threadId },
        select: { id: true },
      });

      const memoryUpdate = restoredMemory
        ? buildConversationMemoryUpdateInputFromSnapshot(restoredMemory)
        : buildConversationMemoryResetInput();

      if (existingMemory) {
        await tx.conversationMemory.update({
          where: { id: existingMemory.id },
          data: memoryUpdate,
        });
      } else {
        await tx.conversationMemory.create({
          data: {
            userId: session.user.id,
            threadId,
            topicSummary:
              typeof memoryUpdate.topicSummary === "string" ||
              memoryUpdate.topicSummary === null
                ? memoryUpdate.topicSummary
                : null,
            activeConstraints:
              (memoryUpdate.activeConstraints as Prisma.InputJsonValue | undefined) ??
              Prisma.JsonNull,
            concreteAnswerCount:
              typeof memoryUpdate.concreteAnswerCount === "number"
                ? memoryUpdate.concreteAnswerCount
                : 0,
            lastDraftArtifactId:
              typeof memoryUpdate.lastDraftArtifactId === "string" ||
              memoryUpdate.lastDraftArtifactId === null
                ? memoryUpdate.lastDraftArtifactId
                : null,
          },
        });
      }

      await tx.chatThread.update({
        where: { id: threadId },
        data: {
          title: restoredTitle,
          updatedAt: new Date(),
        },
      });

      return {
        kind: "ok" as const,
        deletedMessageIds,
        restoredTitle,
        restoredMemoryMode: restoredMemory ? "restored" : "reset",
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { ok: false, errors: [{ field: "messageId", message: "Message not found." }] },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        deletedMessageIds: result.deletedMessageIds,
        deletedCount: result.deletedMessageIds.length,
        restoredThreadTitle: result.restoredTitle,
        restoredMemoryMode: result.restoredMemoryMode,
      },
    });
  } catch (error) {
    console.error("DELETE thread message rewind error:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to rewind the thread." }] },
      { status: 500 },
    );
  }
}
