import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";
import type { FinalizedOnboardingRunPayload } from "@/lib/onboarding/pipeline/finalizeRun";
import { Prisma } from "@/lib/generated/prisma/client";

export type OnboardingScrapeJobKind =
  | "onboarding_run"
  | "profile_refresh"
  | "context_primer"
  | "historical_backfill_year";

export type OnboardingScrapeJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface StoredOnboardingScrapeJob {
  jobId: string;
  kind: OnboardingScrapeJobKind;
  userId: string;
  account: string;
  createdAt: string;
  updatedAt: string;
  status: OnboardingScrapeJobStatus;
  requestInput: Record<string, unknown> | null;
  sourceRunId: string | null;
  progressPayload: Record<string, unknown> | null;
  attempts: number;
  lastError: string | null;
  resultPayload: FinalizedOnboardingRunPayload | null;
  completedRunId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

type PrismaOnboardingScrapeJob = Awaited<
  ReturnType<typeof prisma.onboardingScrapeJob.findFirst>
>;

function getLeaseMs(): number {
  const rawSeconds = Number(process.env.ONBOARDING_SCRAPE_JOB_LEASE_SECONDS);
  if (!Number.isFinite(rawSeconds) || rawSeconds < 30) {
    return 5 * 60 * 1000;
  }

  return Math.floor(rawSeconds) * 1000;
}

function toIsoString(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toISOString();
}

function mapJob(
  job: PrismaOnboardingScrapeJob,
): StoredOnboardingScrapeJob | null {
  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    kind: job.kind,
    userId: job.userId,
    account: job.account,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    status: job.status,
    sourceRunId: job.sourceRunId ?? null,
    requestInput:
      job.requestInput &&
      typeof job.requestInput === "object" &&
      !Array.isArray(job.requestInput)
        ? (job.requestInput as Record<string, unknown>)
        : null,
    progressPayload:
      job.progressPayload &&
      typeof job.progressPayload === "object" &&
      !Array.isArray(job.progressPayload)
        ? (job.progressPayload as Record<string, unknown>)
        : null,
    attempts: job.attempts,
    lastError: job.lastError ?? null,
    resultPayload:
      job.resultPayload &&
      typeof job.resultPayload === "object" &&
      !Array.isArray(job.resultPayload)
        ? (job.resultPayload as unknown as FinalizedOnboardingRunPayload)
        : null,
    completedRunId: job.completedRunId ?? null,
    leaseOwner: job.leaseOwner ?? null,
    leaseExpiresAt: toIsoString(job.leaseExpiresAt),
    heartbeatAt: toIsoString(job.heartbeatAt),
    completedAt: toIsoString(job.completedAt),
    failedAt: toIsoString(job.failedAt),
  };
}

function buildDedupeKey(
  kind: OnboardingScrapeJobKind,
  userId: string,
  account: string,
  scope?: string | null,
): string {
  const base = `${kind}:${userId.trim()}:${account.trim().toLowerCase()}`;
  return scope?.trim() ? `${base}:${scope.trim()}` : base;
}

function buildArchivedDedupeKey(dedupeKey: string): string {
  return `${dedupeKey}:archived:${Date.now()}:${randomUUID().slice(0, 8)}`;
}

function buildWorkerId(workerId?: string): string {
  return workerId?.trim() || `onboarding-scrape-worker-${randomUUID().slice(0, 8)}`;
}

function toNullableJsonValue(value: Record<string, unknown> | null | undefined) {
  if (value === null) {
    return Prisma.JsonNull;
  }

  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonObject;
}

function toNullableProgressValue(value: Record<string, unknown> | null | undefined) {
  if (value === null) {
    return Prisma.JsonNull;
  }

  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonObject;
}

function toNullablePayloadValue(value: FinalizedOnboardingRunPayload | null | undefined) {
  if (value === null) {
    return Prisma.JsonNull;
  }

  if (value === undefined) {
    return undefined;
  }

  return value as unknown as Prisma.InputJsonObject;
}

export async function enqueueOnboardingScrapeJob(params: {
  kind: OnboardingScrapeJobKind;
  userId: string;
  account: string;
  sourceRunId?: string | null;
  requestInput?: Record<string, unknown> | null;
  progressPayload?: Record<string, unknown> | null;
  dedupeScope?: string | null;
}): Promise<{ job: StoredOnboardingScrapeJob; deduped: boolean }> {
  const normalizedAccount = params.account.trim().toLowerCase();
  const dedupeKey = buildDedupeKey(
    params.kind,
    params.userId,
    normalizedAccount,
    params.dedupeScope ?? null,
  );
  return prisma.$transaction(async (tx) => {
    const existing = await tx.onboardingScrapeJob.findUnique({
      where: { dedupeKey },
    });

    if (existing && (existing.status === "pending" || existing.status === "processing")) {
      return {
        job: mapJob(existing)!,
        deduped: true,
      };
    }

    if (existing) {
      await tx.onboardingScrapeJob.update({
        where: { id: existing.id },
        data: {
          dedupeKey: buildArchivedDedupeKey(dedupeKey),
        },
      });
    }

    const nextJob = await tx.onboardingScrapeJob.create({
      data: {
        dedupeKey,
        userId: params.userId,
        account: normalizedAccount,
        kind: params.kind,
        sourceRunId: params.sourceRunId ?? null,
        requestInput: toNullableJsonValue(params.requestInput ?? null),
        progressPayload: toNullableProgressValue(params.progressPayload ?? null),
      },
    });

    return {
      job: mapJob(nextJob)!,
      deduped: false,
    };
  });
}

export async function claimOnboardingScrapeJobById(args: {
  jobId: string;
  kind?: OnboardingScrapeJobKind;
  workerId?: string;
}): Promise<StoredOnboardingScrapeJob | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + getLeaseMs());
  const workerId = buildWorkerId(args.workerId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.onboardingScrapeJob.findUnique({
      where: { id: args.jobId },
    });

    if (!existing || (args.kind && existing.kind !== args.kind)) {
      return null;
    }

    const canClaim =
      existing.status === "pending" ||
      (existing.status === "processing" &&
        (existing.leaseOwner === workerId ||
          !existing.leaseExpiresAt ||
          existing.leaseExpiresAt <= now));

    if (!canClaim) {
      return mapJob(existing);
    }

    const claimed = await tx.onboardingScrapeJob.update({
      where: { id: existing.id },
      data: {
        status: "processing",
        attempts:
          existing.status === "processing" && existing.leaseOwner === workerId
            ? existing.attempts
            : { increment: 1 },
        leaseOwner: workerId,
        leaseExpiresAt,
        heartbeatAt: now,
        startedAt: existing.startedAt ?? now,
        failedAt: null,
        lastError: null,
      },
    });

    return mapJob(claimed);
  });
}

export async function claimNextOnboardingScrapeJob(args?: {
  kinds?: OnboardingScrapeJobKind[];
  workerId?: string;
}): Promise<StoredOnboardingScrapeJob | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + getLeaseMs());
  const workerId = buildWorkerId(args?.workerId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.onboardingScrapeJob.findFirst({
      where: {
        ...(args?.kinds?.length ? { kind: { in: args.kinds } } : {}),
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

    const updateResult = await prisma.onboardingScrapeJob.updateMany({
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

    const claimed = await prisma.onboardingScrapeJob.findUnique({
      where: { id: candidate.id },
    });
    return mapJob(claimed);
  }

  return null;
}

export async function heartbeatOnboardingScrapeJob(args: {
  jobId: string;
  workerId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.onboardingScrapeJob.updateMany({
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

export async function markOnboardingScrapeJobCompleted(args: {
  jobId: string;
  resultPayload?: FinalizedOnboardingRunPayload | null;
  completedRunId?: string | null;
  progressPayload?: Record<string, unknown> | null;
  workerId?: string | null;
}): Promise<StoredOnboardingScrapeJob | null> {
  const now = new Date();
  const updated = await prisma.onboardingScrapeJob.updateMany({
    where: {
      id: args.jobId,
      ...(args.workerId ? { leaseOwner: args.workerId } : {}),
    },
    data: {
      status: "completed",
      completedAt: now,
      failedAt: null,
      heartbeatAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      resultPayload: toNullablePayloadValue(args.resultPayload ?? null),
      completedRunId: args.completedRunId ?? null,
      progressPayload: toNullableProgressValue(args.progressPayload ?? undefined),
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return mapJob(
    await prisma.onboardingScrapeJob.findUnique({
      where: { id: args.jobId },
    }),
  );
}

export async function markOnboardingScrapeJobFailed(args: {
  jobId: string;
  error: string;
  progressPayload?: Record<string, unknown> | null;
  workerId?: string | null;
}): Promise<StoredOnboardingScrapeJob | null> {
  const now = new Date();
  const updated = await prisma.onboardingScrapeJob.updateMany({
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
      progressPayload: toNullableProgressValue(args.progressPayload ?? undefined),
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return mapJob(
    await prisma.onboardingScrapeJob.findUnique({
      where: { id: args.jobId },
    }),
  );
}

export async function readOnboardingScrapeJobById(
  jobId: string,
): Promise<StoredOnboardingScrapeJob | null> {
  return mapJob(
    await prisma.onboardingScrapeJob.findUnique({
      where: { id: jobId },
    }),
  );
}

export async function readOnboardingScrapeJobByIdForUser(args: {
  jobId: string;
  userId: string;
}): Promise<StoredOnboardingScrapeJob | null> {
  return mapJob(
    await prisma.onboardingScrapeJob.findFirst({
      where: {
        id: args.jobId,
        userId: args.userId,
      },
    }),
  );
}

export async function updateOnboardingScrapeJobProgress(args: {
  jobId: string;
  progressPayload: Record<string, unknown> | null;
  workerId?: string | null;
}): Promise<StoredOnboardingScrapeJob | null> {
  const updated = await prisma.onboardingScrapeJob.updateMany({
    where: {
      id: args.jobId,
      ...(args.workerId ? { leaseOwner: args.workerId } : {}),
    },
    data: {
      progressPayload: toNullableProgressValue(args.progressPayload),
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return mapJob(
    await prisma.onboardingScrapeJob.findUnique({
      where: { id: args.jobId },
    }),
  );
}

export async function readLatestActiveOnboardingSyncJobForUser(args: {
  userId: string;
  account: string;
}): Promise<StoredOnboardingScrapeJob | null> {
  return mapJob(
    await prisma.onboardingScrapeJob.findFirst({
      where: {
        userId: args.userId,
        account: args.account.trim().toLowerCase(),
        kind: {
          in: ["context_primer", "historical_backfill_year"],
        },
        status: {
          in: ["pending", "processing"],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
  );
}
