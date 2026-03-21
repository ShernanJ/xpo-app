import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/serverSession";
import { inngest } from "@/lib/inngest/client";
import { bootstrapScrapeCaptureWithOptions } from "@/lib/onboarding/sources/scrapeBootstrap";
import { readLatestScrapeCaptureByAccount } from "@/lib/onboarding/store/scrapeCaptureStore";
import {
  enforceSessionMutationRateLimit,
  parseJsonBody,
  requireAllowedOrigin,
} from "@/lib/security/requestValidation";
import { resolveWorkspaceHandleForRequest } from "@/lib/workspaceHandle.server";
import { inspectScraperSessionsHealth } from "@/lib/x-scrape/userTweetsCapture.mjs";

type ScrapeDebugAction = "recent_sync" | "deep_backfill" | "session_health";

interface ScrapeDebugRequestBody {
  action?: unknown;
  xHandle?: unknown;
}

function isDebugEnabled() {
  return process.env.NODE_ENV !== "production";
}

function parseAction(value: unknown): ScrapeDebugAction | null {
  return value === "recent_sync" || value === "deep_backfill" || value === "session_health"
    ? value
    : null;
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
      const prepared = await bootstrapScrapeCaptureWithOptions(xHandle, {
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
        telemetry: prepared.scrapeTelemetry,
        notice: prepared.scrapeTelemetry?.sessionId
          ? `Recent scrape sync finished for @${xHandle} via session ${prepared.scrapeTelemetry.sessionId}.`
          : `Recent scrape sync finished for @${xHandle}.`,
      });
    }

    if (action === "session_health") {
      const sessionHealth = await inspectScraperSessionsHealth({
        account: xHandle,
        userAgent: "profile-scrape-debug-health",
      });

      return NextResponse.json({
        ok: true,
        action,
        capture: await readLatestScrapeCaptureByAccount(xHandle),
        sessionHealth,
        notice:
          sessionHealth.sessions.length > 0
            ? `Checked ${sessionHealth.sessions.length} scraper session${sessionHealth.sessions.length === 1 ? "" : "s"} against @${xHandle}.`
            : "No scraper sessions were configured to check.",
      });
    }

    const prepared = await bootstrapScrapeCaptureWithOptions(xHandle, {
      pages: 2,
      count: 40,
      targetOriginalPostCount: 40,
      maxDurationMs: 12_000,
      forceRefresh: true,
      mergeWithExisting: true,
      userAgent: "profile-scrape-debug-deep",
    });
    if (!prepared.nextCursor) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              field: "sync",
              message: `A deeper cursor was not available for @${xHandle}, so deep backfill could not be queued.`,
            },
          ],
        },
        { status: 409 },
      );
    }

    await inngest.send({
      name: "onboarding/deep.backfill.started",
      data: {
        account: xHandle,
        cursor: prepared.nextCursor,
        userId: session.user.id,
      },
    });

    const capture = await readLatestScrapeCaptureByAccount(xHandle);
    return NextResponse.json({
      ok: true,
      action,
      capture,
      telemetry: prepared.scrapeTelemetry,
      notice: prepared.scrapeTelemetry?.sessionId
        ? `Deep backfill queued for @${xHandle} after refreshing with session ${prepared.scrapeTelemetry.sessionId}.`
        : `Deep backfill queued for @${xHandle}.`,
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
