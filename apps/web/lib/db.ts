import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
