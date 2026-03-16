import { access, mkdtemp, readFile, rm } from "fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "path";
import { promisify } from "util";

import { readLatestScrapeCaptureByAccount } from "../store/scrapeCaptureStore";
import type { XPublicPost } from "../types";
import { importUserTweetsPayload } from "./importScrapePayload";
import { parseUserTweetsGraphqlPayload } from "./scrapeUserTweetsParser";

const execFileAsync = promisify(execFile);

interface BootstrapImportResult {
  captureId: string;
  capturedAt: string;
  account: string;
  profile: unknown;
  postsImported: number;
  replyPostsImported: number;
  quotePostsImported: number;
  scrapeTelemetry: {
    uniqueOriginalPostsCollected: number;
    totalRawPostCount: number;
    sessionId: string | null;
    rotatedSessionIds: string[];
    didRotateSession: boolean;
  } | null;
}

async function resolveScrapeScriptPath(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "scripts", "scrape-user-tweets-http.mjs"),
    path.resolve(cwd, "apps", "web", "scripts", "scrape-user-tweets-http.mjs"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error("Could not resolve scrape-user-tweets-http.mjs for onboarding bootstrap.");
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
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "stanley-onboarding-probe-"));
  const outputPath = path.join(tmpDir, `${account}-payload.json`);
  const scriptPath = await resolveScrapeScriptPath();
  const count = Math.max(5, Math.min(100, Math.floor(options?.count ?? 20)));

  try {
    await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--account",
        account,
        "--count",
        String(count),
        "--pages",
        "1",
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 8,
      },
    );

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
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
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const detail =
      execError?.stderr?.trim() ||
      execError?.stdout?.trim() ||
      execError?.message ||
      "unknown probe failure";

    throw new Error(`Lightweight profile probe failed for @${account}: ${detail}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
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
      scrapeTelemetry: null,
    } satisfies BootstrapImportResult;
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "stanley-onboarding-"));
  const outputPath = path.join(tmpDir, `${account}-payload.json`);
  const scriptPath = await resolveScrapeScriptPath();
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

  try {
    await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--account",
        account,
        "--count",
        String(count),
        "--pages",
        String(pages),
        "--target-originals",
        String(targetOriginalPostCount),
        "--max-duration-ms",
        String(maxDurationMs),
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 8,
      },
    );

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    const parsed = parseUserTweetsGraphqlPayload({
      payload,
      account,
    });
    const scrapeTelemetryRoot =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).__scrapeMeta
        : null;
    const scrapeTelemetry =
      scrapeTelemetryRoot && typeof scrapeTelemetryRoot === "object" && !Array.isArray(scrapeTelemetryRoot)
        ? {
            uniqueOriginalPostsCollected: parsed.posts.length,
            totalRawPostCount:
              typeof (scrapeTelemetryRoot as Record<string, unknown>).totalRawPostCount === "number"
                ? ((scrapeTelemetryRoot as Record<string, unknown>).totalRawPostCount as number)
                : parsed.posts.length +
                  parsed.replyPosts.length +
                  parsed.quotePosts.length,
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
    const imported = await importUserTweetsPayload({
      account,
      payload,
      source: "bootstrap",
      userAgent: options.userAgent,
      mergeWithExisting: options.mergeWithExisting,
    });
    return {
      ...imported,
      scrapeTelemetry,
    } satisfies BootstrapImportResult;
  } catch (error) {
    const execError = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    const detail =
      execError?.stderr?.trim() ||
      execError?.stdout?.trim() ||
      execError?.message ||
      "unknown scrape bootstrap failure";

    throw new Error(`Live scrape bootstrap failed for @${account}: ${detail}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
