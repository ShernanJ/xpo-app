import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/backfill";
import { runOnboarding } from "@/lib/onboarding/service";
import { persistOnboardingRun, syncOnboardingPostsToDb } from "@/lib/onboarding/store";
import { parseOnboardingInput } from "@/lib/onboarding/validation";
import { prisma } from "@/lib/db";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized." }] },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ field: "account", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

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

  // 2b. Sync posts to Prisma so retrieval and style profiling can use them
  await syncOnboardingPostsToDb(userId, effectiveInput.account, result).catch((err) =>
    console.error("Failed to sync posts to DB:", err),
  );
  const backfill = await maybeEnqueueOnboardingBackfillJob({
    runId: persisted.runId,
    input: effectiveInput,
    result,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activeXHandle: effectiveInput.account },
  });

  const normalizedHandle = effectiveInput.account.replace(/^@/, "").toLowerCase();

  await prisma.voiceProfile.createMany({
    data: [{
      userId,
      xHandle: normalizedHandle,
      styleCard: {},
    }],
    skipDuplicates: true,
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
