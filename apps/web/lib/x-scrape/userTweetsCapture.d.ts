export interface RunUserTweetsCaptureOptions {
  account: string;
  count?: number;
  pages?: number;
  targetOriginals?: number;
  maxDurationMs?: number;
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
      }
    | null;
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
export function runUserTweetsCaptureCli(
  argv?: string[],
): Promise<RunUserTweetsCaptureCliOutcome>;
