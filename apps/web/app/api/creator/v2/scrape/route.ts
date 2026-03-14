import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/serverSession";

import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import { persistOnboardingRun, syncOnboardingPostsToDb } from "@/lib/onboarding/store";
import { parseOnboardingInput } from "@/lib/onboarding/contracts/validation";
import { getBillingStateForUser } from "@/lib/billing/entitlements";
import { validateHandleLimit } from "@/lib/billing/handleLimits";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "auth", message: "Unauthorized." }] },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ field: "account", message: "Request body must be valid JSON." }] },
      { status: 400 }
    );
  }

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
