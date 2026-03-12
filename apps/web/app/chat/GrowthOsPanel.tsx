"use client";

import { Compass, Sparkles } from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";

interface GrowthOsPanelProps {
  context: CreatorAgentContext;
  onPrompt: (prompt: string) => void;
}

function buildStateLine(context: CreatorAgentContext): string {
  return (
    context.profileConversionAudit?.headline ||
    context.contentInsights?.cautionSignals[0] ||
    context.strategyAdjustments?.notes[0] ||
    context.growthStrategySnapshot.ambiguities[0] ||
    `Focus the account around ${context.growthStrategySnapshot.knownFor}.`
  );
}

const CHAT_FIRST_PROMPTS = [
  {
    label: "Draft 4 posts",
    prompt: "draft 4 posts from what you know about me",
  },
  {
    label: "Why no views?",
    prompt: "why am i not getting views",
  },
] as const;

export function GrowthOsPanel(props: GrowthOsPanelProps) {
  const positioningIsTentative =
    props.context.growthStrategySnapshot.confidence.positioning < 65 ||
    props.context.growthStrategySnapshot.ambiguities.length > 0;
  const stateLine = buildStateLine(props.context);

  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-zinc-300">
              <Compass className="h-4 w-4" />
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
              Known for
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                positioningIsTentative
                  ? "border-amber-500/30 text-amber-300"
                  : "border-emerald-500/30 text-emerald-300"
              }`}
            >
              {positioningIsTentative ? "Still settling" : "Clear enough"}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-white sm:text-xl">
              {props.context.growthStrategySnapshot.knownFor}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {stateLine}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {CHAT_FIRST_PROMPTS.map((item) => (
            <button
              key={item.prompt}
              type="button"
              onClick={() => props.onPrompt(item.prompt)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
