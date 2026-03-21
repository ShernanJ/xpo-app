export interface RunUserTweetsCaptureOptions {
  account: string;
  count?: number;
  pages?: number;
  targetOriginals?: number;
  maxDurationMs?: number;
  cursor?: string | null;
  queryId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  sessionFile?: string | null;
  cookie?: string | null;
  csrf?: string | null;
  bearer?: string | null;
  forceGuest?: boolean;
  stateFile?: string;
  maxRequestsPerHour?: number;
  minIntervalMs?: number;
  cooldownMs?: number;
  requestDelayMs?: number;
  requestJitterMs?: number;
  userAgent?: string | null;
  output?: string | null;
  writeOutput?: boolean;
  shouldImport?: boolean;
  endpoint?: string;
}

export interface RunUserTweetsCaptureResult {
  account: string;
  payload: unknown;
  outputPath: string | null;
  importResult: unknown;
  scrapeMeta:
    | {
        sessionId?: string | null;
        rotatedSessionIds?: string[];
        didRotateSession?: boolean;
        totalRawPostCount?: number;
        uniqueOriginalPostsCollected?: number;
        nextCursor?: string | null;
      }
    | null;
}

export interface ScraperSessionRateLimitSnapshot {
  recentRequestCount: number;
  lastRequestAt: string | null;
  cooldownUntil: string | null;
}

export interface ScraperSessionHealthEntry {
  id: string;
  rateLimit: ScraperSessionRateLimitSnapshot;
  health: {
    status:
      | "ok"
      | "budget_exhausted"
      | "cooldown_active"
      | "needs_verification"
      | "suspended"
      | "challenge_required"
      | "auth_blocked"
      | "error";
    message: string;
    checkedAt: string;
    sessionId: string;
    nextCursor: string | null;
    uniqueOriginalPostsCollected: number | null;
    totalRawPostCount: number | null;
  };
}

export interface InspectScraperSessionsHealthResult {
  account: string;
  checkedAt: string;
  defaultRateLimit: ScraperSessionRateLimitSnapshot;
  sessions: ScraperSessionHealthEntry[];
}

export interface RunUserTweetsCaptureCliOutcome {
  ok: boolean;
  exitCode: number;
  message: string | null;
  shouldPrintUsage: boolean;
  result?: RunUserTweetsCaptureResult | null;
}

export function printUsage(): void;
export function normalizeAccount(rawValue: string): string | null;
export function runUserTweetsCapture(
  rawOptions: RunUserTweetsCaptureOptions,
): Promise<RunUserTweetsCaptureResult>;
export function inspectScraperSessionsHealth(
  rawOptions: RunUserTweetsCaptureOptions,
): Promise<InspectScraperSessionsHealthResult>;
export function runUserTweetsCaptureCli(
  argv?: string[],
): Promise<RunUserTweetsCaptureCliOutcome>;
