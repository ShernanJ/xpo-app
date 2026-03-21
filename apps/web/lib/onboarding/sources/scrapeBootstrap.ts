import { readLatestScrapeCaptureByAccount } from "../store/scrapeCaptureStore";
import type { OnboardingSyncState, XPublicPost } from "../types";
import { runUserTweetsCapture } from "../../x-scrape/userTweetsCapture.mjs";
import {
  buildCaptureSyncState,
  buildSearchTimelineQuery,
  fetchSearchTimelinePage,
  resolveSearchTimelineMetadata,
} from "../../x-scrape/searchTimelineCapture";
import { importUserTweetsPayload } from "./importScrapePayload";
import { parseUserTweetsGraphqlPayload } from "./scrapeUserTweetsParser";

export interface BootstrapImportResult {
  captureId: string;
  capturedAt: string;
  account: string;
  profile: unknown;
  postsImported: number;
  replyPostsImported: number;
  quotePostsImported: number;
  nextCursor: string | null;
  captureState?: OnboardingSyncState | null;
  usedExistingCapture: boolean;
  scrapeTelemetry: {
    uniqueOriginalPostsCollected: number;
    totalRawPostCount: number;
    sessionId: string | null;
    rotatedSessionIds: string[];
    didRotateSession: boolean;
  } | null;
}

type ScrapeCaptureMode = "search_timeline" | "user_tweets";

function getConfiguredScrapeCaptureMode(): ScrapeCaptureMode {
  const raw = process.env.ONBOARDING_SCRAPE_CAPTURE_MODE?.trim().toLowerCase();
  return raw === "user_tweets" ? "user_tweets" : "search_timeline";
}

function getOldestObservedPostYear(posts: XPublicPost[]): number | null {
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

async function runSearchTimelineSeedCapture(args: {
  account: string;
  count: number;
  pages: number;
  targetOriginalPostCount: number;
  userAgent: string;
  mergeWithExisting?: boolean;
  phase?: OnboardingSyncState["phase"];
}) {
  const metadata = await resolveSearchTimelineMetadata({
    account: args.account,
    userAgent: args.userAgent,
  });
  const rawQuery = buildSearchTimelineQuery({ account: args.account });
  let cursor: string | null = null;
  let previousCursor: string | null = null;
  let lastImport: Awaited<ReturnType<typeof importUserTweetsPayload>> | null = null;
  let totalOriginalPosts = 0;
  let totalRawPostCount = 0;
  let sessionId: string | null = null;
  let didRotateSession = false;
  const rotatedSessionIds = new Set<string>();
  let oldestObservedPostYear: number | null = null;

  for (let pageNumber = 0; pageNumber < args.pages; pageNumber += 1) {
    const page = await fetchSearchTimelinePage({
      account: args.account,
      count: args.count,
      cursor,
      fleet: "onboarding",
      rawQuery,
      userAgent: args.userAgent,
    });
    const parsed = parseUserTweetsGraphqlPayload({
      payload: page.payload,
      account: args.account,
      includeReplies: false,
      includeQuotes: true,
    });
    const observedYear = getOldestObservedPostYear([
      ...parsed.posts,
      ...parsed.quotePosts,
    ]);
    if (observedYear !== null) {
      oldestObservedPostYear =
        oldestObservedPostYear === null
          ? observedYear
          : Math.min(oldestObservedPostYear, observedYear);
    }

    const captureState = buildCaptureSyncState({
      metadata,
      phase: args.phase ?? "seed",
      oldestObservedPostYear,
    });
    lastImport = await importUserTweetsPayload({
      account: args.account,
      payload: page.payload,
      captureState,
      mergeWithExisting: args.mergeWithExisting,
      profileOverride: metadata.profile,
      source: "bootstrap",
      userAgent: args.userAgent,
    });
    totalOriginalPosts += parsed.posts.length;
    totalRawPostCount += page.totalPostCount;

    if (sessionId && page.sessionId && page.sessionId !== sessionId) {
      rotatedSessionIds.add(page.sessionId);
      didRotateSession = true;
    }
    sessionId = page.sessionId ?? sessionId;

    if (!page.nextCursor || page.nextCursor === cursor || page.nextCursor === previousCursor) {
      cursor = page.nextCursor;
      break;
    }

    if (totalOriginalPosts >= args.targetOriginalPostCount) {
      cursor = page.nextCursor;
      break;
    }

    previousCursor = cursor;
    cursor = page.nextCursor;
  }

  if (!lastImport) {
    throw new Error(`SearchTimeline seed capture produced no importable pages for @${args.account}.`);
  }

  return {
    ...lastImport,
    nextCursor: cursor,
    captureState: buildCaptureSyncState({
      metadata,
      phase: args.phase ?? "seed",
      oldestObservedPostYear,
    }),
    usedExistingCapture: false,
    scrapeTelemetry: {
      uniqueOriginalPostsCollected: totalOriginalPosts,
      totalRawPostCount,
      sessionId,
      rotatedSessionIds: Array.from(rotatedSessionIds),
      didRotateSession,
    },
  } satisfies BootstrapImportResult;
}

function extractScrapeTelemetry(payload: unknown, parsed: {
  posts: { length: number };
  replyPosts: { length: number };
  quotePosts: { length: number };
}) {
  const scrapeTelemetryRoot =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).__scrapeMeta
      : null;

  return scrapeTelemetryRoot &&
    typeof scrapeTelemetryRoot === "object" &&
    !Array.isArray(scrapeTelemetryRoot)
    ? {
        uniqueOriginalPostsCollected: parsed.posts.length,
        totalRawPostCount:
          typeof (scrapeTelemetryRoot as Record<string, unknown>).totalRawPostCount === "number"
            ? ((scrapeTelemetryRoot as Record<string, unknown>).totalRawPostCount as number)
            : parsed.posts.length + parsed.replyPosts.length + parsed.quotePosts.length,
        sessionId:
          typeof (scrapeTelemetryRoot as Record<string, unknown>).sessionId === "string"
            ? ((scrapeTelemetryRoot as Record<string, unknown>).sessionId as string)
            : null,
        rotatedSessionIds: Array.isArray(
          (scrapeTelemetryRoot as Record<string, unknown>).rotatedSessionIds,
        )
          ? ((scrapeTelemetryRoot as Record<string, unknown>).rotatedSessionIds as unknown[])
              .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [],
        didRotateSession:
          (scrapeTelemetryRoot as Record<string, unknown>).didRotateSession === true,
      }
    : {
        uniqueOriginalPostsCollected: parsed.posts.length,
        totalRawPostCount:
          parsed.posts.length + parsed.replyPosts.length + parsed.quotePosts.length,
        sessionId: null,
        rotatedSessionIds: [],
        didRotateSession: false,
      };
}

export async function bootstrapScrapeCapture(account: string) {
  const pages = Math.max(
    1,
    Math.min(
      12,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_SYNC_MAX_PAGES))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_SYNC_MAX_PAGES))
        : Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_PAGES))
          ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_PAGES))
          : 6,
    ),
  );
  const count = Math.max(
    20,
    Math.min(
      100,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_COUNT))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_COUNT))
        : 40,
    ),
  );
  const targetOriginalPostCount = Math.max(
    20,
    Math.min(
      100,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_SYNC_TARGET))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_SYNC_TARGET))
        : 40,
    ),
  );
  const maxDurationMs = Math.max(
    4000,
    Math.min(
      30000,
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_SYNC_TIMEOUT_MS))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_SYNC_TIMEOUT_MS))
        : 10000,
    ),
  );
  return bootstrapScrapeCaptureWithOptions(account, {
    pages,
    count,
    targetOriginalPostCount,
    maxDurationMs,
    userAgent: "onboarding-bootstrap",
  });
}

export async function probeLatestScrapePosts(
  account: string,
  options?: {
    count?: number;
  },
): Promise<{ posts: XPublicPost[] }> {
  const count = Math.max(5, Math.min(100, Math.floor(options?.count ?? 20)));

  try {
    if (getConfiguredScrapeCaptureMode() === "search_timeline") {
      const page = await fetchSearchTimelinePage({
        account,
        count,
        fleet: "onboarding",
        rawQuery: buildSearchTimelineQuery({ account }),
      });
      const parsed = parseUserTweetsGraphqlPayload({
        payload: page.payload,
        account,
        includeReplies: false,
        includeQuotes: false,
      });

      return {
        posts: parsed.posts,
      };
    }

    const { payload } = await runUserTweetsCapture({
      account,
      count,
      pages: 1,
    });
    const parsed = parseUserTweetsGraphqlPayload({
      payload,
      account,
      includeReplies: false,
      includeQuotes: false,
    });

    return {
      posts: parsed.posts,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown probe failure";

    throw new Error(`Lightweight profile probe failed for @${account}: ${detail}`);
  }
}

export async function bootstrapScrapeCaptureWithOptions(
  account: string,
  options: {
    pages: number;
    count: number;
    targetOriginalPostCount?: number;
    maxDurationMs?: number;
    userAgent: string;
    forceRefresh?: boolean;
    mergeWithExisting?: boolean;
    captureMode?: ScrapeCaptureMode;
    phase?: OnboardingSyncState["phase"];
  },
) {
  const existingCapture = await readLatestScrapeCaptureByAccount(account);
  if (existingCapture && !options.forceRefresh) {
    return {
      captureId: existingCapture.captureId,
      capturedAt: existingCapture.capturedAt,
      account: existingCapture.account,
      profile: existingCapture.profile,
      postsImported: existingCapture.posts.length,
      replyPostsImported: existingCapture.replyPosts?.length ?? 0,
      quotePostsImported: existingCapture.quotePosts?.length ?? 0,
      nextCursor: null,
      captureState: existingCapture.captureState ?? null,
      usedExistingCapture: true,
      scrapeTelemetry: null,
    } satisfies BootstrapImportResult;
  }

  const pages = Math.max(1, Math.min(12, Math.floor(options.pages)));
  const count = Math.max(20, Math.min(100, Math.floor(options.count)));
  const targetOriginalPostCount = Math.max(
    20,
    Math.min(100, Math.floor(options.targetOriginalPostCount ?? count)),
  );
  const maxDurationMs = Math.max(
    1000,
    Math.min(30000, Math.floor(options.maxDurationMs ?? 10000)),
  );
  const captureMode = options.captureMode ?? getConfiguredScrapeCaptureMode();

  try {
    if (captureMode === "search_timeline") {
      return await runSearchTimelineSeedCapture({
        account,
        count,
        pages,
        targetOriginalPostCount,
        userAgent: options.userAgent,
        mergeWithExisting: options.mergeWithExisting,
        phase: options.phase,
      });
    }

    const { payload } = await runUserTweetsCapture({
      account,
      count,
      pages,
      targetOriginals: targetOriginalPostCount,
      maxDurationMs,
      userAgent: options.userAgent,
    });
    const parsed = parseUserTweetsGraphqlPayload({
      payload,
      account,
    });
    const scrapeTelemetry = extractScrapeTelemetry(payload, parsed);
    const imported = await importUserTweetsPayload({
      account,
      payload,
      source: "bootstrap",
      userAgent: options.userAgent,
      mergeWithExisting: options.mergeWithExisting,
    });
    return {
      ...imported,
      nextCursor:
        typeof payload === "object" &&
        payload &&
        !Array.isArray(payload) &&
        typeof payload.__scrapeMeta === "object" &&
        payload.__scrapeMeta &&
        !Array.isArray(payload.__scrapeMeta) &&
        (typeof payload.__scrapeMeta.nextCursor === "string" ||
          payload.__scrapeMeta.nextCursor === null)
          ? payload.__scrapeMeta.nextCursor
          : null,
      captureState: null,
      usedExistingCapture: false,
      scrapeTelemetry,
    } satisfies BootstrapImportResult;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown scrape bootstrap failure";

    throw new Error(`Live scrape bootstrap failed for @${account}: ${detail}`);
  }
}
