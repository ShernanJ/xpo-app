import { NonRetriableError, type GetFunctionInput, type GetStepTools } from "inngest";

import { capturePostHogServerEvent, capturePostHogServerException } from "@/lib/posthog/server";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { finalizeOnboardingRunForUser } from "@/lib/onboarding/pipeline/finalizeRun";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import {
  claimOnboardingScrapeJobById,
  markOnboardingScrapeJobCompleted,
  markOnboardingScrapeJobFailed,
  type StoredOnboardingScrapeJob,
} from "@/lib/onboarding/store/onboardingScrapeJobStore";

import { inngest } from "../client";

export interface OnboardingRunRequestedEventData {
  effectiveInput: Record<string, unknown>;
  jobId: string;
  userAgent: string | null;
  userId: string;
}

type ProcessOnboardingRunContext = Omit<GetFunctionInput<typeof inngest>, "event"> & {
  event: {
    data: OnboardingRunRequestedEventData;
  };
  step: GetStepTools<typeof inngest>;
};

export function buildQueuedOnboardingRunId(jobId: string): string {
  return jobId.startsWith("or_") ? jobId : `or_${jobId}`;
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
    const result = await step.run("run-onboarding", async () => runOnboarding(input));
    const finalized = await step.run("finalize-onboarding", async () =>
      finalizeOnboardingRunForUser({
        input,
        result,
        runId: buildQueuedOnboardingRunId(claimedJob.jobId),
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
