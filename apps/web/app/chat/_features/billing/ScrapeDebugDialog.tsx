"use client";

import { useMemo } from "react";
import { ArrowUpRight, Bug, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";

interface ScrapeDebugTelemetry {
  uniqueOriginalPostsCollected: number;
  totalRawPostCount: number;
  sessionId: string | null;
  rotatedSessionIds: string[];
  didRotateSession: boolean;
}

interface ScraperSessionHealthEntry {
  id: string;
  rateLimit: {
    recentRequestCount: number;
    lastRequestAt: string | null;
    cooldownUntil: string | null;
  };
  health: {
    status: string;
    message: string;
    checkedAt: string;
    sessionId: string;
    nextCursor: string | null;
    uniqueOriginalPostsCollected: number | null;
    totalRawPostCount: number | null;
  };
}

interface ScrapeSessionHealthSnapshot {
  account: string;
  checkedAt: string;
  sessions: ScraperSessionHealthEntry[];
}

interface ScrapeDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handle: string | null;
  capture: unknown | null;
  telemetry: ScrapeDebugTelemetry | null;
  sessionHealth: ScrapeSessionHealthSnapshot | null;
  isLoading: boolean;
  actionInFlight: "recent_sync" | "deep_backfill" | "session_health" | null;
  errorMessage: string | null;
  notice: string | null;
  onReload: () => void | Promise<void>;
  onRunRecentSync: () => void | Promise<void>;
  onRunDeepBackfill: () => void | Promise<void>;
  onRunSessionHealthCheck: () => void | Promise<void>;
}

function countPosts(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function formatSessionHealthLabel(status: string): string {
  switch (status) {
    case "ok":
      return "healthy";
    case "budget_exhausted":
      return "budget exhausted";
    case "cooldown_active":
      return "cooldown";
    case "needs_verification":
      return "verify email";
    case "suspended":
      return "suspended";
    case "challenge_required":
      return "challenge";
    case "auth_blocked":
      return "auth blocked";
    default:
      return "error";
  }
}

export function ScrapeDebugDialog(props: ScrapeDebugDialogProps) {
  const {
    open,
    onOpenChange,
    handle,
    capture,
    telemetry,
    sessionHealth,
    isLoading,
    actionInFlight,
    errorMessage,
    notice,
    onReload,
    onRunRecentSync,
    onRunDeepBackfill,
    onRunSessionHealthCheck,
  } = props;

  const formattedJson = useMemo(() => {
    if (!capture) {
      return "";
    }

    return JSON.stringify(capture, null, 2);
  }, [capture]);

  const captureRecord =
    capture && typeof capture === "object" && !Array.isArray(capture)
      ? (capture as Record<string, unknown>)
      : null;
  const postsCount = countPosts(captureRecord?.posts);
  const replyPostsCount = countPosts(captureRecord?.replyPosts);
  const quotePostsCount = countPosts(captureRecord?.quotePosts);
  const capturedAt =
    typeof captureRecord?.capturedAt === "string" ? captureRecord.capturedAt : null;
  const source =
    captureRecord?.metadata &&
    typeof captureRecord.metadata === "object" &&
    !Array.isArray(captureRecord.metadata) &&
    typeof (captureRecord.metadata as Record<string, unknown>).source === "string"
      ? ((captureRecord.metadata as Record<string, unknown>).source as string)
      : null;
  const activeSessionId = telemetry?.sessionId ?? null;
  const rotatedSessionIds = telemetry?.rotatedSessionIds ?? [];

  return (
    <SplitDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Scrape Debug${handle ? ` @${handle}` : ""}`}
      description="Development-only scrape controls for inspecting the latest capture and manually kicking off recent or deep syncs."
      defaultLeftPaneWidth={36}
      minLeftPaneWidth={30}
      maxLeftPaneWidth={44}
      stackOnMobile
      leftPane={
        <div className="flex h-full flex-col border-b border-white/10 md:border-b-0 md:border-r md:border-white/10">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              <Bug className="h-3.5 w-3.5" />
              Dev Only
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              {handle ? `@${handle}` : "No handle selected"}
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              Refresh the recent scrape, queue a deep backfill, and inspect the raw capture
              payload without leaving chat.
            </p>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <button
                type="button"
                onClick={() => {
                  void onReload();
                }}
                disabled={isLoading || !handle}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Reload JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  void onRunRecentSync();
                }}
                disabled={isLoading || actionInFlight !== null || !handle}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    actionInFlight === "recent_sync" ? "animate-spin" : ""
                  }`}
                />
                {actionInFlight === "recent_sync" ? "Running Recent Sync…" : "Rerun Recent"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void onRunSessionHealthCheck();
                }}
                disabled={isLoading || actionInFlight !== null || !handle}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-300/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100 transition hover:bg-sky-300/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck
                  className={`h-3.5 w-3.5 ${
                    actionInFlight === "session_health" ? "animate-pulse" : ""
                  }`}
                />
                {actionInFlight === "session_health" ? "Checking Sessions…" : "Check Sessions"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void onRunDeepBackfill();
                }}
                disabled={isLoading || actionInFlight !== null || !handle}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-300/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowUpRight
                  className={`h-3.5 w-3.5 ${
                    actionInFlight === "deep_backfill" ? "animate-pulse" : ""
                  }`}
                />
                {actionInFlight === "deep_backfill"
                  ? "Queueing Deep Backfill…"
                  : "Rerun Deepfill"}
              </button>
            </div>

            {notice ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  Captured at
                </p>
                <p className="mt-1 text-sm text-white">
                  {capturedAt ? new Date(capturedAt).toLocaleString() : "No capture loaded"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Source</p>
                <p className="mt-1 text-sm text-white">{source ?? "Unknown"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Posts</p>
                <p className="mt-1 text-sm text-white">{postsCount.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Replies</p>
                <p className="mt-1 text-sm text-white">{replyPostsCount.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-2 md:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Quotes</p>
                <p className="mt-1 text-sm text-white">{quotePostsCount.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-2 md:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  Latest Session
                </p>
                <p className="mt-1 text-sm text-white">{activeSessionId ?? "Not captured yet"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-2 md:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  Rotated Sessions
                </p>
                <p className="mt-1 text-sm text-white">
                  {rotatedSessionIds.length > 0 ? rotatedSessionIds.join(", ") : "None"}
                </p>
              </div>
            </div>

            {sessionHealth ? (
              <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Session Health
                    </p>
                    <p className="mt-1 text-sm text-zinc-300">
                      Checked {new Date(sessionHealth.checkedAt).toLocaleString()}
                    </p>
                  </div>
                  <ShieldAlert className="h-4 w-4 text-zinc-400" />
                </div>

                <div className="space-y-3">
                  {sessionHealth.sessions.length > 0 ? (
                    sessionHealth.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{session.id}</p>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                            {formatSessionHealthLabel(session.health.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-400">{session.health.message}</p>
                        <div className="mt-3 grid gap-2 text-[11px] text-zinc-400">
                          <p>Used session: {session.health.sessionId}</p>
                          <p>Recent requests: {session.rateLimit.recentRequestCount}</p>
                          <p>
                            Last request:{" "}
                            {session.rateLimit.lastRequestAt
                              ? new Date(session.rateLimit.lastRequestAt).toLocaleString()
                              : "Never"}
                          </p>
                          <p>
                            Cooldown until:{" "}
                            {session.rateLimit.cooldownUntil
                              ? new Date(session.rateLimit.cooldownUntil).toLocaleString()
                              : "Not cooling down"}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-zinc-500">
                      No configured scraper sessions were found.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      }
      rightPane={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Capture JSON
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#080808] px-5 py-5">
            {formattedJson ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-200">
                {formattedJson}
              </pre>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-zinc-500">
                {isLoading
                  ? "Loading the latest scrape capture…"
                  : "No scrape capture loaded for this handle yet."}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
