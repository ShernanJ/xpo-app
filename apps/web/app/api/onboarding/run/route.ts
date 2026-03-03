import { NextResponse } from "next/server";

import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/backfill";
import { runOnboarding } from "@/lib/onboarding/service";
import { persistOnboardingRun, upsertUserByHandle, syncOnboardingPostsToDb } from "@/lib/onboarding/store";
import { parseOnboardingInput } from "@/lib/onboarding/validation";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request) {
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

  // 1. Upsert the User by handle — creates a real userId for this session
  const userId = await upsertUserByHandle(parsed.data.account);

  const result = await runOnboarding(parsed.data);
  const persisted = await persistOnboardingRun({
    input: parsed.data,
    result,
    userAgent: request.headers.get("user-agent"),
    userId,
  });

  // 2b. Sync posts to Prisma so retrieval and style profiling can use them
  await syncOnboardingPostsToDb(userId, parsed.data.account, result).catch((err) =>
    console.error("Failed to sync posts to DB:", err),
  );
  const backfill = await maybeEnqueueOnboardingBackfillJob({
    runId: persisted.runId,
    input: parsed.data,
    result,
  });

  // 2. Issue a signed session cookie containing the real userId + handle
  const token = await createSessionToken({ userId, handle: parsed.data.account });

  const response = NextResponse.json(
    {
      ok: true,
      runId: persisted.runId,
      persistedAt: persisted.persistedAt,
      backfill,
      data: result,
    },
    { status: 200 },
  );

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: "/",
  });

  return response;
}
