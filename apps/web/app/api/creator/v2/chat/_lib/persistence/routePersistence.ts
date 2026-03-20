import type { V2ChatOutputShape } from "../../../../../../../lib/agent-v2/contracts/chat.ts";
import type {
  RuntimePersistedMemoryChange,
  RuntimePersistenceTracePatch,
  RuntimeWorkerExecution,
} from "../../../../../../../lib/agent-v2/runtime/runtimeContracts.ts";

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
  activeProfileAnalysisRef?: {
    messageId: string;
    handle: string;
    fingerprint: string;
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
  draftVersionId: string | null;
  basedOnVersionId: string | null;
  revisionChainId: string | null;
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
  assistantMessageData: PersistedAssistantMessageData & object;
  threadUpdate: {
    updatedAt: Date;
    title?: string;
  };
  buildMemoryUpdate?: (
    assistantMessageId: string,
  ) => Omit<PersistMemoryUpdateArgs, "threadId">;
  contentTitleSyncContext?: {
    userId: string;
    xHandle: string | null;
  } | null;
  draftCandidateCreates?: PersistDraftCandidateCreate[];
  draftCandidateContext?: PersistDraftCandidateContext;
}

export interface PersistAssistantTurnResult {
  assistantMessageId?: string;
  updatedThreadTitle?: string | null;
  tracePatch: RuntimePersistenceTracePatch;
}

const DRAFT_CANDIDATE_PERSISTENCE_GROUP_ID = "chat_route_persistence_draft_candidates";

function buildPersistenceWorkerExecution(args: {
  worker: string;
  mode: "sequential" | "parallel";
  status: "completed" | "skipped" | "failed";
  groupId?: string | null;
  details?: Record<string, unknown> | null;
}): RuntimeWorkerExecution {
  return {
    worker: args.worker,
    capability: "shared",
    phase: "persistence",
    mode: args.mode,
    status: args.status,
    groupId: args.groupId ?? null,
    ...(args.details ? { details: args.details } : {}),
  };
}

function buildPersistedMemoryChange(
  memoryUpdate: Omit<PersistMemoryUpdateArgs, "threadId"> | null,
  updated: boolean,
): RuntimePersistedMemoryChange | null {
  if (!memoryUpdate) {
    return null;
  }

  return {
    updated,
    preferredSurfaceMode: memoryUpdate.preferredSurfaceMode ?? null,
    activeDraftVersionId: memoryUpdate.activeDraftRef?.versionId ?? null,
    clearedReplyWorkflow:
      memoryUpdate.activeReplyContext === null &&
      memoryUpdate.activeReplyArtifactRef === null &&
      memoryUpdate.selectedReplyOptionId === null,
    selectedReplyOptionId: memoryUpdate.selectedReplyOptionId ?? null,
  };
}

function buildSkippedPersistedMemoryChange(): RuntimePersistedMemoryChange {
  return {
    updated: false,
    preferredSurfaceMode: null,
    activeDraftVersionId: null,
    clearedReplyWorkflow: false,
    selectedReplyOptionId: null,
  };
}

function buildNoThreadTracePatch(
  args: PersistAssistantTurnArgs,
): RuntimePersistenceTracePatch {
  const attemptedDraftCandidates = args.draftCandidateCreates?.length ?? 0;
  const workerExecutions: RuntimeWorkerExecution[] = [
    buildPersistenceWorkerExecution({
      worker: "persist_assistant_message",
      mode: "sequential",
      status: "skipped",
      details: { reason: "missing_thread" },
    }),
    buildPersistenceWorkerExecution({
      worker: "update_chat_thread",
      mode: "sequential",
      status: "skipped",
      details: { reason: "missing_thread" },
    }),
  ];

  if (args.buildMemoryUpdate) {
    workerExecutions.splice(
      1,
      0,
      buildPersistenceWorkerExecution({
        worker: "update_conversation_memory",
        mode: "sequential",
        status: "skipped",
        details: { reason: "missing_thread" },
      }),
    );
  }

  if (attemptedDraftCandidates > 0) {
    workerExecutions.push(
      ...args.draftCandidateCreates!.map((candidate) =>
        buildPersistenceWorkerExecution({
          worker: "create_draft_candidate",
          mode: "parallel",
          status: "skipped",
          groupId: DRAFT_CANDIDATE_PERSISTENCE_GROUP_ID,
          details: {
            title: candidate.title,
            reason: "missing_thread",
          },
        })
      ),
    );
  }

  return {
    workerExecutions,
    persistedStateChanges: {
      assistantMessageId: null,
      thread: null,
      memory: args.buildMemoryUpdate ? buildSkippedPersistedMemoryChange() : null,
      draftCandidates: {
        attempted: attemptedDraftCandidates,
        created: 0,
        skipped: attemptedDraftCandidates,
      },
    },
  };
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
    messageId: string;
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
    draftVersionId: string | null;
    basedOnVersionId: string | null;
    revisionChainId: string | null;
  }) => Promise<unknown>;
  markSupersededDraftVersions?: (args: {
    userId: string;
    xHandle: string | null;
    candidates: PersistDraftCandidateCreate[];
  }) => Promise<void>;
  syncIndexedContentTitlesForThread?: (args: {
    threadId: string;
    userId: string;
    xHandle: string | null;
    title: string;
  }) => Promise<void>;
  runInTransaction?: <T>(
    callback: (deps: Omit<ChatRoutePersistenceDeps, "runInTransaction">) => Promise<T>,
  ) => Promise<T>;
}

export async function persistAssistantTurn(args: PersistAssistantTurnArgs): Promise<PersistAssistantTurnResult> {
  return persistAssistantTurnWithDeps(args, await createDefaultDeps());
}

export async function persistAssistantTurnWithDeps(
  args: PersistAssistantTurnArgs,
  deps: ChatRoutePersistenceDeps,
): Promise<PersistAssistantTurnResult> {
  if (deps.runInTransaction) {
    return deps.runInTransaction((transactionDeps) =>
      persistAssistantTurnWithDeps(args, transactionDeps),
    );
  }

  const transactionalDeps = deps as Omit<ChatRoutePersistenceDeps, "runInTransaction">;
  if (!args.threadId) {
    return {
      tracePatch: buildNoThreadTracePatch(args),
    };
  }
  const threadId = args.threadId;
  const workerExecutions: RuntimeWorkerExecution[] = [];

  const assistantMessage = await transactionalDeps.createChatMessage({
    threadId,
    role: "assistant",
    content: args.assistantMessageData.reply,
    data: args.assistantMessageData,
  });
  workerExecutions.push(
    buildPersistenceWorkerExecution({
      worker: "persist_assistant_message",
      mode: "sequential",
      status: "completed",
      details: {
        threadId,
        assistantMessageId: assistantMessage.id,
      },
    }),
  );

  const memoryUpdate = args.buildMemoryUpdate
    ? args.buildMemoryUpdate(assistantMessage.id)
    : null;
  if (args.buildMemoryUpdate) {
    await transactionalDeps.updateConversationMemory({
      threadId,
      ...memoryUpdate,
    });
    workerExecutions.push(
      buildPersistenceWorkerExecution({
        worker: "update_conversation_memory",
        mode: "sequential",
        status: "completed",
        details: {
          threadId,
          activeDraftVersionId: memoryUpdate?.activeDraftRef?.versionId ?? null,
          selectedReplyOptionId: memoryUpdate?.selectedReplyOptionId ?? null,
        },
      }),
    );
  }

  const updatedThread = await transactionalDeps.updateChatThread({
    threadId,
    data: args.threadUpdate,
  });
  const syncedThreadTitle = updatedThread.title?.trim() || null;
  if (
    syncedThreadTitle &&
    args.contentTitleSyncContext &&
    transactionalDeps.syncIndexedContentTitlesForThread
  ) {
    await transactionalDeps.syncIndexedContentTitlesForThread({
      threadId,
      userId: args.contentTitleSyncContext.userId,
      xHandle: args.contentTitleSyncContext.xHandle,
      title: syncedThreadTitle,
    });
  }
  workerExecutions.push(
    buildPersistenceWorkerExecution({
      worker: "update_chat_thread",
      mode: "sequential",
      status: "completed",
      details: {
        threadId,
        updatedTitle: updatedThread.title,
      },
    }),
  );

  const attemptedDraftCandidates = args.draftCandidateCreates?.length ?? 0;
  let createdDraftCandidates = 0;
  let skippedDraftCandidates = 0;
  if (
    args.draftCandidateCreates &&
    args.draftCandidateCreates.length > 0 &&
    args.draftCandidateContext
  ) {
    const draftCandidateContext = args.draftCandidateContext;
    if (transactionalDeps.markSupersededDraftVersions) {
      await transactionalDeps.markSupersededDraftVersions({
        userId: draftCandidateContext.userId,
        xHandle: draftCandidateContext.xHandle,
        candidates: args.draftCandidateCreates,
      });
    }
    const candidateResults = await Promise.allSettled(
      args.draftCandidateCreates.map((candidate) =>
        transactionalDeps.createDraftCandidate({
          messageId: assistantMessage.id,
          userId: draftCandidateContext.userId,
          xHandle: draftCandidateContext.xHandle,
          threadId,
          runId: draftCandidateContext.runId,
          title: syncedThreadTitle || candidate.title,
          sourcePrompt: draftCandidateContext.sourcePrompt,
          sourcePlaybook: draftCandidateContext.sourcePlaybook,
          outputShape: draftCandidateContext.outputShape,
          artifact: candidate.artifact,
          voiceTarget: candidate.voiceTarget,
          noveltyNotes: candidate.noveltyNotes,
          draftVersionId: candidate.draftVersionId,
          basedOnVersionId: candidate.basedOnVersionId,
          revisionChainId: candidate.revisionChainId,
        }),
      ),
    );
    const missingTableByIndex = new Map<number, boolean>();
    await Promise.all(
      candidateResults.map(async (result, index) => {
        if (result.status !== "rejected") {
          return;
        }
        missingTableByIndex.set(index, await isMissingDraftCandidateTableError(result.reason));
      }),
    );

    const nonMissingFailureIndex = candidateResults.findIndex(
      (result, index) =>
        result.status === "rejected" && missingTableByIndex.get(index) !== true,
    );
    if (nonMissingFailureIndex >= 0) {
      throw (candidateResults[nonMissingFailureIndex] as PromiseRejectedResult).reason;
    }

    args.draftCandidateCreates.forEach((candidate, index) => {
      const result = candidateResults[index];
      const isSkipped = result?.status === "rejected";
      if (isSkipped) {
        skippedDraftCandidates += 1;
      } else {
        createdDraftCandidates += 1;
      }

      workerExecutions.push(
        buildPersistenceWorkerExecution({
          worker: "create_draft_candidate",
          mode: "parallel",
          status: isSkipped ? "skipped" : "completed",
          groupId: DRAFT_CANDIDATE_PERSISTENCE_GROUP_ID,
          details: {
            threadId,
            title: candidate.title,
            ...(isSkipped ? { reason: "missing_draft_candidate_table" } : {}),
          },
        }),
      );
    });
  } else if (attemptedDraftCandidates > 0) {
    skippedDraftCandidates = attemptedDraftCandidates;
    workerExecutions.push(
      ...args.draftCandidateCreates!.map((candidate) =>
        buildPersistenceWorkerExecution({
          worker: "create_draft_candidate",
          mode: "parallel",
          status: "skipped",
          groupId: DRAFT_CANDIDATE_PERSISTENCE_GROUP_ID,
          details: {
            threadId,
            title: candidate.title,
            reason: "missing_draft_candidate_context",
          },
        })
      ),
    );
  }

  const currentThreadTitle =
    typeof args.assistantMessageData.threadTitle === "string"
      ? args.assistantMessageData.threadTitle
      : null;

  return {
    assistantMessageId: assistantMessage.id,
    updatedThreadTitle: updatedThread.title,
    tracePatch: {
      workerExecutions,
      persistedStateChanges: {
        assistantMessageId: assistantMessage.id,
        thread: {
          threadId,
          updatedTitle: updatedThread.title,
          titleChanged: updatedThread.title !== currentThreadTitle,
        },
        memory: buildPersistedMemoryChange(memoryUpdate, Boolean(memoryUpdate)),
        draftCandidates: {
          attempted: attemptedDraftCandidates,
          created: createdDraftCandidates,
          skipped: skippedDraftCandidates,
        },
      },
    },
  };
}

async function createDefaultDeps(): Promise<ChatRoutePersistenceDeps> {
  const [{ prisma }, { Prisma }, memoryStore, contentHub] = await Promise.all([
    import("../../../../../../../lib/db.ts"),
    import("../../../../../../../lib/generated/prisma/client.ts"),
    import("../../../../../../../lib/agent-v2/memory/memoryStore.ts"),
    import("../../../../../../../lib/content/contentHub.ts"),
  ]);

  const buildDeps = (
    client: Pick<
      typeof prisma,
      "chatMessage" | "chatThread" | "draftCandidate"
    > & {
      $transaction?: typeof prisma.$transaction;
    },
    txForMemory?: Parameters<typeof memoryStore.updateConversationMemory>[0]["tx"],
  ): Omit<ChatRoutePersistenceDeps, "runInTransaction"> => ({
    createChatMessage: ({ threadId, role, content, data }) =>
      client.chatMessage.create({
        data: {
          threadId,
          role,
          content,
          data: data as never,
        },
      }),
    updateConversationMemory: (args) =>
      memoryStore.updateConversationMemory({
        ...args,
        ...(txForMemory ? { tx: txForMemory } : {}),
      } as never),
    updateChatThread: ({ threadId, data }) =>
      client.chatThread.update({
        where: { id: threadId },
        data,
      }),
    createDraftCandidate: (args) =>
      client.draftCandidate.create({
        data: {
          messageId: args.messageId,
          userId: args.userId,
          ...(args.xHandle ? { xHandle: args.xHandle } : {}),
          threadId: args.threadId,
          runId: args.runId,
          title: args.title,
          sourcePrompt: args.sourcePrompt,
          sourcePlaybook: args.sourcePlaybook,
          outputShape: args.outputShape,
          status: "DRAFT",
          draftVersionId: args.draftVersionId,
          basedOnVersionId: args.basedOnVersionId,
          revisionChainId: args.revisionChainId,
          artifact: args.artifact as never,
          voiceTarget: args.voiceTarget === null ? Prisma.JsonNull : (args.voiceTarget as never),
          noveltyNotes: args.noveltyNotes as never,
        },
      }),
    markSupersededDraftVersions: async ({ userId, xHandle, candidates }) => {
      const nextDraftVersionIds = candidates
        .map((candidate) => candidate.draftVersionId)
        .filter((draftVersionId): draftVersionId is string => Boolean(draftVersionId));

      for (const candidate of candidates) {
        await contentHub.markSupersededDraftVersions({
          userId,
          xHandle,
          revisionChainId: candidate.revisionChainId,
          basedOnVersionId: candidate.basedOnVersionId,
          exceptDraftVersionIds: nextDraftVersionIds,
        });
      }
    },
    syncIndexedContentTitlesForThread: ({ threadId, userId, xHandle, title }) =>
      contentHub.updateIndexedContentTitlesForThread({
        threadId,
        userId,
        xHandle,
        title,
      }),
  });

  return {
    ...buildDeps(prisma),
    runInTransaction: (callback) =>
      prisma.$transaction((tx) => callback(buildDeps(tx, tx))),
  };
}

async function isMissingDraftCandidateTableError(error: unknown): Promise<boolean> {
  const prismaGuards = await import(
    "../../../../../../../lib/agent-v2/persistence/prismaGuards.ts"
  );
  return prismaGuards.isMissingDraftCandidateTableError(error);
}
