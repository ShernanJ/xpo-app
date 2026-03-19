import { createHmac, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

const EXTENSION_TOKEN_PREFIX = "xpo_ext";
const DEFAULT_EXTENSION_TOKEN_TTL_DAYS = 7;
export const XPO_COMPANION_EXTENSION_SCOPE = "xpo-companion-extension";

function getExtensionTokenSecret(): string {
  return (
    process.env.EXTENSION_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    ""
  );
}

function ensureExtensionTokenSecret(): string {
  const secret = getExtensionTokenSecret();
  if (!secret) {
    throw new Error("EXTENSION_TOKEN_SECRET or SESSION_SECRET must be configured.");
  }

  return secret;
}

export function hashExtensionToken(token: string): string {
  return createHmac("sha256", ensureExtensionTokenSecret()).update(token).digest("hex");
}

export function buildExtensionTokenValue(): string {
  return `${EXTENSION_TOKEN_PREFIX}_${randomBytes(24).toString("base64url")}`;
}

function resolveExtensionTokenTtlDays(): number {
  const rawValue = Number.parseInt(process.env.EXTENSION_TOKEN_TTL_DAYS?.trim() || "", 10);
  if (Number.isFinite(rawValue) && rawValue >= 1 && rawValue <= 30) {
    return rawValue;
  }

  return DEFAULT_EXTENSION_TOKEN_TTL_DAYS;
}

export function parseExtensionBearerToken(
  authorizationHeader: string | null | undefined,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  return token || null;
}

export function isExtensionTokenActive(args: {
  revokedAt?: Date | null;
  expiresAt?: Date | null;
  scope?: string | null;
  expectedScope?: string;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  const expectedScope = args.expectedScope ?? XPO_COMPANION_EXTENSION_SCOPE;

  if (args.revokedAt) {
    return false;
  }

  if ((args.scope?.trim() || "") !== expectedScope) {
    return false;
  }

  if (!args.expiresAt) {
    return false;
  }

  return args.expiresAt.getTime() > now.getTime();
}

export async function issueExtensionApiToken(args: {
  userId: string;
  name?: string | null;
  scope?: string;
  now?: Date;
  revokeExisting?: boolean;
}) {
  const { prisma } = await import("../db.ts");
  const now = args.now ?? new Date();
  const rawToken = buildExtensionTokenValue();
  const tokenTtlDays = resolveExtensionTokenTtlDays();
  const expiresAt = new Date(now.getTime() + tokenTtlDays * 24 * 60 * 60 * 1000);
  const name = args.name?.trim() || "xpo-companion";
  const scope = args.scope?.trim() || XPO_COMPANION_EXTENSION_SCOPE;

  if (args.revokeExisting !== false) {
    await prisma.extensionApiToken.updateMany({
      where: {
        userId: args.userId,
        scope,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    });
  }

  await prisma.extensionApiToken.create({
    data: {
      userId: args.userId,
      name,
      scope,
      tokenHash: hashExtensionToken(rawToken),
      expiresAt,
    },
  });

  return {
    token: rawToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifyExtensionApiToken(
  token: string,
  expectedScope = XPO_COMPANION_EXTENSION_SCOPE,
) {
  const { prisma } = await import("../db.ts");
  const tokenHash = hashExtensionToken(token);
  const record = await prisma.extensionApiToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          activeXHandle: true,
          handle: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (
    !record ||
    !isExtensionTokenActive({
      revokedAt: record.revokedAt,
      expiresAt: record.expiresAt,
      scope: record.scope,
      expectedScope,
    })
  ) {
    return null;
  }

  await prisma.extensionApiToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    tokenId: record.id,
    scope: record.scope,
    user: record.user,
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function authenticateExtensionRequest(
  request: NextRequest,
  expectedScope = XPO_COMPANION_EXTENSION_SCOPE,
) {
  const token = parseExtensionBearerToken(request.headers.get("authorization"));
  if (!token) {
    return null;
  }

  return verifyExtensionApiToken(token, expectedScope);
}
