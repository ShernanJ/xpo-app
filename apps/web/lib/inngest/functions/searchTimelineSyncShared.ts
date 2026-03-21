import { generateStyleProfile } from "@/lib/agent-v2/core/styleProfile";
import { buildRefreshOnboardingInput } from "@/lib/onboarding/pipeline/refreshInput";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import {
  persistOnboardingRun,
  readOnboardingRunById,
  syncOnboardingPostsToDb,
} from "@/lib/onboarding/store/onboardingRunStore";
import type { OnboardingSyncPhase, ScrapeRouteClass, XPublicPost } from "@/lib/onboarding/types";
import type { SearchTimelineMetadata, SearchTimelineProgress } from "@/lib/x-scrape/searchTimelineCapture";

export interface BackgroundSyncProgress
  extends SearchTimelineProgress,
    Record<string, unknown> {
  routeClass: ScrapeRouteClass;
  searchYearFloor: number;
  statusesCount: number | null;
  targetYear?: number | null;
  phase?: OnboardingSyncPhase | null;
  nextJobId?: string | null;
}

export function getOldestObservedPostYear(posts: XPublicPost[]): number | null {
  let oldestYear: number | null = null;

  for (const post of posts) {
    const parsed = new Date(post.createdAt);
    if (!Number.isFinite(parsed.getTime())) {
      continue;
    }

    const year = parsed.getUTCFullYear();
    if (oldestYear === null || year < oldestYear) {
      oldestYear = year;
    }
  }

  return oldestYear;
}

export function normalizeBackgroundSyncProgress(args: {
  progressPayload: Record<string, unknown> | null | undefined;
  currentYear: number;
  metadata: SearchTimelineMetadata;
}): BackgroundSyncProgress {
  const payload = args.progressPayload ?? {};

  const currentYear =
    typeof payload.currentYear === "number" && Number.isFinite(payload.currentYear)
      ? Math.floor(payload.currentYear)
      : args.currentYear;
  const cursor = typeof payload.cursor === "string" && payload.cursor.trim() ? payload.cursor : null;
  const previousCursor =
    typeof payload.previousCursor === "string" && payload.previousCursor.trim()
      ? payload.previousCursor
      : null;
  const consecutiveEmptyPages =
    typeof payload.consecutiveEmptyPages === "number" &&
    Number.isFinite(payload.consecutiveEmptyPages)
      ? Math.max(0, Math.floor(payload.consecutiveEmptyPages))
      : 0;
  const yearSeenPostCount =
    typeof payload.yearSeenPostCount === "number" && Number.isFinite(payload.yearSeenPostCount)
      ? Math.max(0, Math.floor(payload.yearSeenPostCount))
      : 0;
  const exhaustedYears = Array.isArray(payload.exhaustedYears)
    ? payload.exhaustedYears
        .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null))
        .filter((value): value is number => value !== null)
    : [];
  const oldestObservedPostYear =
    typeof payload.oldestObservedPostYear === "number" &&
    Number.isFinite(payload.oldestObservedPostYear)
      ? Math.floor(payload.oldestObservedPostYear)
      : null;

  return {
    currentYear,
    cursor,
    previousCursor,
    consecutiveEmptyPages,
    yearSeenPostCount,
    exhaustedYears,
    oldestObservedPostYear,
    routeClass:
      payload.routeClass === "lightweight" || payload.routeClass === "heavyweight"
        ? payload.routeClass
        : args.metadata.routeClass,
    searchYearFloor:
      typeof payload.searchYearFloor === "number" && Number.isFinite(payload.searchYearFloor)
        ? Math.floor(payload.searchYearFloor)
        : args.metadata.searchYearFloor,
    statusesCount:
      typeof payload.statusesCount === "number" && Number.isFinite(payload.statusesCount)
        ? Math.floor(payload.statusesCount)
        : args.metadata.statusesCount,
    targetYear:
      typeof payload.targetYear === "number" && Number.isFinite(payload.targetYear)
        ? Math.floor(payload.targetYear)
        : null,
    phase:
      payload.phase === "seed" ||
      payload.phase === "primer" ||
      payload.phase === "archive" ||
      payload.phase === "complete"
        ? payload.phase
        : null,
    nextJobId: typeof payload.nextJobId === "string" && payload.nextJobId.trim() ? payload.nextJobId : null,
  };
}

export async function refreshOnboardingRunFromCapture(args: {
  account: string;
  phase: OnboardingSyncPhase;
  sourceRunId: string;
  userAgent: string;
}) {
  const sourceRun = await readOnboardingRunById(args.sourceRunId);
  if (!sourceRun?.userId) {
    throw new Error(`Onboarding source run ${args.sourceRunId} could not be loaded.`);
  }

  const refreshInput = buildRefreshOnboardingInput(
    sourceRun.input,
    args.account,
    "cache_only",
  );
  const refreshedResult = await runOnboarding(refreshInput);
  refreshedResult.syncState = refreshedResult.syncState
    ? {
        ...refreshedResult.syncState,
        phase: args.phase,
      }
    : refreshedResult.syncState;

  await persistOnboardingRun({
    input: refreshInput,
    runId: args.sourceRunId,
    result: refreshedResult,
    userAgent: args.userAgent,
    userId: sourceRun.userId,
  });
  await syncOnboardingPostsToDb(sourceRun.userId, args.account, refreshedResult);
  await generateStyleProfile(sourceRun.userId, args.account, 200, {
    forceRegenerate: true,
  }).catch((error) =>
    console.error("Failed to refresh style profile after SearchTimeline sync:", error),
  );

  return {
    refreshInput,
    refreshedResult,
    sourceRun,
  };
}
