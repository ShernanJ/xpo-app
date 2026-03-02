import { randomUUID } from "crypto";
import type { OnboardingInput, OnboardingResult } from "./types";
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
}

export async function persistOnboardingRun(params: {
  input: OnboardingInput;
  result: OnboardingResult;
  userAgent: string | null;
}): Promise<OnboardingRunPersistedRecord> {
  const persistedAt = new Date().toISOString();
  const runId = `or_${randomUUID()}`;

  await prisma.onboardingRun.create({
    data: {
      id: runId,
      input: params.input as unknown as Prisma.InputJsonObject,
      result: params.result as unknown as Prisma.InputJsonObject,
      createdAt: new Date(persistedAt),
    },
  });

  return {
    runId,
    persistedAt,
  };
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
