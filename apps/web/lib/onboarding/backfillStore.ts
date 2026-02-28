import { randomUUID } from "crypto";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type OnboardingBackfillJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface StoredOnboardingBackfillJob {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  status: OnboardingBackfillJobStatus;
  account: string;
  sourceRunId: string;
  targetPostCount: number;
  attempts: number;
  lastError: string | null;
  lastCaptureId: string | null;
  completedAt: string | null;
}

export interface OnboardingBackfillJobSummary {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

function candidateBackfillStorePaths(): string[] {
  if (process.env.ONBOARDING_BACKFILL_STORE_PATH) {
    return [process.env.ONBOARDING_BACKFILL_STORE_PATH];
  }

  const cwd = process.cwd();
  return [
    path.resolve(cwd, "db", "onboarding-backfill-jobs.json"),
    path.resolve(cwd, "..", "..", "db", "onboarding-backfill-jobs.json"),
  ];
}

async function resolveBackfillStorePath(): Promise<string> {
  const candidates = candidateBackfillStorePaths();
  for (const candidate of candidates) {
    try {
      await access(path.dirname(candidate));
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return candidates[0];
}

async function readAllBackfillJobs(): Promise<StoredOnboardingBackfillJob[]> {
  const storePath = await resolveBackfillStorePath();

  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoredOnboardingBackfillJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllBackfillJobs(
  jobs: StoredOnboardingBackfillJob[],
): Promise<void> {
  const storePath = await resolveBackfillStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(jobs, null, 2), "utf8");
}

export async function enqueueOnboardingBackfillJob(params: {
  account: string;
  sourceRunId: string;
  targetPostCount: number;
}): Promise<{ job: StoredOnboardingBackfillJob; deduped: boolean }> {
  const jobs = await readAllBackfillJobs();
  const normalizedAccount = params.account.toLowerCase();

  const existing = jobs.find(
    (job) =>
      job.account === normalizedAccount &&
      (job.status === "pending" || job.status === "processing"),
  );

  if (existing) {
    return { job: existing, deduped: true };
  }

  const now = new Date().toISOString();
  const job: StoredOnboardingBackfillJob = {
    jobId: `bf_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    account: normalizedAccount,
    sourceRunId: params.sourceRunId,
    targetPostCount: params.targetPostCount,
    attempts: 0,
    lastError: null,
    lastCaptureId: null,
    completedAt: null,
  };

  jobs.push(job);
  await writeAllBackfillJobs(jobs);

  return { job, deduped: false };
}

export async function claimNextOnboardingBackfillJob(): Promise<StoredOnboardingBackfillJob | null> {
  const jobs = await readAllBackfillJobs();
  const nextIndex = jobs.findIndex((job) => job.status === "pending");

  if (nextIndex < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const claimed: StoredOnboardingBackfillJob = {
    ...jobs[nextIndex],
    status: "processing",
    updatedAt: now,
    attempts: jobs[nextIndex].attempts + 1,
    lastError: null,
  };

  jobs[nextIndex] = claimed;
  await writeAllBackfillJobs(jobs);
  return claimed;
}

export async function markOnboardingBackfillJobCompleted(params: {
  jobId: string;
  captureId: string | null;
}): Promise<StoredOnboardingBackfillJob | null> {
  const jobs = await readAllBackfillJobs();
  const index = jobs.findIndex((job) => job.jobId === params.jobId);

  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: StoredOnboardingBackfillJob = {
    ...jobs[index],
    status: "completed",
    updatedAt: now,
    completedAt: now,
    lastCaptureId: params.captureId,
    lastError: null,
  };

  jobs[index] = updated;
  await writeAllBackfillJobs(jobs);
  return updated;
}

export async function markOnboardingBackfillJobFailed(params: {
  jobId: string;
  error: string;
}): Promise<StoredOnboardingBackfillJob | null> {
  const jobs = await readAllBackfillJobs();
  const index = jobs.findIndex((job) => job.jobId === params.jobId);

  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: StoredOnboardingBackfillJob = {
    ...jobs[index],
    status: "failed",
    updatedAt: now,
    lastError: params.error,
  };

  jobs[index] = updated;
  await writeAllBackfillJobs(jobs);
  return updated;
}

export async function readRecentOnboardingBackfillJobs(
  limit = 10,
): Promise<StoredOnboardingBackfillJob[]> {
  const jobs = await readAllBackfillJobs();
  return jobs.slice(-Math.max(1, limit)).reverse();
}

export async function readOnboardingBackfillJobSummary(): Promise<OnboardingBackfillJobSummary> {
  const jobs = await readAllBackfillJobs();

  return jobs.reduce<OnboardingBackfillJobSummary>(
    (summary, job) => {
      summary.total += 1;
      summary[job.status] += 1;
      return summary;
    },
    {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    },
  );
}
