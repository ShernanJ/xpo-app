import { prisma } from "../../db";
import { Prisma } from "../../generated/prisma/client";

export interface CreateMemoryArgs {
  runId: string;
  userId?: string | null;
}

export interface UpdateMemoryArgs {
  runId: string;
  topicSummary?: string | null;
  activeConstraints?: string[];
  concreteAnswerCount?: number;
  lastDraftArtifactId?: string | null;
}

export async function getConversationMemory(runId: string) {
  try {
    const memory = await prisma.conversationMemory.findFirst({
      where: { runId },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to fetch memory for runId ${runId}:`, error);
    return null;
  }
}

export async function createConversationMemory(args: CreateMemoryArgs) {
  try {
    const memory = await prisma.conversationMemory.create({
      data: {
        runId: args.runId,
        userId: args.userId,
        activeConstraints: [] as unknown as Prisma.InputJsonValue,
        concreteAnswerCount: 0,
      },
    });
    return memory;
  } catch (error) {
    console.error(`Failed to create memory for runId ${args.runId}:`, error);
    return null;
  }
}

export async function updateConversationMemory(args: UpdateMemoryArgs) {
  try {
    // Find first since runId isn't marked @unique in the prisma schema
    const existing = await prisma.conversationMemory.findFirst({
      where: { runId: args.runId },
    });

    if (!existing) {
      console.warn(`Attempted to update non-existent memory for runId ${args.runId}`);
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
    console.error(`Failed to update memory for runId ${args.runId}:`, error);
    return null;
  }
}
