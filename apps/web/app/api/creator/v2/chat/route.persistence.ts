import type { V2ChatOutputShape } from "../../../../../lib/agent-v2/contracts/chat.ts";

export interface PersistMemoryUpdateArgs {
  threadId?: string;
  activeDraftRef?: {
    messageId: string;
    versionId: string;
    revisionChainId?: string | null;
  } | null;
  preferredSurfaceMode?: "natural" | "structured" | null;
  activeReplyContext?: unknown;
  activeReplyArtifactRef?: {
    messageId: string;
    kind: "reply_options" | "reply_draft";
  } | null;
  selectedReplyOptionId?: string | null;
}

export interface PersistedAssistantMessageData {
  reply: string;
  threadTitle: string;
}

export interface PersistDraftCandidateCreate {
  title: string;
  artifact: unknown;
  voiceTarget: unknown | null;
  noveltyNotes: string[];
}

export interface PersistDraftCandidateContext {
  userId: string;
  xHandle: string | null;
  runId: string | null;
  sourcePrompt: string;
  sourcePlaybook: string;
  outputShape: V2ChatOutputShape;
}

export interface PersistAssistantTurnArgs {
  threadId: string | null | undefined;
  assistantMessageData: PersistedAssistantMessageData & Record<string, unknown>;
  threadUpdate: {
    updatedAt: Date;
    title?: string;
  };
  buildMemoryUpdate?: (
    assistantMessageId: string,
  ) => Omit<PersistMemoryUpdateArgs, "threadId">;
  draftCandidateCreates?: PersistDraftCandidateCreate[];
  draftCandidateContext?: PersistDraftCandidateContext;
}

export interface PersistAssistantTurnResult {
  assistantMessageId?: string;
  updatedThreadTitle?: string | null;
}

export interface ChatRoutePersistenceDeps {
  createChatMessage: (args: {
    threadId: string;
    role: "assistant";
    content: string;
    data: unknown;
  }) => Promise<{ id: string }>;
  updateConversationMemory: (
    args: PersistMemoryUpdateArgs,
  ) => Promise<unknown>;
  updateChatThread: (args: {
    threadId: string;
    data: {
      updatedAt: Date;
      title?: string;
    };
  }) => Promise<{ title: string | null }>;
  createDraftCandidate: (args: {
    userId: string;
    xHandle: string | null;
    threadId: string;
    runId: string | null;
    title: string;
    sourcePrompt: string;
    sourcePlaybook: string;
    outputShape: V2ChatOutputShape;
    artifact: unknown;
    voiceTarget: unknown | null;
    noveltyNotes: unknown;
  }) => Promise<unknown>;
}

export async function persistAssistantTurn(args: PersistAssistantTurnArgs): Promise<PersistAssistantTurnResult> {
  return persistAssistantTurnWithDeps(args, await createDefaultDeps());
}

export async function persistAssistantTurnWithDeps(
  args: PersistAssistantTurnArgs,
  deps: ChatRoutePersistenceDeps,
): Promise<PersistAssistantTurnResult> {
  if (!args.threadId) {
    return {};
  }
  const threadId = args.threadId;

  const assistantMessage = await deps.createChatMessage({
    threadId,
    role: "assistant",
    content: args.assistantMessageData.reply,
    data: args.assistantMessageData,
  });

  if (args.buildMemoryUpdate) {
    await deps.updateConversationMemory({
      threadId,
      ...args.buildMemoryUpdate(assistantMessage.id),
    });
  }

  const updatedThread = await deps.updateChatThread({
    threadId,
    data: args.threadUpdate,
  });

  if (
    args.draftCandidateCreates &&
    args.draftCandidateCreates.length > 0 &&
    args.draftCandidateContext
  ) {
    const draftCandidateContext = args.draftCandidateContext;
    try {
      await Promise.all(
        args.draftCandidateCreates.map((candidate) =>
          deps.createDraftCandidate({
            userId: draftCandidateContext.userId,
            xHandle: draftCandidateContext.xHandle,
            threadId,
            runId: draftCandidateContext.runId,
            title: candidate.title,
            sourcePrompt: draftCandidateContext.sourcePrompt,
            sourcePlaybook: draftCandidateContext.sourcePlaybook,
            outputShape: draftCandidateContext.outputShape,
            artifact: candidate.artifact,
            voiceTarget: candidate.voiceTarget,
            noveltyNotes: candidate.noveltyNotes,
          }),
        ),
      );
    } catch (error) {
      if (!(await isMissingDraftCandidateTableError(error))) {
        throw error;
      }
    }
  }

  return {
    assistantMessageId: assistantMessage.id,
    updatedThreadTitle: updatedThread.title,
  };
}

async function createDefaultDeps(): Promise<ChatRoutePersistenceDeps> {
  const [{ prisma }, { Prisma }, memoryStore] = await Promise.all([
    import("../../../../../lib/db.ts"),
    import("../../../../../lib/generated/prisma/client.ts"),
    import("../../../../../lib/agent-v2/memory/memoryStore.ts"),
  ]);

  return {
    createChatMessage: ({ threadId, role, content, data }) =>
      prisma.chatMessage.create({
        data: {
          threadId,
          role,
          content,
          data: data as never,
        },
      }),
    updateConversationMemory: (args) =>
      memoryStore.updateConversationMemory(args as never),
    updateChatThread: ({ threadId, data }) =>
      prisma.chatThread.update({
        where: { id: threadId },
        data,
      }),
    createDraftCandidate: (args) =>
      prisma.draftCandidate.create({
        data: {
          userId: args.userId,
          ...(args.xHandle ? { xHandle: args.xHandle } : {}),
          threadId: args.threadId,
          runId: args.runId,
          title: args.title,
          sourcePrompt: args.sourcePrompt,
          sourcePlaybook: args.sourcePlaybook,
          outputShape: args.outputShape,
          artifact: args.artifact as never,
          voiceTarget: args.voiceTarget === null ? Prisma.JsonNull : (args.voiceTarget as never),
          noveltyNotes: args.noveltyNotes as never,
        },
      }),
  };
}

async function isMissingDraftCandidateTableError(error: unknown): Promise<boolean> {
  const prismaGuards = await import(
    "../../../../../lib/agent-v2/orchestrator/prismaGuards.ts"
  );
  return prismaGuards.isMissingDraftCandidateTableError(error);
}
