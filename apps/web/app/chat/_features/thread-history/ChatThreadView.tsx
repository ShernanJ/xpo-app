"use client";

import type { ReactNode, RefObject } from "react";
import { ArrowUpRight } from "lucide-react";

interface ChatThreadViewProps {
  threadScrollRef: RefObject<HTMLElement | null>;
  chatCanvasClassName: string;
  threadCanvasTransitionClassName: string;
  threadContentTransitionClassName: string;
  isLoading: boolean;
  isWorkspaceInitializing: boolean;
  hasContext: boolean;
  hasContract: boolean;
  errorMessage: string | null;
  showBillingWarningBanner: boolean;
  billingWarningLevel: "low" | "critical" | null;
  billingCreditsLabel: string;
  onOpenPricing: () => void;
  onDismissBillingWarning: () => void;
  hero: ReactNode;
  threadContent: ReactNode;
}

export function ChatThreadView(props: ChatThreadViewProps) {
  const {
    threadScrollRef,
    chatCanvasClassName,
    threadCanvasTransitionClassName,
    threadContentTransitionClassName,
    isLoading,
    isWorkspaceInitializing,
    hasContext,
    hasContract,
    errorMessage,
    showBillingWarningBanner,
    billingWarningLevel,
    billingCreditsLabel,
    onOpenPricing,
    onDismissBillingWarning,
    hero,
    threadContent,
  } = props;

  return (
    <section ref={threadScrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className={`${chatCanvasClassName} ${threadCanvasTransitionClassName}`}>
        {(isLoading || isWorkspaceInitializing) && !hasContext && !hasContract ? (
          <div className="flex min-h-[34vh] flex-col items-center justify-center gap-4 text-center">
            <div className="relative h-11 w-11">
              <span className="absolute inset-0 rounded-full border border-white/10" />
              <span className="absolute inset-1 animate-spin rounded-full border border-white/20 border-t-white" />
              <span className="absolute inset-3 animate-pulse rounded-full bg-white/20" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium tracking-[0.08em] text-zinc-200">
                Setting things up...
              </p>
              <p className="text-xs text-zinc-500">We&apos;re preparing your workspace.</p>
            </div>
          </div>
        ) : (
          <div className={threadContentTransitionClassName}>
            {errorMessage ? (
              <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            {showBillingWarningBanner ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-300">
                    <span
                      className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                        billingWarningLevel === "critical" ? "bg-rose-300" : "bg-amber-300"
                      }`}
                    />
                    {billingWarningLevel === "critical"
                      ? "Critical credits remaining."
                      : "Low credits remaining."}{" "}
                    <span className="text-zinc-500">({billingCreditsLabel})</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onOpenPricing}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Upgrade
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onDismissBillingWarning}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                      aria-label="Dismiss billing warning"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {hero}
            {threadContent}
          </div>
        )}
      </div>
    </section>
  );
}
