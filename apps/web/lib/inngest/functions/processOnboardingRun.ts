import { NonRetriableError, type GetFunctionInput, type GetStepTools } from "inngest";

import { capturePostHogServerEvent, capturePostHogServerException } from "@/lib/posthog/server";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { finalizeOnboardingRunForUser } from "@/lib/onboarding/pipeline/finalizeRun";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import { bootstrapScrapeCaptureWithOptions } from "@/lib/onboarding/sources/scrapeBootstrap";
import {
  getConfiguredOnboardingMode,
} from "@/lib/onboarding/sources/resolveOnboardingSource";
import { hasXApiSourceCredentials } from "@/lib/onboarding/sources/xApiSource";
import {
  claimOnboardingScrapeJobById,
  markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed,
  type StoredOnboardingScrapeJob,
} from "@/lib/onboarding/store/onboardingScrapeJobStore";

import { inngest, type OnboardingRunRequestedEventData } from "../client";

type ProcessOnboardingRunContext = Omit<GetFunctionInput<typeof inngest>, "event"> & {
  event: {
    data: OnboardingRunRequestedEventData;
  };
  step: GetStepTools<typeof inngest>;
};

interface ShallowSyncPreparationResult {
  attempted: boolean;
  nextCursor: string | null;
  usedExistingCapture: boolean;
}

export function buildQueuedOnboardingRunId(jobId: string): string {
  return jobId.startsWith("or_") ? jobId : `or_${jobId}`;
}

function shouldAttemptShallowSync(input: ReturnType<typeof getClaimedInput>): boolean {
  if (input.forceMock || input.scrapeFreshness === "cache_only") {
    return false;
  }

  const mode = getConfiguredOnboardingMode();
  return mode !== "mock" && mode !== "x_api";
}

function getClaimedInput(
  job: StoredOnboardingScrapeJob,
  fallbackInput: Record<string, unknown>,
) {
  const parsed = parseOnboardingInput(job.requestInput ?? fallbackInput);
  if (!parsed.ok) {
    throw new NonRetriableError(parsed.errors.map((error) => error.message).join(" "));
  }

  return parsed.data;
}

export async function processOnboardingRunHandler({
  attempt,
  event,
  maxAttempts,
  runId,
  step,
}: ProcessOnboardingRunContext) {
  const { effectiveInput, jobId, userId, userAgent } = event.data;
  const isFinalAttempt = typeof maxAttempts === "number" ? attempt >= maxAttempts - 1 : false;

  try {
    const claimedJob = await step.run("claim-job", async () => {
      const job = await claimOnboardingScrapeJobById({
        jobId,
        kind: "onboarding_run",
        workerId: runId,
      });

      if (!job) {
        throw new NonRetriableError(`Onboarding scrape job ${jobId} was not found.`);
      }

      return job;
    });

    if (claimedJob.status === "completed" && claimedJob.resultPayload) {
      return {
        jobId: claimedJob.jobId,
        runId: claimedJob.completedRunId,
        skipped: true,
        success: true,
      };
    }

    if (claimedJob.status === "failed") {
      return {
        jobId: claimedJob.jobId,
        skipped: true,
        success: false,
      };
    }

    if (claimedJob.status !== "processing" || claimedJob.leaseOwner !== runId) {
      return {
        jobId: claimedJob.jobId,
        skipped: true,
        success: true,
      };
    }

    const input = getClaimedInput(claimedJob, effectiveInput);
    const mode = getConfiguredOnboardingMode();
    const xApiFallbackAvailable = mode === "auto" && hasXApiSourceCredentials();
    const shallowSync = shouldAttemptShallowSync(input)
      ? await step.run("prepare-shallow-sync", async (): Promise<ShallowSyncPreparationResult> => {
          const prepared = await bootstrapScrapeCaptureWithOptions(input.account, {
            pages: 2,
            count: 40,
            targetOriginalPostCount: 40,
            userAgent: "onboarding-shallow-sync",
            mergeWithExisting: true,
          });

          return {
            attempted: true,
            nextCursor: prepared.nextCursor,
            usedExistingCapture: prepared.usedExistingCapture,
          };
        }).catch((error): ShallowSyncPreparationResult => {
          if (xApiFallbackAvailable) {
            return {
              attempted: false,
              nextCursor: null,
              usedExistingCapture: false,
            };
          }

          throw error;
        })
      : {
          attempted: false,
          nextCursor: null,
          usedExistingCapture: false,
        };

    if (
      shallowSync.attempted &&
      !shallowSync.usedExistingCapture &&
      shallowSync.nextCursor
    ) {
      await step.sendEvent("queue-deep-backfill", {
        name: "onboarding/deep.backfill.started",
        data: {
          account: input.account,
          cursor: shallowSync.nextCursor,
          userId: claimedJob.userId,
        },
      });
    }

    const result = await step.run("run-onboarding", async () => runOnboarding(input));
    const finalized = await step.run("finalize-onboarding", async () =>
      finalizeOnboardingRunForUser({
        input,
        result,
        runId: buildQueuedOnboardingRunId(claimedJob.jobId),
        suppressLegacyBackfill: true,
        userAgent,
        userId: claimedJob.userId,
      }),
    );

    await step.run("complete-job", async () => {
      await markOnboardingScrapeJobCompleted({
        jobId: claimedJob.jobId,
        completedRunId: finalized.payload.runId,
        resultPayload: finalized.payload,
        workerId: runId,
      });
    });

    await step.run("capture-completed-event", async () => {
      try {
        await capturePostHogServerEvent({
          distinctId: claimedJob.userId,
          event: "xpo_onboarding_run_completed",
          properties: {
            account: finalized.normalizedHandle,
            backfill_queued: Boolean(finalized.payload.backfill.queued),
            job_id: claimedJob.jobId,
            route: "/api/onboarding/run",
            source: result.source,
            warnings_count: result.warnings?.length ?? 0,
          },
        });
      } catch (analyticsError) {
        console.error("Failed to capture onboarding completion event:", analyticsError);
      }
    });

    return {
      jobId: claimedJob.jobId,
      runId: finalized.payload.runId,
      success: true,
    };
  } catch (error) {
    const shouldMarkFailed = error instanceof NonRetriableError || isFinalAttempt;
    const message =
      error instanceof Error ? error.message : "Unknown onboarding scrape job failure.";

    if (shouldMarkFailed) {
      await step.run("mark-job-failed", async () => {
        await markOnboardingScrapeJobFailed({
          jobId,
          error: message,
          workerId: runId,
        });
      });

      await step.run("capture-failure-event", async () => {
        try {
          await capturePostHogServerException({
            distinctId: userId,
            error,
            properties: {
              account:
                typeof effectiveInput.account === "string" ? effectiveInput.account : undefined,
              job_id: jobId,
              route: "/api/onboarding/run",
            },
          });
        } catch (analyticsError) {
          console.error("Failed to capture onboarding failure event:", analyticsError);
        }
      });
    }

    throw error;
  }
}

export const processOnboardingRun = inngest.createFunction(
  {
    id: "process-onboarding-run",
    retries: 2,
    singleton: {
      key: "event.data.jobId",
      mode: "skip",
    },
    triggers: [{ event: "onboarding/run.requested" }],
    timeouts: {
      finish: "5m",
    },
  },
  processOnboardingRunHandler,
);
