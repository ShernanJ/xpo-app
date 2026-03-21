import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const connectionString = `${process.env.DATABASE_URL}`;

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function hasDelegate<
  Key extends
    | "user"
    | "userHandle"
    | "draftCandidate"
    | "sourceMaterialAsset"
    | "productEvent"
    | "chatTurnControl"
    | "chatMediaAsset",
>(
  client: PrismaClient | undefined,
  key: Key,
): boolean {
  const candidate = client as PrismaClient & Record<Key, unknown> | undefined;
  if (!candidate) {
    return false;
  }

  const delegate = candidate[key];
  return typeof delegate === "object" && delegate !== null;
}

function hasRequiredDelegates(client: PrismaClient | undefined): client is PrismaClient {
  return (
    hasDelegate(client, "user") &&
    hasDelegate(client, "userHandle") &&
    hasDelegate(client, "draftCandidate") &&
    hasDelegate(client, "sourceMaterialAsset") &&
    hasDelegate(client, "productEvent") &&
    hasDelegate(client, "chatTurnControl") &&
    hasDelegate(client, "chatMediaAsset")
  );
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
  });
}

const cachedPrisma = hasRequiredDelegates(globalForPrisma.prisma)
  ? globalForPrisma.prisma
  : undefined;

if (globalForPrisma.prisma && !cachedPrisma) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
}

export const prisma: PrismaClient = cachedPrisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
