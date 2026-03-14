"use client";

import { Fragment, type RefObject } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  List,
  MessageSquareText,
} from "lucide-react";

import {
  PLAYBOOK_STAGE_META,
  PLAYBOOK_STAGE_ORDER,
  type PlaybookDefinition,
  type PlaybookStageKey,
  type PlaybookTemplate,
  type PlaybookTemplateTab,
} from "@/lib/creator/playbooks";

interface PersonalizedPlaybookTemplate extends PlaybookTemplate {
  text: string;
}

interface GrowthGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbookStage: PlaybookStageKey;
  onPlaybookStageChange: (stage: PlaybookStageKey) => void;
  filteredStagePlaybooks: PlaybookDefinition[];
  selectedPlaybook: PlaybookDefinition | null;
  onSelectPlaybook: (playbookId: string) => void;
  selectedPlaybookRef: RefObject<HTMLElement | null>;
  playbookTemplateTab: PlaybookTemplateTab;
  onPlaybookTemplateTabChange: (tab: PlaybookTemplateTab) => void;
  personalizedPlaybookTemplates: PersonalizedPlaybookTemplate[];
  activePlaybookTemplateId: string | null;
  onActivePlaybookTemplateChange: (templateId: string) => void;
  activePlaybookTemplateText: string | null;
  playbookTemplatePreviewCounter: string;
  copiedPlaybookTemplateId: string | null;
  onCopyPlaybookTemplate: (template: PersonalizedPlaybookTemplate) => void;
  templateWhyItWorksPoints: string[];
  previewDisplayName: string;
  previewUsername: string;
  previewAvatarUrl: string | null;
  isVerifiedAccount: boolean;
  onOpenFeedback: () => void;
  onOpenProfileAnalysis: () => void;
}

const TEMPLATE_TABS: Array<{ key: PlaybookTemplateTab; label: string }> = [
  { key: "hook", label: "Hook" },
  { key: "reply", label: "Reply" },
  { key: "thread", label: "Thread" },
  { key: "cta", label: "CTA" },
];

export function GrowthGuideDialog(props: GrowthGuideDialogProps) {
  const {
    open,
    onOpenChange,
    playbookStage,
    onPlaybookStageChange,
    filteredStagePlaybooks,
    selectedPlaybook,
    onSelectPlaybook,
    selectedPlaybookRef,
    playbookTemplateTab,
    onPlaybookTemplateTabChange,
    personalizedPlaybookTemplates,
    activePlaybookTemplateId,
    onActivePlaybookTemplateChange,
    activePlaybookTemplateText,
    playbookTemplatePreviewCounter,
    copiedPlaybookTemplateId,
    onCopyPlaybookTemplate,
    templateWhyItWorksPoints,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    isVerifiedAccount,
    onOpenFeedback,
    onOpenProfileAnalysis,
  } = props;

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
        <div className="space-y-4 border-b border-white/10 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Growth Guide
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Growth Guide</h2>
              <p className="mt-2 text-sm text-zinc-400">what works on x at each stage</p>
              <p className="mt-1 text-xs text-zinc-500">
                read-only field guide • not profile-specific
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.04]"
            >
              Close
            </button>
          </div>

          <div className="space-y-3">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {PLAYBOOK_STAGE_ORDER.map((stageKey) => {
                const isSelected = playbookStage === stageKey;

                return (
                  <button
                    key={stageKey}
                    type="button"
                    onClick={() => onPlaybookStageChange(stageKey)}
                    className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                      isSelected
                        ? "bg-white text-black"
                        : "border border-white/10 text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {PLAYBOOK_STAGE_META[stageKey].label}
                  </button>
                );
              })}
            </div>

            {filteredStagePlaybooks.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-1.5">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${filteredStagePlaybooks.length}, minmax(0, 1fr))`,
                  }}
                >
                  {filteredStagePlaybooks.map((playbook) => {
                    const isSelected = selectedPlaybook?.id === playbook.id;

                    return (
                      <button
                        key={playbook.id}
                        type="button"
                        onClick={() => onSelectPlaybook(playbook.id)}
                        className={`rounded-xl border px-4 py-3 text-left transition-all ${
                          isSelected
                            ? "border-white/25 bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold">{playbook.name}</p>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              isSelected ? "text-zinc-300" : "text-zinc-600"
                            }`}
                          >
                            {isSelected ? "selected" : "view"}
                          </span>
                        </div>
                        <p
                          className={`mt-1 truncate text-xs ${
                            isSelected ? "text-zinc-300" : "text-zinc-500"
                          }`}
                        >
                          {playbook.outcome}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-500">
                No playbooks match this stage yet.
              </div>
            )}
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Stage focus
                  </p>
                  <p className="text-base font-semibold text-white">
                    {PLAYBOOK_STAGE_META[playbookStage].highlight}
                  </p>
                  <p className="text-sm text-zinc-400">
                    win condition: {PLAYBOOK_STAGE_META[playbookStage].winCondition}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PLAYBOOK_STAGE_META[playbookStage].priorities.map((priority) => (
                      <span
                        key={priority}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300"
                      >
                        {priority}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Content mix
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                    <div className="rounded-xl border border-white/10 px-2 py-2 text-center">
                      replies {PLAYBOOK_STAGE_META[playbookStage].contentMix.replies}%
                    </div>
                    <div className="rounded-xl border border-white/10 px-2 py-2 text-center">
                      posts {PLAYBOOK_STAGE_META[playbookStage].contentMix.posts}%
                    </div>
                    <div className="rounded-xl border border-white/10 px-2 py-2 text-center">
                      threads {PLAYBOOK_STAGE_META[playbookStage].contentMix.threads}%
                    </div>
                  </div>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    <div
                      className="bg-white/[0.78]"
                      style={{
                        width: `${PLAYBOOK_STAGE_META[playbookStage].contentMix.replies}%`,
                      }}
                    />
                    <div
                      className="bg-zinc-500/80"
                      style={{
                        width: `${PLAYBOOK_STAGE_META[playbookStage].contentMix.posts}%`,
                      }}
                    />
                    <div
                      className="bg-zinc-700/90"
                      style={{
                        width: `${PLAYBOOK_STAGE_META[playbookStage].contentMix.threads}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {selectedPlaybook ? (
              <section ref={selectedPlaybookRef} className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Playbook details
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">
                        {selectedPlaybook.name}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-400">{selectedPlaybook.outcome}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlaybook.bestFor.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      The loop
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                      {[
                        { label: "Input", value: selectedPlaybook.loop.input },
                        { label: "Action", value: selectedPlaybook.loop.action },
                        { label: "Feedback", value: selectedPlaybook.loop.feedback },
                      ].map((step, index) => (
                        <Fragment key={step.label}>
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              {step.label}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">{step.value}</p>
                          </div>
                          {index < 2 ? (
                            <div className="hidden items-center justify-center md:flex">
                              <ChevronRight className="h-4 w-4 text-zinc-600" />
                            </div>
                          ) : null}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">What good looks like</p>
                        <p className="text-xs text-zinc-500">3-5 benchmarks worth tracking.</p>
                      </div>
                    </div>

                    <ul className="mt-4 space-y-2">
                      {selectedPlaybook.metrics.slice(0, 5).map((metric) => (
                        <li
                          key={metric}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300"
                        >
                          {metric}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3">
                      <List className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">Today's checklist</p>
                        <p className="text-xs text-zinc-500">Daily + weekly loop to keep reps high.</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Daily
                        </p>
                        <ul className="mt-3 space-y-2">
                          {selectedPlaybook.checklist.daily.slice(0, 5).map((item) => (
                            <li key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                              <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-black/20" />
                              <span className="leading-6">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          2x / week
                        </p>
                        <ul className="mt-3 space-y-2">
                          {selectedPlaybook.checklist.weekly.slice(0, 5).map((item) => (
                            <li key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                              <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded border border-white/10 bg-black/20" />
                              <span className="leading-6">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="text-sm font-semibold text-white">Templates</p>
                        <p className="text-xs text-zinc-500">Hook / Reply / Thread / CTA</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => onPlaybookTemplateTabChange(tab.key)}
                          className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                            playbookTemplateTab === tab.key
                              ? "bg-white text-black"
                              : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-2xl border border-white/10 bg-[#0F0F0F] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Example preview
                      </p>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                            {previewAvatarUrl ? (
                              <div
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${previewAvatarUrl})` }}
                                role="img"
                                aria-label={`${previewDisplayName || previewUsername} profile photo`}
                              />
                            ) : (
                              (previewDisplayName || previewUsername || "X").charAt(0)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-sm font-bold text-white">
                                {previewDisplayName}
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
                            <span className="text-xs text-zinc-500">@{previewUsername}</span>
                          </div>
                        </div>

                        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                          {activePlaybookTemplateText || "pick a template on the right to preview it here."}
                        </p>

                        <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                          <span>Example</span>
                          <span>·</span>
                          <span>{playbookTemplatePreviewCounter}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-h-[320px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Example Templates
                      </p>
                      <div className="mt-3 flex-1 space-y-3">
                        {personalizedPlaybookTemplates.map((template) => {
                          const isCopied = copiedPlaybookTemplateId === template.id;
                          const isTemplateSelected = activePlaybookTemplateId === template.id;

                          return (
                            <div key={template.id} className="space-y-2">
                              <button
                                type="button"
                                onClick={() => onActivePlaybookTemplateChange(template.id)}
                                className={`w-full rounded-2xl border p-4 text-left transition ${
                                  isTemplateSelected
                                    ? "border-white/25 bg-white/[0.06]"
                                    : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                      {template.label}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                                      {template.text}
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                                    {isTemplateSelected ? "selected" : "preview"}
                                  </span>
                                </div>
                              </button>

                              <div className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                    Why This Works
                                  </p>
                                  <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                                    {templateWhyItWorksPoints.map((point) => (
                                      <li key={point} className="flex items-start gap-2">
                                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onCopyPlaybookTemplate(template)}
                                  className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                                  aria-label={`Copy ${template.label} template`}
                                >
                                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm font-semibold text-white">Start in 15 min</p>
                    <ol className="mt-4 space-y-3 text-sm text-zinc-300">
                      {selectedPlaybook.quickStart.map((item, index) => (
                        <li key={item} className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-[11px] font-semibold text-zinc-400">
                            {index + 1}
                          </span>
                          <span className="leading-6">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm font-semibold text-white">Why this playbook works</p>
                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300">
                      {selectedPlaybook.rationale}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm font-semibold text-white">Common mistakes</p>
                    <ul className="mt-4 space-y-2">
                      {selectedPlaybook.mistakes.map((item) => (
                        <li
                          key={item}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-sm font-semibold text-white">Examples</p>
                    <ul className="mt-4 space-y-2">
                      {selectedPlaybook.examples.slice(0, 3).map((item) => (
                        <li
                          key={item}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">work in progress: this guide is still being updated.</p>

          <div className="flex flex-wrap items-center gap-3">
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
              onClick={onOpenProfileAnalysis}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              <span>Open Profile Analysis</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
