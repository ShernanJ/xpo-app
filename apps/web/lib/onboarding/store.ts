import { randomUUID } from "crypto";
import type { OnboardingInput, OnboardingResult, XPublicPost } from "./types";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db";

export interface StoredOnboardingRun {
  runId: string;
  persistedAt: string;
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
 * Upserts a User record by X handle. Returns the userId.
 * If the user already exists (same handle), returns their existing id.
 */
export async function upsertUserByHandle(handle: string): Promise<string> {
  const normalized = handle.replace(/^@/, "").toLowerCase();

  const existing = await prisma.user.findUnique({ where: { handle: normalized } });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: { handle: normalized },
  });
  return created.id;
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
  const postsToUpsert: XPublicPost[] = [
    ...(result.recentPosts ?? []),
    ...(result.recentReplyPosts ?? []),
    ...(result.recentQuotePosts ?? []),
  ];

  if (postsToUpsert.length === 0) return;

  const normalizedXHandle = xHandle.replace(/^@/, "").toLowerCase();
  let lane: "original" | "reply" | "quote" = "original";
  const upsertOps = postsToUpsert.map((post) => {
    if (result.recentReplyPosts?.some((r) => r.id === post.id)) lane = "reply";
    else if (result.recentQuotePosts?.some((r) => r.id === post.id)) lane = "quote";
    else lane = "original";

    return prisma.post.upsert({
      where: { id: post.id },
      update: { userId, xHandle: normalizedXHandle, metrics: post.metrics as unknown as Prisma.InputJsonObject },
      create: {
        id: post.id,
        userId,
        xHandle: normalizedXHandle,
        text: post.text,
        lane,
        metrics: post.metrics as unknown as Prisma.InputJsonObject,
        createdAt: new Date(post.createdAt),
      },
    });
  });

  await prisma.$transaction(upsertOps);
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
