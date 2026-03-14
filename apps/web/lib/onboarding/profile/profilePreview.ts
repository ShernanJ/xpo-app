import { normalizeXAvatarUrl } from "./avatarUrl";
import { readLatestScrapeCaptureByAccount } from "../store/scrapeCaptureStore";
import type { XPublicProfile } from "../types";
import { normalizeAccountInput } from "../contracts/validation.ts";

const DEFAULT_X_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BEARER_TOKEN_CACHE_TTL_MS = 15 * 60 * 1000;
const QUERY_ID_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedWebBearerToken: { value: string; expiresAt: number } | null = null;
let cachedUserByScreenNameQueryId: { value: string; expiresAt: number } | null = null;

export type OnboardingPreviewSource =
  | "cache"
  | "user_by_screen_name"
  | "syndication"
  | "users_show"
  | "html"
  | "none";

export interface OnboardingPreviewAttempt {
  source: "cache" | "user_by_screen_name" | "syndication" | "users_show" | "html";
  status: "hit" | "miss" | "error" | "skipped";
  detail?: string;
}

interface PreviewAttemptResult {
  profile: XPublicProfile | null;
  attempt: OnboardingPreviewAttempt;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeJsonEscapes(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [rawName, ...rest] = segment.trim().split("=");
    if (rawName === name) {
      const value = rest.join("=").trim();
      return value ? value : null;
    }
  }

  return null;
}

function ensureCookieContainsCt0(cookie: string | null, csrfToken: string | null): string | null {
  if (!cookie) {
    return null;
  }

  if (!csrfToken || getCookieValue(cookie, "ct0")) {
    return cookie;
  }

  return `${cookie}; ct0=${csrfToken}`;
}

function buildFallbackProfile(account: string): XPublicProfile {
  return {
    username: account,
    name: account,
    bio: "",
    avatarUrl: null,
    isVerified: false,
    followersCount: 0,
    followingCount: 0,
    createdAt: new Date(0).toISOString(),
  };
}

function getConfiguredUserAgent(): string {
  return process.env.X_WEB_USER_AGENT?.trim() || DEFAULT_X_WEB_USER_AGENT;
}

function getConfiguredCookieAndCsrf(): { cookie: string | null; csrfToken: string | null } {
  const cookieRaw = process.env.X_WEB_COOKIE?.trim() || null;
  const csrfFromCookie = cookieRaw ? getCookieValue(cookieRaw, "ct0") : null;
  const csrfToken = process.env.X_WEB_CSRF_TOKEN?.trim() || csrfFromCookie || null;

  return {
    cookie: ensureCookieContainsCt0(cookieRaw, csrfToken),
    csrfToken,
  };
}

function toIsoDateOrFallback(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function parseCompactCount(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-9][0-9.,]*)([KMB])?$/i);
  if (!match) {
    return null;
  }

  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) {
    return null;
  }

  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : suffix === "B" ? 1_000_000_000 : 1;

  return Math.round(base * multiplier);
}

function parseNumberMatch(html: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function parseStringMatch(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeJsonEscapes(match[1]);
    }
  }

  return null;
}

function parseBooleanMatch(html: string, patterns: RegExp[]): boolean | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    if (match[1] === "true") {
      return true;
    }

    if (match[1] === "false") {
      return false;
    }
  }

  return null;
}

function getUserContextWindow(
  html: string,
  account: string,
  radius = 10_000,
): string | null {
  const marker = `"screen_name":"${account}"`;
  const matchIndex = html.indexOf(marker);
  if (matchIndex < 0) {
    return null;
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(html.length, matchIndex + marker.length + radius);
  return html.slice(start, end);
}

function parseMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escapedKey = escapeForRegex(key);
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedKey}["']`,
        "i",
      ),
    ];

    const match = parseStringMatch(html, patterns);
    if (match) {
      return decodeHtmlEntities(match);
    }
  }

  return null;
}

function parseTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }

  return decodeHtmlEntities(match[1]);
}

function extractOperationQueryIdFromJs(
  jsSource: string,
  operationName: string,
): string | null {
  const escapedOperation = escapeForRegex(operationName);
  const patterns = [
    new RegExp(`"([A-Za-z0-9_-]{20,})",operationName:"${escapedOperation}"`),
    new RegExp(
      `operationName:"${escapedOperation}"[^}]{0,800}?queryId:"([A-Za-z0-9_-]{20,})"`,
    ),
    new RegExp(
      `queryId:"([A-Za-z0-9_-]{20,})"[^}]{0,800}?operationName:"${escapedOperation}"`,
    ),
  ];

  for (const pattern of patterns) {
    const match = jsSource.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function referencesTargetAccount(account: string, value: string | null): boolean {
  if (!value) {
    return false;
  }

  const lowered = value.toLowerCase();
  const normalizedAccount = account.toLowerCase();

  return (
    lowered.includes(`@${normalizedAccount}`) ||
    lowered.includes(`/${normalizedAccount}`) ||
    lowered.includes(`%40${normalizedAccount}`)
  );
}

function looksLikeTargetProfilePage(account: string, html: string): boolean {
  const escapedAccount = escapeForRegex(account);

  const canonicalMatch = html.match(
    new RegExp(
      `<link[^>]+rel=["']canonical["'][^>]+href=["']https://(?:(?:www|mobile)\\.)?(?:x|twitter)\\.com/${escapedAccount}(?:[/"'#?]|["'])`,
      "i",
    ),
  );
  if (canonicalMatch) {
    return true;
  }

  const title = parseTitle(html);
  if (title?.match(new RegExp(`\\(@?${escapedAccount}\\)`, "i"))) {
    return true;
  }

  const metaTitle = parseMetaContent(html, ["twitter:title", "og:title"]);
  if (referencesTargetAccount(account, metaTitle)) {
    return true;
  }

  const metaUrl = parseMetaContent(html, ["twitter:url", "og:url"]);
  if (referencesTargetAccount(account, metaUrl)) {
    return true;
  }

  return new RegExp(`"screen_name":"${escapedAccount}"`).test(html);
}

function parseCountFromText(text: string | null, label: "followers" | "following"): number | null {
  if (!text) {
    return null;
  }

  const pattern =
    label === "followers"
      ? /([0-9][0-9.,]*[KMB]?)\s+Followers?/i
      : /([0-9][0-9.,]*[KMB]?)\s+Following/i;

  const match = text.match(pattern);
  if (!match?.[1]) {
    return null;
  }

  return parseCompactCount(match[1]);
}

function extractScriptUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const regex = /<script[^>]+src="([^"]+)"/gi;
  let match = regex.exec(html);
  while (match) {
    const src = match[1];
    if (src.includes("/responsive-web/client-web/") && src.endsWith(".js")) {
      urls.push(
        src.startsWith("http://") || src.startsWith("https://") ? src : `https://x.com${src}`,
      );
    }
    match = regex.exec(html);
  }

  return Array.from(new Set(urls));
}

function extractBearerTokenFromJs(jsSource: string): string | null {
  const patterns = [
    /Bearer\\s+([A-Za-z0-9%=_-]{30,})/,
    /"(AAAA[A-Za-z0-9%=_-]{30,})"/,
  ];

  for (const pattern of patterns) {
    const match = jsSource.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function loadClientScripts(userAgent: string): Promise<string[]> {
  const htmlResponse = await fetch("https://x.com", {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": userAgent,
    },
    cache: "no-store",
  });

  const html = await htmlResponse.text();
  if (!htmlResponse.ok) {
    throw new Error(`Failed loading x.com homepage (${htmlResponse.status}).`);
  }

  return extractScriptUrlsFromHtml(html).slice(0, 20);
}

async function discoverWebBearerToken(userAgent: string): Promise<string> {
  const now = Date.now();
  if (cachedWebBearerToken && cachedWebBearerToken.expiresAt > now) {
    return cachedWebBearerToken.value;
  }

  const envBearer = process.env.X_WEB_BEARER_TOKEN?.trim();
  if (envBearer) {
    cachedWebBearerToken = {
      value: envBearer,
      expiresAt: now + BEARER_TOKEN_CACHE_TTL_MS,
    };
    return envBearer;
  }

  const scripts = await loadClientScripts(userAgent);
  if (scripts.length === 0) {
    throw new Error("Could not find client scripts to discover web bearer token.");
  }

  for (const scriptUrl of scripts) {
    try {
      const scriptRes = await fetch(scriptUrl, {
        method: "GET",
        headers: {
          accept: "application/javascript,text/javascript,*/*",
          "user-agent": userAgent,
          referer: "https://x.com/",
        },
        cache: "no-store",
      });

      if (!scriptRes.ok) {
        continue;
      }

      const scriptText = await scriptRes.text();
      const bearer = extractBearerTokenFromJs(scriptText);
      if (bearer) {
        cachedWebBearerToken = {
          value: bearer,
          expiresAt: Date.now() + BEARER_TOKEN_CACHE_TTL_MS,
        };
        return bearer;
      }
    } catch {
      // Try next script.
    }
  }

  throw new Error("Unable to auto-discover web bearer token.");
}

async function discoverOperationQueryId(
  userAgent: string,
  operationName: string,
): Promise<string> {
  const scripts = await loadClientScripts(userAgent);
  if (scripts.length === 0) {
    throw new Error(`Could not find client scripts to discover ${operationName} queryId.`);
  }

  for (const scriptUrl of scripts) {
    try {
      const scriptRes = await fetch(scriptUrl, {
        method: "GET",
        headers: {
          accept: "application/javascript,text/javascript,*/*",
          "user-agent": userAgent,
          referer: "https://x.com/",
        },
        cache: "no-store",
      });

      if (!scriptRes.ok) {
        continue;
      }

      const scriptText = await scriptRes.text();
      const queryId = extractOperationQueryIdFromJs(scriptText, operationName);
      if (queryId) {
        return queryId;
      }
    } catch {
      // Try next script.
    }
  }

  throw new Error(`Unable to auto-discover ${operationName} queryId.`);
}

async function discoverUserByScreenNameQueryId(userAgent: string): Promise<string> {
  const now = Date.now();
  if (cachedUserByScreenNameQueryId && cachedUserByScreenNameQueryId.expiresAt > now) {
    return cachedUserByScreenNameQueryId.value;
  }

  const queryId = await discoverOperationQueryId(userAgent, "UserByScreenName");
  cachedUserByScreenNameQueryId = {
    value: queryId,
    expiresAt: now + QUERY_ID_CACHE_TTL_MS,
  };
  return queryId;
}

async function resolveGuestToken(
  bearerToken: string,
  userAgent: string,
): Promise<string> {
  const response = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "user-agent": userAgent,
      accept: "*/*",
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`guest_activate_http_${response.status}:${text.slice(0, 120)}`);
  }

  const json = JSON.parse(text) as { guest_token?: string };
  if (!json.guest_token) {
    throw new Error("guest_activate_missing_token");
  }

  return json.guest_token;
}

function buildAuthenticatedPreviewHeaders(params: {
  account: string;
  userAgent: string;
  bearerToken: string;
  cookie: string;
  csrfToken: string;
}): HeadersInit {
  return {
    authorization: `Bearer ${params.bearerToken}`,
    accept: "*/*",
    "content-type": "application/json",
    "user-agent": params.userAgent,
    referer: `https://x.com/${params.account}`,
    cookie: params.cookie,
    "x-csrf-token": params.csrfToken,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
  };
}

interface SyndicationProfileResponseItem {
  screen_name?: string;
  name?: string;
  profile_image_url_https?: string;
  profile_image_url?: string;
  verified?: boolean;
  followers_count?: number | string;
  friends_count?: number | string;
  description?: string;
}

function coerceCount(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

interface UserByScreenNameGraphqlResponse {
  data?: {
    user?: {
      result?: {
        avatar?: {
          image_url?: string;
        };
        core?: {
          created_at?: string;
          name?: string;
          screen_name?: string;
        };
        is_blue_verified?: boolean;
        legacy?: {
          description?: string;
          followers_count?: number;
          friends_count?: number;
          created_at?: string;
        };
        profile_bio?: {
          description?: string;
        };
        verification?: {
          verified?: boolean;
        };
      };
    };
  };
}

async function fetchProfilePreviewFromUserByScreenName(
  account: string,
): Promise<PreviewAttemptResult> {
  const userAgent = getConfiguredUserAgent();

  try {
    const [bearerToken, queryId] = await Promise.all([
      discoverWebBearerToken(userAgent),
      discoverUserByScreenNameQueryId(userAgent),
    ]);
    const guestToken = await resolveGuestToken(bearerToken, userAgent);

    const url = new URL(`https://api.x.com/graphql/${queryId}/UserByScreenName`);
    url.searchParams.set(
      "variables",
      JSON.stringify({
        screen_name: account,
        withGrokTranslatedBio: false,
      }),
    );
    url.searchParams.set(
      "features",
      JSON.stringify({
        hidden_profile_subscriptions_enabled: true,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        responsive_web_profile_redirect_enabled: false,
        rweb_tipjar_consumption_enabled: false,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: true,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      }),
    );
    url.searchParams.set(
      "fieldToggles",
      JSON.stringify({
        withPayments: false,
        withAuxiliaryUserLabels: true,
      }),
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${bearerToken}`,
        accept: "*/*",
        "content-type": "application/json",
        "user-agent": userAgent,
        referer: `https://x.com/${account}`,
        "x-guest-token": guestToken,
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        profile: null,
        attempt: {
          source: "user_by_screen_name",
          status: "miss",
          detail: `http_${response.status}`,
        },
      };
    }

    const json = JSON.parse(text) as UserByScreenNameGraphqlResponse;
    const result = json.data?.user?.result;
    const username = normalizeAccountInput(
      result?.core?.screen_name ?? account,
    ) ?? account;

    if (!result) {
      return {
        profile: null,
        attempt: {
          source: "user_by_screen_name",
          status: "miss",
          detail: "missing_result",
        },
      };
    }

    return {
      profile: {
        username,
        name: result.core?.name?.trim() || username,
        bio: result.profile_bio?.description ?? result.legacy?.description ?? "",
        avatarUrl: normalizeXAvatarUrl(result.avatar?.image_url ?? null),
        isVerified: Boolean(result.verification?.verified || result.is_blue_verified),
        followersCount:
          typeof result.legacy?.followers_count === "number"
            ? result.legacy.followers_count
            : 0,
        followingCount:
          typeof result.legacy?.friends_count === "number"
            ? result.legacy.friends_count
            : 0,
        createdAt: toIsoDateOrFallback(
          result.core?.created_at ?? result.legacy?.created_at ?? null,
          new Date(0).toISOString(),
        ),
      },
      attempt: {
        source: "user_by_screen_name",
        status: "hit",
      },
    };
  } catch (error) {
    return {
      profile: null,
      attempt: {
        source: "user_by_screen_name",
        status: "error",
        detail: error instanceof Error ? error.message.slice(0, 80) : "request_failed",
      },
    };
  }
}

async function fetchProfilePreviewFromSyndication(
  account: string,
): Promise<PreviewAttemptResult> {
  try {
    const url = new URL(
      "https://cdn.syndication.twimg.com/widgets/followbutton/info.json",
    );
    url.searchParams.set("screen_names", account);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": getConfiguredUserAgent(),
        referer: `https://x.com/${account}`,
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        profile: null,
        attempt: {
          source: "syndication",
          status: "miss",
          detail: `http_${response.status}`,
        },
      };
    }

    const json = JSON.parse(text) as unknown;
    const items = Array.isArray(json) ? (json as SyndicationProfileResponseItem[]) : [];
    const item = items.find((entry) => {
      const screenName = normalizeAccountInput(entry?.screen_name ?? "");
      return screenName?.toLowerCase() === account.toLowerCase();
    });

    if (!item) {
      return {
        profile: null,
        attempt: {
          source: "syndication",
          status: "miss",
          detail: "no_matching_profile",
        },
      };
    }

    const username = normalizeAccountInput(item.screen_name ?? "") ?? account;

    return {
      profile: {
        username,
        name: item.name?.trim() || username,
        bio: item.description ?? "",
        avatarUrl: normalizeXAvatarUrl(
          item.profile_image_url_https ?? item.profile_image_url ?? null,
        ),
        isVerified: Boolean(item.verified),
        followersCount: coerceCount(item.followers_count),
        followingCount: coerceCount(item.friends_count),
        createdAt: new Date(0).toISOString(),
      },
      attempt: {
        source: "syndication",
        status: "hit",
      },
    };
  } catch {
    return {
      profile: null,
      attempt: {
        source: "syndication",
        status: "error",
        detail: "request_failed",
      },
    };
  }
}

function parseProfileFromHtml(account: string, html: string): XPublicProfile | null {
  const escapedAccount = escapeForRegex(account);
  const userContext = getUserContextWindow(html, account) ?? html;
  const fallback = buildFallbackProfile(account);
  const title = parseTitle(html);
  const metaTitle = parseMetaContent(html, ["twitter:title", "og:title"]);
  const metaDescription = parseMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);
  const metaTitleName =
    metaTitle?.match(new RegExp(`^(.+?)\\s*\\(@?${escapedAccount}\\)`, "i"))?.[1] ?? null;
  const titleName =
    title?.match(new RegExp(`^(.+?)\\s*\\(@?${escapedAccount}\\)`, "i"))?.[1] ?? null;
  const titleSuffixName =
    title?.match(new RegExp(`^(.+?)\\s+on\\s+X(?::|$)`, "i"))?.[1]?.trim() ?? null;
  const bio = parseStringMatch(userContext, [
    /"description":"([^"]*)"/,
  ]);
  const avatarUrl = parseStringMatch(html, [
    /<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image(?::src)?["']/i,
    /<meta[^>]+(?:name|property)=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']og:image["']/i,
    new RegExp(`"screen_name":"${escapedAccount}"[^]{0,1600}?"profile_image_url_https":"([^"]+)"`),
    new RegExp(`"screen_name":"${escapedAccount}"[^]{0,1600}?"profile_image_url":"([^"]+)"`),
  ]);
  const isVerified = parseBooleanMatch(userContext, [
    /"is_blue_verified":(true|false)/,
    /"verified":(true|false)/,
  ]);

  const followersCount = parseNumberMatch(userContext, [
    /"followers_count":(\d+)/,
  ]) ?? parseCountFromText(metaDescription, "followers");
  const followingCount = parseNumberMatch(userContext, [
    /"friends_count":(\d+)/,
  ]) ?? parseCountFromText(metaDescription, "following");
  const createdAtRaw = parseStringMatch(userContext, [
    /"created_at":"([^"]+)"/,
  ]);
  const hasAccountSignal =
    looksLikeTargetProfilePage(account, html) ||
    referencesTargetAccount(account, title) ||
    referencesTargetAccount(account, metaTitle);

  if (!hasAccountSignal) {
    return null;
  }

  const createdAt = toIsoDateOrFallback(createdAtRaw, fallback.createdAt);
  const displayName = metaTitleName ?? titleName ?? titleSuffixName ?? fallback.name;

  return {
    username: account,
    name: displayName,
    bio: bio ?? fallback.bio,
    avatarUrl: normalizeXAvatarUrl(avatarUrl ? decodeHtmlEntities(avatarUrl) : null),
    isVerified: isVerified ?? fallback.isVerified,
    followersCount: followersCount ?? fallback.followersCount,
    followingCount: followingCount ?? fallback.followingCount,
    createdAt,
  };
}

function parseAvatarUrlFromPhotoHtml(html: string): string | null {
  const fromImageTag = parseStringMatch(html, [
    /<img[^>]+src="(https:\/\/pbs\.twimg\.com\/profile_images\/[^"]+)"/i,
    /<img[^>]+src='(https:\/\/pbs\.twimg\.com\/profile_images\/[^']+)'/i,
  ]);
  if (fromImageTag) {
    return normalizeXAvatarUrl(decodeHtmlEntities(fromImageTag));
  }

  const fromMeta = parseMetaContent(html, ["twitter:image", "twitter:image:src", "og:image"]);
  return normalizeXAvatarUrl(fromMeta);
}

async function fetchAvatarFromPhotoPage(account: string): Promise<string | null> {
  const userAgent = getConfiguredUserAgent();
  const { cookie } = getConfiguredCookieAndCsrf();

  try {
    const response = await fetch(`https://x.com/${account}/photo`, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": userAgent,
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return parseAvatarUrlFromPhotoHtml(html);
  } catch {
    return null;
  }
}

async function fetchProfilePreviewFromHtml(account: string): Promise<XPublicProfile | null> {
  const userAgent = getConfiguredUserAgent();
  const { cookie } = getConfiguredCookieAndCsrf();

  try {
    const response = await fetch(`https://x.com/${account}`, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": userAgent,
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parsed = parseProfileFromHtml(account, html);
    const photoAvatarUrl = await fetchAvatarFromPhotoPage(account);

    if (parsed) {
      return {
        ...parsed,
        avatarUrl: parsed.avatarUrl ?? photoAvatarUrl,
      };
    }

    if (photoAvatarUrl) {
      return {
        ...buildFallbackProfile(account),
        avatarUrl: photoAvatarUrl,
      };
    }

    return null;
  } catch {
    return null;
  }
}

interface UsersShowResponse {
  screen_name?: string;
  name?: string;
  description?: string;
  profile_image_url_https?: string;
  profile_image_url?: string;
  verified?: boolean;
  followers_count?: number;
  friends_count?: number;
  created_at?: string;
}

async function fetchProfilePreviewFromUsersShow(
  account: string,
): Promise<PreviewAttemptResult> {
  const { cookie, csrfToken } = getConfiguredCookieAndCsrf();
  if (!cookie || !csrfToken) {
    return {
      profile: null,
      attempt: {
        source: "users_show",
        status: "skipped",
        detail: "missing_auth",
      },
    };
  }

  const userAgent = getConfiguredUserAgent();

  try {
    const bearerToken = await discoverWebBearerToken(userAgent);
    const url = new URL("https://x.com/i/api/1.1/users/show.json");
    url.searchParams.set("screen_name", account);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: buildAuthenticatedPreviewHeaders({
        account,
        userAgent,
        bearerToken,
        cookie,
        csrfToken,
      }),
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        profile: null,
        attempt: {
          source: "users_show",
          status: "miss",
          detail: `http_${response.status}`,
        },
      };
    }

    const json = JSON.parse(text) as UsersShowResponse;
    const username = normalizeAccountInput(json.screen_name ?? "") ?? account;

    return {
      profile: {
        username,
        name: json.name?.trim() || username,
        bio: json.description ?? "",
        avatarUrl: normalizeXAvatarUrl(
          json.profile_image_url_https ?? json.profile_image_url ?? null,
        ),
        isVerified: Boolean(json.verified),
        followersCount:
          typeof json.followers_count === "number" && Number.isFinite(json.followers_count)
            ? json.followers_count
            : 0,
        followingCount:
          typeof json.friends_count === "number" && Number.isFinite(json.friends_count)
            ? json.friends_count
            : 0,
        createdAt: toIsoDateOrFallback(json.created_at ?? null, new Date(0).toISOString()),
      },
      attempt: {
        source: "users_show",
        status: "hit",
      },
    };
  } catch {
    return {
      profile: null,
      attempt: {
        source: "users_show",
        status: "error",
        detail: "request_failed",
      },
    };
  }
}

async function fetchProfilePreviewFromHtmlAttempt(
  account: string,
): Promise<PreviewAttemptResult> {
  try {
    const profile = await fetchProfilePreviewFromHtml(account);
    if (profile) {
      return {
        profile,
        attempt: {
          source: "html",
          status: "hit",
        },
      };
    }

    return {
      profile: null,
      attempt: {
        source: "html",
        status: "miss",
        detail: "no_profile_signal",
      },
    };
  } catch {
    return {
      profile: null,
      attempt: {
        source: "html",
        status: "error",
        detail: "request_failed",
      },
    };
  }
}

async function fetchProfilePreviewWithAttempts(account: string): Promise<{
  profile: XPublicProfile | null;
  source: Exclude<OnboardingPreviewSource, "cache" | "none"> | "none";
  attempts: OnboardingPreviewAttempt[];
}> {
  const attempts: OnboardingPreviewAttempt[] = [];

  const userByScreenNameResult = await fetchProfilePreviewFromUserByScreenName(account);
  attempts.push(userByScreenNameResult.attempt);
  if (userByScreenNameResult.profile) {
    return {
      profile: userByScreenNameResult.profile,
      source: "user_by_screen_name",
      attempts,
    };
  }

  const syndicationResult = await fetchProfilePreviewFromSyndication(account);
  attempts.push(syndicationResult.attempt);
  if (syndicationResult.profile) {
    return {
      profile: syndicationResult.profile,
      source: "syndication",
      attempts,
    };
  }

  const usersShowResult = await fetchProfilePreviewFromUsersShow(account);
  attempts.push(usersShowResult.attempt);
  if (usersShowResult.profile) {
    return {
      profile: usersShowResult.profile,
      source: "users_show",
      attempts,
    };
  }

  const htmlResult = await fetchProfilePreviewFromHtmlAttempt(account);
  attempts.push(htmlResult.attempt);
  if (htmlResult.profile) {
    return {
      profile: htmlResult.profile,
      source: "html",
      attempts,
    };
  }

  return {
    profile: null,
    source: "none",
    attempts,
  };
}

export async function resolveFreshOnboardingProfilePreview(
  accountInput: string,
): Promise<XPublicProfile | null> {
  const account = normalizeAccountInput(accountInput);
  if (!account) {
    return null;
  }

  const result = await fetchProfilePreviewWithAttempts(account);
  return result.profile;
}

export async function resolveOnboardingProfilePreview(
  accountInput: string,
): Promise<{
  profile: XPublicProfile | null;
  source: OnboardingPreviewSource;
  attempts: OnboardingPreviewAttempt[];
}> {
  const account = normalizeAccountInput(accountInput);
  if (!account) {
    return { profile: null, source: "none", attempts: [] };
  }

  const latestCapture = await readLatestScrapeCaptureByAccount(account);
  if (latestCapture) {
    const livePreviewResult = await fetchProfilePreviewWithAttempts(account);
    const liveProfile = livePreviewResult.profile;
    const profile = {
      ...latestCapture.profile,
      ...(liveProfile?.avatarUrl &&
      liveProfile.avatarUrl !== latestCapture.profile.avatarUrl
        ? { avatarUrl: liveProfile.avatarUrl }
        : {}),
      isVerified:
        latestCapture.profile.isVerified || liveProfile?.isVerified || false,
    };

    return {
      profile,
      source: "cache",
      attempts: [
        {
          source: "cache",
          status: "hit",
        },
        ...livePreviewResult.attempts,
      ],
    };
  }

  return fetchProfilePreviewWithAttempts(account);
}
