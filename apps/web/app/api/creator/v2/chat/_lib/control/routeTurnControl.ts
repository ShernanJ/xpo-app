import { prisma } from "@/lib/db";
import type { ChatTurnStatus } from "@/lib/generated/prisma/client";
import { isMissingChatTurnControlTableError } from "@/lib/agent-v2/persistence/prismaGuards";

interface TurnControlIdentity {
  userId: string;
  runId: string | null;
  clientTurnId: string | null;
}

function hasTurnControlIdentity(
  args: TurnControlIdentity,
): args is { userId: string; runId: string; clientTurnId: string } {
  return Boolean(args.userId && args.runId && args.clientTurnId);
}

function activeTurnStatuses(): ChatTurnStatus[] {
  return ["queued", "running", "cancel_requested"];
}

function executableTurnStatuses(): ChatTurnStatus[] {
  return ["queued", "running"];
}

let hasLoggedMissingTurnControlTable = false;

async function withMissingTurnControlFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingChatTurnControlTableError(error)) {
      if (!hasLoggedMissingTurnControlTable) {
        hasLoggedMissingTurnControlTable = true;
        console.error(
          "ChatTurnControl table is missing. Turn-control reads are temporarily disabled until the latest Prisma migrations are applied.",
          error,
        );
      }

      return fallback;
    }

    throw error;
  }
}

function buildIdentityWhere(args: TurnControlIdentity) {
  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  return {
    userId_runId_clientTurnId: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
    },
  } as const;
}

export async function upsertRunningTurnControl(args: TurnControlIdentity & {
  threadId?: string | null;
  userMessageId?: string | null;
  requestPayload?: unknown;
  billingIdempotencyKey?: string | null;
  creditCost?: number | null;
  leaseOwner?: string | null;
  leaseMs?: number;
}) {
  const threadId = args.threadId ?? null;
  const userMessageId = args.userMessageId ?? null;
  const requestPayload = args.requestPayload;
  const billingIdempotencyKey = args.billingIdempotencyKey ?? null;
  const creditCost = args.creditCost ?? null;
  const leaseOwner = args.leaseOwner ?? null;
  const where = buildIdentityWhere(args);
  if (!where) {
    return null;
  }

  const now = new Date();
  const leaseExpiresAt = leaseOwner
    ? new Date(now.getTime() + Math.max(5_000, args.leaseMs ?? 30_000))
    : null;
  const identity = where.userId_runId_clientTurnId;
  return prisma.chatTurnControl.upsert({
    where,
    update: {
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      ...(threadId ? { threadId } : {}),
      ...(userMessageId ? { userMessageId } : {}),
      ...(requestPayload !== undefined ? { requestPayload: requestPayload as never } : {}),
      ...(billingIdempotencyKey ? { billingIdempotencyKey } : {}),
      ...(typeof creditCost === "number" ? { creditCost } : {}),
      ...(leaseOwner ? { leaseOwner, leaseExpiresAt } : {}),
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    },
    create: {
      userId: identity.userId,
      runId: identity.runId,
      clientTurnId: identity.clientTurnId,
      ...(threadId ? { threadId } : {}),
      ...(userMessageId ? { userMessageId } : {}),
      ...(requestPayload !== undefined ? { requestPayload: requestPayload as never } : {}),
      ...(billingIdempotencyKey ? { billingIdempotencyKey } : {}),
      ...(typeof creditCost === "number" ? { creditCost } : {}),
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      ...(leaseOwner ? { leaseOwner, leaseExpiresAt } : {}),
    },
  });
}

export async function upsertQueuedTurnControl(args: TurnControlIdentity & {
  threadId?: string | null;
  userMessageId?: string | null;
  requestPayload?: unknown;
  billingIdempotencyKey?: string | null;
  creditCost?: number | null;
}) {
  const threadId = args.threadId ?? null;
  const userMessageId = args.userMessageId ?? null;
  const requestPayload = args.requestPayload;
  const billingIdempotencyKey = args.billingIdempotencyKey ?? null;
  const creditCost = args.creditCost ?? null;
  const where = buildIdentityWhere(args);
  if (!where) {
    return null;
  }

  const identity = where.userId_runId_clientTurnId;
  return prisma.chatTurnControl.upsert({
    where,
    update: {
      status: "queued",
      ...(threadId ? { threadId } : {}),
      ...(userMessageId ? { userMessageId } : {}),
      ...(requestPayload !== undefined ? { requestPayload: requestPayload as never } : {}),
      ...(billingIdempotencyKey ? { billingIdempotencyKey } : {}),
      ...(typeof creditCost === "number" ? { creditCost } : {}),
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      failedAt: null,
      completedAt: null,
      cancelRequestedAt: null,
      assistantMessageId: null,
    },
    create: {
      userId: identity.userId,
      runId: identity.runId,
      clientTurnId: identity.clientTurnId,
      ...(threadId ? { threadId } : {}),
      ...(userMessageId ? { userMessageId } : {}),
      ...(requestPayload !== undefined ? { requestPayload: requestPayload as never } : {}),
      ...(billingIdempotencyKey ? { billingIdempotencyKey } : {}),
      ...(typeof creditCost === "number" ? { creditCost } : {}),
      status: "queued",
    },
  });
}

export async function markTurnProgress(args: {
  turnId?: string | null;
  userId?: string | null;
  runId?: string | null;
  clientTurnId?: string | null;
  stepId?: string | null;
  label?: string | null;
  explanation?: string | null;
  leaseOwner?: string | null;
  leaseMs?: number;
}) {
  const where = args.turnId
    ? { id: args.turnId }
    : buildIdentityWhere({
        userId: args.userId ?? "",
        runId: args.runId ?? null,
        clientTurnId: args.clientTurnId ?? null,
      });
  if (!where) {
    return null;
  }

  return prisma.chatTurnControl.update({
    where,
    data: {
      heartbeatAt: new Date(),
      ...(args.leaseOwner
        ? {
            leaseOwner: args.leaseOwner,
            leaseExpiresAt: new Date(
              Date.now() + Math.max(5_000, args.leaseMs ?? 30_000),
            ),
          }
        : {}),
      progressStepId: args.stepId ?? null,
      progressLabel: args.label ?? null,
      progressExplanation: args.explanation ?? null,
    },
  });
}

export async function readTurnById(args: {
  turnId: string;
  userId: string;
}) {
  return withMissingTurnControlFallback(
    () =>
      prisma.chatTurnControl.findFirst({
        where: {
          id: args.turnId,
          userId: args.userId,
        },
      }),
    null,
  );
}

export async function readTurnProgressById(args: {
  turnId: string;
  userId: string;
}) {
  return withMissingTurnControlFallback(
    () =>
      prisma.chatTurnControl.findFirst({
        where: {
          id: args.turnId,
          userId: args.userId,
        },
        select: {
          id: true,
          threadId: true,
          status: true,
          progressStepId: true,
          progressLabel: true,
          progressExplanation: true,
          assistantMessageId: true,
          userMessageId: true,
          errorCode: true,
          errorMessage: true,
          startedAt: true,
          heartbeatAt: true,
          failedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    null,
  );
}

export async function readTurnByIdentity(args: TurnControlIdentity) {
  const where = buildIdentityWhere(args);
  if (!where) {
    return null;
  }

  return withMissingTurnControlFallback(
    () =>
      prisma.chatTurnControl.findUnique({
        where,
      }),
    null,
  );
}

export async function findActiveTurnForThread(args: {
  userId: string;
  threadId: string;
  excludeTurnId?: string | null;
  excludeClientTurnId?: string | null;
}) {
  return withMissingTurnControlFallback(
    () =>
      prisma.chatTurnControl.findFirst({
        where: {
          userId: args.userId,
          threadId: args.threadId,
          status: {
            in: activeTurnStatuses(),
          },
          ...(args.excludeTurnId
            ? {
                id: {
                  not: args.excludeTurnId,
                },
              }
            : {}),
          ...(args.excludeClientTurnId
            ? {
                clientTurnId: {
                  not: args.excludeClientTurnId,
                },
              }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    null,
  );
}

export async function claimTurnExecutionLease(args: {
  turnId: string;
  userId: string;
  leaseOwner: string;
  leaseMs?: number;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + Math.max(5_000, args.leaseMs ?? 30_000));
  const updateResult = await prisma.chatTurnControl.updateMany({
    where: {
      id: args.turnId,
      userId: args.userId,
      status: {
        in: executableTurnStatuses(),
      },
      OR: [
        { leaseOwner: args.leaseOwner },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      leaseOwner: args.leaseOwner,
      leaseExpiresAt,
    },
  });

  if (updateResult.count === 0) {
    return null;
  }

  return readTurnById({
    turnId: args.turnId,
    userId: args.userId,
  });
}

export async function claimNextExecutableTurn(args: {
  leaseOwner: string;
  leaseMs?: number;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + Math.max(5_000, args.leaseMs ?? 30_000));

  return prisma.$transaction(async (tx) => {
    const nextTurn = await tx.chatTurnControl.findFirst({
      where: {
        status: {
          in: executableTurnStatuses(),
        },
        OR: [
          { status: "queued" },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
    });

    if (!nextTurn) {
      return null;
    }

    const updateResult = await tx.chatTurnControl.updateMany({
      where: {
        id: nextTurn.id,
        status: {
          in: executableTurnStatuses(),
        },
        OR: [
          { leaseOwner: args.leaseOwner },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "running",
        startedAt: now,
        heartbeatAt: now,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
      },
    });

    if (updateResult.count === 0) {
      return null;
    }

    return tx.chatTurnControl.findUnique({
      where: {
        id: nextTurn.id,
      },
    });
  });
}

export async function heartbeatTurnExecution(args: {
  turnId: string;
  userId: string;
  leaseOwner?: string | null;
  leaseMs?: number;
}) {
  const now = new Date();
  return prisma.chatTurnControl.updateMany({
    where: {
      id: args.turnId,
      userId: args.userId,
      ...(args.leaseOwner ? { leaseOwner: args.leaseOwner } : {}),
      status: {
        in: executableTurnStatuses(),
      },
    },
    data: {
      heartbeatAt: now,
      ...(args.leaseMs
        ? {
            leaseExpiresAt: new Date(now.getTime() + Math.max(5_000, args.leaseMs)),
          }
        : {}),
    },
  });
}

export async function isTurnCancellationRequested(args: TurnControlIdentity & {
  turnId?: string | null;
}) {
  const turnId = args.turnId;
  const control = turnId
    ? await withMissingTurnControlFallback(
        () =>
          prisma.chatTurnControl.findFirst({
            where: {
              id: turnId,
              userId: args.userId,
            },
            select: {
              status: true,
            },
          }),
        null,
      )
    : await readTurnByIdentity(args);

  return control?.status === "cancel_requested" || control?.status === "cancelled";
}

export async function markTurnCancelled(args: TurnControlIdentity & {
  turnId?: string | null;
}) {
  const now = new Date();
  if (args.turnId) {
    return prisma.chatTurnControl.updateMany({
      where: {
        id: args.turnId,
        userId: args.userId,
        status: {
          in: activeTurnStatuses(),
        },
      },
      data: {
        status: "cancelled",
        cancelRequestedAt: now,
        completedAt: now,
        heartbeatAt: now,
      },
    });
  }

  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  return prisma.chatTurnControl.updateMany({
    where: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
      status: {
        in: activeTurnStatuses(),
      },
    },
    data: {
      status: "cancelled",
      cancelRequestedAt: now,
      completedAt: now,
      heartbeatAt: now,
    },
  });
}

export async function markTurnCompleted(args: TurnControlIdentity & {
  turnId?: string | null;
  assistantMessageId?: string | null;
}) {
  const assistantMessageId = args.assistantMessageId ?? null;
  const now = new Date();

  if (args.turnId) {
    return prisma.chatTurnControl.updateMany({
      where: {
        id: args.turnId,
        userId: args.userId,
        status: {
          not: "cancelled",
        },
      },
      data: {
        status: "completed",
        completedAt: now,
        heartbeatAt: now,
        assistantMessageId,
      },
    });
  }

  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  return prisma.chatTurnControl.updateMany({
    where: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
      status: {
        not: "cancelled",
      },
    },
    data: {
      status: "completed",
      completedAt: now,
      heartbeatAt: now,
      assistantMessageId,
    },
  });
}

export async function markTurnFailed(args: TurnControlIdentity & {
  turnId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const now = new Date();
  const data = {
    status: "failed" as const,
    errorCode: args.errorCode ?? "TURN_FAILED",
    errorMessage: args.errorMessage ?? "The turn failed before completion.",
    failedAt: now,
    completedAt: now,
    heartbeatAt: now,
  };

  if (args.turnId) {
    return prisma.chatTurnControl.updateMany({
      where: {
        id: args.turnId,
        userId: args.userId,
      },
      data,
    });
  }

  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  return prisma.chatTurnControl.updateMany({
    where: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
    },
    data,
  });
}

export async function requestTurnCancellation(args: TurnControlIdentity & {
  turnId?: string | null;
  threadId?: string | null;
}): Promise<"cancel_requested" | "completed" | "not_found"> {
  const threadId = args.threadId ?? null;
  const existing = args.turnId
    ? await prisma.chatTurnControl.findFirst({
        where: {
          id: args.turnId,
          userId: args.userId,
        },
        select: {
          id: true,
          status: true,
        },
      })
    : hasTurnControlIdentity(args)
      ? await prisma.chatTurnControl.findUnique({
          where: {
            userId_runId_clientTurnId: {
              userId: args.userId,
              runId: args.runId,
              clientTurnId: args.clientTurnId,
            },
          },
          select: {
            id: true,
            status: true,
          },
        })
      : null;

  if (!existing) {
    return "not_found";
  }

  if (existing.status === "completed") {
    return "completed";
  }

  await prisma.chatTurnControl.update({
    where: {
      id: existing.id,
    },
    data: {
      status: "cancel_requested",
      cancelRequestedAt: new Date(),
      ...(threadId ? { threadId } : {}),
    },
  });

  return "cancel_requested";
}
