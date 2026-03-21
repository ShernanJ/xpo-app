import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { maybeEnqueueOnboardingBackfillJob } from "@/lib/onboarding/pipeline/backfill";
import { bootstrapScrapeCaptureWithOptions } from "@/lib/onboarding/sources/scrapeBootstrap";
import { readLatestOnboardingRunByHandle } from "@/lib/onboarding/store/onboardingRunStore";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";

type ScrapeDebugAction = "recent_sync" | "deep_backfill";

interface ScrapeDebugRequestBody {
  action?: unknown;
  xHandle?: unknown;
}

function isDebugEnabled() {
  return process.env.NODE_ENV !== "production";
}

function parseAction(value: unknown): ScrapeDebugAction | null {
  return value === "recent_sync" || value === "deep_backfill" ? value : null;
}

function notFoundResponse() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

export async function POST(request: NextRequest) {
  if (!isDebugEnabled()) {
    return notFoundResponse();
  }

  const originError = requireAllowedOrigin(request);
  if (originError) {
    return originError;
  }

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitError = await enforceSessionMutationRateLimit(request, {
    userId: session.user.id,
    scope: "creator:profile_scrape_debug",
    user: {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: "Too many scrape debug actions. Please wait before trying again.",
    },
    ip: {
      limit: 40,
      windowMs: 10 * 60 * 1000,
      message: "Too many scrape debug actions from this network. Please wait before trying again.",
    },
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const bodyResult = await parseJsonBody<ScrapeDebugRequestBody>(request, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const action = parseAction(bodyResult.value.action);
  if (!action) {
    return NextResponse.json(
      { ok: false, errors: [{ field: "action", message: "Invalid debug scrape action." }] },
      { status: 400 },
    );
  }

  const bodyHandle =
    typeof bodyResult.value.xHandle === "string" ? bodyResult.value.xHandle : null;
  const workspaceHandle = await resolveWorkspaceHandleForRequest({
    request,
    session,
    bodyHandle,
    allowSessionFallback: true,
  });
  if (!workspaceHandle.ok) {
    return workspaceHandle.response;
  }

  const xHandle = workspaceHandle.xHandle;

  try {
    if (action === "recent_sync") {
      await bootstrapScrapeCaptureWithOptions(xHandle, {
        pages: 2,
        count: 40,
        targetOriginalPostCount: 40,
        maxDurationMs: 10_000,
        forceRefresh: true,
        mergeWithExisting: true,
        userAgent: "profile-scrape-debug-recent",
      });

      const capture = await readLatestScrapeCaptureByAccount(xHandle);
      return NextResponse.json({
        ok: true,
        action,
        capture,
        notice: `Recent scrape sync finished for @${xHandle}.`,
      });
    }

    const latestRun = await readLatestOnboardingRunByHandle(session.user.id, xHandle);
    if (!latestRun) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              field: "run",
              message: `No onboarding run was available for @${xHandle}, so background sync could not be queued.`,
            },
          ],
        },
        { status: 409 },
      );
    }

    const queued = await maybeEnqueueOnboardingBackfillJob({
      runId: latestRun.runId,
      input: latestRun.input,
      result: latestRun.result,
    });
    if (!queued.queued || !queued.jobId) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              field: "sync",
              message: `Background sync was not queued for @${xHandle}.`,
            },
          ],
        },
        { status: 409 },
      );
    }

    const capture = await readLatestScrapeCaptureByAccount(xHandle);
    return NextResponse.json({
      ok: true,
      action,
      capture,
      notice: `Background sync queued for @${xHandle}.`,
      jobId: queued.jobId,
    });
  } catch (error) {
    console.error("Failed to run scrape debug action:", error);
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            field: "action",
            message:
              error instanceof Error
                ? error.message
                : "Failed to run scrape debug action.",
          },
        ],
      },
      { status: 502 },
    );
  }
}
