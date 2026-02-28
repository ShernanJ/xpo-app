"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import type { CreatorGenerationContract } from "@/lib/onboarding/generationContract";
import type {
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  ToneCasing,
  ToneRisk,
  TransformationMode,
  UserGoal,
} from "@/lib/onboarding/types";

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

interface CreatorChatSuccess {
  ok: true;
  data: {
    reply: string;
    angles: string[];
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    supportAsset: string | null;
    outputShape:
      | "ideation_angles"
      | "short_form_post"
      | "long_form_post"
      | "thread_seed"
      | "reply_candidate"
      | "quote_candidate";
    whyThisWorks: string[];
    watchOutFor: string[];
    source: "openai" | "groq" | "deterministic";
    model: string | null;
    mode: CreatorGenerationContract["mode"];
  };
}

interface CreatorChatFailure {
  ok: false;
  errors: ValidationError[];
}

type CreatorChatResponse = CreatorChatSuccess | CreatorChatFailure;

interface CreatorChatStreamStatusEvent {
  type: "status";
  phase: "planning" | "writing" | "critic" | "finalizing";
  message: string;
}

interface CreatorChatStreamResultEvent {
  type: "result";
  data: CreatorChatSuccess["data"];
}

interface CreatorChatStreamErrorEvent {
  type: "error";
  message: string;
}

type CreatorChatStreamEvent =
  | CreatorChatStreamStatusEvent
  | CreatorChatStreamResultEvent
  | CreatorChatStreamErrorEvent;

type DraftArtifact = DraftArtifactDetails;

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  excludeFromHistory?: boolean;
  quickReplies?: ChatQuickReply[];
  angles?: string[];
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  supportAsset?: string | null;
  whyThisWorks?: string[];
  watchOutFor?: string[];
  source?: "openai" | "groq" | "deterministic";
  model?: string | null;
  outputShape?: CreatorChatSuccess["data"]["outputShape"];
}

type ChatProviderPreference = "openai" | "groq";
type ChatIntent = "ideate" | "draft" | "review";
type ChatContentFocus =
  | "project_showcase"
  | "technical_insight"
  | "build_in_public"
  | "operator_lessons"
  | "social_observation";

interface ChatQuickReply {
  kind: "content_focus";
  value: ChatContentFocus;
  label: string;
}

interface ChatStrategyInputs {
  goal: UserGoal;
  postingCadenceCapacity: PostingCadenceCapacity;
  replyBudgetPerDay: ReplyBudgetPerDay;
  transformationMode: TransformationMode;
}

interface ChatToneInputs {
  toneCasing: ToneCasing;
  toneRisk: ToneRisk;
}

interface WorkspaceLoadResult {
  ok: boolean;
  contextData?: CreatorAgentContext;
  contractData?: CreatorGenerationContract;
}

const showDevTools = process.env.NEXT_PUBLIC_SHOW_ONBOARDING_DEV_TOOLS === "1";
const chatProviderStorageKey = "stanley-x-chat-provider";
const DEFAULT_CHAT_STRATEGY_INPUTS: ChatStrategyInputs = {
  goal: "followers",
  postingCadenceCapacity: "1_per_day",
  replyBudgetPerDay: "5_15",
  transformationMode: "optimize",
};
const DEFAULT_CHAT_TONE_INPUTS: ChatToneInputs = {
  toneCasing: "normal",
  toneRisk: "safe",
};
const contentFocusOptions: ChatContentFocus[] = [
  "project_showcase",
  "technical_insight",
  "build_in_public",
  "operator_lessons",
  "social_observation",
];

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

function formatContentFocusLabel(value: ChatContentFocus): string {
  switch (value) {
    case "project_showcase":
      return "Project Showcase";
    case "technical_insight":
      return "Technical Insight";
    case "build_in_public":
      return "Build In Public";
    case "operator_lessons":
      return "Operator Lessons";
    case "social_observation":
      return "Social Observation";
  }
}

function formatToneCasingLabel(value: ToneCasing): string {
  return value === "lowercase" ? "Lowercase / Casual" : "Normal / Standard";
}

function formatToneRiskLabel(value: ToneRisk): string {
  return value === "bold" ? "Bold / Punchier" : "Safe / Steady";
}

function inferInitialToneInputs(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
}): ChatToneInputs {
  const { context, contract } = params;
  const voice = context.creatorProfile.voice;
  const isLongFormCreator =
    context.creatorProfile.identity.isVerified ||
    contract.planner.outputShape === "long_form_post" ||
    contract.planner.outputShape === "thread_seed" ||
    voice.multiLinePostRate >= 30 ||
    voice.averageLengthBand === "long";

  const shouldUseLowercase =
    voice.primaryCasing === "lowercase" ||
    (!isLongFormCreator && voice.lowercaseSharePercent >= 60) ||
    (isLongFormCreator && voice.lowercaseSharePercent >= 85);

  return {
    toneCasing: shouldUseLowercase ? "lowercase" : "normal",
    toneRisk: contract.writer.targetRisk,
  };
}

function formatNicheSummary(context: CreatorAgentContext): string {
  const { primaryNiche, targetNiche } = context.creatorProfile.niche;

  if (
    primaryNiche === "generalist" &&
    targetNiche &&
    targetNiche !== "generalist"
  ) {
    return `Broad Right Now -> ${formatEnumLabel(targetNiche)}`;
  }

  return formatEnumLabel(primaryNiche);
}

const chatScanlineStyle = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "100% 6px",
};

function buildInitialAssistantMessage(
  context: CreatorAgentContext,
  contract: CreatorGenerationContract,
): string {
  const angle = contract.planner.primaryAngle;
  const loop = formatEnumLabel(context.creatorProfile.distribution.primaryLoop);
  const observedNiche = formatEnumLabel(context.creatorProfile.niche.primaryNiche);
  const targetNiche =
    context.creatorProfile.niche.targetNiche &&
    context.creatorProfile.niche.targetNiche !== "generalist"
      ? formatEnumLabel(context.creatorProfile.niche.targetNiche)
      : null;

  if (contract.mode === "analysis_only") {
    return `I analyzed @${context.account}. Your current model is not strong enough for reliable drafting yet. You're trending ${formatEnumLabel(
      context.creatorProfile.archetype,
    )} in ${observedNiche}, but we should stay in analysis mode until the sample deepens.`;
  }

  if (
    context.creatorProfile.niche.primaryNiche === "generalist" &&
    targetNiche
  ) {
    return `I analyzed @${context.account}. You're primarily ${formatEnumLabel(
      context.creatorProfile.archetype,
    )}, but your current niche signal is still broad. The best niche to build toward is ${targetNiche}, and your strongest growth loop is ${loop}. The best next angle is: ${angle}`;
  }

  return `I analyzed @${context.account}. You're primarily ${formatEnumLabel(
    context.creatorProfile.archetype,
  )} in ${observedNiche}, and your strongest growth loop is ${loop}. The best next angle is: ${angle}`;
}

function AssistantTypingBubble(props: { status?: string | null }) {
  return (
    <div
      className="max-w-[88%] rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-zinc-100"
      aria-live="polite"
      aria-label="Assistant is typing"
    >
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-2.5 w-2.5 rounded-full bg-zinc-400/80 animate-pulse"
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
      </div>
      {props.status ? (
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {props.status}
        </p>
      ) : null}
    </div>
  );
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
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [strategyInputs] = useState<ChatStrategyInputs>(DEFAULT_CHAT_STRATEGY_INPUTS);
  const [toneInputs, setToneInputs] = useState<ChatToneInputs>(
    DEFAULT_CHAT_TONE_INPUTS,
  );
  const [activeContentFocus, setActiveContentFocus] =
    useState<ChatContentFocus | null>(null);
  const [activeStrategyInputs, setActiveStrategyInputs] =
    useState<ChatStrategyInputs | null>(null);
  const [activeToneInputs, setActiveToneInputs] = useState<ChatToneInputs | null>(
    null,
  );
  const [activeDraftEditor, setActiveDraftEditor] = useState<{
    messageId: string;
    artifactIndex: number;
  } | null>(null);
  const [editorDraftText, setEditorDraftText] = useState("");
  const [pinnedReferencePostIds, setPinnedReferencePostIds] = useState<string[]>([]);

  const loadWorkspace = useCallback(
    async (
      overrides: ChatStrategyInputs | null = activeStrategyInputs,
      toneOverrides: ChatToneInputs | null = activeToneInputs,
    ): Promise<WorkspaceLoadResult> => {
      if (!runId) {
        setErrorMessage("Missing runId. Start from the landing page.");
        setIsLoading(false);
        return { ok: false };
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const requestBody = {
          runId,
          ...(overrides ?? {}),
          ...(toneOverrides ?? {}),
        };

        const [contextResponse, contractResponse] = await Promise.all([
          fetch("/api/creator/context", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
          fetch("/api/creator/generation-contract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
        ]);

        const contextData: CreatorAgentContextResponse = await contextResponse.json();
        const contractData: CreatorGenerationContractResponse =
          await contractResponse.json();

        if (!contextResponse.ok || !contextData.ok) {
          setErrorMessage(
            contextData.ok
              ? "Failed to load the creator context."
              : (contextData.errors[0]?.message ??
                "Failed to load the creator context."),
          );
          return { ok: false };
        }

        if (!contractResponse.ok || !contractData.ok) {
          setErrorMessage(
            contractData.ok
              ? "Failed to load the generation contract."
              : (contractData.errors[0]?.message ??
                "Failed to load the generation contract."),
          );
          return { ok: false };
        }

        setContext(contextData.data);
        setContract(contractData.data);
        return {
          ok: true,
          contextData: contextData.data,
          contractData: contractData.data,
        };
      } catch {
        setErrorMessage("Network error while loading the chat workspace.");
        return { ok: false };
      } finally {
        setIsLoading(false);
      }
    },
    [activeStrategyInputs, activeToneInputs, runId],
  );

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
        content: `${buildInitialAssistantMessage(
          context,
          contract,
        )}\n\nwhat do you want to focus on posting about next? tell me in your own words, or pick a lane to start.`,
        excludeFromHistory: true,
        quickReplies: contentFocusOptions.map((option) => ({
          kind: "content_focus",
          value: option,
          label: formatContentFocusLabel(option),
        })),
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

  useEffect(() => {
    if (!showDevTools) {
      return;
    }

    const storedValue = window.localStorage.getItem(chatProviderStorageKey);
    if (storedValue === "openai" || storedValue === "groq") {
      setProviderPreference(storedValue);
    }
  }, []);

  useEffect(() => {
    if (!showDevTools) {
      return;
    }

    window.localStorage.setItem(chatProviderStorageKey, providerPreference);
  }, [providerPreference]);

  useEffect(() => {
    if (!context || !contract) {
      return;
    }

    setActiveStrategyInputs((current) => current ?? strategyInputs);

    if (activeToneInputs) {
      return;
    }

    const inferredToneInputs =
      toneInputs.toneCasing === DEFAULT_CHAT_TONE_INPUTS.toneCasing &&
      toneInputs.toneRisk === DEFAULT_CHAT_TONE_INPUTS.toneRisk
        ? inferInitialToneInputs({ context, contract })
        : toneInputs;

    setToneInputs(inferredToneInputs);
    setActiveToneInputs(inferredToneInputs);
    void loadWorkspace(activeStrategyInputs ?? strategyInputs, inferredToneInputs);
  }, [
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    loadWorkspace,
    strategyInputs,
    toneInputs,
  ]);

  const pinnedReferenceCandidates = useMemo(() => {
    if (!context) {
      return [];
    }

    const seen = new Set<string>();

    return [
      ...context.creatorProfile.examples.voiceAnchors,
      ...context.creatorProfile.examples.replyVoiceAnchors,
      ...context.creatorProfile.examples.quoteVoiceAnchors,
    ].filter((post) => {
      if (seen.has(post.id)) {
        return false;
      }

      seen.add(post.id);
      return true;
    }).slice(0, 6);
  }, [context]);

  useEffect(() => {
    if (pinnedReferenceCandidates.length === 0) {
      setPinnedReferencePostIds([]);
      return;
    }

    const availableIds = new Set(pinnedReferenceCandidates.map((post) => post.id));
    setPinnedReferencePostIds((current) =>
      current.filter((postId) => availableIds.has(postId)),
    );
  }, [pinnedReferenceCandidates]);

  const summaryChips = useMemo(() => {
    if (!context) {
      return [];
    }

    return [
      `Archetype: ${formatEnumLabel(context.creatorProfile.archetype)}`,
      `Niche: ${formatNicheSummary(context)}`,
      `Loop: ${formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}`,
      `Readiness: ${formatEnumLabel(context.readiness.status)}`,
      ...(activeContentFocus
        ? [`Focus: ${formatContentFocusLabel(activeContentFocus)}`]
        : []),
      ...(activeToneInputs
        ? [
            `Tone: ${formatToneCasingLabel(
              activeToneInputs.toneCasing,
            )} / ${formatToneRiskLabel(activeToneInputs.toneRisk)}`,
          ]
        : []),
    ];
  }, [activeContentFocus, activeToneInputs, context]);

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
  const selectedDraftArtifact = useMemo(() => {
    if (!activeDraftEditor) {
      return null;
    }

    const message = messages.find((item) => item.id === activeDraftEditor.messageId);
    if (!message?.draftArtifacts) {
      return null;
    }

    return message.draftArtifacts[activeDraftEditor.artifactIndex] ?? null;
  }, [activeDraftEditor, messages]);

  useEffect(() => {
    if (!selectedDraftArtifact) {
      setEditorDraftText("");
      return;
    }

    setEditorDraftText(selectedDraftArtifact.content);
  }, [selectedDraftArtifact]);

  const togglePinnedReferencePostId = useCallback((postId: string) => {
    setPinnedReferencePostIds((current) => {
      if (current.includes(postId)) {
        return current.filter((value) => value !== postId);
      }

      if (current.length >= 2) {
        return [...current.slice(1), postId];
      }

      return [...current, postId];
    });
  }, []);

  const openDraftEditor = useCallback((messageId: string, artifactIndex: number) => {
    setActiveDraftEditor({ messageId, artifactIndex });
  }, []);

  const saveDraftEditor = useCallback(() => {
    if (!activeDraftEditor) {
      return;
    }

    const nextContent = editorDraftText.trim();
    if (!nextContent) {
      return;
    }

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== activeDraftEditor.messageId || !message.draftArtifacts) {
          return message;
        }

        const nextDraftArtifacts = message.draftArtifacts.map((artifact, index) =>
          index === activeDraftEditor.artifactIndex
            ? buildDraftArtifact({
                id: artifact.id,
                title: artifact.title,
                kind: artifact.kind,
                content: nextContent,
                supportAsset: artifact.supportAsset,
              })
            : artifact,
        );

        const nextDrafts =
          message.drafts && message.drafts.length > 0
            ? message.drafts.map((draft, index) =>
                index === activeDraftEditor.artifactIndex ? nextContent : draft,
              )
            : nextDraftArtifacts.map((artifact) => artifact.content);

        return {
          ...message,
          drafts: nextDrafts,
          draftArtifacts: nextDraftArtifacts,
        };
      }),
    );
  }, [activeDraftEditor, editorDraftText]);

  const copyDraftEditor = useCallback(async () => {
    if (!editorDraftText.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(editorDraftText);
    } catch {
      setErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [editorDraftText]);

  const requestAssistantReply = useCallback(
    async (options: {
      prompt?: string;
      appendUserMessage: boolean;
      displayUserMessage?: string;
      includeUserMessageInHistory?: boolean;
      selectedAngle?: string | null;
      intent?: ChatIntent;
      historySeed?: ChatMessage[];
      strategyInputOverride?: ChatStrategyInputs;
      toneInputOverride?: ChatToneInputs;
      contentFocusOverride?: ChatContentFocus | null;
      fallbackContext?: CreatorAgentContext;
      fallbackContract?: CreatorGenerationContract;
    }) => {
      const resolvedContext = options.fallbackContext ?? context;
      const resolvedContract = options.fallbackContract ?? contract;
      const resolvedStrategyInputs =
        options.strategyInputOverride ?? activeStrategyInputs;
      const resolvedToneInputs = options.toneInputOverride ?? activeToneInputs;
      const resolvedContentFocus =
        options.contentFocusOverride ?? activeContentFocus;

      if (
        !runId ||
        !resolvedContext ||
        !resolvedContract ||
        !resolvedStrategyInputs ||
        !resolvedToneInputs ||
        isSending
      ) {
        return;
      }

      const trimmedPrompt = options.prompt?.trim() ?? "";
      const hasStructuredIntent =
        !!options.selectedAngle ||
        ((options.intent ?? "draft") === "ideate" && !!resolvedContentFocus);

      if (!trimmedPrompt && !hasStructuredIntent) {
        return;
      }

      let history = (options.historySeed ?? messages)
        .filter((message) => !message.excludeFromHistory)
        .slice(-6);

      if (options.appendUserMessage) {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          content: options.displayUserMessage?.trim() || trimmedPrompt,
          excludeFromHistory: options.includeUserMessageInHistory === false,
        };

        setMessages((current) => [...current, userMessage]);
        if (options.includeUserMessageInHistory !== false) {
          history = [...history, userMessage].slice(-6);
        }
      }

      setIsSending(true);
      setStreamStatus("Planning the next move.");
      setErrorMessage(null);

      try {
        const response = await fetch("/api/creator/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            ...(trimmedPrompt ? { message: trimmedPrompt } : {}),
            history,
            provider: providerPreference,
            stream: true,
            intent: options.intent ?? "draft",
            ...(resolvedContentFocus ? { contentFocus: resolvedContentFocus } : {}),
            selectedAngle: options.selectedAngle ?? null,
            pinnedReferencePostIds,
            ...resolvedToneInputs,
            ...resolvedStrategyInputs,
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          const data: CreatorChatResponse = await response.json();

          if (!response.ok || !data.ok) {
            setErrorMessage(
              data.ok
                ? "The chat route failed to return a reply."
                : (data.errors[0]?.message ?? "Failed to generate a reply."),
            );
            return;
          }

          setMessages((current) => [
            ...current,
            {
              id: `assistant-${Date.now() + 1}`,
              role: "assistant",
              content: data.data.reply,
              angles: data.data.angles,
              drafts: data.data.drafts,
              draftArtifacts: data.data.draftArtifacts,
              supportAsset: data.data.supportAsset,
              outputShape: data.data.outputShape,
              whyThisWorks: data.data.whyThisWorks,
              watchOutFor: data.data.watchOutFor,
              source: data.data.source,
              model: data.data.model ?? null,
            },
          ]);
          return;
        }

        if (!response.body) {
          throw new Error("The chat stream did not return a readable body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedResult: CreatorChatSuccess["data"] | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
              continue;
            }

            const event = JSON.parse(line) as CreatorChatStreamEvent;

            if (event.type === "status") {
              setStreamStatus(event.message);
              continue;
            }

            if (event.type === "result") {
              streamedResult = event.data;
              continue;
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        if (buffer.trim()) {
          const event = JSON.parse(buffer.trim()) as CreatorChatStreamEvent;
          if (event.type === "status") {
            setStreamStatus(event.message);
          } else if (event.type === "result") {
            streamedResult = event.data;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!streamedResult) {
          throw new Error("The chat stream finished without a result.");
        }

        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now() + 1}`,
            role: "assistant",
            content: streamedResult.reply,
            angles: streamedResult.angles,
            drafts: streamedResult.drafts,
            draftArtifacts: streamedResult.draftArtifacts,
            supportAsset: streamedResult.supportAsset,
            outputShape: streamedResult.outputShape,
            whyThisWorks: streamedResult.whyThisWorks,
            watchOutFor: streamedResult.watchOutFor,
            source: streamedResult.source,
            model: streamedResult.model ?? null,
          },
        ]);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The live model failed before the backend could return a response.",
        );
      } finally {
        setIsSending(false);
        setStreamStatus(null);
      }
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      contract,
      context,
      isSending,
      messages,
      providerPreference,
      pinnedReferencePostIds,
      runId,
    ],
  );

  const handleAngleSelect = useCallback(
    async (angle: string) => {
      if (!activeStrategyInputs || !activeToneInputs || isSending) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: angle,
        includeUserMessageInHistory: false,
        selectedAngle: angle,
        appendUserMessage: true,
        intent: "draft",
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      isSending,
      requestAssistantReply,
    ],
  );

  const handleQuickReplySelect = useCallback(
    async (quickReply: ChatQuickReply) => {
      if (
        quickReply.kind !== "content_focus" ||
        !activeStrategyInputs ||
        !activeToneInputs ||
        isSending
      ) {
        return;
      }

      setActiveContentFocus(quickReply.value);

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: quickReply.label,
        includeUserMessageInHistory: false,
        appendUserMessage: true,
        intent: "ideate",
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: quickReply.value,
      });
    },
    [activeStrategyInputs, activeToneInputs, isSending, requestAssistantReply],
  );

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = draftInput.trim();
    if (!trimmedInput || !context || !contract || isSending) {
      return;
    }

    if (!activeStrategyInputs || !activeToneInputs) {
      setErrorMessage("The planning model is still loading.");
      return;
    }

    setDraftInput("");

    await requestAssistantReply({
      prompt: trimmedInput,
      appendUserMessage: true,
      intent: "draft",
      strategyInputOverride: activeStrategyInputs,
      toneInputOverride: activeToneInputs,
      contentFocusOverride: activeContentFocus,
    });
  }

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={chatScanlineStyle} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
      {showDevTools ? (
        <div className="fixed bottom-24 right-4 z-20 md:bottom-6">
          <button
            type="button"
            onClick={() =>
              setProviderPreference((current) =>
                current === "openai" ? "groq" : "openai",
              )
            }
            className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-xl transition hover:bg-white/[0.04]"
          >
            Provider: {providerPreference === "openai" ? "OpenAI" : "Groq"}
          </button>
        </div>
      ) : null}

      <div className="relative flex h-full min-h-0">
        <aside
          className={`sticky top-0 hidden h-full min-h-0 shrink-0 border-r border-white/10 bg-white/[0.02] transition-[width] duration-300 md:flex md:flex-col ${
            sidebarOpen ? "w-[18.5rem]" : "w-[4.75rem]"
          }`}
        >
          <div className="px-3 pt-3">
            <Link
              href="/"
              className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 transition hover:bg-white/[0.04] ${
                sidebarOpen ? "justify-start" : "justify-center"
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-sm font-semibold tracking-[0.18em] text-white">
                X
              </span>
              {sidebarOpen ? (
                <span className="text-sm font-semibold tracking-[0.18em] text-white">
                  Xpo
                </span>
              ) : null}
            </Link>
          </div>

          <div className="flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((current) => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? "×" : "≡"}
            </button>
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => {
                  void loadWorkspace();
                }}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:bg-white/[0.04]"
              >
                Refresh
              </button>
            ) : null}
          </div>

          <div className="px-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-3">
              <span className="text-sm text-zinc-500">⌕</span>
              {sidebarOpen ? (
                <>
                  <span className="text-sm text-zinc-400">Search</span>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                    ⌘K
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="px-3 pt-3">
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-left transition hover:bg-white/[0.03] ${
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
              <div className="space-y-6">
                {sidebarThreads.map((section) => (
                  <div key={section.section} className="space-y-2">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                      {section.section}
                    </p>
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="block w-full rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03]"
                      >
                        <span className="line-clamp-2 text-sm leading-6 text-zinc-200">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          {item.meta}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 pt-2">
                {sidebarThreads.flatMap((section) => section.items).slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                    title={item.label}
                  >
                    {item.label.slice(0, 2)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-3 py-4">
            {sidebarOpen && context ? (
              <div className="rounded-2xl border border-white/10 px-3 py-3">
                <p className="text-sm font-semibold text-white">@{context.account}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                </p>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-white">
                  {context?.account.slice(0, 2).toUpperCase() ?? "X"}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white md:hidden"
                aria-label="Toggle sidebar"
              >
                ≡
              </button>
              <div className="flex justify-center md:justify-start">
                <div className="rounded-full border border-white/10 px-5 py-2">
                  <p className="font-mono text-sm font-semibold tracking-[0.08em] text-white">
                    X Strategy Chat
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAnalysisOpen(true)}
                  className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-white/[0.04]"
                >
                  View Analysis
                </button>
              </div>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {summaryChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              {backfillNotice ? (
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  {backfillNotice}
                </div>
              ) : null}

              {isLoading && !context && !contract ? (
                <div className="text-sm text-zinc-400">Loading the agent context...</div>
              ) : (
                <>
                  {errorMessage ? (
                    <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] px-4 py-3 text-sm leading-8 ${
                        message.role === "assistant"
                          ? "rounded-[1.75rem] border border-white/10 bg-white/[0.03] text-zinc-100"
                          : "ml-auto rounded-[1.75rem] bg-white px-4 py-3 text-black"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>

                      {message.role === "assistant" && message.quickReplies?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                          {message.quickReplies.map((quickReply) => (
                            <button
                              key={`${message.id}-${quickReply.kind}-${quickReply.value}`}
                              type="button"
                              onClick={() => {
                                void handleQuickReplySelect(quickReply);
                              }}
                              disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                              className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                            >
                              {quickReply.label}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" && message.angles?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.angles.map((angle, index) => (
                            <div
                              key={`${message.id}-angle-${index}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Angle {index + 1}
                              </p>
                              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-100">
                                {angle}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleAngleSelect(angle);
                                }}
                                disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                                className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                              >
                                Turn Into Drafts
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" && message.draftArtifacts?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.draftArtifacts.map((artifact, index) => (
                            <div
                              key={`${message.id}-draft-artifact-${artifact.id}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    {artifact.title}
                                  </p>
                                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                    {formatAreaLabel(artifact.kind)} · {artifact.weightedCharacterCount}/
                                    {artifact.maxCharacterLimit}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openDraftEditor(message.id, index)}
                                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                                >
                                  Edit
                                </button>
                              </div>
                              <p className="mt-3 whitespace-pre-wrap leading-7 text-zinc-100">
                                {artifact.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      !message.draftArtifacts?.length &&
                      message.drafts?.length ? (
                        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                          {message.drafts.map((draft, index) => (
                            <div
                              key={`${message.id}-draft-${index}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Draft {index + 1}
                              </p>
                              <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-100">
                                {draft}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      message.supportAsset &&
                      !message.draftArtifacts?.length ? (
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Best Asset
                          </p>
                          <p className="mt-2 text-xs leading-6 text-zinc-300">
                            {message.supportAsset}
                          </p>
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                      ((message.whyThisWorks?.length ?? 0) > 0 ||
                        (message.watchOutFor?.length ?? 0) > 0) ? (
                        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                          {message.whyThisWorks?.length ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Why This Works
                              </p>
                              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                                {message.whyThisWorks.map((item, index) => (
                                  <li key={`${message.id}-why-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {message.watchOutFor?.length ? (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Watch Out For
                              </p>
                              <ul className="mt-2 space-y-2 text-xs leading-6 text-zinc-300">
                                {message.watchOutFor.map((item, index) => (
                                  <li key={`${message.id}-watch-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {showDevTools && message.role === "assistant" && message.source ? (
                        <div className="mt-4 border-t border-white/10 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            {message.source}
                            {message.model ? ` · ${message.model}` : ""}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {isSending ? <AssistantTypingBubble status={streamStatus} /> : null}
                </>
              )}
            </div>
          </section>

          <div className="shrink-0 border-t border-white/10 bg-black/80 backdrop-blur-xl">
            <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
              <form onSubmit={handleComposerSubmit}>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      +
                    </button>
                    <textarea
                      value={draftInput}
                      onChange={(event) => setDraftInput(event.target.value)}
                      placeholder="What are we creating today?"
                      disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                      className="min-h-[72px] flex-1 resize-none bg-transparent text-sm font-medium tracking-tight text-white outline-none placeholder:text-zinc-600"
                    />
                    <button
                      type="submit"
                      disabled={
                        !context ||
                        !contract ||
                        !activeStrategyInputs ||
                        !activeToneInputs ||
                        !draftInput.trim() ||
                        isSending
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-zinc-500"
                      aria-label="Send message"
                    >
                      {isSending ? "…" : "↑"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {selectedDraftArtifact ? (
        <aside className="absolute inset-y-0 right-0 z-20 w-full border-l border-white/10 bg-black/95 backdrop-blur-xl sm:max-w-xl">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {selectedDraftArtifact.title}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                  {formatAreaLabel(selectedDraftArtifact.kind)} · {computeXWeightedCharacterCount(
                    editorDraftText,
                  )}/{selectedDraftArtifact.maxCharacterLimit} · {computeXWeightedCharacterCount(
                    editorDraftText,
                  ) <= selectedDraftArtifact.maxCharacterLimit
                    ? "Within Limit"
                    : "Over Limit"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDraftEditor(null)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <textarea
                value={editorDraftText}
                onChange={(event) => setEditorDraftText(event.target.value)}
                className="min-h-[22rem] w-full resize-none rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-600"
                placeholder="Draft content"
              />

              {selectedDraftArtifact.supportAsset ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Suggested Asset
                  </p>
                  <p className="mt-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.supportAsset}
                  </p>
                </div>
              ) : null}

              {selectedDraftArtifact.betterClosers.length ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Better Closers
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.betterClosers.map((closer, index) => (
                      <li key={`${selectedDraftArtifact.id}-closer-${index}`}>{closer}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedDraftArtifact.replyPlan.length ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Reply Plan
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-7 text-zinc-300">
                    {selectedDraftArtifact.replyPlan.map((step, index) => (
                      <li key={`${selectedDraftArtifact.id}-reply-${index}`}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/10 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                  Edit the draft here before you use it.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void copyDraftEditor();
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={saveDraftEditor}
                    className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {analysisOpen && context ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-4 py-8">
          <div className="relative max-h-[85vh] w-full max-w-4xl overflow-y-auto border border-white/10 bg-black p-6">
            <button
              type="button"
              onClick={() => setAnalysisOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
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
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Archetype</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.archetype)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Niche</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatNicheSummary(context)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Loop</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatEnumLabel(context.creatorProfile.distribution.primaryLoop)}
                  </p>
                </div>
                <div className="border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Readiness</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {context.readiness.score}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Strategy Delta
                  </p>
                  <p className="mt-3 text-sm font-medium text-white">
                    {context.strategyDelta.primaryGap}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {context.strategyDelta.adjustments.slice(0, 4).map((item) => (
                      <li key={`${item.area}-${item.direction}`}>
                        {formatEnumLabel(item.direction)} {formatAreaLabel(item.area)} ({formatEnumLabel(item.priority)})
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-white/10 p-5">
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
                <div className="border border-white/10 p-5 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Pinned Voice References
                      </p>
                      <p className="mt-2 text-sm text-zinc-300">
                        Pin up to 2 posts. The backend will treat them as the highest-priority voice references during generation.
                      </p>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {pinnedReferencePostIds.length} / 2 pinned
                    </p>
                  </div>

                  <ul className="mt-4 grid gap-3 md:grid-cols-2">
                    {pinnedReferenceCandidates.map((post) => {
                      const isPinned = pinnedReferencePostIds.includes(post.id);

                      return (
                        <li key={post.id} className="border border-white/10 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                {formatEnumLabel(post.lane)} | {post.selectionReason}
                              </p>
                              <p className="mt-2 line-clamp-4 text-sm leading-6 text-zinc-300">
                                {post.text}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => togglePinnedReferencePostId(post.id)}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                                isPinned
                                  ? "border-white/20 bg-white/[0.06] text-white"
                                  : "border-white/10 text-zinc-400 hover:bg-white/[0.04]"
                              }`}
                            >
                              {isPinned ? "Pinned" : "Pin"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Positive Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.positiveAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          {formatEnumLabel(post.lane)} | {post.goalFitScore}
                        </p>
                        <p className="mt-2 line-clamp-3 leading-6">{post.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border border-white/10 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Negative Anchors
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                    {context.negativeAnchors.slice(0, 4).map((post) => (
                      <li key={post.id} className="border border-white/10 p-3">
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
    </main>
  );
}
