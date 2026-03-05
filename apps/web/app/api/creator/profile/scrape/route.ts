import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/authOptions";
import { runOnboarding } from "@/lib/onboarding/service";
import {
  persistOnboardingRun,
  readLatestOnboardingRunByHandle,
  syncOnboardingPostsToDb,
} from "@/lib/onboarding/store";
import { probeLatestScrapePosts } from "@/lib/onboarding/sources/scrapeBootstrap";
import type { OnboardingInput } from "@/lib/onboarding/types";

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

function getDailyRefreshIntervalMs(): number {
  const rawHours = Number(process.env.PROFILE_SCRAPE_DAILY_INTERVAL_HOURS);
  if (!Number.isFinite(rawHours) || rawHours < 1) {
    return 24 * 60 * 60 * 1000;
  }

  return Math.floor(rawHours) * 60 * 60 * 1000;
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

function buildRefreshInput(baseInput: OnboardingInput, account: string): OnboardingInput {
  const goal =
    baseInput.goal === "followers" || baseInput.goal === "leads" || baseInput.goal === "authority"
      ? baseInput.goal
      : "followers";
  const timeBudgetMinutes =
    Number.isFinite(baseInput.timeBudgetMinutes) && baseInput.timeBudgetMinutes >= 5
      ? Math.floor(baseInput.timeBudgetMinutes)
      : 30;
  const transformationMode =
    baseInput.transformationMode === "preserve" ||
    baseInput.transformationMode === "optimize" ||
    baseInput.transformationMode === "pivot_soft" ||
    baseInput.transformationMode === "pivot_hard"
      ? baseInput.transformationMode
      : undefined;

  return {
    account,
    goal,
    timeBudgetMinutes,
    postingCadenceCapacity: baseInput.postingCadenceCapacity,
    replyBudgetPerDay: baseInput.replyBudgetPerDay,
    transformationMode,
    transformationModeSource: transformationMode
      ? baseInput.transformationModeSource ?? "default"
      : undefined,
    tone: {
      casing: baseInput.tone?.casing === "normal" ? "normal" : "lowercase",
      risk: baseInput.tone?.risk === "bold" ? "bold" : "safe",
    },
    scrapeFreshness: "always",
    forceFreshScrape: true,
  };
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

function parseRequestError(field: string, message: string): ScrapeRefreshError[] {
  return [{ field, message }];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.user?.activeXHandle) {
    return NextResponse.json(
      {
        ok: false,
        errors: parseRequestError("account", "Unauthorized or no active handle selected."),
      },
      { status: 401 },
    );
  }

  let body: RefreshRequestBody | null = null;
  try {
    body = (await request.json()) as RefreshRequestBody;
  } catch {
    body = null;
  }

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

  const normalizedHandle = session.user.activeXHandle.replace(/^@/, "").toLowerCase();
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

  if (trigger === "daily_login") {
    const dailyIntervalMs = getDailyRefreshIntervalMs();
    if (Number.isFinite(lastRunMs) && nowMs - lastRunMs < dailyIntervalMs) {
      return NextResponse.json(
        {
          ok: true,
          refreshed: false,
          reason: "fresh_enough",
          cooldownUntil,
        },
        { status: 200 },
      );
    }

    try {
      const probe = await probeLatestScrapePosts(normalizedHandle, { count: 20 });
      const knownIds = newestPostIdSet(latestRun.result.recentPosts ?? []);
      const hasNewPosts = probe.posts.some((post) => !knownIds.has(post.id));

      if (!hasNewPosts) {
        return NextResponse.json(
          {
            ok: true,
            refreshed: false,
            reason: "no_new_posts_detected",
            cooldownUntil,
          },
          { status: 200 },
        );
      }
    } catch (error) {
      console.error("Daily profile scrape probe failed:", error);
      return NextResponse.json(
        {
          ok: true,
          refreshed: false,
          reason: "probe_failed",
          cooldownUntil,
        },
        { status: 200 },
      );
    }
  }

  try {
    const refreshInput = buildRefreshInput(latestRun.input, normalizedHandle);
    const result = await runOnboarding(refreshInput);
    const persisted = await persistOnboardingRun({
      input: refreshInput,
      result,
      userAgent: request.headers.get("user-agent"),
      userId: session.user.id,
    });

    await syncOnboardingPostsToDb(session.user.id, normalizedHandle, result).catch((error) =>
      console.error("Failed to sync refreshed posts to DB:", error),
    );

    const nextCooldownUntil = toCooldownIso(persisted.persistedAt, manualCooldownMs);

    return NextResponse.json(
      {
        ok: true,
        refreshed: true,
        reason: trigger === "manual" ? "manual_refresh" : "new_posts_detected",
        runId: persisted.runId,
        persistedAt: persisted.persistedAt,
        cooldownUntil: nextCooldownUntil,
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
