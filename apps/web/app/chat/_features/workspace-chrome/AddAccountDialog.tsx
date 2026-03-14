"use client";

import type { FormEvent } from "react";
import Image from "next/image";

import type { XPublicProfile } from "@/lib/onboarding/types";

interface AddAccountDialogProps {
  open: boolean;
  requiresXAccountGate: boolean;
  isSubmitting: boolean;
  preview: XPublicProfile | null;
  normalizedHandle: string;
  loadingStepIndex: number;
  loadingSteps: readonly string[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inputValue: string;
  onInputValueChange: (value: string) => void;
  readyAccountHandle: string | null;
  hasValidPreview: boolean;
  isPreviewLoading: boolean;
  errorMessage: string | null;
}

const followerCountFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function AddAccountDialog(props: AddAccountDialogProps) {
  const {
    open,
    requiresXAccountGate,
    isSubmitting,
    preview,
    normalizedHandle,
    loadingStepIndex,
    loadingSteps,
    onOpenChange,
    onSubmit,
    inputValue,
    onInputValueChange,
    readyAccountHandle,
    hasValidPreview,
    isPreviewLoading,
    errorMessage,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (!requiresXAccountGate && event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950 shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        {isSubmitting ? (
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center text-center">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-white/10" />
                <div className="absolute inset-2 rounded-full border border-white/15 animate-ping" />
                <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white">
                  {preview?.avatarUrl ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${preview.avatarUrl})` }}
                      role="img"
                      aria-label={`${preview.name} profile photo`}
                    />
                  ) : (
                    (preview?.name?.slice(0, 2) || normalizedHandle.slice(0, 2) || "X").toUpperCase()
                  )}
                </div>
              </div>

              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Mapping Account
              </p>
              <p className="mt-3 text-lg font-semibold text-white">@{normalizedHandle}</p>
              <p className="mt-2 text-sm text-zinc-400">{loadingSteps[loadingStepIndex]}</p>

              <div className="mt-6 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white transition-all duration-[1200ms] ease-linear"
                  style={{
                    width: `${((loadingStepIndex + 1) / loadingSteps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Add X Account
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Pull another profile into this workspace
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Preview the account, run the scrape, then switch over without leaving chat.
                </p>
              </div>
              {!requiresXAccountGate ? (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Close
                </button>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="mr-2 text-lg font-medium text-zinc-600">@</span>
                <input
                  value={inputValue}
                  onChange={(event) => {
                    if (readyAccountHandle) {
                      return;
                    }
                    onInputValueChange(event.target.value);
                  }}
                  placeholder="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={Boolean(readyAccountHandle)}
                  className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-500"
                  aria-label="Add X account"
                />
              </div>

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  (!readyAccountHandle &&
                    (!hasValidPreview || isPreviewLoading || !normalizedHandle))
                }
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {readyAccountHandle ? `Continue as @${readyAccountHandle}` : "Analyze Account"}
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-rose-400">
                {errorMessage}
              </p>
            ) : readyAccountHandle ? (
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
                all set. the profile is ready to switch into.
              </p>
            ) : null}

            <div className="mt-5 min-h-[112px]">
              {isPreviewLoading ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Loading Preview
                  </p>
                </div>
              ) : preview ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4">
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
                        {followerCountFormatter.format(preview.followersCount)}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Followers
                      </p>
                    </div>
                  </div>
                </div>
              ) : normalizedHandle ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    No Account Found
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Enter an active X account that resolves in preview first.
                  </p>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Waiting For Handle
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Type an X username to preview it before you map it into this workspace.
                  </p>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
