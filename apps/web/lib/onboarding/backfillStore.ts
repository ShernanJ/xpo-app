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
  activeJobCount: number;
  oldestPendingAgeMinutes: number | null;
  recentFailureCount: number;
  hasStalledQueue: boolean;
}

const TERMINAL_BACKFILL_JOB_STATUSES: ReadonlySet<OnboardingBackfillJobStatus> =
  new Set(["completed", "failed"]);

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

function getBackfillRetentionMs(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_RETENTION_HOURS);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1000 * 60 * 60 * 72;
  }

  return Math.floor(raw) * 60 * 60 * 1000;
}

function getMaxTerminalBackfillJobs(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_MAX_TERMINAL_JOBS);
  if (!Number.isFinite(raw) || raw < 1) {
    return 200;
  }

  return Math.floor(raw);
}

function getBackfillFailureWindowMs(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_FAILURE_WINDOW_HOURS);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1000 * 60 * 60 * 24;
  }

  return Math.floor(raw) * 60 * 60 * 1000;
}

function getStalledPendingThresholdMs(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_STALLED_PENDING_MINUTES);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1000 * 60 * 15;
  }

  return Math.floor(raw) * 60 * 1000;
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneBackfillJobs(
  jobs: StoredOnboardingBackfillJob[],
): StoredOnboardingBackfillJob[] {
  const now = Date.now();
  const retentionMs = getBackfillRetentionMs();
  const maxTerminalJobs = getMaxTerminalBackfillJobs();

  const keepTerminalJobIds = new Set(
    jobs
      .filter((job) => TERMINAL_BACKFILL_JOB_STATUSES.has(job.status))
      .filter((job) => now - toTimestamp(job.updatedAt) <= retentionMs)
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
      .slice(0, maxTerminalJobs)
      .map((job) => job.jobId),
  );

  return jobs.filter(
    (job) =>
      !TERMINAL_BACKFILL_JOB_STATUSES.has(job.status) ||
      keepTerminalJobIds.has(job.jobId),
  );
}

async function writeAllBackfillJobs(
  jobs: StoredOnboardingBackfillJob[],
): Promise<void> {
  const storePath = await resolveBackfillStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(pruneBackfillJobs(jobs), null, 2), "utf8");
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
  const now = Date.now();
  const failureWindowMs = getBackfillFailureWindowMs();
  const stalledPendingThresholdMs = getStalledPendingThresholdMs();

  const oldestPendingAgeMinutes = jobs
    .filter((job) => job.status === "pending")
    .map((job) => now - toTimestamp(job.createdAt))
    .filter((ageMs) => ageMs >= 0)
    .sort((left, right) => right - left)[0];

  const summary = jobs.reduce<OnboardingBackfillJobSummary>(
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
      activeJobCount: 0,
      oldestPendingAgeMinutes: null,
      recentFailureCount: 0,
      hasStalledQueue: false,
    },
  );

  summary.activeJobCount = summary.processing;
  summary.oldestPendingAgeMinutes =
    oldestPendingAgeMinutes !== undefined
      ? Math.floor(oldestPendingAgeMinutes / (1000 * 60))
      : null;
  summary.recentFailureCount = jobs.filter(
    (job) =>
      job.status === "failed" && now - toTimestamp(job.updatedAt) <= failureWindowMs,
  ).length;
  summary.hasStalledQueue =
    oldestPendingAgeMinutes !== undefined &&
    oldestPendingAgeMinutes >= stalledPendingThresholdMs;

  return summary;
}

export async function readOnboardingBackfillJobById(
  jobId: string,
): Promise<StoredOnboardingBackfillJob | null> {
  const jobs = await readAllBackfillJobs();
  return jobs.find((job) => job.jobId === jobId) ?? null;
}
