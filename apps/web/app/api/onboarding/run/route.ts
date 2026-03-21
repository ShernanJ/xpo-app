import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { inngest } from "@/lib/inngest/client";
import { enqueueOnboardingRunJob } from "@/lib/onboarding/pipeline/scrapeJob";
import { markOnboardingScrapeJobFailed } from "@/lib/onboarding/store/onboardingScrapeJobStore";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";
import { persistPendingWorkspaceHandleForUser } from "@/lib/userHandles.server";
import {
  capturePostHogServerEvent,
  capturePostHogServerException,
} from "@/lib/posthog/server";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function POST(request: Request) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized." }] },
      { status: 401 },
    );
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "onboarding:run",
    user: {
      limit: 8,
      windowMs: 10 * 60 * 1000,
      message: "Too many onboarding runs. Please wait before starting another scrape.",
    },
    ip: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many onboarding runs from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<unknown>(request, {
    maxBytes: 16 * 1024,
    field: "account",
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const parsed = parseOnboardingInput(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 400 });
  }
  const effectiveInput = {
    ...parsed.data,
    scrapeFreshness: "if_stale" as const,
  };
  const userId = session.user.id;
  const handleLimitCheck = await validateHandleLimit({
    userId,
    targetHandle: effectiveInput.account,
  });
  if (!handleLimitCheck.ok) {
    const billingState = await getBillingStateForUser(userId);
    return NextResponse.json(
      {
        ok: false,
        code: handleLimitCheck.code,
        errors: [{ field: "account", message: handleLimitCheck.message }],
        data: {
          billing: billingState.billing,
        },
      },
      { status: 403 },
    );
  }

  await persistPendingWorkspaceHandleForUser({
    userId,
    xHandle: effectiveInput.account,
  });

  const queued = await enqueueOnboardingRunJob({
    account: effectiveInput.account,
    input: effectiveInput,
    userId,
  });
  const normalizedHandle = effectiveInput.account.replace(/^@/, "").toLowerCase();

  try {
    if (!queued.deduped) {
      await inngest.send({
        id: queued.jobId,
        name: "onboarding/run.requested",
        data: {
          effectiveInput,
          jobId: queued.jobId,
          userAgent: request.headers.get("user-agent"),
          userId,
        },
      });
    }
  } catch (error) {
    await markOnboardingScrapeJobFailed({
      jobId: queued.jobId,
      error:
        error instanceof Error ? error.message : "Failed to queue onboarding scrape job.",
    });
    await capturePostHogServerException({
      request,
      distinctId: userId,
      error,
      properties: {
        account: normalizedHandle,
        job_id: queued.jobId,
        route: "/api/onboarding/run",
      },
    });
    return NextResponse.json(
      {
        ok: false,
        code: "QUEUE_UNAVAILABLE",
        errors: [{ field: "account", message: "Failed to start onboarding. Please try again." }],
      },
      { status: 502 },
    );
  }

  await capturePostHogServerEvent({
    request,
    distinctId: userId,
    event: "xpo_onboarding_run_queued",
    properties: {
      account: normalizedHandle,
      deduped: queued.deduped,
      job_id: queued.jobId,
      route: "/api/onboarding/run",
    },
  });

  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      jobId: queued.jobId,
      account: normalizedHandle,
    },
    { status: 202 },
  );
}
