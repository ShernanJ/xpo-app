import { NextResponse } from "next/server";

import { readRecentOnboardingRuns } from "@/lib/onboarding/store/onboardingRunStore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "10");
  const includeFull = searchParams.get("full") === "1";
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
    : 10;

  const runs = await readRecentOnboardingRuns(limit);
  const summaries = runs.map((run) => ({
    runId: run.runId,
    persistedAt: run.persistedAt,
    account: run.input.account,
    goal: run.input.goal,
    followersCount: run.result.profile.followersCount,
    growthStage: run.result.growthStage,
    averageEngagement: run.result.baseline.averageEngagement,
  }));

  return NextResponse.json(
    {
      ok: true,
      count: runs.length,
      runs: includeFull ? runs : summaries,
    },
    { status: 200 },
  );
}
