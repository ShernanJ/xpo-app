"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { XShell } from "@/components/x-shell";
import type { OnboardingInput } from "@/lib/onboarding/types";

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

const LOADING_STEPS = [
  "Finding profile",
  "Reading recent posts",
  "Building your growth snapshot",
] as const;

export default function OnboardingLanding() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedAccount = account.trim();
    if (!trimmedAccount) {
      setErrorMessage("Enter an X username first.");
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
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="username"
                  className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
                  aria-label="X username"
                />
              </div>

              <button
                type="submit"
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
        </section>
      </div>
    </XShell>
  );
}
