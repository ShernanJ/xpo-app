import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { finalizeOnboardingRunForUser } from "@/lib/onboarding/pipeline/finalizeRun";
import { shouldQueueOnboardingLiveScrape } from "@/lib/onboarding/pipeline/liveScrapePolicy";
import { enqueueOnboardingRunJob } from "@/lib/onboarding/pipeline/scrapeJob";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";
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

  if (await shouldQueueOnboardingLiveScrape(effectiveInput)) {
    const queued = await enqueueOnboardingRunJob({
      account: effectiveInput.account,
      input: effectiveInput,
      userId,
    });
    const normalizedHandle = effectiveInput.account.replace(/^@/, "").toLowerCase();

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

  let result: Awaited<ReturnType<typeof runOnboarding>>;
  try {
    result = await runOnboarding(effectiveInput);
  } catch (error) {
    await capturePostHogServerException({
      request,
      distinctId: userId,
      error,
      properties: {
        account: effectiveInput.account,
        route: "/api/onboarding/run",
      },
    });
    const message =
      error instanceof Error ? error.message : "Failed to run onboarding scrape.";
    return NextResponse.json(
      {
        ok: false,
        code: "SCRAPE_UNAVAILABLE",
        errors: [{ field: "account", message }],
      },
      { status: 502 },
    );
  }

  const allowMockFallback =
    process.env.ONBOARDING_ALLOW_MOCK_FALLBACK?.trim() === "1" ||
    process.env.NODE_ENV !== "production";
  if (!allowMockFallback && result.source === "mock") {
    const warningDetail = result.warnings?.[0] ?? null;
    return NextResponse.json(
      {
        ok: false,
        code: "SCRAPE_UNAVAILABLE",
        errors: [
          {
            field: "account",
            message:
              warningDetail ??
              "Onboarding scrape could not fetch real profile data. Check scraping env vars in Vercel and retry.",
          },
        ],
      },
      { status: 502 },
    );
  }

  const finalized = await finalizeOnboardingRunForUser({
    input: effectiveInput,
    result,
    userAgent: request.headers.get("user-agent"),
    userId,
  });
  await capturePostHogServerEvent({
    request,
    distinctId: userId,
    event: "xpo_onboarding_run_completed",
    properties: {
      account: finalized.normalizedHandle,
      backfill_queued: Boolean(finalized.payload.backfill.queued),
      route: "/api/onboarding/run",
      source: result.source,
      warnings_count: result.warnings?.length ?? 0,
    },
  });

  return NextResponse.json(finalized.payload, { status: 200 });
}
