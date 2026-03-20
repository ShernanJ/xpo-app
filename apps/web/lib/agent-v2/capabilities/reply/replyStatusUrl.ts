export interface ParsedXStatusUrl {
  canonicalUrl: string;
  authorHandle: string | null;
  postId: string;
}

const STATUS_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const HANDLE_STATUS_PATH_PATTERN =
  /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/i;
const WEB_STATUS_PATH_PATTERN =
  /^\/i\/(?:web\/)?status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/i;

export function parseXStatusUrl(value: string): ParsedXStatusUrl | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (!STATUS_HOSTS.has(host)) {
    return null;
  }

  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
  const handleMatch = pathname.match(HANDLE_STATUS_PATH_PATTERN);
  if (handleMatch) {
    const authorHandle = handleMatch[1]!.toLowerCase();
    const postId = handleMatch[2]!;
    return {
      canonicalUrl: `https://x.com/${authorHandle}/status/${postId}`,
      authorHandle,
      postId,
    };
  }

  const webMatch = pathname.match(WEB_STATUS_PATH_PATTERN);
  if (webMatch) {
    const postId = webMatch[1]!;
    return {
      canonicalUrl: `https://x.com/i/web/status/${postId}`,
      authorHandle: null,
      postId,
    };
  }

  return null;
}

export function isStandaloneXStatusUrl(value: string): boolean {
  return parseXStatusUrl(value) !== null;
}
