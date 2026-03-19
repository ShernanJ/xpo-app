"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import UniqueLoading from "@/components/ui/grid-loading";

import { useChatThreadViewCanvas } from "../chat-page/ChatCanvasContext";

interface ChatThreadViewProps {
  hero: ReactNode;
  threadContent: ReactNode;
}

export function ChatThreadView(props: ChatThreadViewProps) {
  const prefersReducedMotion = useReducedMotion();
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
    statusMessage,
    showBillingWarningBanner,
    billingWarningLevel,
    billingCreditsLabel,
    onOpenPricing,
    onDismissBillingWarning,
  } = useChatThreadViewCanvas();
  const {
    hero,
    threadContent,
  } = props;
  const isBootstrapping = (isLoading || isWorkspaceInitializing) && !hasContext && !hasContract;
  const sharedEase = [0.16, 1, 0.3, 1] as const;

  return (
    <section ref={threadScrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className={`${chatCanvasClassName} ${threadCanvasTransitionClassName}`}>
        <AnimatePresence initial={false} mode="wait">
          {isBootstrapping ? (
            <motion.div
              key="workspace-loading"
              className="flex min-h-[34vh] flex-col items-center justify-center gap-4 text-center"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 1.015, y: -14, filter: "blur(18px)" }
              }
              transition={{ duration: prefersReducedMotion ? 0 : 0.36, ease: sharedEase }}
            >
              <UniqueLoading
                variant="squares"
                size="lg"
                text="Setting things up"
                className="[&>div>div]:rounded-[2px] [&>div>div]:bg-zinc-200"
              />
              <motion.div
                className="space-y-1"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(8px)" }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.28, delay: prefersReducedMotion ? 0 : 0.06, ease: sharedEase }}
              >
                <p className="text-sm font-medium tracking-[0.08em] text-zinc-200">
                  Setting things up...
                </p>
                <p className="text-xs text-zinc-500">We&apos;re preparing your workspace.</p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="workspace-ready"
              className={threadContentTransitionClassName}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 24, scale: 0.985, filter: "blur(14px)" }
              }
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(10px)" }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.44, ease: sharedEase }}
            >
              <motion.div
                className="mx-auto w-full max-w-4xl"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.32, delay: prefersReducedMotion ? 0 : 0.08, ease: sharedEase }}
              >
                {errorMessage ? (
                  <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {errorMessage}
                  </div>
                ) : null}

                {statusMessage ? (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200">
                    {statusMessage}
                  </div>
                ) : null}

                {showBillingWarningBanner ? (
                  <motion.div
                    className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: prefersReducedMotion ? 0 : 0.12, ease: sharedEase }}
                  >
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
                  </motion.div>
                ) : null}

                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.38, delay: prefersReducedMotion ? 0 : 0.16, ease: sharedEase }}
                >
                  {hero}
                </motion.div>
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.42, delay: prefersReducedMotion ? 0 : 0.2, ease: sharedEase }}
                >
                  {threadContent}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
