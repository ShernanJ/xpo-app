import type { XPinnedPost } from "../types.ts";

const DEFAULT_X_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStableMediaUrl(value: string | null): string | null {
  const normalized = asString(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() === "t.co") {
      return null;
    }

    if (url.hostname.toLowerCase() === "pbs.twimg.com") {
      const extensionMatch = url.pathname.match(/\.([a-z0-9]+)$/i);
      if (extensionMatch?.[1] && !url.searchParams.has("format")) {
        url.searchParams.set("format", extensionMatch[1].toLowerCase());
      }
      if (!url.searchParams.has("name")) {
        url.searchParams.set("name", "large");
      }
    }

    return url.toString();
  } catch {
    return normalized;
  }
}

function uniqueImageUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeStableMediaUrl(value ?? null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function collectMediaImageUrls(value: Record<string, unknown>): string[] {
  const candidates = [
    ...(Array.isArray(value.mediaDetails) ? value.mediaDetails : []),
    ...(Array.isArray(value.photos) ? value.photos : []),
    ...(Array.isArray(asRecord(value.entities)?.media)
      ? (asRecord(value.entities)?.media as unknown[])
      : []),
    ...(Array.isArray(asRecord(value.extended_entities)?.media)
      ? (asRecord(value.extended_entities)?.media as unknown[])
      : []),
  ];

  const imageUrls: string[] = [];
  for (const candidateValue of candidates) {
    const candidate = asRecord(candidateValue);
    if (!candidate) {
      continue;
    }

    const type = asString(candidate.type)?.toLowerCase() ?? null;
    if (type === "video" || type === "animated_gif" || type === "gif") {
      continue;
    }

    const imageUrl =
      asString(candidate.media_url_https) ??
      asString(candidate.media_url) ??
      asString(candidate.imageUrl) ??
      asString(candidate.url);

    if (imageUrl) {
      imageUrls.push(imageUrl);
    }
  }

  return uniqueImageUrls(imageUrls);
}

function parseMetaImageUrls(html: string): string[] {
  const patterns = [
    /<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image(?::src)?["']/gi,
    /<meta[^>]+(?:name|property)=["']og:image(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']og:image(?::url|:secure_url)?["']/gi,
  ];

  const imageUrls: string[] = [];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1]) {
        imageUrls.push(match[1]);
      }
    }
  }

  return uniqueImageUrls(imageUrls);
}

function buildStatusUrl(pinnedPost: XPinnedPost): string | null {
  const explicitUrl = asString(pinnedPost.url);
  if (explicitUrl) {
    return explicitUrl;
  }

  const id = asString(pinnedPost.id);
  if (!id) {
    return null;
  }

  return `https://x.com/i/web/status/${id}`;
}

function buildSyndicationUrl(postId: string): string {
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
  url.searchParams.set("id", postId);
  url.searchParams.set("lang", "en");
  url.searchParams.set(
    "token",
    Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "profilemedia",
  );
  return url.toString();
}

async function resolveFromSyndication(postId: string): Promise<string[]> {
  const response = await fetch(buildSyndicationUrl(postId), {
    method: "GET",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": DEFAULT_X_WEB_USER_AGENT,
      referer: "https://x.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as unknown;
  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  return collectMediaImageUrls(record);
}

async function resolveFromHtml(statusUrl: string): Promise<string[]> {
  const response = await fetch(statusUrl, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": process.env.X_WEB_USER_AGENT?.trim() || DEFAULT_X_WEB_USER_AGENT,
      referer: "https://x.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  return parseMetaImageUrls(await response.text());
}

export async function resolvePinnedPostImageUrls(
  pinnedPost: XPinnedPost | null | undefined,
): Promise<string[] | null> {
  if (!pinnedPost) {
    return null;
  }

  const existingImageUrls = uniqueImageUrls(pinnedPost.imageUrls ?? []);
  if (existingImageUrls.length > 0) {
    return existingImageUrls;
  }

  const postId = asString(pinnedPost.id);
  if (postId) {
    try {
      const syndicationUrls = await resolveFromSyndication(postId);
      if (syndicationUrls.length > 0) {
        return syndicationUrls;
      }
    } catch {}
  }

  const statusUrl = buildStatusUrl(pinnedPost);
  if (!statusUrl) {
    return null;
  }

  try {
    const htmlUrls = await resolveFromHtml(statusUrl);
    return htmlUrls.length > 0 ? htmlUrls : null;
  } catch {
    return null;
  }
}
