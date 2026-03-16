import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";
import type { OnboardingBackfillJobStatus as PrismaBackfillJobStatus } from "@/lib/generated/prisma/client";

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
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
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

type PrismaBackfillJob = Awaited<
  ReturnType<typeof prisma.onboardingBackfillJob.findFirst>
>;

function getLeaseMs(): number {
  const rawSeconds = Number(process.env.ONBOARDING_BACKFILL_LEASE_SECONDS);
  if (!Number.isFinite(rawSeconds) || rawSeconds < 30) {
    return 5 * 60 * 1000;
  }

  return Math.floor(rawSeconds) * 1000;
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

function toIsoString(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toISOString();
}

function toTimestamp(value: Date | null | undefined): number {
  if (!value) {
    return 0;
  }

  return value.getTime();
}

function mapBackfillJob(
  job: PrismaBackfillJob,
): StoredOnboardingBackfillJob | null {
  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    status: job.status,
    account: job.account,
    sourceRunId: job.sourceRunId,
    targetPostCount: job.targetPostCount,
    attempts: job.attempts,
    lastError: job.lastError ?? null,
    lastCaptureId: job.lastCaptureId ?? null,
    completedAt: toIsoString(job.completedAt),
    leaseOwner: job.leaseOwner ?? null,
    leaseExpiresAt: toIsoString(job.leaseExpiresAt),
    heartbeatAt: toIsoString(job.heartbeatAt),
  };
}

function buildDedupeKey(account: string, sourceRunId: string): string {
  return `${account.trim().toLowerCase()}:${sourceRunId.trim()}`;
}

function buildWorkerId(workerId?: string): string {
  return workerId?.trim() || `backfill-worker-${randomUUID().slice(0, 8)}`;
}

export async function enqueueOnboardingBackfillJob(params: {
  account: string;
  sourceRunId: string;
  targetPostCount: number;
}): Promise<{ job: StoredOnboardingBackfillJob; deduped: boolean }> {
  const normalizedAccount = params.account.trim().toLowerCase();
  const dedupeKey = buildDedupeKey(normalizedAccount, params.sourceRunId);
  const existing = await prisma.onboardingBackfillJob.findUnique({
    where: { dedupeKey },
  });

  if (existing && (existing.status === "pending" || existing.status === "processing")) {
    return {
      job: mapBackfillJob(existing)!,
      deduped: true,
    };
  }

  const nextJob = existing
    ? await prisma.onboardingBackfillJob.update({
        where: { dedupeKey },
        data: {
          account: normalizedAccount,
          sourceRunId: params.sourceRunId,
          targetPostCount: params.targetPostCount,
          status: "pending",
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          lastError: null,
          lastCaptureId: null,
        },
      })
    : await prisma.onboardingBackfillJob.create({
        data: {
          dedupeKey,
          account: normalizedAccount,
          sourceRunId: params.sourceRunId,
          targetPostCount: params.targetPostCount,
        },
      });

  return {
    job: mapBackfillJob(nextJob)!,
    deduped: false,
  };
}

export async function claimNextOnboardingBackfillJob(args?: {
  workerId?: string;
}): Promise<StoredOnboardingBackfillJob | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + getLeaseMs());
  const workerId = buildWorkerId(args?.workerId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.onboardingBackfillJob.findFirst({
      where: {
        OR: [
          { status: "pending" },
          {
            status: "processing",
            leaseExpiresAt: {
              lte: now,
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { updatedAt: "asc" }],
      select: {
        id: true,
      },
    });

    if (!candidate?.id) {
      return null;
    }

    const updateResult = await prisma.onboardingBackfillJob.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "pending" },
          {
            status: "processing",
            leaseExpiresAt: {
              lte: now,
            },
          },
        ],
      },
      data: {
        status: "processing",
        attempts: {
          increment: 1,
        },
        leaseOwner: workerId,
        leaseExpiresAt,
        heartbeatAt: now,
        startedAt: now,
        lastError: null,
      },
    });

    if (updateResult.count === 0) {
      continue;
    }

    const claimed = await prisma.onboardingBackfillJob.findUnique({
      where: { id: candidate.id },
    });
    return mapBackfillJob(claimed);
  }

  return null;
}

export async function heartbeatOnboardingBackfillJob(args: {
  jobId: string;
  workerId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.onboardingBackfillJob.updateMany({
    where: {
      id: args.jobId,
      status: "processing",
      leaseOwner: args.workerId,
    },
    data: {
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + getLeaseMs()),
    },
  });
}

export async function markOnboardingBackfillJobCompleted(args: {
  jobId: string;
  captureId: string | null;
  workerId?: string | null;
}): Promise<StoredOnboardingBackfillJob | null> {
  const now = new Date();
  const updated = await prisma.onboardingBackfillJob.updateMany({
    where: {
      id: args.jobId,
      ...(args.workerId ? { leaseOwner: args.workerId } : {}),
    },
    data: {
      status: "completed",
      completedAt: now,
      heartbeatAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastCaptureId: args.captureId,
      lastError: null,
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return mapBackfillJob(
    await prisma.onboardingBackfillJob.findUnique({
      where: { id: args.jobId },
    }),
  );
}

export async function markOnboardingBackfillJobFailed(args: {
  jobId: string;
  error: string;
  workerId?: string | null;
}): Promise<StoredOnboardingBackfillJob | null> {
  const now = new Date();
  const updated = await prisma.onboardingBackfillJob.updateMany({
    where: {
      id: args.jobId,
      ...(args.workerId ? { leaseOwner: args.workerId } : {}),
    },
    data: {
      status: "failed",
      failedAt: now,
      heartbeatAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: args.error,
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return mapBackfillJob(
    await prisma.onboardingBackfillJob.findUnique({
      where: { id: args.jobId },
    }),
  );
}

export async function readRecentOnboardingBackfillJobs(
  limit = 10,
): Promise<StoredOnboardingBackfillJob[]> {
  const jobs = await prisma.onboardingBackfillJob.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(100, limit)),
  });

  return jobs.map((job) => mapBackfillJob(job)!).filter(Boolean);
}

export async function readOnboardingBackfillJobSummary(): Promise<OnboardingBackfillJobSummary> {
  const [jobs, counts] = await Promise.all([
    prisma.onboardingBackfillJob.findMany({
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.onboardingBackfillJob.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
  ]);

  const countByStatus = new Map<PrismaBackfillJobStatus, number>(
    counts.map((entry) => [entry.status, entry._count._all]),
  );
  const now = Date.now();
  const failureWindowMs = getBackfillFailureWindowMs();
  const stalledPendingThresholdMs = getStalledPendingThresholdMs();

  const oldestPendingAgeMs = jobs
    .filter((job) => job.status === "pending")
    .map((job) => now - toTimestamp(job.createdAt))
    .filter((ageMs) => ageMs >= 0)
    .sort((left, right) => right - left)[0];

  return {
    total: jobs.length,
    pending: countByStatus.get("pending") ?? 0,
    processing: countByStatus.get("processing") ?? 0,
    completed: countByStatus.get("completed") ?? 0,
    failed: countByStatus.get("failed") ?? 0,
    activeJobCount: countByStatus.get("processing") ?? 0,
    oldestPendingAgeMinutes:
      oldestPendingAgeMs !== undefined
        ? Math.floor(oldestPendingAgeMs / (1000 * 60))
        : null,
    recentFailureCount: jobs.filter(
      (job) =>
        job.status === "failed" &&
        now - toTimestamp(job.updatedAt) <= failureWindowMs,
    ).length,
    hasStalledQueue:
      oldestPendingAgeMs !== undefined &&
      oldestPendingAgeMs >= stalledPendingThresholdMs,
  };
}

export async function readOnboardingBackfillJobById(
  jobId: string,
): Promise<StoredOnboardingBackfillJob | null> {
  return mapBackfillJob(
    await prisma.onboardingBackfillJob.findUnique({
      where: { id: jobId },
    }),
  );
}
