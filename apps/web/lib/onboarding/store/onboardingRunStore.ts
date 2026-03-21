import { randomUUID } from "crypto";
import type { OnboardingInput, OnboardingResult, XPublicPost } from "../types";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { checkNewTweetsAgainstDrafts } from "../../content/autoPublishMatcher";

const LATEST_ONBOARDING_RUN_CACHE_TTL_MS = 15_000;
const POST_SYNC_BATCH_SIZE = 100;

type LatestOnboardingRunCacheEntry = {
  expiresAt: number;
  value: StoredOnboardingRun | null;
};

const latestOnboardingRunByHandleCache = new Map<string, LatestOnboardingRunCacheEntry>();

function normalizeOnboardingAccountHandle(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

function buildLatestOnboardingRunCacheKey(userId: string, handle: string): string {
  return `${userId}:${normalizeOnboardingAccountHandle(handle) ?? ""}`;
}

function readCachedLatestOnboardingRun(
  userId: string,
  handle: string,
): StoredOnboardingRun | null | undefined {
  const cacheKey = buildLatestOnboardingRunCacheKey(userId, handle);
  const cached = latestOnboardingRunByHandleCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    latestOnboardingRunByHandleCache.delete(cacheKey);
    return undefined;
  }

  return cached.value;
}

function writeCachedLatestOnboardingRun(
  userId: string,
  handle: string,
  value: StoredOnboardingRun | null,
) {
  latestOnboardingRunByHandleCache.set(buildLatestOnboardingRunCacheKey(userId, handle), {
    expiresAt: Date.now() + LATEST_ONBOARDING_RUN_CACHE_TTL_MS,
    value,
  });
}

function invalidateLatestOnboardingRunCache(userId: string, handle: string | null | undefined) {
  const normalizedHandle = normalizeOnboardingAccountHandle(handle);
  if (!normalizedHandle) {
    return;
  }

  latestOnboardingRunByHandleCache.delete(buildLatestOnboardingRunCacheKey(userId, normalizedHandle));
}

export interface StoredOnboardingRun {
  runId: string;
  persistedAt: string;
  userId: string | null;
  input: OnboardingInput;
  result: OnboardingResult;
  metadata: {
    userAgent: string | null;
  };
}

export interface OnboardingRunPersistedRecord {
  runId: string;
  persistedAt: string;
  userId: string;
}

function buildUpsertablePosts(args: {
  posts: XPublicPost[];
  replyPosts?: XPublicPost[];
  quotePosts?: XPublicPost[];
}): Array<{ post: XPublicPost; lane: "original" | "reply" | "quote" }> {
  const postsById = new Map<string, { post: XPublicPost; lane: "original" | "reply" | "quote" }>();

  for (const post of args.posts) {
    if (!postsById.has(post.id)) {
      postsById.set(post.id, { post, lane: "original" });
    }
  }

  for (const post of args.replyPosts ?? []) {
    if (!postsById.has(post.id)) {
      postsById.set(post.id, { post, lane: "reply" });
    }
  }

  for (const post of args.quotePosts ?? []) {
    if (!postsById.has(post.id)) {
      postsById.set(post.id, { post, lane: "quote" });
    }
  }

  return Array.from(postsById.values());
}

export async function syncPostsToDb(params: {
  userId: string;
  xHandle: string;
  posts: XPublicPost[];
  replyPosts?: XPublicPost[];
  quotePosts?: XPublicPost[];
}): Promise<void> {
  const postsToUpsert = buildUpsertablePosts({
    posts: params.posts,
    replyPosts: params.replyPosts,
    quotePosts: params.quotePosts,
  });

  if (postsToUpsert.length === 0) return;

  const normalizedXHandle = params.xHandle.replace(/^@/, "").toLowerCase();
  for (let index = 0; index < postsToUpsert.length; index += POST_SYNC_BATCH_SIZE) {
    const batchOps = postsToUpsert
      .slice(index, index + POST_SYNC_BATCH_SIZE)
      .map(({ post, lane }) =>
        prisma.post.upsert({
          where: { id: post.id },
          update: {
            userId: params.userId,
            xHandle: normalizedXHandle,
            lane,
            metrics: post.metrics as unknown as Prisma.InputJsonObject,
          },
          create: {
            id: post.id,
            userId: params.userId,
            xHandle: normalizedXHandle,
            text: post.text,
            lane,
            metrics: post.metrics as unknown as Prisma.InputJsonObject,
            createdAt: new Date(post.createdAt),
          },
        }),
      );

    await prisma.$transaction(batchOps);
  }

  const newlyObservedOriginalPosts = postsToUpsert
    .filter((entry) => entry.lane === "original")
    .map((entry) => entry.post);
  if (newlyObservedOriginalPosts.length > 0) {
    await checkNewTweetsAgainstDrafts({
      userId: params.userId,
      activeXHandle: normalizedXHandle,
      newTweets: newlyObservedOriginalPosts,
    }).catch((error) =>
      console.error("Failed to detect auto-published drafts after post sync:", error),
    );
  }
}

export async function persistOnboardingRun(params: {
  input: OnboardingInput;
  runId?: string;
  result: OnboardingResult;
  userAgent: string | null;
  userId: string;
}): Promise<OnboardingRunPersistedRecord> {
  const runId = params.runId?.trim() || `or_${randomUUID()}`;
  const createdAt = new Date();
  const persisted = await prisma.onboardingRun.upsert({
    where: { id: runId },
    create: {
      id: runId,
      userId: params.userId,
      input: params.input as unknown as Prisma.InputJsonObject,
      result: params.result as unknown as Prisma.InputJsonObject,
      createdAt,
    },
    update: {
      userId: params.userId,
      input: params.input as unknown as Prisma.InputJsonObject,
      result: params.result as unknown as Prisma.InputJsonObject,
    },
  });

  invalidateLatestOnboardingRunCache(params.userId, params.input.account);

  return {
    runId,
    persistedAt: persisted.createdAt.toISOString(),
    userId: params.userId,
  };
}

/**
 * Upserts scraped posts from an OnboardingResult into the Prisma Post table.
 * This ensures the retrieval and style profiling queries can find user posts.
 */
export async function syncOnboardingPostsToDb(
  userId: string,
  xHandle: string,
  result: OnboardingResult,
): Promise<void> {
  await syncPostsToDb({
    userId,
    xHandle,
    posts: result.recentPosts ?? [],
    replyPosts: result.recentReplyPosts ?? [],
    quotePosts: result.recentQuotePosts ?? [],
  });
}

export async function readRecentOnboardingRuns(
  limit = 10,
): Promise<StoredOnboardingRun[]> {
  try {
    const runs = await prisma.onboardingRun.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.max(1, limit),
    });

    return runs.map((run) => ({
      runId: run.id,
      persistedAt: run.createdAt.toISOString(),
      userId: run.userId,
      input: run.input as unknown as OnboardingInput,
      result: run.result as unknown as OnboardingResult,
      metadata: {
        userAgent: null,
      },
    }));
  } catch (error) {
    console.error("Failed to read recent onboarding runs", error);
    return [];
  }
}

export async function readOnboardingRunById(
  runId: string,
): Promise<StoredOnboardingRun | null> {
  try {
    const run = await prisma.onboardingRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return null;
    }

    return {
      runId: run.id,
      persistedAt: run.createdAt.toISOString(),
      userId: run.userId,
      input: run.input as unknown as OnboardingInput,
      result: run.result as unknown as OnboardingResult,
      metadata: {
        userAgent: null,
      },
    };
  } catch (error) {
    console.error(`Failed to read onboarding run ${runId}`, error);
    return null;
  }
}

export async function readLatestOnboardingRunByHandle(
  userId: string,
  handle: string,
): Promise<StoredOnboardingRun | null> {
  try {
    const cached = readCachedLatestOnboardingRun(userId, handle);
    if (cached !== undefined) {
      return cached;
    }

    const normalizedHandle = normalizeOnboardingAccountHandle(handle);
    if (!normalizedHandle) {
      return null;
    }

    const runs = await prisma.onboardingRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        input: true,
        result: true,
      },
    });

    const match = runs.find((r) => {
      const input = r.input as { account?: string } | null;
      return normalizeOnboardingAccountHandle(input?.account) === normalizedHandle;
    });

    if (!match) {
      writeCachedLatestOnboardingRun(userId, normalizedHandle, null);
      return null;
    }

    const nextValue = {
      runId: match.id,
      persistedAt: match.createdAt.toISOString(),
      userId: match.userId,
      input: match.input as unknown as OnboardingInput,
      result: match.result as unknown as OnboardingResult,
      metadata: { userAgent: null },
    };
    writeCachedLatestOnboardingRun(userId, normalizedHandle, nextValue);
    return nextValue;
  } catch (error) {
    console.error(`Failed to read latest run for user ${userId} handle ${handle}`, error);
    return null;
  }
}
