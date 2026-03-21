import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => {
  let counter = 0;
  const jobs: Array<Record<string, unknown>> = [];

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  function applyJobUpdate(job: Record<string, unknown>, data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        const increment = Number((value as { increment: number }).increment);
        job[key] = Number(job[key] ?? 0) + increment;
        continue;
      }

      job[key] = value;
    }

    job.updatedAt = new Date();
  }

  function findUnique(args: { where: { dedupeKey?: string; id?: string } }) {
    const job =
      args.where.id !== undefined
        ? jobs.find((candidate) => candidate.id === args.where.id)
        : jobs.find((candidate) => candidate.dedupeKey === args.where.dedupeKey);

    return Promise.resolve(job ? clone(job) : null);
  }

  function update(args: { where: { id: string }; data: Record<string, unknown> }) {
    const job = jobs.find((candidate) => candidate.id === args.where.id);
    if (!job) {
      throw new Error(`Job ${args.where.id} not found`);
    }

    applyJobUpdate(job, args.data);
    return Promise.resolve(clone(job));
  }

  function create(args: { data: Record<string, unknown> }) {
    counter += 1;
    const now = new Date();
    const job = {
      id: `job_${counter}`,
      dedupeKey: args.data.dedupeKey,
      userId: args.data.userId,
      account: args.data.account,
      kind: args.data.kind,
      status: "pending",
      requestInput:
        args.data.requestInput && typeof args.data.requestInput === "object"
          ? clone(args.data.requestInput)
          : null,
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      resultPayload: null,
      completedRunId: null,
      createdAt: now,
      updatedAt: now,
    };
    jobs.push(job);
    return Promise.resolve(clone(job));
  }

  const tx = {
    onboardingScrapeJob: {
      create,
      findUnique,
      update,
    },
  };

  return {
    jobs,
    reset() {
      counter = 0;
      jobs.splice(0, jobs.length);
    },
    seed(job: Record<string, unknown>) {
      jobs.push(clone(job));
    },
    tx,
    prisma: {
      onboardingScrapeJob: {
        create,
        findUnique,
        update,
      },
      $transaction: async <T>(callback: (innerTx: typeof tx) => Promise<T>) => callback(tx),
    },
  };
});

vi.mock("@/lib/db", () => ({
  prisma: state.prisma,
}));

import { enqueueOnboardingScrapeJob } from "./onboardingScrapeJobStore";

beforeEach(() => {
  state.reset();
});

function date(value: string): Date {
  return new Date(value);
}

describe("enqueueOnboardingScrapeJob", () => {
  test("dedupes an active onboarding job for the same user and account", async () => {
    state.seed({
      id: "job_existing",
      dedupeKey: "onboarding_run:user_1:stan",
      userId: "user_1",
      account: "stan",
      kind: "onboarding_run",
      status: "pending",
      requestInput: null,
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      resultPayload: null,
      completedRunId: null,
      createdAt: date("2026-03-20T00:00:00.000Z"),
      updatedAt: date("2026-03-20T00:00:00.000Z"),
    });

    const queued = await enqueueOnboardingScrapeJob({
      kind: "onboarding_run",
      userId: "user_1",
      account: "stan",
      requestInput: { account: "stan" },
    });

    expect(queued.deduped).toBe(true);
    expect(queued.job.jobId).toBe("job_existing");
    expect(state.jobs).toHaveLength(1);
  });

  test.each(["completed", "failed"])(
    "creates a fresh job after a %s onboarding run while preserving the archived row",
    async (terminalStatus) => {
      state.seed({
        id: "job_terminal",
        dedupeKey: "onboarding_run:user_1:stan",
        userId: "user_1",
        account: "stan",
        kind: "onboarding_run",
        status: terminalStatus,
        requestInput: { account: "stan" },
        attempts: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: date("2026-03-20T00:00:00.000Z"),
        completedAt: terminalStatus === "completed" ? date("2026-03-20T00:03:00.000Z") : null,
        failedAt: terminalStatus === "failed" ? date("2026-03-20T00:03:00.000Z") : null,
        lastError: terminalStatus === "failed" ? "boom" : null,
        resultPayload: terminalStatus === "completed" ? { ok: true } : null,
        completedRunId: terminalStatus === "completed" ? "or_job_terminal" : null,
        createdAt: date("2026-03-20T00:00:00.000Z"),
        updatedAt: date("2026-03-20T00:03:00.000Z"),
      });

      const queued = await enqueueOnboardingScrapeJob({
        kind: "onboarding_run",
        userId: "user_1",
        account: "stan",
        requestInput: { account: "stan" },
      });

      expect(queued.deduped).toBe(false);
      expect(queued.job.jobId).not.toBe("job_terminal");
      expect(state.jobs).toHaveLength(2);

      const archived = state.jobs.find((job) => job.id === "job_terminal");
      const fresh = state.jobs.find((job) => job.id === queued.job.jobId);

      expect(archived?.dedupeKey).toMatch(/^onboarding_run:user_1:stan:archived:/);
      expect(archived?.status).toBe(terminalStatus);
      expect(fresh).toMatchObject({
        account: "stan",
        dedupeKey: "onboarding_run:user_1:stan",
        kind: "onboarding_run",
        status: "pending",
        userId: "user_1",
      });
    },
  );
});
