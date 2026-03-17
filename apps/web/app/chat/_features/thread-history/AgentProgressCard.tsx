"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { startTransition, useEffect, useId, useMemo, useState } from "react";

import {
  formatAgentProgressDuration,
  formatAgentProgressThoughtDuration,
  resolveAgentProgressSnapshot,
  type AgentProgressRun,
  type PendingStatusResolvedStep,
} from "@/lib/chat/agentProgress";
import { TextShimmer } from "@/components/ui/text-shimmer";

type AgentProgressCardVariant = "bubble" | "message" | "shell";

interface AgentProgressCardProps {
  progress: AgentProgressRun;
  variant?: AgentProgressCardVariant;
}

function resolveWrapperClassName(variant: AgentProgressCardVariant): string {
  switch (variant) {
    case "message":
      return "px-0 py-1";
    case "shell":
      return "px-0 py-1";
    case "bubble":
    default:
      return "px-0 py-1";
  }
}

function resolveTickerToneClassName(progress: AgentProgressRun): string {
  switch (progress.phase) {
    case "completed":
      return "text-zinc-400";
    case "failed":
      return "text-zinc-500";
    case "active":
    default:
      return "text-zinc-400";
  }
}

function resolveStepMarkerClassName(step: PendingStatusResolvedStep): string {
  switch (step.status) {
    case "completed":
      return "bg-zinc-500/80";
    case "active":
      return "bg-zinc-400/85";
    case "pending":
    default:
      return "bg-zinc-700";
  }
}

function resolveAnnouncementText(args: {
  progress: AgentProgressRun;
  activeStepLabel: string;
  thoughtDurationLabel: string;
}): string {
  const { progress, activeStepLabel, thoughtDurationLabel } = args;

  switch (progress.phase) {
    case "completed":
      return `Thought for ${thoughtDurationLabel}. Expand to review the process.`;
    case "failed":
      return `Stopped after ${thoughtDurationLabel}. Expand to review the process.`;
    case "active":
    default:
      return `Thinking. ${activeStepLabel}.`;
  }
}

function ThinkingGlyph(props: { phase: AgentProgressRun["phase"] }) {
  if (props.phase === "completed") {
    return <Lightbulb className="h-3.5 w-3.5 text-zinc-400" aria-hidden />;
  }

  if (props.phase === "failed") {
    return <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" aria-hidden />;
  }

  return null;
}

export function AgentProgressCard(props: AgentProgressCardProps) {
  const { progress, variant = "bubble" } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const contentId = useId();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (progress.phase === "active") {
      setIsExpanded(false);
    }
  }, [progress.phase, progress.startedAtMs]);

  useEffect(() => {
    if (progress.phase !== "active") {
      setNowMs(progress.endedAtMs ?? Date.now());
      return;
    }

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        setNowMs(Date.now());
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [progress.endedAtMs, progress.phase, progress.startedAtMs]);

  const snapshot = useMemo(
    () => resolveAgentProgressSnapshot(progress, nowMs),
    [nowMs, progress],
  );
  const elapsedMs = (progress.endedAtMs ?? nowMs) - progress.startedAtMs;
  const durationLabel = formatAgentProgressDuration(elapsedMs);
  const thoughtDurationLabel = formatAgentProgressThoughtDuration(elapsedMs);
  const activeStep =
    snapshot.steps.find((step) => step.status === "active") ??
    snapshot.steps[snapshot.steps.length - 1] ??
    null;
  const tickerLabel =
    progress.phase === "completed"
      ? `Thought for ${thoughtDurationLabel}`
      : progress.phase === "failed"
        ? `Stopped after ${thoughtDurationLabel}`
        : activeStep?.label ?? snapshot.summaryLabel;
  const announcementText = resolveAnnouncementText({
    progress,
    activeStepLabel: activeStep?.label ?? snapshot.summaryLabel,
    thoughtDurationLabel,
  });
  const canExpand = progress.phase !== "active";
  const transitionProps = prefersReducedMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 0 },
      }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -14 },
      };
  const tickerKey =
    progress.phase === "active"
      ? (activeStep?.id ?? snapshot.summaryLabel)
      : `${progress.phase}-${progress.endedAtMs ?? progress.startedAtMs}`;
  const activeTickerClassName =
    "truncate text-[13px] font-medium leading-5 tracking-[0.01em] [--base-color:#71717a] [--base-gradient-color:#fafafa] dark:[--base-color:#52525b] dark:[--base-gradient-color:#ffffff]";

  return (
    <div className={`${resolveWrapperClassName(variant)} text-left`}>
      <p className="sr-only" aria-live="polite">
        {announcementText}
      </p>

      {canExpand ? (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => {
            setIsExpanded((current) => !current);
          }}
          className="inline-flex max-w-full items-center gap-2 text-left"
        >
          <ThinkingGlyph phase={progress.phase} />
          <div className="min-w-0 overflow-hidden">
            <AnimatePresence initial={false} mode="wait">
              <motion.p
                key={tickerKey}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                className={`truncate text-xs font-medium ${resolveTickerToneClassName(progress)}`}
                {...transitionProps}
              >
                {tickerLabel}
              </motion.p>
            </AnimatePresence>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">
            {durationLabel}
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            {progress.phase === "active" ? (
              <TextShimmer as="p" duration={1.6} className={activeTickerClassName}>
                {tickerLabel}
              </TextShimmer>
            ) : (
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  key={tickerKey}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                  className={`truncate text-xs font-medium ${resolveTickerToneClassName(progress)}`}
                  {...transitionProps}
                >
                  {tickerLabel}
                </motion.p>
              </AnimatePresence>
            )}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {canExpand && isExpanded ? (
          <motion.div
            id={contentId}
            initial={prefersReducedMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={prefersReducedMotion ? { opacity: 0, height: "auto" } : { opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ol className="mt-2 space-y-2.5 pt-1">
              {snapshot.steps.map((step) => (
                <li key={`${progress.startedAtMs}-${step.id}`} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${resolveStepMarkerClassName(step)}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] ${
                        step.status === "pending" ? "text-zinc-600" : "text-zinc-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                      {step.explanation}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
