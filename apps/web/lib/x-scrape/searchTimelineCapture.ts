import { fetchXPublicProfile, hasXApiCredentials } from "@/lib/onboarding/sources/xApi";
import { parseUserTweetsGraphqlPayload } from "@/lib/onboarding/sources/scrapeUserTweetsParser";
import type {
  OnboardingSyncState,
  ScrapeRouteClass,
  XPublicProfile,
} from "@/lib/onboarding/types";
import { Pool } from "pg";

import {
  createSessionBroker,
  ensureCookieContainsCt0,
  getCookieValue,
} from "./sessionBroker.mjs";

const DEFAULT_X_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_FEATURES = {
  rweb_video_screen_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_share_attachment_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};
const DEFAULT_FIELD_TOGGLES = {
  withArticlePlainText: false,
};
const HARD_MIN_SEARCH_YEAR = 2006;
const HEAVYWEIGHT_STATUSES_CUTOFF = 2500;
const PROXY_LOCK_MS = 6 * 60 * 60 * 1000;
const DEFAULT_PROXY_TABLE = process.env.X_WEB_SCRAPER_PROXY_TABLE?.trim() || "ScraperProxyAccount";

export type SearchTimelineFleet = "onboarding" | "archive";

export interface SearchTimelineMetadata {
  profile: XPublicProfile;
  routeClass: ScrapeRouteClass;
  statusesCount: number | null;
  createdYear: number | null;
  searchYearFloor: number;
}

export interface SearchTimelineProgress {
  currentYear: number;
  cursor: string | null;
  previousCursor: string | null;
  consecutiveEmptyPages: number;
  yearSeenPostCount: number;
  exhaustedYears: number[];
  oldestObservedPostYear: number | null;
  nextJobId?: string | null;
}

export interface SearchTimelinePageResult {
  payload: unknown;
  nextCursor: string | null;
  originalPostCount: number;
  quotePostCount: number;
  totalPostCount: number;
  rateLimitRemaining: number | null;
  responseHeaders: Record<string, string>;
  sessionId: string | null;
}

interface AuthContext {
  bearerToken: string;
  cookie: string | null;
  csrfToken: string | null;
  guestToken: string | null;
  userAgent: string;
  sessionId: string | null;
  broker: Awaited<ReturnType<typeof createSessionBroker>>;
  sessionHandle: {
    sessionId: string | null;
  } | null;
}

interface FetchJsonResult<T> {
  json: T;
  headers: Record<string, string>;
}

export class SearchTimelineRateLimitError extends Error {
  sessionId: string | null;

  constructor(message: string, sessionId: string | null) {
    super(message);
    this.name = "SearchTimelineRateLimitError";
    this.sessionId = sessionId;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfiguredUserAgent(userAgent?: string | null): string {
  return userAgent?.trim() || process.env.X_WEB_USER_AGENT?.trim() || DEFAULT_X_WEB_USER_AGENT;
}

function buildDefaultProfile(account: string): XPublicProfile {
  return {
    username: account,
    name: account,
    bio: "",
    avatarUrl: null,
    headerImageUrl: null,
    isVerified: false,
    followersCount: 0,
    followingCount: 0,
    createdAt: new Date(0).toISOString(),
    statusesCount: null,
  };
}

function normalizeAccount(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("@")) {
    const handle = raw.slice(1).trim();
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
  }

  if (/^[A-Za-z0-9_]{1,15}$/.test(raw)) {
    return raw;
  }

  const urlCandidate =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;

  try {
    const parsed = new URL(urlCandidate);
    const host = parsed.hostname.toLowerCase();
    if (!["x.com", "www.x.com", "mobile.x.com"].includes(host)) {
      return null;
    }

    const [username = ""] = parsed.pathname.split("/").filter(Boolean);
    return /^[A-Za-z0-9_]{1,15}$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

function extractScriptUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const regex = /<script[^>]+src="([^"]+)"/gi;
  let match = regex.exec(html);
  while (match) {
    const src = match[1];
    if (src.includes("/responsive-web/client-web/") && src.endsWith(".js")) {
      urls.push(src.startsWith("http") ? src : `https://x.com${src}`);
    }
    match = regex.exec(html);
  }

  return Array.from(new Set(urls));
}

function extractOperationQueryIdFromJs(jsSource: string, operationName: string) {
  const escapedOperation = operationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function extractBearerTokenFromJs(jsSource: string) {
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

async function loadClientScripts(userAgent: string) {
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

async function discoverOperationQueryId(userAgent: string, operationName: string) {
  const scripts = await loadClientScripts(userAgent);
  if (scripts.length === 0) {
    throw new Error(`Could not find client scripts to discover ${operationName} queryId.`);
  }

  for (const scriptUrl of scripts) {
    try {
      const scriptResponse = await fetch(scriptUrl, {
        method: "GET",
        headers: {
          accept: "application/javascript,text/javascript,*/*",
          "user-agent": userAgent,
          referer: "https://x.com/",
        },
        cache: "no-store",
      });
      if (!scriptResponse.ok) {
        continue;
      }

      const scriptText = await scriptResponse.text();
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

async function discoverWebBearerToken(userAgent: string) {
  const scripts = await loadClientScripts(userAgent);
  if (scripts.length === 0) {
    throw new Error("Could not find client scripts to discover the web bearer token.");
  }

  for (const scriptUrl of scripts) {
    try {
      const scriptResponse = await fetch(scriptUrl, {
        method: "GET",
        headers: {
          accept: "application/javascript,text/javascript,*/*",
          "user-agent": userAgent,
          referer: "https://x.com/",
        },
        cache: "no-store",
      });
      if (!scriptResponse.ok) {
        continue;
      }

      const scriptText = await scriptResponse.text();
      const bearerToken = extractBearerTokenFromJs(scriptText);
      if (bearerToken) {
        return bearerToken;
      }
    } catch {
      // Try next script.
    }
  }

  throw new Error("Unable to auto-discover the web bearer token.");
}

async function resolveGuestToken(bearerToken: string, userAgent: string) {
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
    throw new Error(`Guest activation failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = JSON.parse(text) as { guest_token?: unknown };
  if (typeof json.guest_token !== "string" || !json.guest_token.trim()) {
    throw new Error("Guest activation response did not include guest_token.");
  }

  return json.guest_token;
}

function buildHeadersRecord(headers: Headers): Record<string, string> {
  const next: Record<string, string> = {};
  headers.forEach((value, key) => {
    next[key.toLowerCase()] = value;
  });
  return next;
}

async function fetchJsonWithHeadersRetry<T>(
  url: string,
  init: RequestInit,
  retries = 1,
): Promise<FetchJsonResult<T>> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
      });
      const text = await response.text();
      const headers = buildHeadersRecord(response.headers);

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new SearchTimelineRateLimitError(
            `HTTP ${response.status}: ${text.slice(0, 200)}`,
            null,
          );
        }

        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      return {
        json: JSON.parse(text) as T,
        headers,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown fetch error.");
}

function buildRequestHeaders(args: {
  account: string;
  bearerToken: string;
  cookie: string | null;
  csrfToken: string | null;
  guestToken: string | null;
  userAgent: string;
}) {
  const useCookieAuth = Boolean(args.cookie && args.csrfToken);
  const headers: Record<string, string> = {
    authorization: `Bearer ${args.bearerToken}`,
    "content-type": "application/json",
    accept: "*/*",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "user-agent": args.userAgent,
    referer: `https://x.com/${args.account}`,
  };

  if (useCookieAuth && args.cookie && args.csrfToken) {
    headers.cookie = args.cookie;
    headers["x-csrf-token"] = args.csrfToken;
    headers["x-twitter-auth-type"] = "OAuth2Session";
  } else if (args.guestToken) {
    headers["x-guest-token"] = args.guestToken;
  }

  return headers;
}

async function acquireAuthContext(args: {
  account: string;
  fleet: SearchTimelineFleet;
  userAgent?: string | null;
}) {
  const userAgent = getConfiguredUserAgent(args.userAgent);
  const broker = await createSessionBroker({
    maxRequestsPerHour: Number(
      process.env.SCRAPER_BUDGET_PER_HOUR ?? process.env.X_WEB_MAX_REQUESTS_PER_HOUR ?? 500,
    ),
    minIntervalMs: Number(process.env.X_WEB_MIN_INTERVAL_MS ?? 5000),
  });
  const sessionHandle = await broker.acquire({ fleet: args.fleet });
  const cookieRaw = sessionHandle.cookie ?? process.env.X_WEB_COOKIE ?? null;
  const csrfFromCookie = cookieRaw ? getCookieValue(cookieRaw, "ct0") : null;
  const csrfToken =
    sessionHandle.csrfToken ??
    process.env.X_WEB_CSRF_TOKEN ??
    csrfFromCookie ??
    null;
  const cookie = ensureCookieContainsCt0(cookieRaw, csrfToken);

  const bearerToken =
    sessionHandle.bearerToken ??
    process.env.X_WEB_BEARER_TOKEN?.trim() ??
    (await discoverWebBearerToken(userAgent));
  const guestToken =
    cookie && csrfToken ? null : await resolveGuestToken(bearerToken, userAgent);

  return {
    bearerToken,
    broker,
    cookie,
    csrfToken,
    guestToken,
    sessionHandle: {
      sessionId: sessionHandle.sessionId ?? null,
    },
    sessionId: sessionHandle.sessionId ?? null,
    userAgent,
  } satisfies AuthContext;
}

async function lockProxySession(sessionId: string, lockForMs: number) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl || !sessionId || !(lockForMs > 0)) {
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  try {
    await pool.query(
      `
        UPDATE "${DEFAULT_PROXY_TABLE}"
        SET "lockedUntil" = TO_TIMESTAMP($2 / 1000.0),
            "updatedAt" = NOW()
        WHERE "sessionId" = $1
      `,
      [sessionId, Date.now() + lockForMs],
    );
  } finally {
    await pool.end();
  }
}

function toIsoDate(value: string | null): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
}

function getCreatedYear(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }

  const parsed = new Date(isoDate);
  return Number.isFinite(parsed.getTime()) ? parsed.getUTCFullYear() : null;
}

function clampSearchYearFloor(value: number | null | undefined) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
  if (parsed === null) {
    return HARD_MIN_SEARCH_YEAR;
  }

  return Math.max(HARD_MIN_SEARCH_YEAR, parsed);
}

function buildSyncState(args: {
  routeClass: ScrapeRouteClass;
  statusesCount: number | null;
  createdYear: number | null;
  searchYearFloor: number;
  phase: OnboardingSyncState["phase"];
}): OnboardingSyncState {
  return {
    routeClass: args.routeClass,
    statusesCount: args.statusesCount,
    createdYear: args.createdYear,
    searchYearFloor: args.searchYearFloor,
    phase: args.phase,
    repliesExcluded: true,
  };
}

function pickRouteClass(statusesCount: number | null): ScrapeRouteClass {
  if (statusesCount !== null && statusesCount <= HEAVYWEIGHT_STATUSES_CUTOFF) {
    return "lightweight";
  }

  return "heavyweight";
}

function resolveSearchYearFloor(args: {
  createdYear: number | null;
  oldestObservedPostYear?: number | null;
}) {
  return clampSearchYearFloor(args.createdYear ?? args.oldestObservedPostYear ?? HARD_MIN_SEARCH_YEAR);
}

interface UserByScreenNameResponse {
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
          followers_count?: number | string;
          friends_count?: number | string;
          created_at?: string;
          profile_banner_url?: string;
          profile_image_url_https?: string;
          statuses_count?: number | string;
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

function normalizeXAvatarUrl(url: string | null) {
  return url?.trim() || null;
}

function normalizeXHeaderUrl(url: string | null) {
  return url?.trim() || null;
}

async function fetchUserByScreenNameMetadata(args: {
  account: string;
  userAgent?: string | null;
}): Promise<SearchTimelineMetadata | null> {
  const auth = await acquireAuthContext({
    account: args.account,
    fleet: "onboarding",
    userAgent: args.userAgent,
  });

  try {
    const queryId = await discoverOperationQueryId(auth.userAgent, "UserByScreenName");
    const url = new URL(`https://x.com/i/api/graphql/${queryId}/UserByScreenName`);
    url.searchParams.set(
      "variables",
      JSON.stringify({
        screen_name: args.account,
        withGrokTranslatedBio: false,
      }),
    );
    url.searchParams.set("features", JSON.stringify(DEFAULT_FEATURES));
    url.searchParams.set("fieldToggles", JSON.stringify(DEFAULT_FIELD_TOGGLES));

    const response = await fetchJsonWithHeadersRetry<UserByScreenNameResponse>(
      url.toString(),
      {
        method: "GET",
        headers: buildRequestHeaders({
          account: args.account,
          bearerToken: auth.bearerToken,
          cookie: auth.cookie,
          csrfToken: auth.csrfToken,
          guestToken: auth.guestToken,
          userAgent: auth.userAgent,
        }),
      },
      1,
    );

    const result = response.json.data?.user?.result;
    if (!result) {
      return null;
    }

    const createdAt = toIsoDate(
      asString(result.core?.created_at) ?? asString(result.legacy?.created_at),
    );
    const createdYear = getCreatedYear(createdAt);
    const statusesCount = asNumber(result.legacy?.statuses_count);
    const profile: XPublicProfile = {
      username: asString(result.core?.screen_name) ?? args.account,
      name: asString(result.core?.name) ?? args.account,
      bio:
        asString(result.profile_bio?.description) ??
        asString(result.legacy?.description) ??
        "",
      avatarUrl: normalizeXAvatarUrl(
        asString(result.avatar?.image_url) ??
          asString(result.legacy?.profile_image_url_https) ??
          null,
      ),
      headerImageUrl: normalizeXHeaderUrl(asString(result.legacy?.profile_banner_url) ?? null),
      isVerified: Boolean(result.verification?.verified || result.is_blue_verified),
      followersCount: asNumber(result.legacy?.followers_count) ?? 0,
      followingCount: asNumber(result.legacy?.friends_count) ?? 0,
      createdAt,
      statusesCount,
    };

    return {
      profile,
      routeClass: pickRouteClass(statusesCount),
      statusesCount,
      createdYear,
      searchYearFloor: resolveSearchYearFloor({ createdYear }),
    };
  } finally {
    await auth.broker.close();
  }
}

async function fetchXApiMetadata(account: string): Promise<SearchTimelineMetadata | null> {
  if (!hasXApiCredentials()) {
    return null;
  }

  try {
    const { profile } = await fetchXPublicProfile(account);
    const statusesCount = profile.statusesCount ?? null;
    const createdYear = getCreatedYear(profile.createdAt);
    return {
      profile,
      routeClass: pickRouteClass(statusesCount),
      statusesCount,
      createdYear,
      searchYearFloor: resolveSearchYearFloor({ createdYear }),
    };
  } catch {
    return null;
  }
}

export async function resolveSearchTimelineMetadata(args: {
  account: string;
  oldestObservedPostYear?: number | null;
  userAgent?: string | null;
}) {
  const account = normalizeAccount(args.account ?? "");
  if (!account) {
    throw new Error("Invalid account. Use @username, username, or x.com/username.");
  }

  const userByScreenName = await fetchUserByScreenNameMetadata({
    account,
    userAgent: args.userAgent,
  }).catch(() => null);
  if (userByScreenName) {
    return {
      ...userByScreenName,
      searchYearFloor: resolveSearchYearFloor({
        createdYear: userByScreenName.createdYear,
        oldestObservedPostYear: args.oldestObservedPostYear ?? null,
      }),
    };
  }

  const xApiMetadata = await fetchXApiMetadata(account);
  if (xApiMetadata) {
    return {
      ...xApiMetadata,
      searchYearFloor: resolveSearchYearFloor({
        createdYear: xApiMetadata.createdYear,
        oldestObservedPostYear: args.oldestObservedPostYear ?? null,
      }),
    };
  }

  return {
    profile: buildDefaultProfile(account),
    routeClass: "heavyweight" as const,
    statusesCount: null,
    createdYear: null,
    searchYearFloor: resolveSearchYearFloor({
      createdYear: null,
      oldestObservedPostYear: args.oldestObservedPostYear ?? null,
    }),
  } satisfies SearchTimelineMetadata;
}

function getSearchTimelineContainer(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const searchByRawQuery = asRecord(data?.search_by_raw_query);
  const searchTimeline = asRecord(searchByRawQuery?.search_timeline);
  return asRecord(searchTimeline?.timeline);
}

function extractBottomCursor(payload: unknown) {
  const timeline = getSearchTimelineContainer(payload);
  if (!timeline) {
    return null;
  }

  const instructions = Array.isArray(timeline.instructions) ? timeline.instructions : [];
  for (const instructionValue of instructions) {
    const instruction = asRecord(instructionValue);
    if (!instruction || !Array.isArray(instruction.entries)) {
      continue;
    }

    for (const entryValue of instruction.entries) {
      const entry = asRecord(entryValue);
      const content = asRecord(entry?.content);
      if (
        content?.entryType === "TimelineTimelineCursor" &&
        content?.cursorType === "Bottom"
      ) {
        return asString(content.value);
      }
    }
  }

  return null;
}

function parseRateLimitRemaining(headers: Record<string, string>) {
  return asNumber(headers["x-rate-limit-remaining"]);
}

export function buildSearchTimelineQuery(args: {
  account: string;
  year?: number | null;
}) {
  const handle = normalizeAccount(args.account ?? "");
  if (!handle) {
    throw new Error("Invalid account. Use @username, username, or x.com/username.");
  }

  if (!args.year) {
    return `(from:${handle}) -filter:replies`;
  }

  const year = Math.floor(args.year);
  return `(from:${handle}) since:${year}-01-01 until:${year + 1}-01-01 -filter:replies`;
}

async function fetchSearchTimelineJson(args: {
  account: string;
  rawQuery: string;
  count: number;
  cursor?: string | null;
  fleet: SearchTimelineFleet;
  userAgent?: string | null;
}) {
  const auth = await acquireAuthContext({
    account: args.account,
    fleet: args.fleet,
    userAgent: args.userAgent,
  });

  try {
    const queryId = await discoverOperationQueryId(auth.userAgent, "SearchTimeline");
    const variables = {
      rawQuery: args.rawQuery,
      count: args.count,
      querySource: "typed_query",
      product: "Latest",
      ...(args.cursor ? { cursor: args.cursor } : {}),
    };
    const url = new URL(`https://x.com/i/api/graphql/${queryId}/SearchTimeline`);
    url.searchParams.set("variables", JSON.stringify(variables));
    url.searchParams.set("features", JSON.stringify(DEFAULT_FEATURES));
    url.searchParams.set("fieldToggles", JSON.stringify(DEFAULT_FIELD_TOGGLES));

    const response = await fetchJsonWithHeadersRetry<unknown>(
      url.toString(),
      {
        method: "GET",
        headers: buildRequestHeaders({
          account: args.account,
          bearerToken: auth.bearerToken,
          cookie: auth.cookie,
          csrfToken: auth.csrfToken,
          guestToken: auth.guestToken,
          userAgent: auth.userAgent,
        }),
      },
      1,
    );

    await auth.broker.markSuccess(auth.sessionHandle ?? undefined);
    return {
      ...response,
      sessionId: auth.sessionId,
      broker: auth.broker,
      sessionHandle: auth.sessionHandle,
    };
  } catch (error) {
    await auth.broker.markFailure(auth.sessionHandle ?? undefined, {
      shouldCooldown: true,
      cooldownMs: PROXY_LOCK_MS,
      lockProxyForMs: PROXY_LOCK_MS,
    });
    throw error;
  }
}

export async function fetchSearchTimelinePage(args: {
  account: string;
  rawQuery: string;
  count?: number;
  cursor?: string | null;
  fleet?: SearchTimelineFleet;
  userAgent?: string | null;
}) {
  const normalizedAccount = normalizeAccount(args.account ?? "");
  if (!normalizedAccount) {
    throw new Error("Invalid account. Use @username, username, or x.com/username.");
  }

  const result = await fetchSearchTimelineJson({
    account: normalizedAccount,
    rawQuery: args.rawQuery,
    count: Math.max(10, Math.min(100, Math.floor(args.count ?? 40))),
    cursor: args.cursor ?? null,
    fleet: args.fleet ?? "onboarding",
    userAgent: args.userAgent,
  });

  try {
    const parsed = parseUserTweetsGraphqlPayload({
      payload: result.json,
      account: normalizedAccount,
      includeReplies: false,
      includeQuotes: true,
    });
    const totalPostCount = parsed.posts.length + parsed.quotePosts.length;
    const rateLimitRemaining = parseRateLimitRemaining(result.headers);
    if (rateLimitRemaining !== null && rateLimitRemaining < 5) {
      await lockProxySession(result.sessionId ?? "", PROXY_LOCK_MS);
      throw new SearchTimelineRateLimitError(
        `SearchTimeline remaining budget dropped below 5 for session ${result.sessionId ?? "default"}.`,
        result.sessionId,
      );
    }
    return {
      payload: result.json,
      nextCursor: extractBottomCursor(result.json),
      originalPostCount: parsed.posts.length,
      quotePostCount: parsed.quotePosts.length,
      totalPostCount,
      rateLimitRemaining,
      responseHeaders: result.headers,
      sessionId: result.sessionId,
    } satisfies SearchTimelinePageResult;
  } finally {
    await result.broker.close();
  }
}

export function buildCaptureSyncState(args: {
  metadata: SearchTimelineMetadata;
  phase: OnboardingSyncState["phase"];
  oldestObservedPostYear?: number | null;
}) {
  return buildSyncState({
    routeClass: args.metadata.routeClass,
    statusesCount: args.metadata.statusesCount,
    createdYear: args.metadata.createdYear,
    searchYearFloor: resolveSearchYearFloor({
      createdYear: args.metadata.createdYear,
      oldestObservedPostYear: args.oldestObservedPostYear ?? null,
    }),
    phase: args.phase,
  });
}

export async function lockSearchTimelineSession(sessionId: string | null, lockForMs = PROXY_LOCK_MS) {
  if (!sessionId) {
    return;
  }

  await lockProxySession(sessionId, lockForMs);
}
