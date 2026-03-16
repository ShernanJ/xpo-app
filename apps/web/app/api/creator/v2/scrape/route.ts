import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import {
  persistOnboardingRun,
  syncOnboardingPostsToDb,
} from "@/lib/onboarding/store/onboardingRunStore";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized." }] },
      { status: 401 }
    );
  }

  const userRateLimit = await consumeRateLimit({
    key: `creator:v2_scrape:user:${session.user.id}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!userRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many scrape requests. Please wait before trying again.",
      extras: {
        retryAfterSeconds: userRateLimit.retryAfterSeconds,
      },
    });
  }

  const ipRateLimit = await consumeRateLimit({
    key: `creator:v2_scrape:ip:${getRequestIp(request)}`,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many scrape requests from this network. Please wait before trying again.",
      extras: {
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<unknown>(request, {
    maxBytes: 32 * 1024,
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

  const userId = session.user.id;
  const targetXHandle = parsed.data.account;
  const handleLimitCheck = await validateHandleLimit({
    userId,
    targetHandle: targetXHandle,
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

  try {
    const result = await runOnboarding(parsed.data);
    const persisted = await persistOnboardingRun({
      input: parsed.data,
      result,
      userAgent: request.headers.get("user-agent"),
      userId,
    });

    // 2b. Sync posts to Prisma so retrieval and style profiling can use them, directly to this xHandle
    await syncOnboardingPostsToDb(userId, targetXHandle, result).catch((err) =>
      console.error("Failed to sync posts to DB:", err),
    );

    return NextResponse.json(
      {
        ok: true,
        runId: persisted.runId,
        persistedAt: persisted.persistedAt,
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Scraping onboarding failed:", error);
    return NextResponse.json(
      { ok: false, errors: [{ field: "server", message: "Failed to run onboarding loop." }] },
      { status: 500 }
    );
  }
}
