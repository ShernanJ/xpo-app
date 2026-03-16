import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { generateStyleProfile } from "@/lib/agent-v2/core/styleProfile";
import type { OnboardingInput } from "@/lib/onboarding/contracts/types";
import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/pipeline/backfill";
import { buildRefreshOnboardingInput } from "@/lib/onboarding/pipeline/refreshInput";
import { runOnboarding } from "@/lib/onboarding/pipeline/service";
import { bootstrapScrapeCaptureWithOptions } from "@/lib/onboarding/sources/scrapeBootstrap";
import {
  persistOnboardingRun,
  readLatestOnboardingRunByHandle,
  syncOnboardingPostsToDb,
  syncPostsToDb,
} from "@/lib/onboarding/store/onboardingRunStore";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import { consumeRateLimit } from "@/lib/security/rateLimit";
import {
  buildErrorResponse,
  getRequestIp,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

type RefreshTrigger = "manual" | "daily_login";

interface RefreshRequestBody {
  trigger?: unknown;
}

interface ScrapeRefreshError {
  field: string;
  message: string;
}

function getManualCooldownMs(): number {
  const rawMinutes = Number(process.env.PROFILE_SCRAPE_MANUAL_COOLDOWN_MINUTES);
  if (!Number.isFinite(rawMinutes) || rawMinutes < 1) {
    return 10 * 60 * 1000;
  }

  return Math.floor(rawMinutes) * 60 * 1000;
}

function getFreshnessCooldownMs(): number {
  const rawHours = Number(process.env.PROFILE_SCRAPE_FRESHNESS_COOLDOWN_HOURS);
  if (!Number.isFinite(rawHours) || rawHours < 1) {
    return 6 * 60 * 60 * 1000;
  }

  return Math.floor(rawHours) * 60 * 60 * 1000;
}

function getFreshnessProbeCount(): number {
  const raw = Number(process.env.PROFILE_SCRAPE_FRESHNESS_PROBE_COUNT);
  if (!Number.isFinite(raw) || raw < 5) {
    return 20;
  }

  return Math.max(5, Math.min(40, Math.floor(raw)));
}

function getDeepRefreshStaleMs(): number {
  const rawHours = Number(process.env.PROFILE_SCRAPE_DEEP_REFRESH_STALE_HOURS);
  if (!Number.isFinite(rawHours) || rawHours < 1) {
    return 24 * 60 * 60 * 1000;
  }

  return Math.floor(rawHours) * 60 * 60 * 1000;
}

function getDeepRefreshNewPostThreshold(): number {
  const raw = Number(process.env.PROFILE_SCRAPE_DEEP_REFRESH_NEW_POST_THRESHOLD);
  if (!Number.isFinite(raw) || raw < 1) {
    return 5;
  }

  return Math.max(1, Math.min(20, Math.floor(raw)));
}

function getSyncTargetPostCount(): number {
  const raw = Number(process.env.ONBOARDING_SCRAPE_SYNC_TARGET);
  if (!Number.isFinite(raw) || raw < 20) {
    return 40;
  }

  return Math.max(20, Math.min(80, Math.floor(raw)));
}

function getSyncMaxPages(): number {
  const raw = Number(process.env.ONBOARDING_SCRAPE_SYNC_MAX_PAGES);
  if (!Number.isFinite(raw) || raw < 1) {
    return 6;
  }

  return Math.max(1, Math.min(12, Math.floor(raw)));
}

function getSyncTimeoutMs(): number {
  const raw = Number(process.env.ONBOARDING_SCRAPE_SYNC_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1_000) {
    return 10_000;
  }

  return Math.max(4_000, Math.min(30_000, Math.floor(raw)));
}

function getBackfillTargetPostCount(): number {
  const raw = Number(process.env.ONBOARDING_BACKFILL_TARGET);
  if (!Number.isFinite(raw) || raw < 40) {
    return 80;
  }

  return Math.max(40, Math.min(120, Math.floor(raw)));
}

function resolveTrigger(body: RefreshRequestBody | null): RefreshTrigger | null {
  if (!body || body.trigger === undefined) {
    return "manual";
  }

  if (body.trigger === "manual" || body.trigger === "daily_login") {
    return body.trigger;
  }

  return null;
}

function toCooldownIso(baseIso: string, cooldownMs: number): string | null {
  const createdMs = new Date(baseIso).getTime();
  if (!Number.isFinite(createdMs)) {
    return null;
  }

  return new Date(createdMs + cooldownMs).toISOString();
}

function newestPostIdSet(posts: Array<{ id: string }>): Set<string> {
  return new Set(posts.map((post) => post.id));
}

function getKnownOriginalPostIds(args: {
  latestCapturePosts?: Array<{ id: string }> | null;
  latestRunPosts?: Array<{ id: string }> | null;
}): Set<string> {
  if (args.latestCapturePosts && args.latestCapturePosts.length > 0) {
    return newestPostIdSet(args.latestCapturePosts);
  }

  return newestPostIdSet(args.latestRunPosts ?? []);
}

function parseRequestError(field: string, message: string): ScrapeRefreshError[] {
  return [{ field, message }];
}

async function runManualRefresh(params: {
  latestRunInput: OnboardingInput;
  normalizedHandle: string;
  userId: string;
  userAgent: string | null;
}) {
  const syncTargetPostCount = getSyncTargetPostCount();
  await bootstrapScrapeCaptureWithOptions(params.normalizedHandle, {
    pages: getSyncMaxPages(),
    count: syncTargetPostCount,
    targetOriginalPostCount: syncTargetPostCount,
    maxDurationMs: getSyncTimeoutMs(),
    userAgent: "profile-scrape-manual",
    forceRefresh: true,
    mergeWithExisting: true,
  });

  const refreshInput = buildRefreshOnboardingInput(
    params.latestRunInput,
    params.normalizedHandle,
    "cache_only",
  );
  const result = await runOnboarding(refreshInput);
  const persisted = await persistOnboardingRun({
    input: refreshInput,
    result,
    userAgent: params.userAgent,
    userId: params.userId,
  });

  await syncOnboardingPostsToDb(params.userId, params.normalizedHandle, result).catch((error) =>
    console.error("Failed to sync refreshed posts to DB:", error),
  );
  await generateStyleProfile(
    params.userId,
    params.normalizedHandle,
    getBackfillTargetPostCount(),
    { forceRegenerate: true },
  ).catch((error) =>
    console.error("Failed to refresh style profile after profile scrape:", error),
  );
  const backfill = await maybeEnqueueOnboardingBackfillJob({
    runId: persisted.runId,
    input: refreshInput,
    result,
  });

  return {
    persisted,
    result,
    backfillQueued: backfill.queued,
  };
}

export async function POST(request: NextRequest) {
  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        ok: false,
        errors: parseRequestError("account", "Unauthorized or no active handle selected."),
      },
      { status: 401 },
    );
  }

  const userRateLimit = await consumeRateLimit({
    key: `creator:profile_scrape:user:${session.user.id}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!userRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many profile scrape requests. Please wait before trying again.",
      extras: {
        retryAfterSeconds: userRateLimit.retryAfterSeconds,
      },
    });
  }

  const ipRateLimit = await consumeRateLimit({
    key: `creator:profile_scrape:ip:${getRequestIp(request)}`,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRateLimit.ok) {
    return buildErrorResponse({
      status: 429,
      field: "rate",
      message: "Too many profile scrape requests from this network. Please wait before trying again.",
      extras: {
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      },
    });
  }

  const bodyResult = await parseJsonBody<RefreshRequestBody | null>(request, {
    maxBytes: 4 * 1024,
    allowEmpty: true,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }
  const body = bodyResult.value;

  const trigger = resolveTrigger(body);
  if (!trigger) {
    return NextResponse.json(
      {
        ok: false,
        errors: parseRequestError("account", "trigger must be manual or daily_login."),
      },
      { status: 400 },
    );
  }

  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const normalizedHandle = workspaceHandle.xHandle;
  const latestRun = await readLatestOnboardingRunByHandle(session.user.id, normalizedHandle);
  if (!latestRun) {
    return NextResponse.json(
      {
        ok: true,
        refreshed: false,
        reason: "missing_onboarding_run",
      },
      { status: 200 },
    );
  }

  const nowMs = Date.now();
  const lastRunMs = new Date(latestRun.persistedAt).getTime();
  const manualCooldownMs = getManualCooldownMs();
  const cooldownUntil = toCooldownIso(latestRun.persistedAt, manualCooldownMs);
  const remainingCooldownMs =
    Number.isFinite(lastRunMs) ? Math.max(0, lastRunMs + manualCooldownMs - nowMs) : 0;

  if (trigger === "manual" && remainingCooldownMs > 0) {
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingCooldownMs / 1000));
    return NextResponse.json(
      {
        ok: false,
        code: "COOLDOWN",
        errors: parseRequestError(
          "account",
          "Please wait before running another profile scrape.",
        ),
        cooldownUntil,
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  const latestCapture = await readLatestScrapeCaptureByAccount(normalizedHandle);

  if (trigger === "daily_login") {
    const freshnessBaseIso = latestCapture?.capturedAt ?? latestRun.persistedAt;
    const freshnessCooldownMs = getFreshnessCooldownMs();
    const freshnessCooldownUntil = toCooldownIso(freshnessBaseIso, freshnessCooldownMs);
    const freshnessBaseMs = new Date(freshnessBaseIso).getTime();

    if (Number.isFinite(freshnessBaseMs) && nowMs - freshnessBaseMs < freshnessCooldownMs) {
      return NextResponse.json(
        {
          ok: true,
          refreshed: false,
          reason: "fresh_enough",
          cooldownUntil: freshnessCooldownUntil,
        },
        { status: 200 },
      );
    }

    try {
      const knownIds = getKnownOriginalPostIds({
        latestCapturePosts: latestCapture?.posts ?? null,
        latestRunPosts: latestRun.result.recentPosts ?? [],
      });
      await bootstrapScrapeCaptureWithOptions(normalizedHandle, {
        pages: 1,
        count: getFreshnessProbeCount(),
        targetOriginalPostCount: getFreshnessProbeCount(),
        maxDurationMs: 5_000,
        userAgent: "profile-scrape-delta",
        forceRefresh: true,
        mergeWithExisting: true,
      });

      const refreshedCapture = await readLatestScrapeCaptureByAccount(normalizedHandle);
      const deltaPosts = (refreshedCapture?.posts ?? []).filter((post) => !knownIds.has(post.id));
      const nextCooldownUntil = refreshedCapture
        ? toCooldownIso(refreshedCapture.capturedAt, freshnessCooldownMs)
        : freshnessCooldownUntil;

      if (deltaPosts.length === 0) {
        return NextResponse.json(
          {
            ok: true,
            refreshed: false,
            reason: "no_new_posts_detected",
            cooldownUntil: nextCooldownUntil,
            syncedPostCount: 0,
            queuedBackfill: false,
          },
          { status: 200 },
        );
      }

      await syncPostsToDb({
        userId: session.user.id,
        xHandle: normalizedHandle,
        posts: deltaPosts,
      }).catch((error) =>
        console.error("Failed to sync delta posts to DB:", error),
      );

      const latestRunAgeMs = Number.isFinite(lastRunMs)
        ? nowMs - lastRunMs
        : Number.MAX_SAFE_INTEGER;
      const shouldQueueBackfill =
        deltaPosts.length >= getDeepRefreshNewPostThreshold() ||
        latestRunAgeMs >= getDeepRefreshStaleMs();

      let queuedBackfill = false;
      if (shouldQueueBackfill) {
        const backfill = await maybeEnqueueOnboardingBackfillJob({
          runId: latestRun.runId,
          input: latestRun.input,
          result: latestRun.result,
        });
        queuedBackfill = backfill.queued;
      }

      return NextResponse.json(
        {
          ok: true,
          refreshed: false,
          reason: "new_posts_detected",
          cooldownUntil: nextCooldownUntil,
          syncedPostCount: deltaPosts.length,
          queuedBackfill,
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Daily profile scrape probe failed:", error);
      return NextResponse.json(
        {
          ok: true,
          refreshed: false,
          reason: "probe_failed",
          cooldownUntil: freshnessCooldownUntil,
        },
        { status: 200 },
      );
    }
  }

  try {
    const refresh = await runManualRefresh({
      latestRunInput: latestRun.input,
      normalizedHandle,
      userId: session.user.id,
      userAgent: request.headers.get("user-agent"),
    });
    const nextCooldownUntil = toCooldownIso(refresh.persisted.persistedAt, manualCooldownMs);

    return NextResponse.json(
      {
        ok: true,
        refreshed: true,
        reason: "manual_refresh",
        runId: refresh.persisted.runId,
        persistedAt: refresh.persisted.persistedAt,
        cooldownUntil: nextCooldownUntil,
        syncedPostCount: refresh.result.recentPosts?.length ?? 0,
        queuedBackfill: refresh.backfillQueued,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to refresh profile scrape:", error);
    return NextResponse.json(
      {
        ok: false,
        errors: parseRequestError("account", "Failed to refresh profile scrape."),
      },
      { status: 500 },
    );
  }
}
