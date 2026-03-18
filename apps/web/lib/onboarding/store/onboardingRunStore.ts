import { randomUUID } from "crypto";
import type { OnboardingInput, OnboardingResult, XPublicPost } from "../types";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { checkNewTweetsAgainstDrafts } from "../../content/autoPublishMatcher";

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
  const upsertOps = postsToUpsert.map(({ post, lane }) =>
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

  await prisma.$transaction(upsertOps);

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
  result: OnboardingResult;
  userAgent: string | null;
  userId: string;
}): Promise<OnboardingRunPersistedRecord> {
  const persistedAt = new Date().toISOString();
  const runId = `or_${randomUUID()}`;

  await prisma.onboardingRun.create({
    data: {
      id: runId,
      userId: params.userId,
      input: params.input as unknown as Prisma.InputJsonObject,
      result: params.result as unknown as Prisma.InputJsonObject,
      createdAt: new Date(persistedAt),
    },
  });

  return {
    runId,
    persistedAt,
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
    const runs = await prisma.onboardingRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const match = runs.find((r) => {
      const input = r.input as { account?: string } | null;
      return input?.account?.toLowerCase() === handle.toLowerCase();
    });

    if (!match) return null;

    return {
      runId: match.id,
      persistedAt: match.createdAt.toISOString(),
      userId: match.userId,
      input: match.input as unknown as OnboardingInput,
      result: match.result as unknown as OnboardingResult,
      metadata: { userAgent: null },
    };
  } catch (error) {
    console.error(`Failed to read latest run for user ${userId} handle ${handle}`, error);
    return null;
  }
}
