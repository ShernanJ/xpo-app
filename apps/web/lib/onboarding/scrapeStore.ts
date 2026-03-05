import { randomUUID } from "crypto";
import { access, appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { XPublicPost, XPublicProfile } from "./types";

export interface StoredScrapeCapture {
  captureId: string;
  capturedAt: string;
  account: string;
  profile: XPublicProfile;
  posts: XPublicPost[];
  replyPosts?: XPublicPost[];
  quotePosts?: XPublicPost[];
  metadata: {
    source: "manual_import" | "agent";
    userAgent: string | null;
  };
}

export const SCRAPE_CAPTURE_TTL_MS = 1000 * 60 * 60 * 24 * 2;

function candidateScrapeStorePaths(): string[] {
  if (process.env.SCRAPE_STORE_PATH) {
    return [process.env.SCRAPE_STORE_PATH];
  }

  const cwd = process.cwd();
  return [
    path.resolve(cwd, "db", "x-scrape-captures.jsonl"),
    path.resolve(cwd, "..", "..", "db", "x-scrape-captures.jsonl"),
  ];
}

async function resolveScrapeStorePath(): Promise<string> {
  const candidates = candidateScrapeStorePaths();
  for (const candidate of candidates) {
    try {
      await access(path.dirname(candidate));
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return candidates[0];
}

export function isScrapeCaptureExpired(
  capturedAt: string,
  nowMs = Date.now(),
): boolean {
  const capturedAtMs = new Date(capturedAt).getTime();
  if (!Number.isFinite(capturedAtMs)) {
    return true;
  }

  return nowMs - capturedAtMs >= SCRAPE_CAPTURE_TTL_MS;
}

function parseStoredCaptureLine(line: string): StoredScrapeCapture | null {
  try {
    const parsed = JSON.parse(line) as StoredScrapeCapture;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.account !== "string" ||
      typeof parsed.capturedAt !== "string"
    ) {
      return null;
    }

    return {
      ...parsed,
      account: parsed.account.toLowerCase(),
      profile: {
        ...parsed.profile,
        username: parsed.profile.username.toLowerCase(),
      },
    };
  } catch {
    return null;
  }
}

async function writeAllCaptures(
  storePath: string,
  captures: StoredScrapeCapture[],
): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  const body = captures.map((capture) => JSON.stringify(capture)).join("\n");
  await writeFile(storePath, body ? `${body}\n` : "", "utf8");
}

async function readAllCaptures(): Promise<StoredScrapeCapture[]> {
  const storePath = await resolveScrapeStorePath();

  try {
    const parsed = (await readFile(storePath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseStoredCaptureLine(line))
      .filter((capture): capture is StoredScrapeCapture => capture !== null);
    const activeCaptures = parsed.filter(
      (capture) => !isScrapeCaptureExpired(capture.capturedAt),
    );

    if (activeCaptures.length !== parsed.length) {
      await writeAllCaptures(storePath, activeCaptures);
    }

    return activeCaptures;
  } catch {
    return [];
  }
}

export async function persistScrapeCapture(params: {
  account: string;
  profile: XPublicProfile;
  posts: XPublicPost[];
  replyPosts?: XPublicPost[];
  quotePosts?: XPublicPost[];
  source?: "manual_import" | "agent";
  userAgent: string | null;
}): Promise<{ captureId: string; capturedAt: string }> {
  const storePath = await resolveScrapeStorePath();
  const activeCaptures = await readAllCaptures();
  await writeAllCaptures(storePath, activeCaptures);
  await mkdir(path.dirname(storePath), { recursive: true });

  const captureId = `sc_${randomUUID()}`;
  const capturedAt = new Date().toISOString();
  const record: StoredScrapeCapture = {
    captureId,
    capturedAt,
    account: params.account.toLowerCase(),
    profile: {
      ...params.profile,
      username: params.account.toLowerCase(),
    },
    posts: params.posts,
    replyPosts: params.replyPosts ?? [],
    quotePosts: params.quotePosts ?? [],
    metadata: {
      source: params.source ?? "manual_import",
      userAgent: params.userAgent,
    },
  };

  await appendFile(storePath, `${JSON.stringify(record)}\n`, "utf8");

  return { captureId, capturedAt };
}

export async function readLatestScrapeCaptureByAccount(
  account: string,
): Promise<StoredScrapeCapture | null> {
  const normalized = account.toLowerCase();
  const all = await readAllCaptures();
  for (let index = all.length - 1; index >= 0; index -= 1) {
    if (all[index]?.account === normalized) {
      return all[index];
    }
  }

  return null;
}

export async function readRecentScrapeCaptures(
  limit = 10,
): Promise<StoredScrapeCapture[]> {
  const all = await readAllCaptures();
  return all.slice(-Math.max(1, limit)).reverse();
}
