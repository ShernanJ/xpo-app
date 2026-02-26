import { randomUUID } from "crypto";
import { access, appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

import type { OnboardingInput, OnboardingResult } from "./types";

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

function candidateStoreFilePaths(): string[] {
  if (process.env.ONBOARDING_STORE_PATH) {
    return [process.env.ONBOARDING_STORE_PATH];
  }

  const cwd = process.cwd();
  return [
    path.resolve(cwd, "db", "onboarding-runs.jsonl"),
    path.resolve(cwd, "..", "..", "db", "onboarding-runs.jsonl"),
  ];
}

async function resolveStoreFilePath(): Promise<string> {
  const candidates = candidateStoreFilePaths();
  for (const candidate of candidates) {
    try {
      await access(path.dirname(candidate));
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return candidates[0];
}

export async function persistOnboardingRun(params: {
  input: OnboardingInput;
  result: OnboardingResult;
  userAgent: string | null;
}): Promise<OnboardingRunPersistedRecord> {
  const storePath = await resolveStoreFilePath();
  await mkdir(path.dirname(storePath), { recursive: true });

  const persistedAt = new Date().toISOString();
  const runId = `or_${randomUUID()}`;
  const record: StoredOnboardingRun = {
    runId,
    persistedAt,
    input: params.input,
    result: params.result,
    metadata: {
      userAgent: params.userAgent,
    },
  };

  await appendFile(storePath, `${JSON.stringify(record)}\n`, "utf8");

  return {
    runId,
    persistedAt,
  };
}

export async function readRecentOnboardingRuns(
  limit = 10,
): Promise<StoredOnboardingRun[]> {
  const storePath = await resolveStoreFilePath();

  try {
    const runs = (await readFile(storePath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredOnboardingRun);

    return runs
      .slice(-Math.max(1, limit))
      .reverse()
      .map((run) => run);
  } catch {
    return [];
  }
}

export async function readOnboardingRunById(
  runId: string,
): Promise<StoredOnboardingRun | null> {
  const storePath = await resolveStoreFilePath();

  try {
    const runs = (await readFile(storePath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredOnboardingRun);

    for (let index = runs.length - 1; index >= 0; index -= 1) {
      if (runs[index]?.runId === runId) {
        return runs[index];
      }
    }

    return null;
  } catch {
    return null;
  }
}
