"use client";

import Image from "next/image";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import type {
  CreatorProfile,
  OnboardingInput,
  OnboardingResult,
  PerformanceModel,
  XPublicPost,
  XPublicProfile,
} from "@/lib/onboarding/types";

interface ValidationError {
  field: string;
  message: string;
}

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
  persistedAt: string;
  data: OnboardingResult;
}

interface OnboardingRunFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

interface PerformanceModelSuccess {
  ok: true;
  data: PerformanceModel;
}

interface PerformanceModelFailure {
  ok: false;
  errors: ValidationError[];
}

type PerformanceModelResponse = PerformanceModelSuccess | PerformanceModelFailure;

interface CreatorProfileSuccess {
  ok: true;
  data: CreatorProfile;
}

interface CreatorProfileFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorProfileResponse = CreatorProfileSuccess | CreatorProfileFailure;

interface OnboardingPreviewSuccess {
  ok: true;
  account: string;
  preview: XPublicProfile | null;
  source:
    | "cache"
    | "user_by_screen_name"
    | "syndication"
    | "users_show"
    | "html"
    | "none";
}

interface OnboardingPreviewFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingPreviewResponse = OnboardingPreviewSuccess | OnboardingPreviewFailure;

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const LOADING_STEPS = [
  "Finding profile",
  "Reading recent posts",
  "Building your growth snapshot",
] as const;

const showOnboardingDevTools =
  process.env.NEXT_PUBLIC_SHOW_ONBOARDING_DEV_TOOLS === "1";

const scanlineStyle = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "100% 6px",
};

function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPostDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getPostEngagementTotal(metrics: XPublicPost["metrics"]): number {
  return metrics.likeCount + metrics.replyCount + metrics.repostCount + metrics.quoteCount;
}

function getTransformationOverviewTitle(
  strategyState: OnboardingResult["strategyState"],
): string {
  if (strategyState.transformationMode === "preserve") {
    return "High-ROI signals to protect what already works.";
  }

  if (strategyState.transformationMode === "pivot_soft") {
    return "High-ROI signals to guide a gradual pivot.";
  }

  if (strategyState.transformationMode === "pivot_hard") {
    return "High-ROI signals to support a cleaner repositioning.";
  }

  return "High-ROI signals from your recent posts.";
}

function getTransformationNextMoveLabel(
  strategyState: OnboardingResult["strategyState"],
): string {
  if (strategyState.transformationMode === "preserve") {
    return "Protect What Works";
  }

  if (strategyState.transformationMode === "pivot_soft") {
    return "Soft Pivot";
  }

  if (strategyState.transformationMode === "pivot_hard") {
    return "Hard Pivot";
  }

  return "Next Move";
}

function getProfileInitials(name: string, username: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length > 0) {
    return parts.map((part) => part.charAt(0).toUpperCase()).join("");
  }

  return username.slice(0, 2).toUpperCase();
}

function VerifiedBadge({ visible }: { visible?: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <Image
      src="/x-verified.svg"
      alt="Verified account"
      width={18}
      height={18}
      className="h-[18px] w-[18px] shrink-0"
    />
  );
}

function ProfileAvatar({
  profile,
  sizeClassName,
  textClassName,
  borderClassName,
  fallbackClassName,
}: {
  profile: XPublicProfile;
  sizeClassName: string;
  textClassName: string;
  borderClassName: string;
  fallbackClassName: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClassName} ${borderClassName} ${textClassName} ${fallbackClassName}`}
    >
      {profile.avatarUrl ? (
        <div
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${profile.avatarUrl})` }}
          role="img"
          aria-label={`${profile.name} profile photo`}
        />
      ) : (
        getProfileInitials(profile.name, profile.username)
      )}
    </div>
  );
}

function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-7xl px-2 py-2 sm:px-4 sm:py-4">
        <div className="relative flex min-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505] sm:min-h-[calc(100vh-2rem)]">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={scanlineStyle} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
          <div className="relative flex-1">{children}</div>
          <footer className="relative border-t border-white/10 px-6 py-4">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-[10px] font-medium uppercase tracking-[0.28em] text-zinc-500 sm:text-[11px]">
              <span>Dev</span>
              <span className="h-3 w-px bg-white/10" />
              <span>Growth Scan</span>
              <span className="h-3 w-px bg-white/10" />
              <span>Live</span>
              <span className="h-3 w-px bg-white/10" />
              <span>Agent Ready</span>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  const [account, setAccount] = useState("");
  const [forceMock, setForceMock] = useState(false);
  const [transformationMode, setTransformationMode] =
    useState<OnboardingInput["transformationMode"]>("optimize");
  const [hasTouchedTransformationMode, setHasTouchedTransformationMode] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<XPublicProfile | null>(null);
  const [isCreatorProfileLoading, setIsCreatorProfileLoading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [result, setResult] = useState<OnboardingRunResponse | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [showCreatorProfileJson, setShowCreatorProfileJson] = useState(false);
  const [performanceModel, setPerformanceModel] = useState<PerformanceModel | null>(
    null,
  );
  const [creatorProfileError, setCreatorProfileError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const payload = useMemo(
    () => ({
      account,
      goal: "followers" as OnboardingInput["goal"],
      timeBudgetMinutes: 30,
      tone: {
        casing: "normal" as OnboardingInput["tone"]["casing"],
        risk: "safe" as OnboardingInput["tone"]["risk"],
      },
      transformationMode,
      transformationModeSource: hasTouchedTransformationMode
        ? ("user_selected" as const)
        : ("default" as const),
      forceMock,
    }),
    [account, forceMock, hasTouchedTransformationMode, transformationMode],
  );

  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }

    setLoadingStepIndex(0);
    const interval = window.setInterval(() => {
      setLoadingStepIndex((current) => Math.min(current + 1, LOADING_STEPS.length - 1));
    }, 1400);

    return () => {
      window.clearInterval(interval);
    };
  }, [isLoading]);

  useEffect(() => {
    const trimmed = account.trim();
    if (!trimmed || trimmed.length < 2) {
      setPreview(null);
      setIsPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsPreviewLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/onboarding/preview?account=${encodeURIComponent(trimmed)}`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        const text = await response.text();
        let data: OnboardingPreviewResponse | null = null;

        try {
          data = JSON.parse(text) as OnboardingPreviewResponse;
        } catch {
          data = null;
        }

        if (!response.ok || !data) {
          setPreview(null);
          return;
        }

        if (!data.ok) {
          setPreview(null);
          return;
        }

        setPreview(data.preview);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setPreview(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsPreviewLoading(false);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [account]);

  useEffect(() => {
    if (!result || !result.ok) {
      setCreatorProfile(null);
      setCreatorProfileError(null);
      setIsCreatorProfileLoading(false);
      setShowCreatorProfileJson(false);
      return;
    }

    const controller = new AbortController();

    setCreatorProfile(null);
    setCreatorProfileError(null);
    setIsCreatorProfileLoading(true);
    setShowCreatorProfileJson(false);

    void (async () => {
      try {
        const response = await fetch("/api/creator/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ runId: result.runId }),
          signal: controller.signal,
        });

        const data: CreatorProfileResponse = await response.json();
        if (!response.ok || !data.ok) {
          setCreatorProfileError(
            data.ok
              ? "Failed to build creator profile."
              : (data.errors[0]?.message ?? "Failed to build creator profile."),
          );
          return;
        }

        setCreatorProfile(data.data);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setCreatorProfileError("Network error while building creator profile.");
      } finally {
        if (!controller.signal.aborted) {
          setIsCreatorProfileLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setIsCreatorProfileLoading(false);
    setCreatorProfile(null);
    setCreatorProfileError(null);
    setShowCreatorProfileJson(false);
    setNetworkError(null);
    setModelError(null);
    setResult(null);
    setPerformanceModel(null);

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: OnboardingRunResponse = await response.json();
      setResult(data);
    } catch {
      setNetworkError("Network error. Check that your dev server is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBuildPerformanceModel() {
    if (!result || !result.ok) {
      return;
    }

    setIsModelLoading(true);
    setModelError(null);
    setPerformanceModel(null);

    try {
      const response = await fetch("/api/performance/model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runId: result.runId }),
      });

      const data: PerformanceModelResponse = await response.json();
      if (!data.ok) {
        setModelError(data.errors[0]?.message ?? "Failed to build performance model.");
        return;
      }

      setPerformanceModel(data.data);
    } catch {
      setModelError("Network error while building performance model.");
    } finally {
      setIsModelLoading(false);
    }
  }

  const successResult = result && result.ok ? result : null;
  const bestFormat = successResult?.data.bestFormats[0] ?? null;
  const weakestFormat = successResult?.data.underperformingFormats[0] ?? null;
  const strongestHook = successResult?.data.hookPatterns[0] ?? null;
  const overviewTitle = successResult
    ? getTransformationOverviewTitle(successResult.data.strategyState)
    : "High-ROI signals from your recent posts.";
  const nextMoveLabel = successResult
    ? getTransformationNextMoveLabel(successResult.data.strategyState)
    : "Next Move";

  if (isLoading) {
    return (
      <OnboardingShell>
        <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12 sm:py-20">
          <div className="space-y-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
              X Growth Engine
            </p>
            <h1 className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Analyzing {account}
            </h1>
            <p className="mx-auto max-w-xl text-sm leading-7 text-zinc-400">
              We&apos;re pulling your recent posts and building a high-signal snapshot.
            </p>
          </div>

          <div className="mt-10 rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <svg
                viewBox="0 0 120 120"
                className="h-16 w-16"
                aria-hidden="true"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="42"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray="160 264"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 60 60"
                    to="360 60 60"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx="60" cy="60" r="6" fill="#ffffff">
                  <animate
                    attributeName="opacity"
                    values="0.2;1;0.2"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
            </div>

            <ol className="mt-8 space-y-3">
              {LOADING_STEPS.map((step, index) => {
                const isActive = index === loadingStepIndex;
                const isComplete = index < loadingStepIndex;

                return (
                  <li
                    key={step}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isComplete || isActive
                          ? "bg-white text-black"
                          : "bg-white/5 text-zinc-500"
                      }`}
                    >
                      {isComplete ? "✓" : index + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        isActive ? "font-medium text-white" : "text-zinc-500"
                      }`}
                    >
                      {step}
                    </span>
                    {isActive ? (
                      <span className="ml-auto flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-white [animation:ping_1.2s_ease-in-out_infinite]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-white [animation:ping_1.2s_ease-in-out_0.15s_infinite]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-white [animation:ping_1.2s_ease-in-out_0.3s_infinite]" />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12 sm:py-16">
        <section className="mx-auto w-full max-w-3xl space-y-8 pt-6 text-center sm:pt-10">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
            X Growth Engine
          </p>
          <h1 className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Map What Wins On X.
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            Enter your handle. We&apos;ll pull the signal from your recent posts, map what works,
            and turn it into a clean growth snapshot you can actually use.
          </p>
        </div>

        <form
          className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <span className="mr-2 text-lg font-medium text-zinc-600">@</span>
              <input
                id="account"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="username"
                className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                aria-label="X username"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="rounded-2xl bg-white px-6 py-3 font-mono text-sm font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-500"
            >
              Analyze My X
            </button>
          </div>

          <div
            className={`mt-3 flex items-center px-1 text-left ${
              showOnboardingDevTools ? "justify-between gap-4" : ""
            }`}
          >
            <p className="text-xs text-zinc-500">
              We default to a followers-focused baseline for this first pass.
            </p>
            {showOnboardingDevTools ? (
              <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={forceMock}
                  onChange={(event) => setForceMock(event.target.checked)}
                />
                Use mock
              </label>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-left">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Strategy Path
              </span>
              <select
                value={transformationMode ?? "optimize"}
                onChange={(event) => {
                  setTransformationMode(
                    event.target.value as NonNullable<OnboardingInput["transformationMode"]>,
                  );
                  setHasTouchedTransformationMode(true);
                }}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                aria-label="Transformation mode"
              >
                <option value="optimize">Optimize what already works</option>
                <option value="preserve">Preserve current lane</option>
                <option value="pivot_soft">Soft pivot into adjacent lane</option>
                <option value="pivot_hard">Hard pivot into new lane</option>
              </select>
            </label>
            <p className="max-w-xs text-left text-xs leading-5 text-zinc-500">
              Choose whether the engine should refine, protect, or intentionally shift the account.
            </p>
          </div>

          {isPreviewLoading || preview ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
              {isPreviewLoading ? (
                <div className="flex items-center gap-3 text-left">
                  <div className="h-10 w-10 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 rounded bg-white/10" />
                    <div className="h-3 w-20 rounded bg-white/10" />
                  </div>
                </div>
              ) : preview ? (
                <div className="flex items-center gap-3 text-left">
                  <ProfileAvatar
                    profile={preview}
                    sizeClassName="h-12 w-12"
                    textClassName="text-sm font-semibold text-zinc-200"
                    borderClassName="border border-white/10"
                    fallbackClassName="bg-white/[0.04]"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                      <span className="truncate">{preview.name}</span>
                      <VerifiedBadge visible={preview.isVerified} />
                    </p>
                    <p className="truncate text-xs text-zinc-500">@{preview.username}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold text-white">
                      {formatCompactNumber(preview.followersCount)}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Followers
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
        </section>

        {networkError ? (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {networkError}
          </p>
        ) : null}
        {modelError ? (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {modelError}
          </p>
        ) : null}

        {result ? (
          <section className="space-y-5 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-6">
          {result.ok ? (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-400">
                    Snapshot Ready
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Built {new Date(result.persistedAt).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBuildPerformanceModel}
                  disabled={isModelLoading}
                  className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isModelLoading ? "Building..." : "Load Deeper Breakdown"}
                </button>
              </div>

              {successResult?.data.warnings.length ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-100">
                  {successResult.data.warnings[0]}
                </div>
              ) : null}

              <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/35">
                <div className="h-24 bg-gradient-to-r from-[#0a0f14] via-[#111922] to-[#1d2730]" />
                <div className="px-5 pb-5">
                  <div className="-mt-10 flex items-end justify-between gap-4">
                    <div className="flex min-w-0 items-end gap-4">
                      <ProfileAvatar
                        profile={result.data.profile}
                        sizeClassName="h-20 w-20"
                        textClassName="text-lg font-semibold text-zinc-100"
                        borderClassName="border-4 border-[#050505]"
                        fallbackClassName="bg-white/10 shadow-sm"
                      />

                      <div className="min-w-0 pb-1">
                        <p className="flex items-center gap-1.5 truncate text-xl font-semibold text-white">
                          <span className="truncate">{result.data.profile.name}</span>
                          <VerifiedBadge visible={result.data.profile.isVerified} />
                        </p>
                        <p className="truncate text-sm text-zinc-500">
                          @{result.data.profile.username}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-full border border-white/10 bg-black/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                      {formatEnumLabel(result.data.source)}
                    </div>
                  </div>

                  {result.data.profile.bio ? (
                    <p className="mt-4 text-sm leading-6 text-zinc-300">
                      {result.data.profile.bio}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-5 text-sm">
                    <p className="text-zinc-500">
                      <span className="font-semibold text-white">
                        {formatCompactNumber(result.data.profile.followingCount)}
                      </span>{" "}
                      Following
                    </p>
                    <p className="text-zinc-500">
                      <span className="font-semibold text-white">
                        {formatCompactNumber(result.data.profile.followersCount)}
                      </span>{" "}
                      Followers
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Quick Overview
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {overviewTitle}
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Growth Stage</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {result.data.growthStage}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Best Format</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {bestFormat ? formatEnumLabel(bestFormat.type) : "Not enough data"}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Weak Spot</p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {weakestFormat ? formatEnumLabel(weakestFormat.type) : "Not enough data"}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Posts / Week
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {result.data.strategyState.recommendedPostsPerWeek}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Do More Of</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {bestFormat
                        ? `${formatEnumLabel(bestFormat.type)} posts average ${bestFormat.averageEngagement} engagement.`
                        : "We need a bit more data before calling a winner."}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Watch For</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {strongestHook
                        ? `${formatEnumLabel(strongestHook.pattern)} appears most often in your strongest openers.`
                        : "Your top hook pattern will appear here after more posts are parsed."}
                    </p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {nextMoveLabel}
                    </p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {result.data.strategyState.rationale}
                    </p>
                  </article>
                </div>
              </section>

              <section className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Recent Posts
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    The actual posts driving this snapshot.
                  </h2>
                </div>

                <div className="rounded-[1.4rem] border border-white/10 bg-black/20">
                  {result.data.recentPosts.length ? (
                    <div className="max-h-[40rem] overflow-y-auto">
                      {result.data.recentPosts.slice(0, 20).map((post, index) => (
                      <article
                        key={post.id}
                        className={`p-4 ${index > 0 ? "border-t border-white/10" : ""}`}
                      >
                        <div className="flex gap-3">
                          <ProfileAvatar
                            profile={result.data.profile}
                            sizeClassName="h-11 w-11"
                            textClassName="text-sm font-semibold text-zinc-100"
                            borderClassName="border border-white/10"
                            fallbackClassName="bg-white/[0.04]"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-white">
                                <span className="truncate">{result.data.profile.name}</span>
                                <VerifiedBadge visible={result.data.profile.isVerified} />
                              </p>
                              <p className="truncate text-sm text-zinc-500">
                                @{result.data.profile.username}
                              </p>
                              <span className="text-zinc-700">·</span>
                              <p className="text-sm text-zinc-500">
                                {formatPostDate(post.createdAt)}
                              </p>
                            </div>

                            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-zinc-100">
                              {post.text}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 sm:grid-cols-4">
                              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                                <span className="text-zinc-600">Replies </span>
                                <span className="text-zinc-300">
                                  {formatCompactNumber(post.metrics.replyCount)}
                                </span>
                              </div>
                              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                                <span className="text-zinc-600">Reposts </span>
                                <span className="text-zinc-300">
                                  {formatCompactNumber(post.metrics.repostCount)}
                                </span>
                              </div>
                              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                                <span className="text-zinc-600">Likes </span>
                                <span className="text-zinc-300">
                                  {formatCompactNumber(post.metrics.likeCount)}
                                </span>
                              </div>
                              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                                <span className="text-zinc-600">Total </span>
                                <span className="text-zinc-300">
                                  {formatCompactNumber(getPostEngagementTotal(post.metrics))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-zinc-400">
                      No recent posts were returned for this snapshot.
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    Creator Profile
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    How the engine currently understands this account.
                  </h2>
                </div>

                {isCreatorProfileLoading ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="h-4 w-32 rounded bg-white/10" />
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-48 rounded bg-white/10" />
                        <div className="h-3 w-40 rounded bg-white/10" />
                        <div className="h-3 w-44 rounded bg-white/10" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="h-4 w-40 rounded bg-white/10" />
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-full rounded bg-white/10" />
                        <div className="h-3 w-5/6 rounded bg-white/10" />
                        <div className="h-3 w-4/6 rounded bg-white/10" />
                      </div>
                    </div>
                  </div>
                ) : null}

                {creatorProfileError ? (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                    {creatorProfileError}
                  </div>
                ) : null}

                {creatorProfile ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Archetype</p>
                        <p className="mt-2 text-xl font-semibold text-white">
                          {formatEnumLabel(creatorProfile.archetype)}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Primary
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {formatEnumLabel(creatorProfile.archetype)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Secondary
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {creatorProfile.secondaryArchetype
                                ? formatEnumLabel(creatorProfile.secondaryArchetype)
                                : "None"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Confidence
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {creatorProfile.archetypeConfidence}%
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Voice
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {formatEnumLabel(creatorProfile.voice.primaryCasing)} /{" "}
                              {creatorProfile.voice.averageLengthBand
                                ? formatEnumLabel(creatorProfile.voice.averageLengthBand)
                                : "Mixed"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Strategy Path
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {formatEnumLabel(creatorProfile.strategy.transformationMode)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Mode Source
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {formatEnumLabel(creatorProfile.strategy.transformationModeSource)}
                            </p>
                          </div>
                        </div>
                        <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
                          {creatorProfile.voice.styleNotes.map((note) => (
                            <li key={note}>- {note}</li>
                          ))}
                        </ul>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">
                          Content Pillars
                        </p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Audience Breadth
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {formatEnumLabel(creatorProfile.topics.audienceBreadth)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Top Signal
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-100">
                              {creatorProfile.topics.dominantTopics[0]
                                ? `${creatorProfile.topics.dominantTopics[0].label} (${creatorProfile.topics.dominantTopics[0].percentage}%)`
                                : "n/a"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {creatorProfile.topics.contentPillars.length ? (
                            creatorProfile.topics.contentPillars.map((pillar) => (
                              <span
                                key={pillar}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-300"
                              >
                                {pillar}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-zinc-500">
                              Not enough repeated topics yet.
                            </span>
                          )}
                        </div>
                        <div className="mt-4 space-y-1.5 text-sm text-zinc-300">
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                            Audience Signals
                          </p>
                          {creatorProfile.topics.audienceSignals.length ? (
                            <ul className="space-y-1.5">
                              {creatorProfile.topics.audienceSignals.map((signal) => (
                                <li key={signal}>- {signal}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-zinc-500">
                              Audience intent is still weakly defined.
                            </p>
                          )}
                        </div>
                        <p className="mt-4 text-sm leading-6 text-zinc-300">
                          {creatorProfile.topics.specificityTradeoff}
                        </p>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">
                          Recommended Angles
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">
                          {creatorProfile.strategy.targetState.planningNote}
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                          {creatorProfile.strategy.recommendedAngles.map((angle) => (
                            <li key={angle}>- {angle}</li>
                          ))}
                        </ul>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Next Moves</p>
                        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                          {creatorProfile.strategy.nextMoves.map((move) => (
                            <li key={move}>- {move}</li>
                          ))}
                        </ul>
                      </article>
                    </div>

                    {showOnboardingDevTools ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-zinc-500">
                              Developer Inspector
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              Review the exact creator profile object used for downstream agent context.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowCreatorProfileJson((current) => !current)}
                            className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300 transition hover:border-white/20 hover:text-white"
                          >
                            {showCreatorProfileJson ? "Hide Raw JSON" : "Show Raw JSON"}
                          </button>
                        </div>

                        {showCreatorProfileJson ? (
                          <pre className="mt-4 overflow-x-auto rounded-2xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
                            {JSON.stringify(creatorProfile, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Source</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatEnumLabel(result.data.source)}
                  </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Posts Analyzed</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {result.data.recentPostSampleCount}
                  </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Cadence / Week</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {result.data.baseline.postingCadencePerWeek}
                  </p>
                </article>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Strategy State
                </p>
                <p className="mt-2 font-medium text-white">
                  Recommended posts/week: {result.data.strategyState.recommendedPostsPerWeek}
                </p>
                <p className="mt-1 text-zinc-300">{result.data.strategyState.rationale}</p>
                <p className="mt-2 text-xs text-zinc-600">
                  Weights: D {result.data.strategyState.weights.distribution} / A{" "}
                  {result.data.strategyState.weights.authority} / L{" "}
                  {result.data.strategyState.weights.leverage}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Format Performance
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="py-1 pr-4">Format</th>
                        <th className="py-1 pr-4">Share</th>
                        <th className="py-1 pr-4">Avg Engagement</th>
                        <th className="py-1">Signal</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {result.data.contentDistribution.map((row) => {
                        const isBest = result.data.bestFormats.some(
                          (item) => item.type === row.type,
                        );
                        const isWeak = result.data.underperformingFormats.some(
                          (item) => item.type === row.type,
                        );

                        return (
                          <tr key={row.type} className="border-t border-white/10">
                            <td className="py-2 pr-4">{row.type}</td>
                            <td className="py-2 pr-4">{row.percentage}%</td>
                            <td className="py-2 pr-4">{row.averageEngagement}</td>
                            <td className="py-2">
                              {isBest ? (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                                  best
                                </span>
                              ) : null}
                              {isWeak ? (
                                <span className="ml-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5 text-rose-300">
                                  weak
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Top Hook Patterns</p>
                <ul className="mt-2 space-y-1 text-zinc-300">
                  {result.data.hookPatterns.slice(0, 3).map((item) => (
                    <li key={item.pattern}>
                      {item.pattern}: {item.percentage}% share, {item.averageEngagement} avg
                      engagement
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-red-300">We couldn&apos;t start the analysis.</p>
              <ul className="list-disc pl-5 text-zinc-300">
                {result.errors.map((error) => (
                  <li key={`${error.field}-${error.message}`}>
                    <span className="font-medium">{error.field}:</span> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          </section>
        ) : null}

        {performanceModel ? (
          <section className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] sm:p-6">
          <h2 className="text-lg font-semibold text-white">Deeper Breakdown</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Best Content Type
              </p>
              <p className="mt-1 font-semibold text-white">
                {performanceModel.bestContentType ?? "n/a"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {performanceModel.bestContentTypeConfidence
                  ? `${performanceModel.bestContentTypeConfidence}% confidence`
                  : "Not enough reliable sample yet"}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Best Hook Pattern
              </p>
              <p className="mt-1 font-semibold text-white">
                {performanceModel.bestHookPattern ?? "n/a"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {performanceModel.bestHookPatternConfidence
                  ? `${performanceModel.bestHookPatternConfidence}% confidence`
                  : "Not enough reliable sample yet"}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Recommended Length
              </p>
              <p className="mt-1 font-semibold text-white">
                {performanceModel.lengthOptimization.recommendedBand ?? "n/a"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {performanceModel.lengthOptimization.recommendedBandConfidence
                  ? `${performanceModel.lengthOptimization.recommendedBandConfidence}% confidence`
                  : "Not enough reliable sample yet"}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Conversation Trigger
              </p>
              <p className="mt-1 font-semibold text-white">
                {performanceModel.conversationTriggerRate}%
              </p>
            </article>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Strengths</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {performanceModel.strengths.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Weaknesses</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {performanceModel.weaknesses.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Next Actions</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {performanceModel.nextActions.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Format Insights (delta vs baseline)
            </p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {performanceModel.formatInsights.slice(0, 4).map((item) => (
                <li key={item.key}>
                  {item.key}: {item.averageEngagement} avg ({item.deltaVsBaselinePercent}%) •{" "}
                  {item.count} posts • {item.confidence}% confidence
                  {!item.isReliable ? " • low sample" : ""}
                </li>
              ))}
            </ul>
          </div>
          </section>
        ) : null}
      </div>
    </OnboardingShell>
  );
}
