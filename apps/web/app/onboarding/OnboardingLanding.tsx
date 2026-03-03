"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

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
  "collecting your posts...",
  "understanding how you speak...",
  "mapping your audience...",
  "analyzing your performance...",
  "setting up your workspace...",
] as const;

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export default function OnboardingLanding() {
  const router = useRouter();
  const { status, update } = useSession();
  const [account, setAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<XPublicProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedAccount = normalizeHandle(account);
  const hasValidPreview =
    Boolean(preview) && normalizeHandle(preview?.username ?? "") === normalizedAccount;
  const autofillStyles = (
    <style jsx>{`
      .landingAccountInput:-webkit-autofill,
      .landingAccountInput:-webkit-autofill:hover,
      .landingAccountInput:-webkit-autofill:focus {
        -webkit-text-fill-color: #ffffff !important;
        -webkit-box-shadow: 0 0 0 1000px #050505 inset !important;
        box-shadow: 0 0 0 1000px #050505 inset !important;
        transition: background-color 9999s ease-in-out 0s;
        caret-color: #ffffff;
        border-radius: 9999px;
      }
    `}</style>
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
    }, 850);

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

    if (status === "authenticated") {
      // Authenticated users run the scrape natively and skip login
      try {
        const resp = await fetch("/api/onboarding/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account: trimmedAccount,
            goal: "followers",
            timeBudgetMinutes: 30,
            tone: { casing: "lowercase", risk: "safe" }
          }),
        });

        if (!resp.ok) {
          throw new Error("Failed to map account");
        }

        // Force a session refresh so the next page load has the new JWT activeXHandle,
        // then hard reload to /chat
        await update();
        window.location.href = "/chat";
      } catch (err) {
        console.error(err);
        setErrorMessage("Failed to analyze account. Please try again.");
        setIsLoading(false);
      }
    } else {
      // Anonymous users play the animation then flow into the auth wall
      setTimeout(() => {
        const params = new URLSearchParams({ xHandle: trimmedAccount });
        router.push(`/login?${params.toString()}`);
      }, 6000);
    }
  }

  if (isLoading) {
    return (
      <XShell>
        <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-12 sm:py-20 animate-in fade-in duration-700">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/20 bg-white/5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-transform duration-1000 scale-110">
              {preview?.avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${preview.avatarUrl})` }}
                  role="img"
                  aria-label={`${preview.name} profile photo`}
                />
              ) : (
                preview?.name?.slice(0, 2).toUpperCase() || account.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="text-center space-y-2">
              <h1 className="font-mono text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {preview?.name || account.trim()}
              </h1>
              <p className="text-lg font-medium tracking-[0.1em] text-zinc-400">
                @{preview?.username || normalizedAccount}
              </p>
            </div>
          </div>

          <div className="mt-14 w-full max-w-md text-center">
            <div className="h-8 transition-all duration-500 ease-in-out">
              <p className="text-sm font-medium tracking-[0.1em] text-white animate-pulse">
                {LOADING_STEPS[loadingStepIndex]}
              </p>
            </div>

            <div className="mx-auto mt-6 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-white transition-all duration-[1400ms] ease-linear"
                style={{ width: `${((loadingStepIndex + 1) / LOADING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </section>
        {autofillStyles}
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
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="landingAccountInput w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
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
                      <Image
                        src="/x-verified.svg"
                        alt="Verified account"
                        width={16}
                        height={16}
                        className="h-4 w-4 shrink-0"
                      />
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
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                No Account Found
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                Only active X accounts that resolve in preview can be analyzed.
              </p>
            </div>
          ) : null}
        </section>
        {autofillStyles}
      </div>
    </XShell>
  );
}
