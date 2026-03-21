import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import {
  createSessionBroker,
  DEFAULT_STATE_FILE,
  ensureCookieContainsCt0,
  getCookieValue,
  inspectSessionBrokerState,
} from "./sessionBroker.mjs";

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

function resolveConfiguredScraperBudgetPerHour() {
  const rawBudget =
    process.env.SCRAPER_BUDGET_PER_HOUR ?? process.env.X_WEB_MAX_REQUESTS_PER_HOUR ?? null;
  const parsedBudget = Number(rawBudget ?? NaN);

  if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
    return Math.floor(parsedBudget);
  }

  return 500;
}

const DEFAULT_MAX_REQUESTS_PER_HOUR = resolveConfiguredScraperBudgetPerHour();
const DEFAULT_MIN_INTERVAL_MS = 5000;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_INTER_REQUEST_DELAY_MS = 1500;
const DEFAULT_INTER_REQUEST_JITTER_MS = 750;
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

export function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/scrape-user-tweets-http.mjs --account <username> [options]",
      "",
      "Options:",
      "  --account <value>         X username (or @username or x.com/username).",
      "  --count <number>          Number of tweets to request (default: 40).",
      "  --pages <number>          Number of UserTweets pages to fetch (default: 3, max: 12).",
      "  --target-originals <n>    Stop early after this many unique original posts are collected.",
      "  --max-duration-ms <n>     Stop paginating once this wall-clock budget is reached.",
      "  --query-id <value>        UserTweets queryId (optional; auto-discovered when omitted).",
      "  --user-id <value>         X rest id (optional; resolved via users/show when omitted).",
      "  --session <value>         Force a specific session id from the session pool file.",
      "  --session-file <path>     JSON file containing reusable authenticated sessions.",
      "  --cookie <value>          Cookie header string (or env X_WEB_COOKIE).",
      "  --csrf <value>            CSRF token / ct0 (or env X_WEB_CSRF_TOKEN).",
      "  --bearer <value>          Web bearer token (or env X_WEB_BEARER_TOKEN).",
      "  --guest                   Force guest token flow instead of auth cookie flow.",
      "  --state-file <path>       State path for rate limits/cache.",
      "  --max-requests-hour <n>   Max scrape requests per hour (default: env budget or 500).",
      "  --min-interval-ms <n>     Minimum spacing between runs (default: 5000).",
      "  --cooldown-ms <n>         Cooldown after 429/403 (default: 1800000).",
      "  --request-delay-ms <n>    Base delay between in-run requests (default: 1500).",
      "  --request-jitter-ms <n>   Random extra delay added to in-run requests (default: 750).",
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
      "  X_WEB_PAGES=<number>",
      "  X_WEB_USER_ID=<rest_id>",
      "  X_WEB_USER_AGENT=<ua string>",
      "  X_WEB_SESSION_FILE=<session-pool-json-path>",
      "  X_WEB_SESSION_POOL_JSON=<session-pool-json>",
      "  X_WEB_SCRAPE_STATE_BACKEND=auto|postgres|file",
      "  X_WEB_SCRAPE_STATE_SCHEMA=<schema-name>",
      "  X_WEB_SCRAPE_STATE_TABLE=<table-name>",
      "  X_WEB_SCRAPE_STATE_ROW_ID=<row-id>",
      "  X_WEB_SCRAPE_STATE_PATH=<state-json-path>",
      "  SCRAPER_BUDGET_PER_HOUR=<number> (preferred)",
      "  X_WEB_MAX_REQUESTS_PER_HOUR=<number> (legacy fallback)",
      "  X_WEB_MIN_INTERVAL_MS=<number>",
      "  X_WEB_COOLDOWN_MS=<number>",
      "  X_WEB_REQUEST_DELAY_MS=<number>",
      "  X_WEB_REQUEST_JITTER_MS=<number>",
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
    pages: 3,
    targetOriginals: 40,
    maxDurationMs: 10000,
    queryId: null,
    userId: null,
    sessionId: null,
    sessionFile: null,
    cookie: null,
    csrf: null,
    bearer: null,
    forceGuest: false,
    stateFile: DEFAULT_STATE_FILE,
    maxRequestsPerHour: DEFAULT_MAX_REQUESTS_PER_HOUR,
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    requestDelayMs: DEFAULT_INTER_REQUEST_DELAY_MS,
    requestJitterMs: DEFAULT_INTER_REQUEST_JITTER_MS,
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

    if (token === "--pages") {
      const pages = Number(value);
      if (!Number.isFinite(pages) || pages < 1 || pages > 12) {
        throw new Error("--pages must be an integer between 1 and 12.");
      }
      parsed.pages = Math.floor(pages);
      continue;
    }

    if (token === "--target-originals") {
      const targetOriginals = Number(value);
      if (!Number.isFinite(targetOriginals) || targetOriginals < 1 || targetOriginals > 200) {
        throw new Error("--target-originals must be an integer between 1 and 200.");
      }
      parsed.targetOriginals = Math.floor(targetOriginals);
      continue;
    }

    if (token === "--max-duration-ms") {
      const maxDurationMs = Number(value);
      if (!Number.isFinite(maxDurationMs) || maxDurationMs < 1000) {
        throw new Error("--max-duration-ms must be a number >= 1000.");
      }
      parsed.maxDurationMs = Math.floor(maxDurationMs);
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

    if (token === "--session") {
      parsed.sessionId = value;
      continue;
    }

    if (token === "--session-file") {
      parsed.sessionFile = value;
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

    if (token === "--request-delay-ms") {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("--request-delay-ms must be a number >= 0.");
      }
      parsed.requestDelayMs = Math.floor(ms);
      continue;
    }

    if (token === "--request-jitter-ms") {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("--request-jitter-ms must be a number >= 0.");
      }
      parsed.requestJitterMs = Math.floor(ms);
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

export function normalizeAccount(rawValue) {
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

function asBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function unwrapTweetResultNode(value) {
  const node = asRecord(value);
  if (!node) {
    return null;
  }

  if (node.__typename === "Tweet" && asRecord(node.legacy)) {
    return node;
  }

  const tweet = asRecord(node.tweet);
  if (tweet) {
    return unwrapTweetResultNode(tweet);
  }

  const result = asRecord(node.result);
  if (result) {
    return unwrapTweetResultNode(result);
  }

  if (asRecord(node.legacy)) {
    return node;
  }

  return null;
}

function extractTimelineTweetNode(value) {
  const node = asRecord(value);
  if (!node) {
    return null;
  }

  const itemContent = asRecord(node.itemContent);
  const tweetResults = asRecord(node.tweet_results) ?? asRecord(itemContent?.tweet_results);
  return unwrapTweetResultNode(tweetResults?.result);
}

function getTimelineContainer(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  if (!userResult) {
    return null;
  }

  const timeline = asRecord(asRecord(userResult.timeline)?.timeline);
  if (timeline) {
    return timeline;
  }

  return asRecord(asRecord(userResult.timeline_v2)?.timeline);
}

function collectTimelineTweetNodes(payload) {
  const timeline = getTimelineContainer(payload);
  if (!timeline) {
    return [];
  }

  const instructions = Array.isArray(timeline.instructions) ? timeline.instructions : [];
  const nodes = [];

  for (const instructionValue of instructions) {
    const instruction = asRecord(instructionValue);
    if (!instruction) {
      continue;
    }

    const entries = [];
    if (Array.isArray(instruction.entries)) {
      entries.push(...instruction.entries);
    }

    const singleEntry = asRecord(instruction.entry);
    if (singleEntry) {
      entries.push(singleEntry);
    }

    for (const entryValue of entries) {
      const entry = asRecord(entryValue);
      const content = asRecord(entry?.content);
      if (!content) {
        continue;
      }

      const contentTweetNode = extractTimelineTweetNode(content);
      if (contentTweetNode) {
        nodes.push(contentTweetNode);
      }

      const contentItem = asRecord(content.item);
      if (contentItem) {
        const contentItemTweetNode = extractTimelineTweetNode(contentItem);
        if (contentItemTweetNode) {
          nodes.push(contentItemTweetNode);
        }
      }

      const moduleItems = Array.isArray(content.items) ? content.items : [];
      for (const moduleItemValue of moduleItems) {
        const moduleItem = asRecord(moduleItemValue);
        if (!moduleItem) {
          continue;
        }

        const moduleItemTweetNode = extractTimelineTweetNode(moduleItem);
        if (moduleItemTweetNode) {
          nodes.push(moduleItemTweetNode);
        }

        const moduleItemItem = asRecord(moduleItem.item);
        if (!moduleItemItem) {
          continue;
        }

        const moduleItemItemTweetNode = extractTimelineTweetNode(moduleItemItem);
        if (moduleItemItemTweetNode) {
          nodes.push(moduleItemItemTweetNode);
        }
      }
    }
  }

  return nodes;
}

function extractTweetId(tweetNode) {
  const legacy = asRecord(tweetNode?.legacy);
  return (
    asString(legacy?.id_str) ??
    asString(tweetNode?.rest_id) ??
    asString(tweetNode?.id_str) ??
    asString(tweetNode?.id)
  );
}

function isRetweetTweetNode(tweetNode) {
  const legacy = asRecord(tweetNode?.legacy);
  const fullText = asString(legacy?.full_text) ?? asString(legacy?.text) ?? "";
  return (
    fullText.startsWith("RT @") ||
    asRecord(legacy?.retweeted_status_result) !== null ||
    asString(legacy?.retweeted_status_id_str) !== null ||
    asRecord(tweetNode?.retweeted_status_result) !== null
  );
}

function isReplyTweetNode(tweetNode) {
  const legacy = asRecord(tweetNode?.legacy);
  return (
    asString(legacy?.in_reply_to_status_id_str) !== null ||
    asString(legacy?.in_reply_to_user_id_str) !== null ||
    asString(legacy?.in_reply_to_screen_name) !== null
  );
}

function isQuoteTweetNode(tweetNode) {
  const legacy = asRecord(tweetNode?.legacy);
  return (
    asBoolean(legacy?.is_quote_status) === true ||
    asString(legacy?.quoted_status_id_str) !== null ||
    asRecord(tweetNode?.quoted_status_result) !== null
  );
}

function collectUniqueTweetIds(payload) {
  const ids = new Set();
  for (const node of collectTimelineTweetNodes(payload)) {
    const id = extractTweetId(node);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function collectUniqueOriginalTweetIds(payload) {
  const ids = new Set();
  for (const node of collectTimelineTweetNodes(payload)) {
    const id = extractTweetId(node);
    if (!id) {
      continue;
    }

    if (isRetweetTweetNode(node) || isReplyTweetNode(node) || isQuoteTweetNode(node)) {
      continue;
    }

    ids.add(id);
  }
  return ids;
}

function buildDefaultOutputPath(account) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(process.cwd(), "tmp", `user-tweets-http-${account}-${stamp}.json`);
}

function shouldCooldownSession(error) {
  return error instanceof HttpStatusError && (error.status === 403 || error.status === 429);
}

function shouldRetryWithAnotherSession(error) {
  if (shouldCooldownSession(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("cursor") ||
    message.includes("usertweets payload shape") ||
    message.includes("resolved timeline belongs") ||
    message.includes("auth") ||
    message.includes("user id")
  );
}

function getJitteredDelayMs(baseMs, jitterMs) {
  if (baseMs <= 0 && jitterMs <= 0) {
    return 0;
  }

  const randomExtra = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  return Math.max(0, baseMs + randomExtra);
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
  const { account, userAgent, headers, queryId: providedQueryId } = params;
  const queryId = providedQueryId ?? (await discoverUserByScreenNameQueryId(userAgent));

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
    new RegExp(`"rest_id":"(\\d+)"[^}]{0,600}?"screen_name":"${accountEscaped}"`),
    new RegExp(`"screen_name":"${accountEscaped}"[^]{0,1200}?"rest_id":"(\\d+)"`),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("Could not resolve user id from profile HTML.");
}

function extractPayloadUsername(payload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const user = asRecord(data?.user);
  const userResult = asRecord(user?.result);
  if (!userResult) {
    return null;
  }

  const core = asRecord(userResult.core);
  const userCore = asRecord(core?.core);
  if (typeof userCore?.screen_name === "string") {
    return userCore.screen_name;
  }

  const legacy = asRecord(userResult.legacy);
  if (typeof legacy?.screen_name === "string") {
    return legacy.screen_name;
  }

  return null;
}

async function resolveUserRestIdWithFallbacks(params) {
  const {
    account,
    userId,
    userAgent,
    headers,
    cookie,
    broker,
  } = params;

  if (userId) {
    return userId;
  }

  const cachedUserByScreenNameQueryId = broker.getCachedGlobal(
    "userByScreenNameQueryId",
    GLOBAL_CACHE_TTL_MS,
  );
  let userByScreenNameQueryId = cachedUserByScreenNameQueryId;
  if (!userByScreenNameQueryId) {
    userByScreenNameQueryId = await discoverUserByScreenNameQueryId(userAgent);
    broker.setCachedGlobal("userByScreenNameQueryId", userByScreenNameQueryId);
  }

  try {
    return await resolveUserRestIdFromGraphqlUserByScreenName({
      account,
      userAgent,
      headers,
      queryId: userByScreenNameQueryId,
    });
  } catch (graphqlError) {
    const gqlMessage =
      graphqlError instanceof Error ? graphqlError.message : "unknown graphql user lookup error";
    console.warn(`[http] UserByScreenName lookup failed: ${gqlMessage}`);
  }

  try {
    return await resolveUserRestId({
      account,
      userId: null,
      headers,
    });
  } catch (usersShowError) {
    const usersShowMessage =
      usersShowError instanceof Error ? usersShowError.message : "unknown users/show error";
    console.warn(`[http] users/show lookup failed: ${usersShowMessage}`);
  }

  console.warn("[http] Falling back to profile HTML rest_id extraction.");
  return resolveUserRestIdFromProfilePage({
    account,
    userAgent,
    cookie,
  });
}

async function fetchUserTweetsPayload(params) {
  const variables = {
    userId: params.userId,
    count: params.count,
    ...(params.cursor ? { cursor: params.cursor } : {}),
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

function extractBottomCursor(payload) {
  const timeline = getTimelineContainer(payload);
  if (!timeline) {
    return null;
  }

  const instructions = Array.isArray(timeline.instructions) ? timeline.instructions : [];
  let bottomCursor = null;
  for (const instructionValue of instructions) {
    const instruction = asRecord(instructionValue);
    if (!instruction) {
      continue;
    }

    const entries = Array.isArray(instruction.entries) ? instruction.entries : [];
    for (const entryValue of entries) {
      const entry = asRecord(entryValue);
      const content = asRecord(entry?.content);
      if (
        content?.entryType === "TimelineTimelineCursor" &&
        content?.cursorType === "Bottom"
      ) {
        bottomCursor = asString(content.value);
      }
    }
  }

  return bottomCursor;
}

function appendTimelineInstructions(targetPayload, nextPayload) {
  const targetTimeline = getTimelineContainer(targetPayload);
  const nextTimeline = getTimelineContainer(nextPayload);
  if (!targetTimeline || !nextTimeline) {
    return;
  }

  const targetInstructions = Array.isArray(targetTimeline.instructions)
    ? targetTimeline.instructions
    : [];
  const nextInstructions = Array.isArray(nextTimeline.instructions)
    ? nextTimeline.instructions
    : [];

  targetTimeline.instructions = [...targetInstructions, ...nextInstructions];
}

function getUniqueOriginalPostCount(payload) {
  return collectUniqueOriginalTweetIds(payload).size;
}

function getUniqueTimelinePostCount(payload) {
  return collectUniqueTweetIds(payload).size;
}

async function fetchPaginatedUserTweetsPayload(params) {
  const startedAtMs = Date.now();
  const mergedPayload = await fetchUserTweetsPayload({
    userId: params.userId,
    count: params.count,
    cursor: params.cursor,
    queryId: params.queryId,
    headers: params.headers,
  });
  let uniqueOriginalPostCount = getUniqueOriginalPostCount(mergedPayload);

  if (uniqueOriginalPostCount >= params.targetOriginals) {
    console.log(
      `[http] Reached target depth after page 1 (${uniqueOriginalPostCount}/${params.targetOriginals} original posts).`,
    );
    return {
      payload: mergedPayload,
      nextCursor: extractBottomCursor(mergedPayload),
    };
  }

  let cursor = extractBottomCursor(mergedPayload);
  const seenCursors = new Set(cursor ? [cursor] : []);

  for (let page = 2; page <= params.pages; page += 1) {
    if (!cursor) {
      break;
    }

    if (Date.now() - startedAtMs >= params.maxDurationMs) {
      console.log(
        `[http] Stopping pagination after ${page - 1} page(s); wall-clock budget reached.`,
      );
      break;
    }

    const interRequestDelayMs = getJitteredDelayMs(
      params.requestDelayMs,
      params.requestJitterMs,
    );
    if (interRequestDelayMs > 0) {
      console.log(
        `[rate-limit] Sleeping ${interRequestDelayMs}ms before page ${page} request.`,
      );
      await sleep(interRequestDelayMs);
    }

    console.log(`[http] Fetching page ${page} with cursor.`);
    const nextPayload = await fetchUserTweetsPayload({
      userId: params.userId,
      count: params.count,
      queryId: params.queryId,
      headers: params.headers,
      cursor,
    });

    if (!looksLikeUserTweetsPayload(nextPayload)) {
      throw new Error(`Paginated response for page ${page} did not match UserTweets payload shape.`);
    }

    appendTimelineInstructions(mergedPayload, nextPayload);
    uniqueOriginalPostCount = getUniqueOriginalPostCount(mergedPayload);
    if (uniqueOriginalPostCount >= params.targetOriginals) {
      console.log(
        `[http] Reached target depth after page ${page} (${uniqueOriginalPostCount}/${params.targetOriginals} original posts).`,
      );
      break;
    }

    const nextCursor = extractBottomCursor(nextPayload);
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    payload: mergedPayload,
    nextCursor: extractBottomCursor(mergedPayload),
  };
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

function attachScrapeMeta(payload, meta) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  payload.__scrapeMeta = meta;
  return payload;
}

async function runScrapeAttempt(params) {
  const {
    account,
    options,
    broker,
    pages,
    requestDelayMs,
    requestJitterMs,
    sessionHandle,
  } = params;
  const sessionCookie = sessionHandle.cookie ?? null;
  const sessionCsrfToken = sessionHandle.csrfToken ?? null;
  const sessionUserAgent = sessionHandle.userAgent ?? null;
  const sessionBearerToken = sessionHandle.bearerToken ?? null;

  const cookieRaw = options.cookie ?? sessionCookie ?? process.env.X_WEB_COOKIE ?? null;
  const csrfFromCookie = cookieRaw ? getCookieValue(cookieRaw, "ct0") : null;
  const csrfToken =
    options.csrf ??
    sessionCsrfToken ??
    process.env.X_WEB_CSRF_TOKEN ??
    csrfFromCookie ??
    null;
  const cookie = ensureCookieContainsCt0(cookieRaw, csrfToken);
  const userAgent =
    options.userAgent ??
    sessionUserAgent ??
    process.env.X_WEB_USER_AGENT ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const bearerFromArgsOrEnv =
    options.bearer ??
    sessionBearerToken ??
    process.env.X_WEB_BEARER_TOKEN ??
    null;
  const cachedBearer = bearerFromArgsOrEnv
    ? null
    : broker.getCachedGlobal("bearerToken", GLOBAL_CACHE_TTL_MS);
  let bearerToken = bearerFromArgsOrEnv ?? cachedBearer;
  if (!bearerToken) {
    bearerToken = await discoverWebBearerToken(userAgent);
    broker.setCachedGlobal("bearerToken", bearerToken);
  }

  const queryIdFromArgsOrEnv =
    options.queryId || process.env.X_WEB_USER_TWEETS_QUERY_ID || null;
  const cachedQueryId = queryIdFromArgsOrEnv
    ? null
    : broker.getCachedGlobal("queryId", GLOBAL_CACHE_TTL_MS);
  const resolvedQueryId =
    queryIdFromArgsOrEnv || cachedQueryId || (await discoverUserTweetsQueryId(userAgent));
  if (!queryIdFromArgsOrEnv && !cachedQueryId) {
    broker.setCachedGlobal("queryId", resolvedQueryId);
  }
  console.log(`[http] UserTweets queryId: ${resolvedQueryId}`);

  const userIdFromEnv = process.env.X_WEB_USER_ID || null;
  const userIdInput =
    options.userId ||
    userIdFromEnv ||
    broker.getCachedUserId(account, USER_ID_CACHE_TTL_MS);

  const useCookieAuth = Boolean(cookie && csrfToken && !options.forceGuest);
  let guestToken = null;

  if (!useCookieAuth) {
    console.log("[http] Using guest-token flow (no auth cookie supplied).");
    guestToken = await resolveGuestToken(bearerToken, userAgent);
  } else if (sessionHandle.kind === "pooled") {
    console.log(`[http] Using authenticated cookie flow via session ${sessionHandle.label}.`);
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

  const userId = await resolveUserRestIdWithFallbacks({
    account,
    userId: userIdInput,
    userAgent,
    headers,
    cookie,
    broker,
  });
  broker.setCachedUserId(account, userId);
  console.log(`[http] Resolved user id: ${userId}`);

  const payload = await fetchPaginatedUserTweetsPayload({
    userId,
    count: options.count,
    cursor: options.cursor,
    pages,
    requestDelayMs,
    requestJitterMs,
    queryId: resolvedQueryId,
    headers,
    targetOriginals: options.targetOriginals,
    maxDurationMs: options.maxDurationMs,
  });

  if (!looksLikeUserTweetsPayload(payload.payload)) {
    throw new Error(
      "Response does not match UserTweets payload shape. This can happen when headers/queryId/features drift.",
    );
  }

  const payloadAccount = extractPayloadUsername(payload.payload);
  if (
    payloadAccount &&
    payloadAccount.toLowerCase() !== account.toLowerCase()
  ) {
    throw new Error(
      `Resolved timeline belongs to @${payloadAccount}, not @${account}. User id resolution is stale or incorrect.`,
    );
  }

  return {
    payload: payload.payload,
    nextCursor: payload.nextCursor,
  };
}

function buildCaptureOptions(rawOptions = {}) {
  return {
    ...parseArgs([]),
    ...rawOptions,
  };
}

function classifySessionHealthError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("scrape hourly budget exceeded")) {
    return {
      status: "budget_exhausted",
      message,
    };
  }

  if (lowerMessage.includes("scrape cooldown active")) {
    return {
      status: "cooldown_active",
      message,
    };
  }

  if (
    lowerMessage.includes("verify your email") ||
    (lowerMessage.includes("verify") && lowerMessage.includes("email"))
  ) {
    return {
      status: "needs_verification",
      message,
    };
  }

  if (lowerMessage.includes("suspend")) {
    return {
      status: "suspended",
      message,
    };
  }

  if (
    lowerMessage.includes("challenge") ||
    lowerMessage.includes("checkpoint") ||
    lowerMessage.includes("unusual activity")
  ) {
    return {
      status: "challenge_required",
      message,
    };
  }

  if (
    lowerMessage.includes("http 401") ||
    lowerMessage.includes("http 403") ||
    lowerMessage.includes("auth") ||
    lowerMessage.includes("login") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("unauthorized")
  ) {
    return {
      status: "auth_blocked",
      message,
    };
  }

  return {
    status: "error",
    message,
  };
}

export async function runUserTweetsCapture(rawOptions) {
  const options = buildCaptureOptions(rawOptions);
  const account = normalizeAccount(options.account ?? "");
  if (!account) {
    throw new Error("Invalid account. Use @username, username, or x.com/username.");
  }

  const envMaxRequests = Number(
    process.env.SCRAPER_BUDGET_PER_HOUR ?? process.env.X_WEB_MAX_REQUESTS_PER_HOUR ?? NaN,
  );
  const envMinInterval = Number(process.env.X_WEB_MIN_INTERVAL_MS ?? NaN);
  const envCooldown = Number(process.env.X_WEB_COOLDOWN_MS ?? NaN);
  const envPages = Number(process.env.X_WEB_PAGES ?? NaN);
  const envRequestDelay = Number(process.env.X_WEB_REQUEST_DELAY_MS ?? NaN);
  const envRequestJitter = Number(process.env.X_WEB_REQUEST_JITTER_MS ?? NaN);
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
  const pages =
    Number.isFinite(envPages) && envPages >= 1
      ? Math.min(12, Math.floor(envPages))
      : options.pages;
  const requestDelayMs =
    Number.isFinite(envRequestDelay) && envRequestDelay >= 0
      ? Math.floor(envRequestDelay)
      : options.requestDelayMs;
  const requestJitterMs =
    Number.isFinite(envRequestJitter) && envRequestJitter >= 0
      ? Math.floor(envRequestJitter)
      : options.requestJitterMs;

  const sessionFilePath = options.sessionFile ?? process.env.X_WEB_SESSION_FILE ?? null;
  const broker = await createSessionBroker({
    statePath: process.env.X_WEB_SCRAPE_STATE_PATH ?? options.stateFile,
    sessionFilePath,
    maxRequestsPerHour,
    minIntervalMs,
  });

  try {
    let forcedSessionId = options.sessionId ?? null;
    const attemptedSessionIds = new Set();
    const rotatedSessionIds = [];
    const maxSessionAttempts = forcedSessionId ? 1 : 4;
    let attemptError = null;
    let finalPayload = null;
    let finalNextCursor = null;
    let finalSessionId = null;

    for (let attempt = 1; attempt <= maxSessionAttempts; attempt += 1) {
      const sessionHandle = await broker.acquire({
        forcedSessionId,
      });
      finalSessionId = sessionHandle.sessionId ?? finalSessionId;

      try {
        const attemptResult = await runScrapeAttempt({
          account,
          options,
          broker,
          pages,
          requestDelayMs,
          requestJitterMs,
          sessionHandle,
        });
        await broker.markSuccess(sessionHandle);
        finalPayload = attemptResult.payload;
        finalNextCursor = attemptResult.nextCursor ?? null;
        finalSessionId = sessionHandle.sessionId ?? finalSessionId;
        break;
      } catch (error) {
        attemptError = error;
        const shouldCooldown = shouldCooldownSession(error);
        await broker.markFailure(sessionHandle, {
          cooldownMs,
          shouldCooldown,
        });

        const canRetryWithAnotherSession =
          !forcedSessionId &&
          sessionHandle.sessionId &&
          !attemptedSessionIds.has(sessionHandle.sessionId) &&
          shouldRetryWithAnotherSession(error) &&
          attempt < maxSessionAttempts;

        if (!canRetryWithAnotherSession) {
          throw error;
        }

        attemptedSessionIds.add(sessionHandle.sessionId);
        rotatedSessionIds.push(sessionHandle.sessionId);
        console.warn(
          `[session] Session ${sessionHandle.label} failed; retrying the scrape from page 1 with another session.`,
        );
        forcedSessionId = null;
      }
    }

    if (!finalPayload) {
      throw attemptError ?? new Error("Scrape failed before any payload could be saved.");
    }

    const payload = attachScrapeMeta(finalPayload, {
      sessionId: finalSessionId,
      rotatedSessionIds,
      didRotateSession: rotatedSessionIds.length > 0,
      totalRawPostCount: getUniqueTimelinePostCount(finalPayload),
      uniqueOriginalPostsCollected: getUniqueOriginalPostCount(finalPayload),
      nextCursor: finalNextCursor ?? extractBottomCursor(finalPayload),
    });

    const shouldWriteOutput = options.writeOutput === true || Boolean(options.output);
    let outputPath = null;
    if (shouldWriteOutput) {
      outputPath = path.resolve(options.output ?? buildDefaultOutputPath(account));
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      console.log(`[http] Saved payload: ${outputPath}`);
    }

    let importResult = null;
    if (options.shouldImport) {
      console.log(`[import] Posting capture to ${options.endpoint}`);
      importResult = await maybeImportCapture({
        endpoint: options.endpoint,
        account,
        payload,
      });
      console.log(`[import] Success:\n${JSON.stringify(importResult, null, 2)}`);
    }

    return {
      account,
      payload,
      outputPath,
      importResult,
      scrapeMeta:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload.__scrapeMeta ?? null
          : null,
    };
  } finally {
    await broker.close();
  }
}

export async function inspectScraperSessionsHealth(rawOptions) {
  const options = buildCaptureOptions(rawOptions);
  const account = normalizeAccount(options.account ?? "");
  if (!account) {
    throw new Error("Invalid account. Use @username, username, or x.com/username.");
  }

  const envMaxRequests = Number(
    process.env.SCRAPER_BUDGET_PER_HOUR ?? process.env.X_WEB_MAX_REQUESTS_PER_HOUR ?? NaN,
  );
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

  const sessionFilePath = options.sessionFile ?? process.env.X_WEB_SESSION_FILE ?? null;
  const sessionState = await inspectSessionBrokerState({
    statePath: process.env.X_WEB_SCRAPE_STATE_PATH ?? options.stateFile,
    sessionFilePath,
  });

  const broker = await createSessionBroker({
    statePath: process.env.X_WEB_SCRAPE_STATE_PATH ?? options.stateFile,
    sessionFilePath,
    maxRequestsPerHour,
    minIntervalMs,
  });

  try {
    const sessions = [];

    for (const session of sessionState.sessions) {
      const checkedAt = new Date().toISOString();

      try {
        const sessionHandle = await broker.acquire({
          forcedSessionId: session.id,
        });

        try {
          const attemptResult = await runScrapeAttempt({
            account,
            options: {
              ...options,
              count: 5,
              pages: 1,
              targetOriginals: 1,
              maxDurationMs: 7_500,
              userAgent: options.userAgent ?? "scraper-session-health-check",
            },
            broker,
            pages: 1,
            requestDelayMs: 0,
            requestJitterMs: 0,
            sessionHandle,
          });
          await broker.markSuccess(sessionHandle);

          sessions.push({
            id: session.id,
            rateLimit: session.rateLimit,
            health: {
              status: "ok",
              message: "Authenticated scrape probe succeeded.",
              checkedAt,
              sessionId: sessionHandle.sessionId ?? session.id,
              nextCursor: attemptResult.nextCursor ?? null,
              uniqueOriginalPostsCollected: getUniqueOriginalPostCount(attemptResult.payload),
              totalRawPostCount: getUniqueTimelinePostCount(attemptResult.payload),
            },
          });
        } catch (error) {
          const classified = classifySessionHealthError(error);
          await broker.markFailure(sessionHandle, {
            cooldownMs,
            shouldCooldown: shouldCooldownSession(error),
          });

          sessions.push({
            id: session.id,
            rateLimit: session.rateLimit,
            health: {
              ...classified,
              checkedAt,
              sessionId: sessionHandle.sessionId ?? session.id,
              nextCursor: null,
              uniqueOriginalPostsCollected: null,
              totalRawPostCount: null,
            },
          });
        }
      } catch (error) {
        const classified = classifySessionHealthError(error);
        sessions.push({
          id: session.id,
          rateLimit: session.rateLimit,
          health: {
            ...classified,
            checkedAt,
            sessionId: session.id,
            nextCursor: null,
            uniqueOriginalPostsCollected: null,
            totalRawPostCount: null,
          },
        });
      }
    }

    return {
      account,
      checkedAt: new Date().toISOString(),
      defaultRateLimit: sessionState.defaultRateLimit,
      sessions,
    };
  } finally {
    await broker.close();
  }
}

export async function runUserTweetsCaptureCli(argv = process.argv.slice(2)) {
  await loadLocalEnv();

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      message: error instanceof Error ? error.message : "Unknown argument error.",
      shouldPrintUsage: true,
    };
  }

  if (options.help) {
    return {
      ok: true,
      exitCode: 0,
      message: null,
      shouldPrintUsage: true,
      result: null,
    };
  }

  if (!options.account) {
    return {
      ok: false,
      exitCode: 1,
      message: null,
      shouldPrintUsage: true,
    };
  }

  const account = normalizeAccount(options.account);
  if (!account) {
    return {
      ok: false,
      exitCode: 1,
      message: "Invalid --account value. Use @username, username, or x.com/username.",
      shouldPrintUsage: false,
    };
  }

  const result = await runUserTweetsCapture({
    ...options,
    account,
    writeOutput: true,
  });

  return {
    ok: true,
    exitCode: 0,
    message: null,
    shouldPrintUsage: false,
    result,
  };
}
