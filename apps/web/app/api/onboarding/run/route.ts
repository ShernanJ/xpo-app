import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/pipeline/backfill";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import {
  persistOnboardingRun,
  syncOnboardingPostsToDb,
} from "@/lib/onboarding/store/onboardingRunStore";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { prisma } from "@/lib/db";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";
import {
  capturePostHogServerEvent,
  capturePostHogServerException,
} from "@/lib/posthog/server";
import { generateStyleProfile } from "@/lib/agent-v2/core/styleProfile";
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

  const persisted = await persistOnboardingRun({
    input: effectiveInput,
    result,
    userAgent: request.headers.get("user-agent"),
    userId,
  });
  const normalizedHandle = effectiveInput.account.replace(/^@/, "").toLowerCase();

  // 2b. Sync posts to Prisma so retrieval and style profiling can use them
  await syncOnboardingPostsToDb(userId, effectiveInput.account, result).catch((err) =>
    console.error("Failed to sync posts to DB:", err),
  );
  await generateStyleProfile(
    userId,
    normalizedHandle,
    80,
    { forceRegenerate: true },
  ).catch((error) =>
    console.error("Failed to refresh style profile after onboarding sync:", error),
  );
  const backfill = await maybeEnqueueOnboardingBackfillJob({
    runId: persisted.runId,
    input: effectiveInput,
    result,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activeXHandle: normalizedHandle },
  });

  await prisma.voiceProfile.createMany({
    data: [{
      userId,
      xHandle: normalizedHandle,
      styleCard: {},
    }],
    skipDuplicates: true,
  });
  await capturePostHogServerEvent({
    request,
    distinctId: userId,
    event: "xpo_onboarding_run_completed",
    properties: {
      account: normalizedHandle,
      backfill_queued: Boolean(backfill),
      route: "/api/onboarding/run",
      source: result.source,
      warnings_count: result.warnings?.length ?? 0,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      runId: persisted.runId,
      persistedAt: persisted.persistedAt,
      backfill,
      data: result,
    },
    { status: 200 },
  );
}
