import { randomUUID } from "crypto";

import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
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

function ttlExpiryFor(capturedAt: Date): Date {
  return new Date(capturedAt.getTime() + SCRAPE_CAPTURE_TTL_MS);
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

function normalizeProfile(
  profile: XPublicProfile,
  account: string,
): XPublicProfile {
  return {
    ...profile,
    username: account,
  };
}

function asPostArray(value: unknown): XPublicPost[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as XPublicPost[];
}

function mapSource(raw: string): "manual_import" | "agent" {
  return raw === "manual_import" ? "manual_import" : "agent";
}

function toInputJson(value: XPublicProfile | XPublicPost[]): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function mapRowToStoredCapture(row: {
  captureId: string;
  capturedAt: Date;
  account: string;
  profile: unknown;
  posts: unknown;
  replyPosts: unknown;
  quotePosts: unknown;
  source: string;
  userAgent: string | null;
}): StoredScrapeCapture {
  return {
    captureId: row.captureId,
    capturedAt: row.capturedAt.toISOString(),
    account: row.account,
    profile: normalizeProfile(
      row.profile as XPublicProfile,
      row.account.toLowerCase(),
    ),
    posts: asPostArray(row.posts),
    replyPosts: asPostArray(row.replyPosts),
    quotePosts: asPostArray(row.quotePosts),
    metadata: {
      source: mapSource(row.source),
      userAgent: row.userAgent,
    },
  };
}

async function pruneExpiredCaptures(account?: string): Promise<void> {
  await prisma.scrapeCaptureCache.deleteMany({
    where: {
      ...(account ? { account: account.toLowerCase() } : {}),
      expiresAt: {
        lte: new Date(),
      },
    },
  });
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
  const normalizedAccount = params.account.toLowerCase();
  const capturedAt = new Date();
  const captureId = `sc_${randomUUID()}`;
  const source = params.source ?? "manual_import";

  await pruneExpiredCaptures(normalizedAccount);

  await prisma.scrapeCaptureCache.upsert({
    where: { account: normalizedAccount },
    create: {
      captureId,
      account: normalizedAccount,
      capturedAt,
      expiresAt: ttlExpiryFor(capturedAt),
      profile: toInputJson(normalizeProfile(params.profile, normalizedAccount)),
      posts: toInputJson(params.posts),
      replyPosts: toInputJson(params.replyPosts ?? []),
      quotePosts: toInputJson(params.quotePosts ?? []),
      source,
      userAgent: params.userAgent,
    },
    update: {
      captureId,
      capturedAt,
      expiresAt: ttlExpiryFor(capturedAt),
      profile: toInputJson(normalizeProfile(params.profile, normalizedAccount)),
      posts: toInputJson(params.posts),
      replyPosts: toInputJson(params.replyPosts ?? []),
      quotePosts: toInputJson(params.quotePosts ?? []),
      source,
      userAgent: params.userAgent,
    },
  });

  return {
    captureId,
    capturedAt: capturedAt.toISOString(),
  };
}

export async function readLatestScrapeCaptureByAccount(
  account: string,
): Promise<StoredScrapeCapture | null> {
  const normalizedAccount = account.toLowerCase();
  await pruneExpiredCaptures(normalizedAccount);

  const capture = await prisma.scrapeCaptureCache.findUnique({
    where: { account: normalizedAccount },
    select: {
      captureId: true,
      capturedAt: true,
      account: true,
      profile: true,
      posts: true,
      replyPosts: true,
      quotePosts: true,
      source: true,
      userAgent: true,
    },
  });

  if (!capture) {
    return null;
  }

  if (isScrapeCaptureExpired(capture.capturedAt.toISOString())) {
    await pruneExpiredCaptures(normalizedAccount);
    return null;
  }

  return mapRowToStoredCapture(capture);
}

export async function readRecentScrapeCaptures(
  limit = 10,
): Promise<StoredScrapeCapture[]> {
  await pruneExpiredCaptures();

  const captures = await prisma.scrapeCaptureCache.findMany({
    orderBy: { capturedAt: "desc" },
    take: Math.max(1, limit),
    select: {
      captureId: true,
      capturedAt: true,
      account: true,
      profile: true,
      posts: true,
      replyPosts: true,
      quotePosts: true,
      source: true,
      userAgent: true,
    },
  });

  return captures.map((capture) => mapRowToStoredCapture(capture));
}
