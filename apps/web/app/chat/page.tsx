"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { XShell } from "@/components/x-shell";
import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import type { CreatorGenerationContract } from "@/lib/onboarding/generationContract";

interface ValidationError {
  field: string;
  message: string;
}

interface CreatorAgentContextSuccess {
  ok: true;
  data: CreatorAgentContext;
}

interface CreatorAgentContextFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorAgentContextResponse = CreatorAgentContextSuccess | CreatorAgentContextFailure;

interface CreatorGenerationContractSuccess {
  ok: true;
  data: CreatorGenerationContract;
}

interface CreatorGenerationContractFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorGenerationContractResponse =
  | CreatorGenerationContractSuccess
  | CreatorGenerationContractFailure;

interface BackfillJobStatusResponse {
  ok: true;
  job: {
    jobId: string;
    status: "pending" | "processing" | "completed" | "failed";
    lastError: string | null;
  } | null;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
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

function buildInitialAssistantMessage(
  context: CreatorAgentContext,
  contract: CreatorGenerationContract,
): string {
  const angle = contract.planner.primaryAngle;
  const loop = formatEnumLabel(context.creatorProfile.distribution.primaryLoop);
  const niche = formatEnumLabel(context.creatorProfile.niche.primaryNiche);

  if (contract.mode === "analysis_only") {
    return `I analyzed @${context.account}. Your current model is not strong enough for reliable drafting yet. You're trending ${formatEnumLabel(
      context.creatorProfile.archetype,
    )} in ${niche}, but we should stay in analysis mode until the sample deepens.`;
  }

  return `I analyzed @${context.account}. You're primarily ${formatEnumLabel(
    context.creatorProfile.archetype,
  )} in ${niche}, and your strongest growth loop is ${loop}. The best next angle is: ${angle}`;
}

function buildDeterministicReply(
  context: CreatorAgentContext,
  contract: CreatorGenerationContract,
): string {
  const topHook = contract.planner.suggestedHookPatterns[0]
    ? formatEnumLabel(contract.planner.suggestedHookPatterns[0])
    : "Statement Open";
  const topType = contract.planner.suggestedContentTypes[0]
    ? formatEnumLabel(contract.planner.suggestedContentTypes[0])
    : "Single Line";

  if (contract.mode === "analysis_only") {
    return `Context readiness is still too weak for drafting. Stay in analysis mode, wait for the backfill to finish, and keep strengthening your standalone post sample.`;
  }

  return `Use the ${formatEnumLabel(contract.planner.targetLane)} lane. Lead with a ${topHook} opener, structure it as ${topType}, and keep it aligned to: ${contract.planner.primaryAngle}`;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId")?.trim() ?? "";
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const loadWorkspace = useCallback(async () => {
    if (!runId) {
      setErrorMessage("Missing runId. Start from the landing page.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [contextResponse, contractResponse] = await Promise.all([
        fetch("/api/creator/context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ runId }),
        }),
        fetch("/api/creator/generation-contract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ runId }),
        }),
      ]);

      const contextData: CreatorAgentContextResponse = await contextResponse.json();
      const contractData: CreatorGenerationContractResponse = await contractResponse.json();

      if (!contextResponse.ok || !contextData.ok) {
        setErrorMessage(
          contextData.ok
            ? "Failed to load the creator context."
            : (contextData.errors[0]?.message ?? "Failed to load the creator context."),
        );
        return;
      }

      if (!contractResponse.ok || !contractData.ok) {
        setErrorMessage(
          contractData.ok
            ? "Failed to load the generation contract."
            : (contractData.errors[0]?.message ?? "Failed to load the generation contract."),
        );
        return;
      }

      setContext(contextData.data);
      setContract(contractData.data);
    } catch {
      setErrorMessage("Network error while loading the chat workspace.");
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!context || !contract || messages.length > 0) {
      return;
    }

    setMessages([
      {
        id: "assistant-initial",
        role: "assistant",
        content: buildInitialAssistantMessage(context, contract),
      },
    ]);
  }, [context, contract, messages.length]);

  useEffect(() => {
    if (!backfillJobId) {
      return;
    }

    let cancelled = false;
    let finished = false;

    async function pollBackfillJob() {
      if (finished) {
        return;
      }

      try {
        const response = await fetch(
          `/api/onboarding/backfill/jobs?jobId=${encodeURIComponent(backfillJobId)}`,
          { method: "GET" },
        );

        if (!response.ok) {
          return;
        }

        const data: BackfillJobStatusResponse = await response.json();
        const job = data.job;
        if (!job || cancelled) {
          return;
        }

        if (job.status === "pending") {
          setBackfillNotice("Background backfill is queued.");
          return;
        }

        if (job.status === "processing") {
          setBackfillNotice("Background backfill is deepening the model.");
          return;
        }

        if (job.status === "failed") {
          setBackfillNotice(
            job.lastError
              ? `Background backfill failed: ${job.lastError}`
              : "Background backfill failed.",
          );
          finished = true;
          return;
        }

        if (job.status === "completed") {
          setBackfillNotice("Background backfill completed. Context refreshed.");
          await loadWorkspace();
          finished = true;
        }
      } catch {
        // Keep polling on transient failures.
      }
    }

    void pollBackfillJob();
    const interval = window.setInterval(() => {
      void pollBackfillJob();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [backfillJobId, loadWorkspace]);

  const summaryChips = useMemo(() => {
    if (!context) {
      return [];
    }

    return [
      `Archetype: ${formatEnumLabel(context.creatorProfile.archetype)}`,
      `Niche: ${formatEnumLabel(context.creatorProfile.niche.primaryNiche)}`,
      `Loop: ${formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}`,
      `Readiness: ${formatEnumLabel(context.readiness.status)}`,
    ];
  }, [context]);

  const sidebarThreads = useMemo(() => {
    if (!context || !contract) {
      return [];
    }

    const strategyItems = context.strategyDelta.adjustments.slice(0, 3).map((item) => ({
      id: `${item.area}-${item.direction}`,
      label: `${formatEnumLabel(item.direction)} ${formatAreaLabel(item.area)}`,
      meta: formatEnumLabel(item.priority),
    }));

    const anchorItems = context.positiveAnchors.slice(0, 3).map((post) => ({
      id: post.id,
      label: post.text.length > 50 ? `${post.text.slice(0, 50)}...` : post.text,
      meta: `${formatEnumLabel(post.lane)} · ${post.goalFitScore}`,
    }));

    return [
      {
        section: "Active",
        items: [
          {
            id: "current-workspace",
            label: contract.planner.primaryAngle,
            meta: formatEnumLabel(contract.planner.targetLane),
          },
        ],
      },
      {
        section: "Strategy",
        items: strategyItems,
      },
      {
        section: "Anchors",
        items: anchorItems,
      },
    ].filter((section) => section.items.length > 0);
  }, [context, contract]);

  function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = draftInput.trim();
    if (!trimmedInput || !context || !contract) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmedInput,
      },
      {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        content: buildDeterministicReply(context, contract),
      },
    ]);
    setDraftInput("");
  }

  return (
    <XShell>
      <div className="mx-auto flex min-h-full w-full max-w-[96rem] gap-4 px-2 py-2 sm:px-4 sm:py-4">
        <aside
          className={`sticky top-4 hidden h-[calc(100vh-7rem)] shrink-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03] shadow-[0_20px_80px_rgba(0,0,0,0.45)] transition-all duration-300 lg:flex lg:flex-col ${
            sidebarOpen ? "w-[20rem]" : "w-[5.5rem]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? "×" : "≡"}
            </button>
            {sidebarOpen ? (
              <button
                type="button"
                onClick={loadWorkspace}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:bg-white/[0.08]"
              >
                Refresh
              </button>
            ) : null}
          </div>

          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5">
              <span className="text-sm text-zinc-500">⌕</span>
              {sidebarOpen ? (
                <>
                  <span className="text-sm text-zinc-400">Search</span>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                    ⌘K
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.08] ${
                sidebarOpen ? "justify-start" : "justify-center"
              }`}
            >
              <span className="text-sm text-white">✎</span>
              {sidebarOpen ? (
                <span className="text-sm font-medium text-white">New Chat</span>
              ) : null}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {sidebarOpen ? (
              <div className="space-y-5">
                {sidebarThreads.map((section) => (
                  <div key={section.section} className="space-y-2">
                    <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                      {section.section}
                    </p>
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full flex-col items-start gap-1 rounded-2xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        <span className="line-clamp-2 text-sm font-medium leading-5 text-zinc-200">
                          {item.label}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          {item.meta}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center gap-3 pt-2">
                {sidebarThreads.flatMap((section) => section.items).slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                    title={item.label}
                  >
                    {item.label.slice(0, 2)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-3">
            {sidebarOpen && context ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3">
                <p className="text-sm font-semibold text-white">@{context.account}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-sm font-semibold text-white">
                  {context?.account.slice(0, 2).toUpperCase() ?? "X"}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex min-h-[calc(100vh-7rem)] flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.02] shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
                aria-label="Toggle sidebar"
              >
                ≡
              </button>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
                <p className="font-mono text-sm font-semibold tracking-[0.08em] text-white">
                  X Strategy Chat
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {summaryChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
                >
                  {chip}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setAnalysisOpen(true)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.08]"
              >
                View Analysis
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAnalysisOpen(true)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.08] md:hidden"
            >
              Model
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-36 pt-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
              {backfillNotice ? (
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  {backfillNotice}
                </div>
              ) : null}

              {isLoading ? (
                <div className="rounded-3xl border border-white/10 bg-black/30 p-5 text-sm text-zinc-400">
                  Loading the agent context...
                </div>
              ) : errorMessage ? (
                <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100">
                  {errorMessage}
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] rounded-[1.75rem] px-4 py-3 text-sm leading-7 ${
                        message.role === "assistant"
                          ? "border border-white/10 bg-white/[0.04] text-zinc-100"
                          : "ml-auto border border-white/10 bg-white text-black"
                      }`}
                    >
                      {message.content}
                    </div>
                  ))}

                  {context ? (
                    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Current Working Model
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            Context Readiness
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {context.readiness.score}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            {formatEnumLabel(context.readiness.recommendedMode)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            Total Captured
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {formatCompactNumber(context.confidence.sampleSize)}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            {formatEnumLabel(context.confidence.sampleBand)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                            Primary Angle
                          </p>
                          <p className="mt-2 text-sm leading-6 text-zinc-200">
                            {contract?.planner.primaryAngle ?? "Waiting for the generation contract."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="pointer-events-auto w-full max-w-3xl rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <form onSubmit={handleComposerSubmit}>
                <div className="flex items-end gap-3">
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    +
                  </button>
                  <textarea
                    value={draftInput}
                    onChange={(event) => setDraftInput(event.target.value)}
                    placeholder="What are we creating today?"
                    className="min-h-[72px] flex-1 resize-none bg-transparent text-sm font-medium tracking-tight text-white outline-none placeholder:text-zinc-600"
                  />
                  <button
                    type="submit"
                    disabled={!context || !contract || !draftInput.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-zinc-500"
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                    LLM wiring is next. This route already uses the deterministic contract.
                  </p>
                  <div className="hidden items-center gap-2 md:flex">
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {contract ? formatEnumLabel(contract.mode) : "Loading"}
                    </span>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {analysisOpen && context ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="relative max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] border border-white/10 bg-[#070707] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setAnalysisOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white"
            >
              Close
            </button>

            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  Analysis Drawer
                </p>
                <h2 className="mt-2 font-mono text-3xl font-semibold text-white">
                  The full model stays here.
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Archetype</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.archetype)}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Niche</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.niche.primaryNiche)}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Loop</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Readiness</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {context.readiness.score}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Strategy Delta
                  </p>
                  <p className="mt-3 text-sm font-medium text-white">
                    {context.strategyDelta.primaryGap}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {context.strategyDelta.adjustments.slice(0, 4).map((item) => (
                      <li key={`${item.area}-${item.direction}`}>
                        {formatEnumLabel(item.direction)} {formatEnumLabel(item.area)} ({formatEnumLabel(item.priority)})
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Confidence
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    <li>Sample: {context.confidence.sampleSize} posts</li>
                    <li>Needs backfill: {context.confidence.needsBackfill ? "Yes" : "No"}</li>
                    <li>Evaluation: {context.confidence.evaluationOverallScore}</li>
                    <li>Anchor quality: {context.anchorSummary.anchorQualityScore ?? "N/A"}</li>
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Positive Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.positiveAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {formatEnumLabel(post.lane)} | {post.goalFitScore}
                        </p>
                        <p className="mt-2 line-clamp-3 leading-6">{post.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Negative Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.negativeAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {formatEnumLabel(post.lane)} | {post.goalFitScore}
                        </p>
                        <p className="mt-2 line-clamp-3 leading-6">{post.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </XShell>
  );
}
