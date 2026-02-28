"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { XShell } from "@/components/x-shell";
import type { OnboardingInput, XPublicProfile } from "@/lib/onboarding/types";

interface ValidationError {
  field: string;
  message: string;
}

interface OnboardingBackfillState {
  queued: boolean;
  jobId: string | null;
}

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
  backfill?: OnboardingBackfillState;
}

interface OnboardingRunFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

interface OnboardingPreviewSuccess {
  ok: true;
  account: string;
  preview: XPublicProfile | null;
}

interface OnboardingPreviewFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingPreviewResponse = OnboardingPreviewSuccess | OnboardingPreviewFailure;

const LOADING_STEPS = [
  "Finding profile",
  "Reading recent posts",
  "Building your growth snapshot",
] as const;

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export default function OnboardingLanding() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<XPublicProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedAccount = normalizeHandle(account);
  const hasValidPreview =
    Boolean(preview) && normalizeHandle(preview?.username ?? "") === normalizedAccount;

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

        if (!response.ok || !data || !data.ok) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedAccount = normalizedAccount;
    if (!trimmedAccount) {
      setErrorMessage("Enter an X username first.");
      return;
    }

    if (isPreviewLoading) {
      setErrorMessage("Wait for the account preview to finish loading.");
      return;
    }

    if (!hasValidPreview) {
      setErrorMessage("Enter an active X account that resolves in preview first.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const payload: OnboardingInput = {
      account: trimmedAccount,
      goal: "followers",
      timeBudgetMinutes: 30,
      tone: {
        casing: "normal",
        risk: "safe",
      },
      transformationMode: "optimize",
      transformationModeSource: "default",
      postingCadenceCapacity: "1_per_day",
      replyBudgetPerDay: "5_15",
      scrapeFreshness: "always",
    };

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: OnboardingRunResponse = await response.json();
      if (!response.ok || !data.ok) {
        setErrorMessage(
          data.ok ? "Could not analyze this account." : (data.errors[0]?.message ?? "Could not analyze this account."),
        );
        return;
      }

      const params = new URLSearchParams({
        runId: data.runId,
        account: trimmedAccount,
      });

      if (data.backfill?.jobId) {
        params.set("backfillJobId", data.backfill.jobId);
      }

      router.push(`/chat?${params.toString()}`);
    } catch {
      setErrorMessage("Network error. Check that the app is running.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <XShell>
        <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12 sm:py-20">
          <div className="space-y-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
              X Growth Engine
            </p>
            <h1 className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Analyzing @{account.trim()}
            </h1>
            <p className="mx-auto max-w-xl text-sm leading-7 text-zinc-400">
              Pulling the signal from recent posts and building the working model.
            </p>
          </div>

          <div className="mt-10 rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <svg viewBox="0 0 120 120" className="h-16 w-16" aria-hidden="true">
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
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </XShell>
    );
  }

  return (
    <XShell>
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-6 py-12 sm:py-16">
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 text-center">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
              X Growth Engine
            </p>
            <h1 className="font-mono text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Map What Wins On X.
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Enter your handle. We&apos;ll scrape the account, model how you grow, and drop you
              into the agent workspace.
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
                  onChange={(event) => {
                    setAccount(event.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="username"
                  className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                  aria-label="X username"
                />
              </div>

              <button
                type="submit"
                disabled={!hasValidPreview || isPreviewLoading || !normalizedAccount}
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.24em] text-black transition hover:bg-zinc-200"
              >
                Analyze My X
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-rose-400">
                {errorMessage}
              </p>
            ) : null}
          </form>

          {isPreviewLoading ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Loading Preview
              </p>
            </div>
          ) : preview ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-left">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white">
                  {preview.avatarUrl ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${preview.avatarUrl})` }}
                      role="img"
                      aria-label={`${preview.name} profile photo`}
                    />
                  ) : (
                    preview.name.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-semibold text-white">{preview.name}</p>
                    {preview.isVerified ? (
                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-zinc-500">@{preview.username}</p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold text-white">
                    {new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(preview.followersCount)}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Followers
                  </p>
                </div>
              </div>
            </div>
          ) : normalizedAccount && !isPreviewLoading ? (
            <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-300">
                Account Not Available
              </p>
              <p className="mt-2 text-sm text-rose-100">
                Only active X accounts that resolve in preview can be analyzed.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </XShell>
  );
}
