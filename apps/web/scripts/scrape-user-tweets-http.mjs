#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

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

const DEFAULT_STATE_FILE = path.resolve(
  process.cwd(),
  "tmp",
  "x-http-scrape-state.json",
);
const DEFAULT_MAX_REQUESTS_PER_HOUR = 45;
const DEFAULT_MIN_INTERVAL_MS = 5000;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
const GLOBAL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const USER_ID_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class HttpStatusError extends Error {
  constructor(status, bodyPreview) {
    super(`HTTP ${status}: ${bodyPreview}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/scrape-user-tweets-http.mjs --account <username> [options]",
      "",
      "Options:",
      "  --account <value>         X username (or @username or x.com/username).",
      "  --count <number>          Number of tweets to request (default: 40).",
      "  --query-id <value>        UserTweets queryId (optional; auto-discovered when omitted).",
      "  --user-id <value>         X rest id (optional; resolved via users/show when omitted).",
      "  --cookie <value>          Cookie header string (or env X_WEB_COOKIE).",
      "  --csrf <value>            CSRF token / ct0 (or env X_WEB_CSRF_TOKEN).",
      "  --bearer <value>          Web bearer token (or env X_WEB_BEARER_TOKEN).",
      "  --guest                   Force guest token flow instead of auth cookie flow.",
      "  --state-file <path>       State path for rate limits/cache.",
      "  --max-requests-hour <n>   Max scrape requests per hour (default: 45).",
      "  --min-interval-ms <n>     Minimum spacing between runs (default: 5000).",
      "  --cooldown-ms <n>         Cooldown after 429/403 (default: 1800000).",
      "  --output <path>           Raw payload output path.",
      "  --import                  POST payload to onboarding scrape import endpoint.",
      "  --endpoint <url>          Import endpoint (default: http://localhost:3000/api/onboarding/scrape/import).",
      "  --help                    Show this help text.",
      "",
      "Env vars:",
      "  X_WEB_COOKIE=auth_token=...; ct0=...",
      "  X_WEB_CSRF_TOKEN=<ct0>",
      "  X_WEB_BEARER_TOKEN=<token>",
      "  X_WEB_USER_TWEETS_QUERY_ID=<queryId>",
      "  X_WEB_USER_ID=<rest_id>",
      "  X_WEB_USER_AGENT=<ua string>",
      "  X_WEB_SCRAPE_STATE_PATH=<state-json-path>",
      "  X_WEB_MAX_REQUESTS_PER_HOUR=<number>",
      "  X_WEB_MIN_INTERVAL_MS=<number>",
      "  X_WEB_COOLDOWN_MS=<number>",
      "",
      "Examples:",
      "  node scripts/scrape-user-tweets-http.mjs --account shernanjavier --import",
      "  node scripts/scrape-user-tweets-http.mjs --account shernanjavier --cookie 'auth_token=...; ct0=...' --import",
    ].join("\n"),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function loadEnvFileIfPresent(filePath) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const delimiterIndex = trimmed.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, delimiterIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(delimiterIndex + 1).trim());
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}

async function loadLocalEnv() {
  const cwd = process.cwd();
  await loadEnvFileIfPresent(path.resolve(cwd, ".env"));
  await loadEnvFileIfPresent(path.resolve(cwd, ".env.local"));
}

function parseArgs(argv) {
  const parsed = {
    account: null,
    count: 40,
    queryId: null,
    userId: null,
    cookie: null,
    csrf: null,
    bearer: null,
    forceGuest: false,
    stateFile: DEFAULT_STATE_FILE,
    maxRequestsPerHour: DEFAULT_MAX_REQUESTS_PER_HOUR,
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    output: null,
    shouldImport: false,
    endpoint: "http://localhost:3000/api/onboarding/scrape/import",
    help: false,
  };

  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }

    if (token === "--") {
      continue;
    }

    if (!token.startsWith("--")) {
      if (!parsed.account) {
        parsed.account = token;
      }
      continue;
    }

    if (token === "--help") {
      parsed.help = true;
      continue;
    }

    if (token === "--import") {
      parsed.shouldImport = true;
      continue;
    }

    if (token === "--guest") {
      parsed.forceGuest = true;
      continue;
    }

    const value = args.shift();
    if (!value) {
      throw new Error(`Missing value for ${token}`);
    }

    if (token === "--account") {
      parsed.account = value;
      continue;
    }

    if (token === "--count") {
      const count = Number(value);
      if (!Number.isFinite(count) || count < 1 || count > 100) {
        throw new Error("--count must be an integer between 1 and 100.");
      }
      parsed.count = Math.floor(count);
      continue;
    }

    if (token === "--query-id") {
      parsed.queryId = value;
      continue;
    }

    if (token === "--user-id") {
      parsed.userId = value;
      continue;
    }

    if (token === "--cookie") {
      parsed.cookie = value;
      continue;
    }

    if (token === "--csrf") {
      parsed.csrf = value;
      continue;
    }

    if (token === "--bearer") {
      parsed.bearer = value;
      continue;
    }

    if (token === "--output") {
      parsed.output = value;
      continue;
    }

    if (token === "--state-file") {
      parsed.stateFile = value;
      continue;
    }

    if (token === "--max-requests-hour") {
      const max = Number(value);
      if (!Number.isFinite(max) || max < 1) {
        throw new Error("--max-requests-hour must be a number >= 1.");
      }
      parsed.maxRequestsPerHour = Math.floor(max);
      continue;
    }

    if (token === "--min-interval-ms") {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("--min-interval-ms must be a number >= 0.");
      }
      parsed.minIntervalMs = Math.floor(ms);
      continue;
    }

    if (token === "--cooldown-ms") {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("--cooldown-ms must be a number >= 0.");
      }
      parsed.cooldownMs = Math.floor(ms);
      continue;
    }

    if (token === "--endpoint") {
      parsed.endpoint = value;
      continue;
    }

    throw new Error(`Unknown flag: ${token}`);
  }

  return parsed;
}

function normalizeAccount(rawValue) {
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

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getCookieValue(cookieString, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]+)`));
  return match ? match[1] : null;
}

function ensureCookieContainsCt0(cookie, csrfToken) {
  if (!cookie) {
    return cookie;
  }

  if (!csrfToken || getCookieValue(cookie, "ct0")) {
    return cookie;
  }

  const separator = cookie.trim().endsWith(";") ? " " : "; ";
  return `${cookie}${separator}ct0=${csrfToken}`;
}

function buildDefaultOutputPath(account) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(process.cwd(), "tmp", `user-tweets-http-${account}-${stamp}.json`);
}

function createEmptyScrapeState() {
  return {
    recentRequests: [],
    lastRequestAt: null,
    cooldownUntil: null,
    cache: {
      bearerToken: null,
      queryId: null,
      userIds: {},
    },
  };
}

function normalizeScrapeState(raw) {
  const state = createEmptyScrapeState();
  const root = asRecord(raw);
  if (!root) {
    return state;
  }

  if (Array.isArray(root.recentRequests)) {
    state.recentRequests = root.recentRequests
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  if (Number.isFinite(Number(root.lastRequestAt))) {
    state.lastRequestAt = Number(root.lastRequestAt);
  }

  if (Number.isFinite(Number(root.cooldownUntil))) {
    state.cooldownUntil = Number(root.cooldownUntil);
  }

  const cache = asRecord(root.cache);
  if (!cache) {
    return state;
  }

  const bearerToken = asRecord(cache.bearerToken);
  const queryId = asRecord(cache.queryId);
  const userIds = asRecord(cache.userIds);

  if (bearerToken && typeof bearerToken.value === "string") {
    state.cache.bearerToken = {
      value: bearerToken.value,
      updatedAt: Number(bearerToken.updatedAt) || Date.now(),
    };
  }

  if (queryId && typeof queryId.value === "string") {
    state.cache.queryId = {
      value: queryId.value,
      updatedAt: Number(queryId.updatedAt) || Date.now(),
    };
  }

  if (userIds) {
    for (const [key, value] of Object.entries(userIds)) {
      const entry = asRecord(value);
      if (!entry || typeof entry.value !== "string") {
        continue;
      }

      state.cache.userIds[key] = {
        value: entry.value,
        updatedAt: Number(entry.updatedAt) || Date.now(),
      };
    }
  }

  return state;
}

async function readScrapeState(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return normalizeScrapeState(JSON.parse(raw));
  } catch {
    return createEmptyScrapeState();
  }
}

async function writeScrapeState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function pruneOldRequests(state, nowMs) {
  state.recentRequests = state.recentRequests.filter(
    (timestampMs) => nowMs - timestampMs < 60 * 60 * 1000,
  );
}

async function enforceRateLimit(state, options) {
  const nowMs = Date.now();
  pruneOldRequests(state, nowMs);

  if (
    Number.isFinite(state.cooldownUntil) &&
    state.cooldownUntil !== null &&
    nowMs < state.cooldownUntil
  ) {
    const waitSeconds = Math.ceil((state.cooldownUntil - nowMs) / 1000);
    throw new Error(
      `Scrape cooldown active for ${waitSeconds}s. Reduce traffic or wait before retrying.`,
    );
  }

  if (
    Number.isFinite(state.lastRequestAt) &&
    state.lastRequestAt !== null &&
    options.minIntervalMs > 0
  ) {
    const elapsedMs = nowMs - state.lastRequestAt;
    if (elapsedMs < options.minIntervalMs) {
      const sleepMs = options.minIntervalMs - elapsedMs;
      console.log(`[rate-limit] Sleeping ${sleepMs}ms to respect min interval.`);
      await sleep(sleepMs);
    }
  }

  const nowAfterSleepMs = Date.now();
  pruneOldRequests(state, nowAfterSleepMs);
  if (state.recentRequests.length >= options.maxRequestsPerHour) {
    const oldest = state.recentRequests[0];
    const waitMs = Math.max(1, oldest + 60 * 60 * 1000 - nowAfterSleepMs);
    const waitSeconds = Math.ceil(waitMs / 1000);
    throw new Error(
      `Scrape hourly budget exceeded (${options.maxRequestsPerHour}/hour). Retry in ~${waitSeconds}s.`,
    );
  }
}

function markRequestStart(state) {
  const nowMs = Date.now();
  state.lastRequestAt = nowMs;
  state.recentRequests.push(nowMs);
}

function maybeSetCooldownFromError(state, error, cooldownMs) {
  if (!(error instanceof HttpStatusError) || cooldownMs <= 0) {
    return;
  }

  if (error.status === 429 || error.status === 403) {
    state.cooldownUntil = Date.now() + cooldownMs;
  }
}

function getCachedGlobal(state, key, ttlMs) {
  const entry = state.cache[key];
  if (!entry) {
    return null;
  }

  if (!Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > ttlMs) {
    return null;
  }

  return entry.value;
}

function setCachedGlobal(state, key, value) {
  state.cache[key] = {
    value,
    updatedAt: Date.now(),
  };
}

function getCachedUserId(state, account) {
  const key = account.toLowerCase();
  const entry = state.cache.userIds[key];
  if (!entry) {
    return null;
  }

  if (!Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > USER_ID_CACHE_TTL_MS) {
    return null;
  }

  return entry.value;
}

function setCachedUserId(state, account, userId) {
  state.cache.userIds[account.toLowerCase()] = {
    value: userId,
    updatedAt: Date.now(),
  };
}

function buildRequestHeaders(params) {
  const {
    bearerToken,
    userAgent,
    account,
    cookie,
    csrfToken,
    guestToken,
    useCookieAuth,
  } = params;

  const headers = {
    authorization: `Bearer ${bearerToken}`,
    "content-type": "application/json",
    accept: "*/*",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "user-agent": userAgent,
    referer: `https://x.com/${account}`,
  };

  if (useCookieAuth) {
    headers.cookie = cookie;
    headers["x-csrf-token"] = csrfToken;
    headers["x-twitter-auth-type"] = "OAuth2Session";
  } else {
    headers["x-guest-token"] = guestToken;
  }

  return headers;
}

async function fetchJsonWithRetry(url, options, retries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();

      if (!response.ok) {
        throw new HttpStatusError(response.status, text.slice(0, 300));
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
      }
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown fetch error.");
}

async function resolveGuestToken(bearerToken, userAgent) {
  const response = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "user-agent": userAgent,
      accept: "*/*",
      "content-type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new HttpStatusError(response.status, text.slice(0, 300));
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Guest activate non-JSON response: ${text.slice(0, 300)}`);
  }

  const token = typeof json.guest_token === "string" ? json.guest_token : null;
  if (!token) {
    throw new Error("Guest activate response did not include guest_token.");
  }

  return token;
}

function extractScriptUrlsFromHtml(html) {
  const urls = [];
  const regex = /<script[^>]+src="([^"]+)"/gi;
  let match = regex.exec(html);
  while (match) {
    const src = match[1];
    if (src.includes("/responsive-web/client-web/") && src.endsWith(".js")) {
      if (src.startsWith("http://") || src.startsWith("https://")) {
        urls.push(src);
      } else {
        urls.push(`https://x.com${src}`);
      }
    }
    match = regex.exec(html);
  }

  return Array.from(new Set(urls));
}

function extractOperationQueryIdFromJs(jsSource, operationName) {
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

function extractBearerTokenFromJs(jsSource) {
  const patterns = [
    /Bearer\\s+([A-Za-z0-9%=_-]{30,})/,
    /\"(AAAA[A-Za-z0-9%=_-]{30,})\"/,
  ];

  for (const pattern of patterns) {
    const match = jsSource.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function loadClientScripts(userAgent) {
  const htmlResponse = await fetch("https://x.com", {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": userAgent,
    },
  });

  const html = await htmlResponse.text();
  if (!htmlResponse.ok) {
    throw new Error(`Failed loading x.com homepage (${htmlResponse.status}).`);
  }

  return extractScriptUrlsFromHtml(html).slice(0, 20);
}

async function discoverUserTweetsQueryId(userAgent) {
  return discoverOperationQueryId(userAgent, "UserTweets");
}

async function discoverUserByScreenNameQueryId(userAgent) {
  return discoverOperationQueryId(userAgent, "UserByScreenName");
}

async function discoverOperationQueryId(userAgent, operationName) {
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

  throw new Error(
    `Unable to auto-discover ${operationName} queryId.`,
  );
}

async function discoverWebBearerToken(userAgent) {
  const scripts = await loadClientScripts(userAgent);
  if (scripts.length === 0) {
    throw new Error(
      "Could not find client scripts to discover web bearer token. Provide --bearer or X_WEB_BEARER_TOKEN.",
    );
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
      });

      if (!scriptRes.ok) {
        continue;
      }

      const scriptText = await scriptRes.text();
      const bearer = extractBearerTokenFromJs(scriptText);
      if (bearer) {
        return bearer;
      }
    } catch {
      // Try next script.
    }
  }

  throw new Error(
    "Unable to auto-discover web bearer token. Provide --bearer or X_WEB_BEARER_TOKEN.",
  );
}

async function resolveUserRestId(params) {
  if (params.userId) {
    return params.userId;
  }

  const url = new URL("https://x.com/i/api/1.1/users/show.json");
  url.searchParams.set("screen_name", params.account);

  const json = await fetchJsonWithRetry(
    url.toString(),
    {
      method: "GET",
      headers: params.headers,
    },
    1,
  );

  const root = asRecord(json);
  const id =
    (typeof root?.id_str === "string" && root.id_str) ||
    (typeof root?.rest_id === "string" && root.rest_id) ||
    (typeof root?.id === "number" ? String(root.id) : null);

  if (!id) {
    throw new Error("Could not resolve user id from users/show response.");
  }

  return id;
}

function extractUserRestIdFromGraphqlUserPayload(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const result = asRecord(user?.result);
  if (!result) {
    return null;
  }

  const directRestId = asString(result.rest_id);
  if (directRestId) {
    return directRestId;
  }

  const legacy = asRecord(result.legacy);
  const legacyId = asString(legacy?.id_str);
  if (legacyId) {
    return legacyId;
  }

  const nestedResult = asRecord(result.result);
  if (nestedResult) {
    const nestedPayload = {
      data: {
        user: {
          result: nestedResult,
        },
      },
    };
    return extractUserRestIdFromGraphqlUserPayload(nestedPayload);
  }

  return null;
}

async function resolveUserRestIdFromGraphqlUserByScreenName(params) {
  const { account, userAgent, headers } = params;
  const queryId = await discoverUserByScreenNameQueryId(userAgent);

  const variables = {
    screen_name: account,
    withSafetyModeUserFields: true,
  };

  const url = new URL(`https://x.com/i/api/graphql/${queryId}/UserByScreenName`);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("features", JSON.stringify(DEFAULT_FEATURES));
  url.searchParams.set("fieldToggles", JSON.stringify(DEFAULT_FIELD_TOGGLES));

  const json = await fetchJsonWithRetry(
    url.toString(),
    {
      method: "GET",
      headers,
    },
    1,
  );

  const id = extractUserRestIdFromGraphqlUserPayload(json);
  if (!id) {
    throw new Error("Could not resolve user id from UserByScreenName GraphQL response.");
  }

  return id;
}

async function resolveUserRestIdFromProfilePage(params) {
  const { account, userAgent, cookie } = params;
  const response = await fetch(`https://x.com/${account}`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": userAgent,
      ...(cookie ? { cookie } : {}),
    },
  });

  const html = await response.text();
  if (!response.ok) {
    throw new HttpStatusError(response.status, html.slice(0, 300));
  }

  const accountEscaped = account.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"screen_name":"${accountEscaped}"[^}]{0,400}?"rest_id":"(\\d+)"`),
    /"rest_id":"(\d{8,})","is_blue_verified"/,
    /"rest_id":"(\d{8,})","legacy":\{"created_at"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("Could not resolve user id from profile HTML.");
}

async function fetchUserTweetsPayload(params) {
  const variables = {
    userId: params.userId,
    count: params.count,
    includePromotedContent: true,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
    withV2Timeline: true,
  };

  const url = new URL(`https://x.com/i/api/graphql/${params.queryId}/UserTweets`);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("features", JSON.stringify(DEFAULT_FEATURES));
  url.searchParams.set("fieldToggles", JSON.stringify(DEFAULT_FIELD_TOGGLES));

  return fetchJsonWithRetry(
    url.toString(),
    {
      method: "GET",
      headers: params.headers,
    },
    1,
  );
}

function looksLikeUserTweetsPayload(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  if (!userResult) {
    return false;
  }

  const timeline = asRecord(asRecord(userResult.timeline)?.timeline);
  const timelineV2 = asRecord(asRecord(userResult.timeline_v2)?.timeline);

  return Boolean(timeline || timelineV2);
}

async function maybeImportCapture(params) {
  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account: params.account,
      payload: params.payload,
      source: "agent",
    }),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // Keep null for non-JSON responses.
  }

  if (!response.ok) {
    throw new Error(
      [
        `Import request failed with status ${response.status}.`,
        json ? JSON.stringify(json, null, 2) : "No JSON response body.",
      ].join("\n"),
    );
  }

  return json;
}

async function main() {
  await loadLocalEnv();

  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown argument error.";
    console.error(message);
    printUsage();
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.account) {
    printUsage();
    process.exit(1);
  }

  const account = normalizeAccount(options.account);
  if (!account) {
    console.error("Invalid --account value. Use @username, username, or x.com/username.");
    process.exit(1);
  }

  const envMaxRequests = Number(process.env.X_WEB_MAX_REQUESTS_PER_HOUR ?? NaN);
  const envMinInterval = Number(process.env.X_WEB_MIN_INTERVAL_MS ?? NaN);
  const envCooldown = Number(process.env.X_WEB_COOLDOWN_MS ?? NaN);
  const maxRequestsPerHour =
    Number.isFinite(envMaxRequests) && envMaxRequests > 0
      ? Math.floor(envMaxRequests)
      : options.maxRequestsPerHour;
  const minIntervalMs =
    Number.isFinite(envMinInterval) && envMinInterval >= 0
      ? Math.floor(envMinInterval)
      : options.minIntervalMs;
  const cooldownMs =
    Number.isFinite(envCooldown) && envCooldown >= 0
      ? Math.floor(envCooldown)
      : options.cooldownMs;

  const statePath = path.resolve(
    process.env.X_WEB_SCRAPE_STATE_PATH ?? options.stateFile,
  );
  const state = await readScrapeState(statePath);
  await enforceRateLimit(state, {
    maxRequestsPerHour,
    minIntervalMs,
  });
  markRequestStart(state);
  await writeScrapeState(statePath, state);

  try {
    const cookieRaw = options.cookie ?? process.env.X_WEB_COOKIE ?? null;
    const csrfFromCookie = cookieRaw ? getCookieValue(cookieRaw, "ct0") : null;
    const csrfToken = options.csrf ?? process.env.X_WEB_CSRF_TOKEN ?? csrfFromCookie ?? null;
    const cookie = ensureCookieContainsCt0(cookieRaw, csrfToken);
    const userAgent =
      process.env.X_WEB_USER_AGENT ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    const bearerFromArgsOrEnv =
      options.bearer ?? process.env.X_WEB_BEARER_TOKEN ?? null;
    const cachedBearer = bearerFromArgsOrEnv
      ? null
      : getCachedGlobal(state, "bearerToken", GLOBAL_CACHE_TTL_MS);
    let bearerToken = bearerFromArgsOrEnv ?? cachedBearer;
    if (!bearerToken) {
      bearerToken = await discoverWebBearerToken(userAgent);
      setCachedGlobal(state, "bearerToken", bearerToken);
    }

    const queryIdFromArgsOrEnv =
      options.queryId ?? process.env.X_WEB_USER_TWEETS_QUERY_ID ?? null;
    const cachedQueryId = queryIdFromArgsOrEnv
      ? null
      : getCachedGlobal(state, "queryId", GLOBAL_CACHE_TTL_MS);
    const resolvedQueryId =
      queryIdFromArgsOrEnv ?? cachedQueryId ?? (await discoverUserTweetsQueryId(userAgent));
    if (!queryIdFromArgsOrEnv && !cachedQueryId) {
      setCachedGlobal(state, "queryId", resolvedQueryId);
    }
    console.log(`[http] UserTweets queryId: ${resolvedQueryId}`);

    const userIdFromEnv = process.env.X_WEB_USER_ID ?? null;
    const userIdInput = options.userId ?? userIdFromEnv ?? getCachedUserId(state, account);

    const useCookieAuth = Boolean(cookie && csrfToken && !options.forceGuest);
    let guestToken = null;

    if (!useCookieAuth) {
      console.log("[http] Using guest-token flow (no auth cookie supplied).");
      guestToken = await resolveGuestToken(bearerToken, userAgent);
    } else {
      console.log("[http] Using authenticated cookie flow.");
    }

    const headers = buildRequestHeaders({
      bearerToken,
      userAgent,
      account,
      cookie,
      csrfToken,
      guestToken,
      useCookieAuth,
    });

    let userId = null;
    try {
      userId = await resolveUserRestId({
        account,
        userId: userIdInput,
        headers,
      });
    } catch (error) {
      const primaryMessage = error instanceof Error ? error.message : "unknown users/show error";
      console.warn(`[http] users/show lookup failed: ${primaryMessage}`);
      console.warn("[http] Falling back to UserByScreenName GraphQL.");
      try {
        userId = await resolveUserRestIdFromGraphqlUserByScreenName({
          account,
          userAgent,
          headers,
        });
      } catch (graphqlError) {
        const gqlMessage =
          graphqlError instanceof Error ? graphqlError.message : "unknown graphql user lookup error";
        console.warn(`[http] UserByScreenName lookup failed: ${gqlMessage}`);
        console.warn("[http] Falling back to profile HTML rest_id extraction.");
        userId = await resolveUserRestIdFromProfilePage({
          account,
          userAgent,
          cookie,
        });
      }
    }
    setCachedUserId(state, account, userId);
    console.log(`[http] Resolved user id: ${userId}`);

    const payload = await fetchUserTweetsPayload({
      account,
      userId,
      count: options.count,
      queryId: resolvedQueryId,
      headers,
    });

    if (!looksLikeUserTweetsPayload(payload)) {
      throw new Error(
        "Response does not match UserTweets payload shape. This can happen when headers/queryId/features drift.",
      );
    }

    const outputPath = path.resolve(options.output ?? buildDefaultOutputPath(account));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`[http] Saved payload: ${outputPath}`);

    if (options.shouldImport) {
      console.log(`[import] Posting capture to ${options.endpoint}`);
      const importResult = await maybeImportCapture({
        endpoint: options.endpoint,
        account,
        payload,
      });
      console.log(`[import] Success:\n${JSON.stringify(importResult, null, 2)}`);
    }

    state.cooldownUntil = null;
    await writeScrapeState(statePath, state);
  } catch (error) {
    maybeSetCooldownFromError(state, error, cooldownMs);
    await writeScrapeState(statePath, state);
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exit(1);
});
