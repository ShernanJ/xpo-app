import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";
import type { AppSession } from "./types";

const APP_SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  handle: true,
  activeXHandle: true,
} as const;

export class AuthIdentityConflictError extends Error {
  readonly code = "AUTH_IDENTITY_CONFLICT";
  readonly userId: string;
  readonly existingEmail: string;
  readonly incomingEmail: string;

  constructor(args: {
    userId: string;
    existingEmail: string;
    incomingEmail: string;
  }) {
    super(
      "This sign-in is linked to a different Xpo account. Please use the original email for this account or contact support.",
    );
    this.name = "AuthIdentityConflictError";
    this.userId = args.userId;
    this.existingEmail = args.existingEmail;
    this.incomingEmail = args.incomingEmail;
  }
}

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
    select: APP_SESSION_USER_SELECT,
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
  const existingUserById = await prisma.user.findUnique({
    where: { id: params.userId },
    select: APP_SESSION_USER_SELECT,
  });

  if (existingUserById) {
    if (!normalizedEmail || existingUserById.email === normalizedEmail) {
      return existingUserById;
    }

    if (!existingUserById.email) {
      return prisma.user.update({
        where: { id: params.userId },
        data: {
          email: normalizedEmail,
        },
        select: APP_SESSION_USER_SELECT,
      });
    }

    throw new AuthIdentityConflictError({
      userId: params.userId,
      existingEmail: existingUserById.email,
      incomingEmail: normalizedEmail,
    });
  }

  if (normalizedEmail) {
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: APP_SESSION_USER_SELECT,
    });

    if (existingUserByEmail) {
      // Reuse the existing app account for verified same-email identities
      // instead of mutating primary keys when Supabase returns another auth ID.
      return existingUserByEmail;
    }
  }

  return prisma.user.create({
    data: {
      id: params.userId,
      email: normalizedEmail,
    },
    select: APP_SESSION_USER_SELECT,
  });
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
      select: APP_SESSION_USER_SELECT,
    });

    return existing ? asAppSession(existing) : null;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: APP_SESSION_USER_SELECT,
  });

  return asAppSession(user);
}
