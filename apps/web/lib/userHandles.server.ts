import { prisma } from "./db.ts";
import { normalizeWorkspaceHandle } from "./workspaceHandle.ts";

export interface WorkspaceHandleState {
  activeHandle: string | null;
  handles: string[];
}

function dedupeNormalizedHandles(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeWorkspaceHandle(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function readWorkspaceHandleStateForUser(args: {
  userId: string;
  sessionActiveHandle?: string | null;
}): Promise<WorkspaceHandleState> {
  const [userHandleRows, user] = await Promise.all([
    prisma.userHandle.findMany({
      where: {
        userId: args.userId,
        status: "active",
      },
      orderBy: [{ updatedAt: "desc" }, { xHandle: "asc" }],
      select: { xHandle: true },
    }),
    prisma.user.findUnique({
      where: { id: args.userId },
      select: { activeXHandle: true },
    }),
  ]);

  const handles = dedupeNormalizedHandles(
    userHandleRows.map((row: { xHandle: string }) => row.xHandle),
  );
  const persistedActiveHandle = normalizeWorkspaceHandle(user?.activeXHandle ?? null);
  const sessionActiveHandle = normalizeWorkspaceHandle(args.sessionActiveHandle ?? null);
  const activeHandle = [persistedActiveHandle, sessionActiveHandle].find(
    (value): value is string => typeof value === "string" && handles.includes(value),
  ) ?? null;

  return {
    activeHandle,
    handles,
  };
}

export async function listWorkspaceHandlesForUser(args: {
  userId: string;
  sessionActiveHandle?: string | null;
}): Promise<string[]> {
  const state = await readWorkspaceHandleStateForUser(args);
  return state.handles;
}

export async function persistPendingWorkspaceHandleForUser(args: {
  userId: string;
  xHandle: string;
}) {
  const xHandle = normalizeWorkspaceHandle(args.xHandle);
  if (!xHandle) {
    throw new Error("A valid X handle is required.");
  }

  const existing = await prisma.userHandle.findUnique({
    where: {
      userId_xHandle: {
        userId: args.userId,
        xHandle,
      },
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing?.status === "active") {
    return existing;
  }

  if (existing) {
    return prisma.userHandle.update({
      where: { id: existing.id },
      data: { status: "pending_setup" },
    });
  }

  return prisma.userHandle.create({
    data: {
      userId: args.userId,
      xHandle,
      status: "pending_setup",
    },
  });
}

export async function activateWorkspaceHandleForUser(args: {
  userId: string;
  xHandle: string;
}) {
  const xHandle = normalizeWorkspaceHandle(args.xHandle);
  if (!xHandle) {
    throw new Error("A valid X handle is required.");
  }

  return prisma.userHandle.upsert({
    where: {
      userId_xHandle: {
        userId: args.userId,
        xHandle,
      },
    },
    update: {
      status: "active",
    },
    create: {
      userId: args.userId,
      xHandle,
      status: "active",
    },
  });
}
