import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import pg from "pg";

const { Pool } = pg;

export const DEFAULT_STATE_FILE = path.resolve(
  os.tmpdir(),
  "xpo-scrape",
  "x-http-scrape-state.json",
);
const DEFAULT_STATE_BACKEND = "auto";
const DEFAULT_STATE_TABLE = "x_web_scrape_state";
const DEFAULT_STATE_ROW_ID = "global";
const DEFAULT_PROXY_TABLE = "ScraperProxyAccount";
const DEFAULT_SESSION_POOL_FILE = path.resolve(os.tmpdir(), "session-pool.json");

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function sanitizeSqlIdentifier(identifier, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid ${label} "${identifier}". Use only letters, numbers, and underscores.`);
  }

  return `"${identifier}"`;
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

async function readBrokerStateFromFile(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return normalizeBrokerState(JSON.parse(raw));
  } catch {
    return createEmptyBrokerState();
  }
}

async function writeBrokerStateToFile(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function materializeSessionPoolFile(sessionFilePath) {
  const rawSessionPoolJson = asString(process.env.X_WEB_SESSION_POOL_JSON);
  if (!rawSessionPoolJson) {
    return sessionFilePath ? path.resolve(sessionFilePath) : null;
  }

  try {
    JSON.parse(rawSessionPoolJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`X_WEB_SESSION_POOL_JSON must be valid JSON: ${message}`);
  }

  const resolvedSessionFilePath = path.resolve(sessionFilePath || DEFAULT_SESSION_POOL_FILE);
  await mkdir(path.dirname(resolvedSessionFilePath), { recursive: true });
  await writeFile(resolvedSessionFilePath, `${rawSessionPoolJson}\n`, "utf8");
  return resolvedSessionFilePath;
}

async function createFileStateStore(statePath) {
  const resolvedStatePath = path.resolve(statePath);
  return {
    backend: "file",
    async read() {
      return readBrokerStateFromFile(resolvedStatePath);
    },
    async write(state) {
      await writeBrokerStateToFile(resolvedStatePath, state);
    },
    async close() {
      return undefined;
    },
  };
}

async function createPostgresStateStore(params) {
  const {
    databaseUrl,
    schemaName,
    tableName,
    rowId,
  } = params;
  if (!databaseUrl) {
    throw new Error("Postgres scrape state backend requires DATABASE_URL.");
  }

  const schemaIdentifier = sanitizeSqlIdentifier(schemaName, "state schema");
  const tableIdentifier = sanitizeSqlIdentifier(tableName, "state table");
  const qualifiedTable = `${schemaIdentifier}.${tableIdentifier}`;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
      id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  return {
    backend: "postgres",
    async read() {
      const result = await pool.query(
        `SELECT state FROM ${qualifiedTable} WHERE id = $1 LIMIT 1`,
        [rowId],
      );
      if (result.rowCount === 0) {
        return createEmptyBrokerState();
      }

      const rawState = result.rows[0]?.state ?? null;
      return normalizeBrokerState(rawState);
    },
    async write(state) {
      await pool.query(
        `
          INSERT INTO ${qualifiedTable} (id, state, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
        `,
        [rowId, JSON.stringify(state)],
      );
    },
    async close() {
      await pool.end();
    },
  };
}

async function createBrokerStateStore(params) {
  const {
    statePath,
    stateBackend,
    databaseUrl,
    stateSchema,
    stateTable,
    stateRowId,
  } = params;
  const normalizedBackend = (stateBackend ?? DEFAULT_STATE_BACKEND).trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  const shouldUsePostgres =
    normalizedBackend === "postgres" ||
    (normalizedBackend === "auto" && Boolean(databaseUrl));
  if (shouldUsePostgres) {
    try {
      const stateStore = await createPostgresStateStore({
        databaseUrl,
        schemaName: stateSchema,
        tableName: stateTable,
        rowId: stateRowId,
      });
      console.log(`[state] Using ${stateStore.backend} scrape-state backend.`);
      return stateStore;
    } catch (error) {
      if (normalizedBackend === "postgres" || isProduction) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(
        `[state] Postgres scrape-state backend unavailable (${message}). Falling back to file state.`,
      );
    }
  }

  if (isProduction) {
    throw new Error(
      "Production scraper state requires the Postgres backend. Configure DATABASE_URL or X_WEB_SCRAPE_STATE_BACKEND=postgres.",
    );
  }

  const stateStore = await createFileStateStore(statePath);
  console.log(`[state] Using ${stateStore.backend} scrape-state backend.`);
  return stateStore;
}

async function createProxyAccountStore(params) {
  const {
    databaseUrl,
    schemaName,
    tableName,
  } = params;
  if (!databaseUrl) {
    return null;
  }

  const schemaIdentifier = sanitizeSqlIdentifier(schemaName, "proxy schema");
  const tableIdentifier = sanitizeSqlIdentifier(tableName, "proxy table");
  const qualifiedTable = `${schemaIdentifier}.${tableIdentifier}`;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
      id TEXT PRIMARY KEY,
      "sessionId" TEXT NOT NULL UNIQUE,
      fleet TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      "lockedUntil" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  return {
    async getAvailableSessionIds(fleet) {
      const result = await pool.query(
        `
          SELECT "sessionId"
          FROM ${qualifiedTable}
          WHERE enabled = TRUE
            AND fleet = $1
            AND ("lockedUntil" IS NULL OR "lockedUntil" <= NOW())
        `,
        [fleet],
      );
      return result.rows
        .map((row) => asString(row.sessionId))
        .filter(Boolean);
    },
    async hasAnyRows() {
      const result = await pool.query(`SELECT EXISTS(SELECT 1 FROM ${qualifiedTable}) AS exists`);
      return result.rows[0]?.exists === true;
    },
    async lockSession(sessionId, lockForMs) {
      if (!sessionId || !(lockForMs > 0)) {
        return;
      }

      await pool.query(
        `
          UPDATE ${qualifiedTable}
          SET "lockedUntil" = TO_TIMESTAMP($2 / 1000.0),
              "updatedAt" = NOW()
          WHERE "sessionId" = $1
        `,
        [sessionId, Date.now() + lockForMs],
      );
    },
    async close() {
      await pool.end();
    },
  };
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

function snapshotRateBucket(bucket) {
  const nowMs = Date.now();
  pruneOldRequests(bucket, nowMs);

  return {
    recentRequestCount: bucket.recentRequests.length,
    lastRequestAt:
      Number.isFinite(bucket.lastRequestAt) && bucket.lastRequestAt !== null
        ? new Date(bucket.lastRequestAt).toISOString()
        : null,
    cooldownUntil:
      Number.isFinite(bucket.cooldownUntil) && bucket.cooldownUntil !== null
        ? new Date(bucket.cooldownUntil).toISOString()
        : null,
  };
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
    stateBackend = process.env.X_WEB_SCRAPE_STATE_BACKEND ?? DEFAULT_STATE_BACKEND,
    databaseUrl = process.env.DATABASE_URL ?? null,
    stateSchema = process.env.X_WEB_SCRAPE_STATE_SCHEMA ?? "public",
    stateTable = process.env.X_WEB_SCRAPE_STATE_TABLE ?? DEFAULT_STATE_TABLE,
    stateRowId = process.env.X_WEB_SCRAPE_STATE_ROW_ID ?? DEFAULT_STATE_ROW_ID,
    proxyTable = process.env.X_WEB_SCRAPER_PROXY_TABLE ?? DEFAULT_PROXY_TABLE,
  } = params;

  const resolvedSessionFilePath = await materializeSessionPoolFile(sessionFilePath);
  const stateStore = await createBrokerStateStore({
    statePath,
    stateBackend,
    databaseUrl,
    stateSchema,
    stateTable,
    stateRowId,
  });
  const state = await stateStore.read();
  const sessionPool = await loadSessionPool(resolvedSessionFilePath);
  const proxyAccountStore = await createProxyAccountStore({
    databaseUrl,
    schemaName: stateSchema,
    tableName: proxyTable,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[session] Proxy-account store unavailable (${message}); using the raw session pool.`);
    return null;
  });

  async function persistState() {
    await stateStore.write(state);
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
      let effectiveSessionPool = sessionPool;
      if (proxyAccountStore && options.fleet) {
        const [hasAnyRows, availableSessionIds] = await Promise.all([
          proxyAccountStore.hasAnyRows(),
          proxyAccountStore.getAvailableSessionIds(options.fleet),
        ]);

        if (hasAnyRows) {
          effectiveSessionPool = sessionPool.filter((session) =>
            availableSessionIds.includes(session.id),
          );
          if (effectiveSessionPool.length === 0) {
            throw new Error(
              `No enabled scraper proxy accounts are currently available for fleet ${options.fleet}.`,
            );
          }
        }
      }

      const selectedSession = selectSessionFromPool({
        sessionPool: effectiveSessionPool,
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
          `[session] Using pooled session ${selectedSession.session.id} (${effectiveSessionPool.length} available).`,
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
      if (proxyAccountStore && handle?.sessionId && options.lockProxyForMs > 0) {
        await proxyAccountStore.lockSession(handle.sessionId, options.lockProxyForMs);
      }
    },

    async close() {
      if (proxyAccountStore) {
        await proxyAccountStore.close();
      }
      await stateStore.close();
    },
  };
}

export async function inspectSessionBrokerState(params = {}) {
  const {
    statePath = DEFAULT_STATE_FILE,
    sessionFilePath = null,
    stateBackend = process.env.X_WEB_SCRAPE_STATE_BACKEND ?? DEFAULT_STATE_BACKEND,
    databaseUrl = process.env.DATABASE_URL ?? null,
    stateSchema = process.env.X_WEB_SCRAPE_STATE_SCHEMA ?? "public",
    stateTable = process.env.X_WEB_SCRAPE_STATE_TABLE ?? DEFAULT_STATE_TABLE,
    stateRowId = process.env.X_WEB_SCRAPE_STATE_ROW_ID ?? DEFAULT_STATE_ROW_ID,
  } = params;

  const resolvedSessionFilePath = await materializeSessionPoolFile(sessionFilePath);
  const stateStore = await createBrokerStateStore({
    statePath,
    stateBackend,
    databaseUrl,
    stateSchema,
    stateTable,
    stateRowId,
  });

  try {
    const [state, sessionPool] = await Promise.all([
      stateStore.read(),
      loadSessionPool(resolvedSessionFilePath),
    ]);

    return {
      checkedAt: new Date().toISOString(),
      sessions: sessionPool.map((session) => ({
        id: session.id,
        rateLimit: snapshotRateBucket(getOrCreateSessionRateBucket(state, session.id)),
      })),
      defaultRateLimit: snapshotRateBucket(state),
    };
  } finally {
    await stateStore.close();
  }
}
