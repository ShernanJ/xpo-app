import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

import { runOnboarding } from "@/lib/onboarding/service";
import { persistOnboardingRun, syncOnboardingPostsToDb } from "@/lib/onboarding/store";
import { parseOnboardingInput } from "@/lib/onboarding/validation";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
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
