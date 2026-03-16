import { prisma } from "@/lib/db";
import { isMissingRequestRateLimitBucketTableError } from "@/lib/agent-v2/persistence/prismaGuards";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

let hasLoggedMissingRateLimitTable = false;

function buildFailOpenRateLimitResult(args: {
  limit: number;
  windowMs: number;
}): RateLimitResult {
  return {
    ok: true,
    limit: args.limit,
    remaining: args.limit,
    retryAfterSeconds: Math.max(1, Math.ceil(args.windowMs / 1000)),
  };
}

export async function consumeRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - args.windowMs);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.requestRateLimitBucket.findUnique({
        where: { key: args.key },
      });

      if (!existing || existing.windowStart < windowStart) {
        await tx.requestRateLimitBucket.upsert({
          where: { key: args.key },
          update: {
            windowStart: now,
            count: 1,
          },
          create: {
            key: args.key,
            windowStart: now,
            count: 1,
          },
        });

        return {
          ok: true,
          limit: args.limit,
          remaining: Math.max(0, args.limit - 1),
          retryAfterSeconds: Math.max(1, Math.ceil(args.windowMs / 1000)),
        } satisfies RateLimitResult;
      }

      if (existing.count >= args.limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((existing.windowStart.getTime() + args.windowMs - now.getTime()) / 1000),
        );
        return {
          ok: false,
          limit: args.limit,
          remaining: 0,
          retryAfterSeconds,
        } satisfies RateLimitResult;
      }

      const updated = await tx.requestRateLimitBucket.update({
        where: { key: args.key },
        data: {
          count: {
            increment: 1,
          },
        },
        select: {
          count: true,
        },
      });

      return {
        ok: true,
        limit: args.limit,
        remaining: Math.max(0, args.limit - updated.count),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.windowStart.getTime() + args.windowMs - now.getTime()) / 1000),
        ),
      } satisfies RateLimitResult;
    });
  } catch (error) {
    if (isMissingRequestRateLimitBucketTableError(error)) {
      if (!hasLoggedMissingRateLimitTable) {
        hasLoggedMissingRateLimitTable = true;
        console.error(
          "RequestRateLimitBucket table is missing. Rate limiting is temporarily disabled until the latest Prisma migrations are applied.",
          error,
        );
      }

      return buildFailOpenRateLimitResult(args);
    }

    throw error;
  }
}
