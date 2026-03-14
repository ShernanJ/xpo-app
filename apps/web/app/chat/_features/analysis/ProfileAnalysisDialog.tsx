"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Edit3,
  MessageSquareText,
  RotateCw,
  Settings2,
  Sparkles,
} from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
} from "@/lib/onboarding/draftArtifacts";
import {
  PLAYBOOK_STAGE_META,
  type PlaybookDefinition,
  type PlaybookStageKey,
} from "@/lib/creator/playbooks";

interface AnalysisFollowerProgress {
  currentFollowersLabel: string;
  targetFollowersLabel: string;
  progressPercent: number;
}

interface AnalysisSnapshotCard {
  label: string;
  value: string;
  meta?: string;
}

interface AnalysisPriorityItem {
  area: string;
  direction: string;
  note: string;
  priority: string;
}

interface AnalysisRecommendedPlaybook {
  stage: PlaybookStageKey;
  playbook: PlaybookDefinition;
  whyFit: string;
}

interface AnalysisVoiceSignalChip {
  label: string;
  value: string;
}

interface AnalysisEvidencePost {
  id: string;
  label: string;
  lane: string;
  reason: string;
  text: string;
  engagementTotal: number;
  goalFitScore: number;
  createdAt: string;
}

interface AnalysisReplyConversionHighlight {
  label: string;
  value: string;
}

interface ProfileAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: CreatorAgentContext;
  accountName: string | null;
  isVerifiedAccount: boolean;
  currentPlaybookStage: PlaybookStageKey;
  analysisFollowerProgress: AnalysisFollowerProgress;
  analysisDiagnosisSummary: string;
  analysisSnapshotCards: AnalysisSnapshotCard[];
  analysisPositioningIsTentative: boolean;
  analysisPriorityItems: AnalysisPriorityItem[];
  analysisRecommendedPlaybooks: AnalysisRecommendedPlaybook[];
  analysisLearningStrengths: string[];
  analysisLearningCautions: string[];
  analysisLearningExperiments: string[];
  analysisReplyConversionHighlights: AnalysisReplyConversionHighlight[];
  analysisVoiceSignalChips: AnalysisVoiceSignalChip[];
  analysisKeepList: string[];
  analysisAvoidList: string[];
  analysisEvidencePosts: AnalysisEvidencePost[];
  analysisScrapeNotice: string | null;
  analysisScrapeNoticeTone: "info" | "success" | "error";
  isAnalysisScrapeCoolingDown: boolean;
  analysisScrapeCooldownLabel: string;
  isAnalysisScrapeRefreshing: boolean;
  onRefreshScrape: () => void;
  onOpenFeedback: () => void;
  onOpenGrowthGuide: () => void;
  onOpenGrowthGuideForRecommendation: (stage: PlaybookStageKey, playbookId: string) => void;
}

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

export function ProfileAnalysisDialog(props: ProfileAnalysisDialogProps) {
  const {
    open,
    onOpenChange,
    context,
    accountName,
    isVerifiedAccount,
    currentPlaybookStage,
    analysisFollowerProgress,
    analysisDiagnosisSummary,
    analysisSnapshotCards,
    analysisPositioningIsTentative,
    analysisPriorityItems,
    analysisRecommendedPlaybooks,
    analysisLearningStrengths,
    analysisLearningCautions,
    analysisLearningExperiments,
    analysisReplyConversionHighlights,
    analysisVoiceSignalChips,
    analysisKeepList,
    analysisAvoidList,
    analysisEvidencePosts,
    analysisScrapeNotice,
    analysisScrapeNoticeTone,
    isAnalysisScrapeCoolingDown,
    analysisScrapeCooldownLabel,
    isAnalysisScrapeRefreshing,
    onRefreshScrape,
    onOpenFeedback,
    onOpenGrowthGuide,
    onOpenGrowthGuideForRecommendation,
  } = props;
  const [expandedPriorityIndex, setExpandedPriorityIndex] = useState<number | null>(null);

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-base font-semibold text-white uppercase">
              {context.avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${context.avatarUrl})` }}
                  role="img"
                  aria-label={`${context.creatorProfile.identity.displayName || context.creatorProfile.identity.username} profile photo`}
                />
              ) : (
                (
                  context.creatorProfile.identity.displayName ||
                  context.creatorProfile.identity.username ||
                  "X"
                ).charAt(0)
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Profile Analysis
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold text-white">
                  {context.creatorProfile.identity.displayName ||
                    context.creatorProfile.identity.username}
                </h2>
                {isVerifiedAccount ? (
                  <Image
                    src="/x-verified.svg"
                    alt="Verified account"
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] shrink-0"
                  />
                ) : null}
                <span className="text-sm text-zinc-500">
                  @{context.creatorProfile.identity.username}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  Stage {PLAYBOOK_STAGE_META[currentPlaybookStage].label}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {PLAYBOOK_STAGE_META[currentPlaybookStage].highlight}
                </span>
              </div>
              <div className="mt-3 max-w-lg">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{analysisFollowerProgress.currentFollowersLabel}</span>
                  <span>{analysisFollowerProgress.targetFollowersLabel}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
                  <div
                    className="h-full rounded-full bg-white/80"
                    style={{ width: `${analysisFollowerProgress.progressPercent}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 whitespace-normal break-words text-sm leading-7 text-zinc-300">
                {analysisDiagnosisSummary}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analysisSnapshotCards.map((card) => (
                <article
                  key={card.label}
                  className="rounded-3xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">{card.value}</p>
                  {card.meta ? <p className="mt-1 text-xs text-zinc-500">{card.meta}</p> : null}
                </article>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Positioning
                    </p>
                    <p className="mt-2 text-sm text-zinc-300">
                      what this account should be known for right now
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      analysisPositioningIsTentative
                        ? "border-amber-500/30 text-amber-300"
                        : "border-emerald-500/30 text-emerald-300"
                    }`}
                  >
                    {analysisPositioningIsTentative ? "Tentative" : "Stable"}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                      Known for
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {context.growthStrategySnapshot.knownFor}
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Attract: {context.growthStrategySnapshot.targetAudience}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                      Core pillars
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {context.growthStrategySnapshot.contentPillars.slice(0, 5).map((pillar) => (
                        <span
                          key={pillar}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300"
                        >
                          {pillar}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Profile cues
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                        {context.growthStrategySnapshot.profileConversionCues
                          .slice(0, 3)
                          .map((cue) => (
                            <li key={cue} className="leading-6">
                              • {cue}
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Off-brand
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                        {context.growthStrategySnapshot.offBrandThemes.length > 0 ? (
                          context.growthStrategySnapshot.offBrandThemes
                            .slice(0, 3)
                            .map((item) => (
                              <li key={item} className="leading-6">
                                • {item}
                              </li>
                            ))
                        ) : (
                          <li className="text-zinc-500">no major off-brand themes flagged</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {context.growthStrategySnapshot.ambiguities.length > 0 ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                        Ambiguities
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                        {context.growthStrategySnapshot.ambiguities.slice(0, 3).map((item) => (
                          <li key={item} className="leading-6">
                            • {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Profile Conversion Audit
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {context.profileConversionAudit?.headline || "profile conversion signals are loading."}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    <div
                      className="h-full rounded-full bg-white/80"
                      style={{
                        width: `${Math.max(0, Math.min(100, context.profileConversionAudit?.score || 0))}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {context.profileConversionAudit?.score ?? 0}/100
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-500/20 bg-black/20 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                      Strengths
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                      {(context.profileConversionAudit?.strengths || []).length > 0 ? (
                        context.profileConversionAudit?.strengths.slice(0, 3).map((item) => (
                          <li key={item} className="leading-6">
                            • {item}
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500">insufficient data</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-amber-500/20 bg-black/20 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                      Gaps
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                      {(context.profileConversionAudit?.gaps || []).length > 0 ? (
                        context.profileConversionAudit?.gaps.slice(0, 3).map((item) => (
                          <li key={item} className="leading-6">
                            • {item}
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500">no major gaps flagged</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Recommended bio edits
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {(context.profileConversionAudit?.recommendedBioEdits || []).map((item) => (
                      <li key={item} className="leading-6">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Recent-post coherence
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {(context.profileConversionAudit?.recentPostCoherenceNotes || []).length > 0 ? (
                      context.profileConversionAudit?.recentPostCoherenceNotes.map((item) => (
                        <li key={item} className="leading-6">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">no coherence notes yet</li>
                    )}
                  </ul>
                </div>
              </article>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Top priorities
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  biggest gap: {context.strategyDelta.primaryGap}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                {analysisPriorityItems.length > 0 ? (
                  analysisPriorityItems.slice(0, 3).map((item, index) => {
                    const isExpanded = expandedPriorityIndex === index;
                    const severityTone =
                      item.priority === "high"
                        ? "border-rose-500/30 text-rose-300"
                        : item.priority === "medium"
                          ? "border-amber-500/30 text-amber-300"
                          : "border-emerald-500/30 text-emerald-300";

                    return (
                      <article
                        key={`${item.area}-${item.direction}-${index}`}
                        className="rounded-2xl border border-white/10 bg-black/20"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPriorityIndex((current) =>
                              current === index ? null : index,
                            )
                          }
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">
                              {index + 1}. {formatEnumLabel(item.direction)}{" "}
                              {formatAreaLabel(item.area)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${severityTone}`}
                            >
                              {formatEnumLabel(item.priority)}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-zinc-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-zinc-500" />
                            )}
                          </div>
                        </button>
                        {isExpanded ? (
                          <div className="border-t border-white/10 px-4 py-3">
                            <p className="text-sm leading-6 text-zinc-300">{item.note}</p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">
                    insufficient data
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-3">
                <BookOpen className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-sm font-semibold text-white">
                    Recommended playbooks for you
                  </p>
                  <p className="text-xs text-zinc-500">
                    personalized routes based on your stage + gaps
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {analysisRecommendedPlaybooks.length > 0 ? (
                  analysisRecommendedPlaybooks.map((recommendation, index) => (
                    <article
                      key={`${recommendation.stage}-${recommendation.playbook.id}`}
                      className={`rounded-2xl border p-4 ${
                        index === 0
                          ? "border-white/25 bg-white/[0.06]"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                          {PLAYBOOK_STAGE_META[recommendation.stage].label}
                        </span>
                        {index === 0 ? (
                          <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                            Primary
                          </span>
                        ) : (
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Alternate
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-base font-semibold text-white">
                        {recommendation.playbook.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {recommendation.playbook.outcome}
                      </p>
                      <p className="mt-3 text-xs text-zinc-300">{recommendation.whyFit}</p>

                      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Start in 15 min
                        </p>
                        <ol className="mt-2 space-y-1.5 text-xs text-zinc-300">
                          {recommendation.playbook.quickStart.slice(0, 3).map((step, stepIndex) => (
                            <li key={step} className="leading-5">
                              {stepIndex + 1}. {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenGrowthGuideForRecommendation(
                            recommendation.stage,
                            recommendation.playbook.id,
                          )
                        }
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                      >
                        <span>Open in Growth Guide</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">
                    insufficient data
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-sm font-semibold text-white">What changed from learning</p>
                  <p className="text-xs text-zinc-500">
                    merged reply + post signals feeding the next strategy pass
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                <article className="rounded-2xl border border-emerald-500/20 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                    Reinforce
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {analysisLearningStrengths.length > 0 ? (
                      analysisLearningStrengths.map((item) => (
                        <li key={item} className="leading-6">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">no strong learning signals yet</li>
                    )}
                  </ul>
                </article>

                <article className="rounded-2xl border border-amber-500/20 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                    Deprioritize
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {analysisLearningCautions.length > 0 ? (
                      analysisLearningCautions.map((item) => (
                        <li key={item} className="leading-6">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">no major caution signals yet</li>
                    )}
                  </ul>
                </article>

                <article className="rounded-2xl border border-sky-500/20 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                    Experiments
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {analysisLearningExperiments.length > 0 ? (
                      analysisLearningExperiments.map((item) => (
                        <li key={item} className="leading-6">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-zinc-500">no active experiments yet</li>
                    )}
                  </ul>
                </article>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Reply loop
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      selection {context.replyInsights?.selectionRate ?? "n/a"}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      post rate {context.replyInsights?.postRate ?? "n/a"}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      observed {context.replyInsights?.observedRate ?? "n/a"}
                    </span>
                  </div>
                  {analysisReplyConversionHighlights.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {analysisReplyConversionHighlights.map((item) => (
                        <div
                          key={`${item.label}-${item.value}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"
                        >
                          <span className="uppercase tracking-[0.12em] text-zinc-500">
                            {item.label}
                          </span>
                          <span className="text-right text-zinc-200">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Post loop
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      drafts {context.contentInsights?.totalCandidates ?? 0}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      post rate {context.contentInsights?.postRate ?? "n/a"}
                    </span>
                    <span className="rounded-full border border-white/10 px-2.5 py-1">
                      observed {context.contentInsights?.observedRate ?? "n/a"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  <Settings2 className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-semibold text-white">Voice signals</p>
                    <p className="text-xs text-zinc-500">how this profile naturally writes</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {analysisVoiceSignalChips.map((chip) => (
                    <span
                      key={`${chip.label}-${chip.value}`}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300"
                    >
                      {chip.label}: <span className="text-zinc-100">{chip.value}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Style anchor
                  </p>
                  {context.positiveAnchors[0]?.text ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-[#0F0F0F] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                          {context.avatarUrl ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${context.avatarUrl})` }}
                              role="img"
                              aria-label={`${context.creatorProfile.identity.displayName || context.creatorProfile.identity.username} profile photo`}
                            />
                          ) : (
                            (
                              context.creatorProfile.identity.displayName ||
                              context.creatorProfile.identity.username ||
                              "X"
                            ).charAt(0)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-sm font-bold text-white">
                              {context.creatorProfile.identity.displayName ||
                                context.creatorProfile.identity.username}
                            </span>
                            {isVerifiedAccount ? (
                              <Image
                                src="/x-verified.svg"
                                alt="Verified account"
                                width={16}
                                height={16}
                                className="h-4 w-4 shrink-0"
                              />
                            ) : null}
                          </div>
                          <span className="text-xs text-zinc-500">
                            @{context.creatorProfile.identity.username || accountName || "user"}
                          </span>
                        </div>
                      </div>

                      <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-100">
                        {context.positiveAnchors[0].text}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>
                          {new Date(context.positiveAnchors[0].createdAt).toLocaleDateString()}
                        </span>
                        <span>·</span>
                        <span>
                          {computeXWeightedCharacterCount(context.positiveAnchors[0].text)}/
                          {getXCharacterLimitForAccount(context.creatorProfile.identity.isVerified)}{" "}
                          chars
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">insufficient data</p>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  <Edit3 className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-semibold text-white">Keep / Avoid</p>
                    <p className="text-xs text-zinc-500">fast reference while drafting</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-500/25 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                      Keep doing
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                      {analysisKeepList.length > 0 ? (
                        analysisKeepList.map((item) => (
                          <li key={item} className="leading-6">
                            • {item}
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500">insufficient data</li>
                      )}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-amber-500/25 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                      Avoid
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                      {analysisAvoidList.length > 0 ? (
                        analysisAvoidList.map((item) => (
                          <li key={item} className="leading-6">
                            • {item}
                          </li>
                        ))
                      ) : (
                        <li className="text-zinc-500">insufficient data</li>
                      )}
                    </ul>
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Evidence</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    posts xpo used for this diagnosis
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {analysisEvidencePosts.slice(0, 6).map((post) => {
                  const labelTone =
                    post.label === "Strong anchor"
                      ? "border-emerald-500/30 text-emerald-300"
                      : post.label === "Weak anchor"
                        ? "border-amber-500/30 text-amber-300"
                        : "border-sky-500/30 text-sky-300";

                  return (
                    <article
                      key={post.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${labelTone}`}
                        >
                          {post.label}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                          {formatEnumLabel(post.lane)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">{post.reason}</p>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
                        {post.text}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          engagement {post.engagementTotal}
                        </span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          goal fit {Math.round(post.goalFitScore)}
                        </span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">
              work in progress: profile analysis is still improving. share feedback so we can
              improve result quality :)
            </p>
            {analysisScrapeNotice ? (
              <p
                className={`text-xs ${
                  analysisScrapeNoticeTone === "success"
                    ? "text-emerald-300"
                    : analysisScrapeNoticeTone === "error"
                      ? "text-rose-300"
                      : "text-zinc-400"
                }`}
              >
                {analysisScrapeNotice}
              </p>
            ) : null}
            {isAnalysisScrapeCoolingDown ? (
              <p className="text-[11px] uppercase tracking-[0.12em] text-amber-300">
                rerun cooldown: {analysisScrapeCooldownLabel}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRefreshScrape}
              disabled={isAnalysisScrapeRefreshing || isAnalysisScrapeCoolingDown}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw
                className={`h-4 w-4 ${isAnalysisScrapeRefreshing ? "animate-spin" : ""}`}
              />
              <span>
                {isAnalysisScrapeRefreshing
                  ? "Running scrape"
                  : isAnalysisScrapeCoolingDown
                    ? `Retry in ${analysisScrapeCooldownLabel}`
                    : "Rerun Scrape"}
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenFeedback}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
              aria-label="Open feedback"
              title="Feedback"
            >
              <MessageSquareText className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenGrowthGuide}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              <span>Open Growth Guide</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
