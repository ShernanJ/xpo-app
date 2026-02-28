import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const DEFAULT_STATE_FILE = path.resolve(
  process.cwd(),
  "tmp",
  "x-http-scrape-state.json",
);

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function getCookieValue(cookieString, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${escapedKey}=([^;]+)`));
  return match ? match[1] : null;
}

export function ensureCookieContainsCt0(cookie, csrfToken) {
  if (!cookie) {
    return cookie;
  }

  if (!csrfToken || getCookieValue(cookie, "ct0")) {
    return cookie;
  }

  const separator = cookie.trim().endsWith(";") ? " " : "; ";
  return `${cookie}${separator}ct0=${csrfToken}`;
}

function createEmptyRateBucket() {
  return {
    recentRequests: [],
    lastRequestAt: null,
    cooldownUntil: null,
  };
}

function createEmptyBrokerState() {
  return {
    ...createEmptyRateBucket(),
    sessions: {},
    cache: {
      global: {},
      userIds: {},
    },
  };
}

function normalizeRateBucket(raw) {
  const bucket = createEmptyRateBucket();
  const root = asRecord(raw);
  if (!root) {
    return bucket;
  }

  if (Array.isArray(root.recentRequests)) {
    bucket.recentRequests = root.recentRequests
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  if (Number.isFinite(Number(root.lastRequestAt))) {
    bucket.lastRequestAt = Number(root.lastRequestAt);
  }

  if (Number.isFinite(Number(root.cooldownUntil))) {
    bucket.cooldownUntil = Number(root.cooldownUntil);
  }

  return bucket;
}

function normalizeCacheEntry(raw) {
  const root = asRecord(raw);
  if (!root || typeof root.value !== "string") {
    return null;
  }

  return {
    value: root.value,
    updatedAt: Number(root.updatedAt) || Date.now(),
  };
}

function normalizeBrokerState(raw) {
  const state = createEmptyBrokerState();
  const root = asRecord(raw);
  if (!root) {
    return state;
  }

  const topLevelBucket = normalizeRateBucket(root);
  state.recentRequests = topLevelBucket.recentRequests;
  state.lastRequestAt = topLevelBucket.lastRequestAt;
  state.cooldownUntil = topLevelBucket.cooldownUntil;

  const sessions = asRecord(root.sessions);
  if (sessions) {
    for (const [sessionId, value] of Object.entries(sessions)) {
      state.sessions[sessionId] = normalizeRateBucket(value);
    }
  }

  const cache = asRecord(root.cache);
  if (!cache) {
    return state;
  }

  const globalCache = asRecord(cache.global);
  if (globalCache) {
    for (const [key, value] of Object.entries(globalCache)) {
      const entry = normalizeCacheEntry(value);
      if (!entry) {
        continue;
      }

      state.cache.global[key] = entry;
    }
  }

  const userIds = asRecord(cache.userIds);
  if (userIds) {
    for (const [key, value] of Object.entries(userIds)) {
      const entry = normalizeCacheEntry(value);
      if (!entry) {
        continue;
      }

      state.cache.userIds[key] = entry;
    }
  }

  return state;
}

async function readBrokerState(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return normalizeBrokerState(JSON.parse(raw));
  } catch {
    return createEmptyBrokerState();
  }
}

async function writeBrokerState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function pruneOldRequests(bucket, nowMs) {
  bucket.recentRequests = bucket.recentRequests.filter(
    (timestampMs) => nowMs - timestampMs < 60 * 60 * 1000,
  );
}

function getRateBucketWaitMs(bucket, options) {
  const nowMs = Date.now();
  pruneOldRequests(bucket, nowMs);

  let waitMs = 0;

  if (
    Number.isFinite(bucket.cooldownUntil) &&
    bucket.cooldownUntil !== null &&
    nowMs < bucket.cooldownUntil
  ) {
    waitMs = Math.max(waitMs, bucket.cooldownUntil - nowMs);
  }

  if (
    Number.isFinite(bucket.lastRequestAt) &&
    bucket.lastRequestAt !== null &&
    options.minIntervalMs > 0
  ) {
    const elapsedMs = nowMs - bucket.lastRequestAt;
    if (elapsedMs < options.minIntervalMs) {
      waitMs = Math.max(waitMs, options.minIntervalMs - elapsedMs);
    }
  }

  pruneOldRequests(bucket, nowMs);
  if (bucket.recentRequests.length >= options.maxRequestsPerHour) {
    const oldest = bucket.recentRequests[0];
    waitMs = Math.max(waitMs, Math.max(1, oldest + 60 * 60 * 1000 - nowMs));
  }

  return waitMs;
}

async function enforceRateLimit(bucket, options, label = "default") {
  const initialWaitMs = getRateBucketWaitMs(bucket, options);
  if (initialWaitMs <= 0) {
    return;
  }

  const nowMs = Date.now();
  const coolingDown =
    Number.isFinite(bucket.cooldownUntil) &&
    bucket.cooldownUntil !== null &&
    nowMs < bucket.cooldownUntil;
  if (coolingDown) {
    const waitSeconds = Math.ceil((bucket.cooldownUntil - nowMs) / 1000);
    throw new Error(
      `Scrape cooldown active for session ${label} for ${waitSeconds}s. Reduce traffic or wait before retrying.`,
    );
  }

  if (bucket.recentRequests.length >= options.maxRequestsPerHour) {
    const oldest = bucket.recentRequests[0];
    const waitMs = Math.max(1, oldest + 60 * 60 * 1000 - nowMs);
    const waitSeconds = Math.ceil(waitMs / 1000);
    throw new Error(
      `Scrape hourly budget exceeded for session ${label} (${options.maxRequestsPerHour}/hour). Retry in ~${waitSeconds}s.`,
    );
  }

  if (options.minIntervalMs > 0) {
    console.log(`[rate-limit] Sleeping ${initialWaitMs}ms before reusing session ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, initialWaitMs));
  }
}

function markRequestStart(bucket) {
  const nowMs = Date.now();
  bucket.lastRequestAt = nowMs;
  bucket.recentRequests.push(nowMs);
}

function getOrCreateSessionRateBucket(state, sessionId) {
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = createEmptyRateBucket();
  }

  return state.sessions[sessionId];
}

function normalizeSessionConfig(raw, index) {
  const root = asRecord(raw);
  if (!root) {
    return null;
  }

  const id = asString(root.id) ?? `session_${index + 1}`;
  const cookieRaw = asString(root.cookie);
  if (!cookieRaw) {
    return null;
  }

  const explicitCsrf =
    asString(root.csrfToken) ??
    asString(root.csrf) ??
    asString(root.ct0);
  const csrfFromCookie = getCookieValue(cookieRaw, "ct0");
  const csrfToken = explicitCsrf ?? csrfFromCookie;
  if (!csrfToken) {
    return null;
  }

  return {
    id,
    cookie: ensureCookieContainsCt0(cookieRaw, csrfToken),
    csrfToken,
    userAgent: asString(root.userAgent),
    bearerToken: asString(root.bearerToken),
  };
}

async function loadSessionPool(sessionFilePath) {
  if (!sessionFilePath) {
    return [];
  }

  let raw = "";
  try {
    raw = await readFile(sessionFilePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed reading session pool file: ${message}`);
  }

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Session pool file must be valid JSON: ${message}`);
  }

  const root = asRecord(json);
  const candidates = Array.isArray(json)
    ? json
    : Array.isArray(root?.sessions)
      ? root.sessions
      : null;
  if (!candidates) {
    throw new Error("Session pool JSON must be an array or an object with a sessions array.");
  }

  const sessions = candidates
    .map((value, index) => normalizeSessionConfig(value, index))
    .filter(Boolean);
  if (sessions.length === 0) {
    throw new Error("Session pool did not contain any usable authenticated sessions.");
  }

  return sessions;
}

function selectSessionFromPool(params) {
  const { sessionPool, state, options, forcedSessionId } = params;
  if (sessionPool.length === 0) {
    return null;
  }

  const candidates = forcedSessionId
    ? sessionPool.filter((session) => session.id === forcedSessionId)
    : sessionPool;
  if (forcedSessionId && candidates.length === 0) {
    throw new Error(`Session ${forcedSessionId} was not found in the configured session pool.`);
  }

  const scored = candidates.map((session) => {
    const bucket = getOrCreateSessionRateBucket(state, session.id);
    const waitMs = getRateBucketWaitMs(bucket, options);

    return {
      session,
      bucket,
      waitMs,
      load: bucket.recentRequests.length,
      lastRequestAt:
        Number.isFinite(bucket.lastRequestAt) && bucket.lastRequestAt !== null
          ? bucket.lastRequestAt
          : 0,
    };
  });

  const available = scored.filter((candidate) => candidate.waitMs <= 0);
  const ranked = (available.length > 0 ? available : scored).sort((a, b) => {
    if (a.waitMs !== b.waitMs) {
      return a.waitMs - b.waitMs;
    }

    if (a.load !== b.load) {
      return a.load - b.load;
    }

    if (a.lastRequestAt !== b.lastRequestAt) {
      return a.lastRequestAt - b.lastRequestAt;
    }

    return a.session.id.localeCompare(b.session.id);
  });

  return ranked[0] ?? null;
}

function getCacheEntry(cacheMap, key, ttlMs) {
  const entry = cacheMap[key];
  if (!entry) {
    return null;
  }

  if (!Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > ttlMs) {
    return null;
  }

  return entry.value;
}

function setCacheEntry(cacheMap, key, value) {
  cacheMap[key] = {
    value,
    updatedAt: Date.now(),
  };
}

export async function createSessionBroker(params) {
  const {
    statePath = DEFAULT_STATE_FILE,
    sessionFilePath = null,
    maxRequestsPerHour,
    minIntervalMs,
  } = params;

  const resolvedStatePath = path.resolve(statePath);
  const resolvedSessionFilePath = sessionFilePath
    ? path.resolve(sessionFilePath)
    : null;
  const state = await readBrokerState(resolvedStatePath);
  const sessionPool = await loadSessionPool(resolvedSessionFilePath);

  async function persistState() {
    await writeBrokerState(resolvedStatePath, state);
  }

  return {
    getCachedGlobal(key, ttlMs) {
      return getCacheEntry(state.cache.global, key, ttlMs);
    },

    setCachedGlobal(key, value) {
      setCacheEntry(state.cache.global, key, value);
    },

    getCachedUserId(account, ttlMs) {
      return getCacheEntry(state.cache.userIds, account.toLowerCase(), ttlMs);
    },

    setCachedUserId(account, value) {
      setCacheEntry(state.cache.userIds, account.toLowerCase(), value);
    },

    async acquire(options = {}) {
      const selectedSession = selectSessionFromPool({
        sessionPool,
        state,
        options: {
          maxRequestsPerHour,
          minIntervalMs,
        },
        forcedSessionId: options.forcedSessionId ?? null,
      });
      const activeRateBucket = selectedSession ? selectedSession.bucket : state;
      const activeRateLabel = selectedSession ? selectedSession.session.id : "default";

      if (selectedSession) {
        console.log(
          `[session] Using pooled session ${selectedSession.session.id} (${sessionPool.length} configured).`,
        );
      }

      await enforceRateLimit(
        activeRateBucket,
        {
          maxRequestsPerHour,
          minIntervalMs,
        },
        activeRateLabel,
      );
      markRequestStart(activeRateBucket);
      await persistState();

      return {
        kind: selectedSession ? "pooled" : "default",
        label: activeRateLabel,
        sessionId: selectedSession?.session.id ?? null,
        cookie: selectedSession?.session.cookie ?? null,
        csrfToken: selectedSession?.session.csrfToken ?? null,
        userAgent: selectedSession?.session.userAgent ?? null,
        bearerToken: selectedSession?.session.bearerToken ?? null,
      };
    },

    async markSuccess(handle) {
      const bucket = handle?.sessionId
        ? getOrCreateSessionRateBucket(state, handle.sessionId)
        : state;
      bucket.cooldownUntil = null;
      await persistState();
    },

    async markFailure(handle, options = {}) {
      const bucket = handle?.sessionId
        ? getOrCreateSessionRateBucket(state, handle.sessionId)
        : state;

      if (options.shouldCooldown && options.cooldownMs > 0) {
        bucket.cooldownUntil = Date.now() + options.cooldownMs;
      }

      await persistState();
    },
  };
}
