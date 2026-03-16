import { prisma } from "@/lib/db";

type TurnControlStatus =
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "completed";

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

export async function upsertRunningTurnControl(args: TurnControlIdentity & {
  threadId?: string | null;
}) {
  const threadId = args.threadId ?? null;
  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  return prisma.chatTurnControl.upsert({
    where: {
      userId_runId_clientTurnId: {
        userId: args.userId,
        runId: args.runId,
        clientTurnId: args.clientTurnId,
      },
    },
    update: {
      ...(threadId ? { threadId } : {}),
    },
    create: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
      ...(threadId ? { threadId } : {}),
      status: "running",
    },
  });
}

export async function isTurnCancellationRequested(args: TurnControlIdentity) {
  if (!hasTurnControlIdentity(args)) {
    return false;
  }

  const control = await prisma.chatTurnControl.findUnique({
    where: {
      userId_runId_clientTurnId: {
        userId: args.userId,
        runId: args.runId,
        clientTurnId: args.clientTurnId,
      },
    },
    select: {
      status: true,
    },
  });

  return control?.status === "cancel_requested" || control?.status === "cancelled";
}

export async function markTurnCancelled(args: TurnControlIdentity) {
  if (!hasTurnControlIdentity(args)) {
    return null;
  }

  const now = new Date();
  return prisma.chatTurnControl.updateMany({
    where: {
      userId: args.userId,
      runId: args.runId,
      clientTurnId: args.clientTurnId,
      status: {
        in: ["running", "cancel_requested"] satisfies TurnControlStatus[],
      },
    },
    data: {
      status: "cancelled",
      cancelRequestedAt: now,
      completedAt: now,
    },
  });
}

export async function markTurnCompleted(args: TurnControlIdentity & {
  assistantMessageId?: string | null;
}) {
  const assistantMessageId = args.assistantMessageId ?? null;
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
      completedAt: new Date(),
      assistantMessageId,
    },
  });
}

export async function requestTurnCancellation(args: TurnControlIdentity & {
  threadId?: string | null;
}): Promise<"cancel_requested" | "completed" | "not_found"> {
  const threadId = args.threadId ?? null;
  if (!hasTurnControlIdentity(args)) {
    return "not_found";
  }

  const existing = await prisma.chatTurnControl.findUnique({
    where: {
      userId_runId_clientTurnId: {
        userId: args.userId,
        runId: args.runId,
        clientTurnId: args.clientTurnId,
      },
    },
    select: {
      status: true,
    },
  });

  if (!existing) {
    return "not_found";
  }

  if (existing.status === "completed") {
    return "completed";
  }

  await prisma.chatTurnControl.update({
    where: {
      userId_runId_clientTurnId: {
        userId: args.userId,
        runId: args.runId,
        clientTurnId: args.clientTurnId,
      },
    },
    data: {
      status: "cancel_requested",
      cancelRequestedAt: new Date(),
      ...(threadId ? { threadId } : {}),
    },
  });

  return "cancel_requested";
}
