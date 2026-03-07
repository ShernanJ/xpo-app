import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";
import type { AppSession } from "./types";

function asAppSession(user: {
  id: string;
  name: string | null;
  email: string | null;
  handle: string | null;
  activeXHandle: string | null;
}): AppSession {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      handle: user.handle ?? undefined,
      activeXHandle: user.activeXHandle,
    },
  };
}

export async function getServerSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const payload = await verifySessionToken(rawToken);
  if (!payload?.userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      handle: true,
      activeXHandle: true,
    },
  });

  if (!user) {
    return null;
  }

  return asAppSession(user);
}

export async function ensureAppUserForAuthIdentity(params: {
  userId: string;
  email: string | null;
}) {
  const normalizedEmail = params.email?.toLowerCase() ?? null;

  try {
    return await prisma.user.upsert({
      where: { id: params.userId },
      create: {
        id: params.userId,
        email: normalizedEmail,
      },
      update: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        activeXHandle: true,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002" &&
      normalizedEmail
    ) {
      // Supabase returned a new ID, but the email already exists in our DB (e.g. legacy NextAuth ID)
      // Migrate the existing user record to adopt the new Supabase ID to preserve their data.
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        return prisma.user.update({
          where: { email: normalizedEmail },
          data: { id: params.userId },
          select: {
            id: true,
            name: true,
            email: true,
            handle: true,
            activeXHandle: true,
          },
        });
      }
    }

    throw error;
  }
}

export async function updateAppSessionUser(
  userId: string,
  data: {
    activeXHandle?: string | null;
    handle?: string | null;
  },
): Promise<AppSession | null> {
  const updates: { activeXHandle?: string | null; handle?: string | null } = {};

  if (data.activeXHandle !== undefined) {
    updates.activeXHandle = data.activeXHandle;
  }

  if (data.handle !== undefined) {
    updates.handle = data.handle;
  }

  if (Object.keys(updates).length === 0) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        activeXHandle: true,
      },
    });

    return existing ? asAppSession(existing) : null;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: {
      id: true,
      name: true,
      email: true,
      handle: true,
      activeXHandle: true,
    },
  });

  return asAppSession(user);
}
