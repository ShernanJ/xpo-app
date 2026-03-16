import { prisma } from "@/lib/db";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - args.windowMs);

  return prisma.$transaction(async (tx) => {
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
}
