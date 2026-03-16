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
      Number.isFinite(Number(process.env.ONBOARDING_SCRAPE_PAGES))
        ? Math.floor(Number(process.env.ONBOARDING_SCRAPE_PAGES))
        : 5,
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
  return bootstrapScrapeCaptureWithOptions(account, {
    pages,
    count,
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
    userAgent: string;
    forceRefresh?: boolean;
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
    } satisfies BootstrapImportResult;
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "stanley-onboarding-"));
  const outputPath = path.join(tmpDir, `${account}-payload.json`);
  const scriptPath = await resolveScrapeScriptPath();
  const pages = Math.max(1, Math.min(12, Math.floor(options.pages)));
  const count = Math.max(20, Math.min(100, Math.floor(options.count)));

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
        "--output",
        outputPath,
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 8,
      },
    );

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    return await importUserTweetsPayload({
      account,
      payload,
      source: "bootstrap",
      userAgent: options.userAgent,
    });
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
