import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";

export interface CreateMemoryArgs {
  runId?: string;
  threadId?: string;
  userId?: string | null;
}

export interface UpdateMemoryArgs {
  runId?: string;
  threadId?: string;
  topicSummary?: string | null;
  activeConstraints?: string[];
  concreteAnswerCount?: number;
  lastDraftArtifactId?: string | null;
}

export async function getConversationMemory({ runId, threadId }: { runId?: string, threadId?: string }) {
  if (!runId && !threadId) return null;
  try {
    const memory = await prisma.conversationMemory.findFirst({
      where: threadId ? { threadId } : { runId },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to fetch memory for thread ${threadId} / run ${runId}:`, error);
    return null;
  }
}

export async function createConversationMemory(args: CreateMemoryArgs) {
  try {
    const memory = await prisma.conversationMemory.create({
      data: {
        runId: args.runId,
        threadId: args.threadId,
        userId: args.userId,
        activeConstraints: [] as unknown as Prisma.InputJsonValue,
        concreteAnswerCount: 0,
      },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to create memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}

export async function updateConversationMemory(args: UpdateMemoryArgs) {
  if (!args.runId && !args.threadId) return null;
  try {
    const existing = await prisma.conversationMemory.findFirst({
      where: args.threadId ? { threadId: args.threadId } : { runId: args.runId },
    });

    if (!existing) {
      console.warn(`Attempted to update non-existent memory for thread ${args.threadId} / run ${args.runId}`);
      return null;
    }

    const dataToUpdate: Prisma.ConversationMemoryUpdateInput = {};
    if (args.topicSummary !== undefined) dataToUpdate.topicSummary = args.topicSummary;
    if (args.activeConstraints !== undefined) dataToUpdate.activeConstraints = args.activeConstraints as unknown as Prisma.InputJsonValue;
    if (args.concreteAnswerCount !== undefined) dataToUpdate.concreteAnswerCount = args.concreteAnswerCount;
    if (args.lastDraftArtifactId !== undefined) dataToUpdate.lastDraftArtifactId = args.lastDraftArtifactId;

    const memory = await prisma.conversationMemory.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });
    return memory;
  } catch (error) {
    console.error(`Failed to update memory for thread ${args.threadId} / run ${args.runId}:`, error);
    return null;
  }
}

