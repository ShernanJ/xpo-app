"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ChevronUp, Check, LogOut, Plus } from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import {
  isBroadDraftRequest,
  isBroadDiscoveryPrompt,
  isCorrectionPrompt,
  isDraftPushPrompt,
  isMetaClarifyingPrompt,
  isThinCoachInput,
} from "@/lib/onboarding/coachReply";
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
    draft?: string | null;
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    supportAsset: string | null;
    outputShape:
    | "coach_question"
    | "ideation_angles"
    | "short_form_post"
    | "long_form_post"
    | "thread_seed"
    | "reply_candidate"
    | "quote_candidate";
    whyThisWorks: string[];
    watchOutFor: string[];
    debug: {
      formatExemplar: {
        id: string;
        lane: "original" | "reply" | "quote";
        text: string;
        selectionReason: string;
        goalFitScore: number;
      } | null;
      topicAnchors: Array<{
        id: string;
        lane: "original" | "reply" | "quote";
        text: string;
        selectionReason: string;
        goalFitScore: number;
      }>;
      pinnedVoiceReferences: Array<{
        id: string;
        lane: "original" | "reply" | "quote";
        text: string;
        selectionReason: string;
        goalFitScore: number;
      }>;
      pinnedEvidenceReferences: Array<{
        id: string;
        lane: "original" | "reply" | "quote";
        text: string;
        selectionReason: string;
        goalFitScore: number;
      }>;
      evidencePack: {
        sourcePostIds: string[];
        entities: string[];
        metrics: string[];
        proofPoints: string[];
        storyBeats: string[];
        constraints: string[];
        requiredEvidenceCount: number;
      };
      formatBlueprint: string;
      formatSkeleton: string;
      outputShapeRationale: string;
      draftDiagnostics: Array<{
        preview: string;
        score: number;
        chosen: boolean;
        evidenceCoverage: {
          entityMatches: number;
          metricMatches: number;
          proofMatches: number;
          total: number;
        };
        focusTermMatches: number;
        genericPhraseCount: number;
        strategyLeakCount: number;
        matchesBlueprint: boolean | null;
        matchesSkeleton: boolean | null;
        reasons: string[];
        validator: {
          pass: boolean;
          errors: string[];
          metrics: {
            wordCount: number;
            sectionCount: number;
            blankLineSeparators: number;
            proofBullets: number;
            mechanismSteps: number;
            maxLineLen: number;
            ngramOverlap5: number;
            metricReuseCount: number;
            bannedOpenerHit: boolean;
          };
        } | null;
      }>;
    };
    source: "openai" | "groq" | "deterministic";
    model: string | null;
    mode: CreatorGenerationContract["mode"];
    memory?: {
      conversationState: string;
      activeConstraints: string[];
      topicSummary: string | null;
      concreteAnswerCount: number;
      currentDraftArtifactId: string | null;
    };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  angles?: any[];
  draft?: string | null;
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  supportAsset?: string | null;
  whyThisWorks?: string[];
  watchOutFor?: string[];
  debug?: CreatorChatSuccess["data"]["debug"];
  source?: "openai" | "groq" | "deterministic";
  model?: string | null;
  outputShape?: CreatorChatSuccess["data"]["outputShape"];
  isStreaming?: boolean;
}

type ChatProviderPreference = "openai" | "groq";
type ChatIntent = "coach" | "ideate" | "draft" | "review";
type ChatContentFocus =
  | "project_showcase"
  | "technical_insight"
  | "build_in_public"
  | "operator_lessons"
  | "social_observation";

interface ChatQuickReply {
  kind: "content_focus" | "example_reply";
  value: string;
  label: string;
  suggestedFocus?: ChatContentFocus;
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
function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

function inferInitialToneInputs(params: {
  context: CreatorAgentContext;
  contract: CreatorGenerationContract;
}): ChatToneInputs {
  const { context, contract } = params;
  const voice = context.creatorProfile.voice;
  if (context.creatorProfile.identity.isVerified) {
    return {
      toneCasing: "normal",
      toneRisk: contract.writer.targetRisk,
    };
  }

  const isLongFormCreator =
    context.creatorProfile.identity.isVerified ||
    contract.planner.outputShape === "long_form_post" ||
    contract.planner.outputShape === "thread_seed" ||
    voice.multiLinePostRate >= 30 ||
    voice.averageLengthBand === "long";

  const stronglyLowercaseShortForm =
    voice.primaryCasing === "lowercase" &&
    voice.lowercaseSharePercent >= 72 &&
    voice.multiLinePostRate < 35;
  const overwhelminglyLowercaseLongForm =
    voice.primaryCasing === "lowercase" &&
    voice.lowercaseSharePercent >= 95 &&
    voice.multiLinePostRate < 10;
  const shouldUseLowercase = isLongFormCreator
    ? overwhelminglyLowercaseLongForm
    : stronglyLowercaseShortForm;

  return {
    toneCasing: shouldUseLowercase ? "lowercase" : "normal",
    toneRisk: contract.writer.targetRisk,
  };
}

function inferComposerIntent(input: string): ChatIntent {
  const trimmed = input.trim();
  if (!trimmed) {
    return "coach";
  }

  if (isBroadDraftRequest(trimmed)) {
    return "draft";
  }

  if (isDraftPushPrompt(trimmed)) {
    return "coach";
  }

  if (
    /\b(draft|write|rewrite|turn this into|make this a post|make this into a post|post draft|write me a post|turn this into drafts)\b/i.test(
      trimmed,
    )
  ) {
    return "draft";
  }

  if (/\b(review|critique|edit|improve this|make this better)\b/i.test(trimmed)) {
    return "review";
  }

  if (isCorrectionPrompt(trimmed) || isMetaClarifyingPrompt(trimmed)) {
    return "coach";
  }

  if (isBroadDiscoveryPrompt(trimmed)) {
    return "coach";
  }

  if (isThinCoachInput(trimmed)) {
    return "coach";
  }

  if (/\b(idea|ideate|brainstorm|angles?|topics?)\b/i.test(trimmed)) {
    return "ideate";
  }

  return "coach";
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

function formatTypingStatusLabel(status?: string | null): string {
  switch (status) {
    case "Planning the next move.":
      return "thinking through the sharpest angle";
    case "Writing draft options.":
      return "turning that into something postable";
    case "Tightening the response.":
      return "tightening the wording";
    case "Finalizing the reply.":
      return "getting the final wording right";
    default:
      return "thinking this through";
  }
}

function AssistantTypingBubble(props: { status?: string | null }) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDotCount((current) => (current >= 3 ? 1 : current + 1));
    }, 420);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const statusLabel = formatTypingStatusLabel(props.status);

  return (
    <div
      className="max-w-[88%] px-0 py-1 text-zinc-100"
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
        <p className="mt-3 text-xs text-zinc-400">
          {statusLabel}
          {".".repeat(dotCount)}
        </p>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse text-zinc-500">Loading workspace...</div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId")?.trim() ?? "";
  const threadIdParam = searchParams.get("threadId")?.trim() ?? null;
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";

  const accountName = session?.user?.activeXHandle ?? null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdParam);
  const [chatThreads, setChatThreads] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);

  // Guard against double fetching welcome message
  const welcomeFetchedRef = useRef(false);

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accountName) return;
    fetch(`/api/creator/v2/threads?xHandle=${encodeURIComponent(accountName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.data?.threads) {
          setChatThreads(data.data.threads);
        }
      })
      .catch(err => console.error("Failed to fetch threads:", err));
  }, [accountName]);

  const handleNewChat = useCallback(async () => {
    if (!accountName) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/creator/v2/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xHandle: accountName })
      });
      const data = await res.json();
      if (data.ok && data.data?.thread) {
        setChatThreads((prev) => [data.data.thread, ...prev]);
        setActiveThreadId(data.data.thread.id);
        welcomeFetchedRef.current = false;
        setMessages([]); // Clear chat history for the new thread
        setDraftInput("");
        // Optionally update URL: window.history.pushState(null, '', `?threadId=${data.data.thread.id}&account=${accountName}`)
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [accountName]);
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [, setBackfillNotice] = useState<string | null>(null);
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
  const [pinnedVoicePostIds, setPinnedVoicePostIds] = useState<string[]>([]);
  const [pinnedEvidencePostIds, setPinnedEvidencePostIds] = useState<string[]>(
    [],
  );
  const [conversationMemory, setConversationMemory] = useState<
    CreatorChatSuccess["data"]["memory"] | null
  >(null);
  const [typedAssistantLengths, setTypedAssistantLengths] = useState<
    Record<string, number>
  >({});

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [availableHandles, setAvailableHandles] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/creator/profile/handles")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.handles) {
          setAvailableHandles(data.data.handles);
        }
      })
      .catch((err) => console.error("Failed to load available handles:", err));
  }, []);

  const switchActiveHandle = useCallback(async (handle: string) => {
    if (handle === accountName) return;

    setAccountMenuOpen(false);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const resp = await fetch("/api/creator/profile/handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (!resp.ok) {
        throw new Error("Failed to switch handle");
      }

      // Let reload clear state natively. Reusing load workspace breaks the NextAuth context boundary without a hard reload.
      window.location.reload();
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not switch to account @" + handle);
      setIsLoading(false);
    }
  }, [accountName]);

  const loadWorkspace = useCallback(
    async (
      overrides: ChatStrategyInputs | null = activeStrategyInputs,
      toneOverrides: ChatToneInputs | null = activeToneInputs,
    ): Promise<WorkspaceLoadResult> => {

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const requestBody = {
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
    [activeStrategyInputs, activeToneInputs, accountName],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    setContext(null);
    setContract(null);
    setMessages([]);
    setDraftInput("");
    setErrorMessage(null);
    setStreamStatus(null);
    setAnalysisOpen(false);
    setBackfillNotice(null);
    setActiveContentFocus(null);
    setToneInputs(DEFAULT_CHAT_TONE_INPUTS);
    setActiveToneInputs(null);
    setActiveStrategyInputs(DEFAULT_CHAT_STRATEGY_INPUTS);
    setActiveDraftEditor(null);
    setEditorDraftText("");
    setPinnedVoicePostIds([]);
    setPinnedEvidencePostIds([]);
    setTypedAssistantLengths({});
  }, [accountName]);

  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.length > 0);

    if (!latestAssistantMessage) {
      return;
    }



    const targetLength = latestAssistantMessage.content.length;
    const currentLength = typedAssistantLengths[latestAssistantMessage.id];

    if (currentLength !== undefined && currentLength >= targetLength) {
      return;
    }

    const interval = window.setInterval(() => {
      setTypedAssistantLengths((current) => {
        const latest = current[latestAssistantMessage.id] ?? 0;
        if (latest >= targetLength) {
          window.clearInterval(interval);
          return current;
        }

        const remaining = targetLength - latest;
        const step = remaining > 90 ? 8 : remaining > 40 ? 5 : 3;

        return {
          ...current,
          [latestAssistantMessage.id]: Math.min(targetLength, latest + step),
        };
      });
    }, 18);

    return () => {
      window.clearInterval(interval);
    };
  }, [messages]);

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
      ...context.creatorProfile.examples.bestPerforming,
      ...context.creatorProfile.examples.strategyAnchors,
      ...context.creatorProfile.examples.goalAnchors,
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
      setPinnedVoicePostIds([]);
      setPinnedEvidencePostIds([]);
      return;
    }

    const availableIds = new Set(pinnedReferenceCandidates.map((post) => post.id));
    setPinnedVoicePostIds((current) =>
      current.filter((postId) => availableIds.has(postId)),
    );
    setPinnedEvidencePostIds((current) =>
      current.filter((postId) => availableIds.has(postId)),
    );
  }, [pinnedReferenceCandidates]);

  const sidebarThreads = useMemo(() => {
    if (!context || !contract) {
      return [];
    }

    const recentItems = chatThreads.slice(0, 10).map((t) => ({
      id: t.id,
      label: t.title || "Chat",
      meta: new Date(t.updatedAt).toLocaleDateString(),
    }));

    return [
      {
        section: "Chats",
        items: recentItems.length > 0 ? recentItems : [
          {
            id: activeThreadId ?? "current-workspace",
            label: contract.planner.primaryAngle,
            meta: "Active",
          },
        ],
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

  const latestAssistantMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.length > 0)
        ?.id ?? null,
    [messages],
  );

  useEffect(() => {
    if (!selectedDraftArtifact) {
      setEditorDraftText("");
      return;
    }

    setEditorDraftText(selectedDraftArtifact.content);
  }, [selectedDraftArtifact]);

  const togglePinnedPostId = useCallback(
    (postId: string, kind: "voice" | "evidence") => {
      const setPins =
        kind === "voice" ? setPinnedVoicePostIds : setPinnedEvidencePostIds;

      setPins((current) => {
        if (current.includes(postId)) {
          return current.filter((value) => value !== postId);
        }

        if (current.length >= 2) {
          return [...current.slice(1), postId];
        }

        return [...current, postId];
      });
    },
    [],
  );

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
        !resolvedContext?.runId ||
        !resolvedContract ||
        !resolvedStrategyInputs ||
        !resolvedToneInputs ||
        isSending
      ) {
        return;
      }

      const trimmedPrompt = options.prompt?.trim() ?? "";
      const resolvedIntent = options.intent;
      const hasStructuredIntent =
        !!options.selectedAngle ||
        (resolvedIntent === "coach" &&
          (!trimmedPrompt || !!resolvedContentFocus)) ||
        ((resolvedIntent === "ideate" || resolvedIntent === "coach") &&
          !!resolvedContentFocus);

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
        const response = await fetch("/api/creator/v2/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId: resolvedContext.runId,
            threadId: activeThreadId,
            ...(trimmedPrompt ? { message: trimmedPrompt } : {}),
            history,
            provider: providerPreference,
            stream: true,
            intent: resolvedIntent,
            ...(resolvedContentFocus ? { contentFocus: resolvedContentFocus } : {}),
            selectedAngle: options.selectedAngle ?? null,
            pinnedVoicePostIds,
            pinnedEvidencePostIds,
            ...resolvedToneInputs,
            ...resolvedStrategyInputs,
            ...(conversationMemory ? { memory: conversationMemory } : {}),
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
              draft: data.data.draft || null,
              drafts: data.data.drafts,
              draftArtifacts: data.data.draftArtifacts,
              supportAsset: data.data.supportAsset,
              outputShape: data.data.outputShape,
              whyThisWorks: data.data.whyThisWorks,
              watchOutFor: data.data.watchOutFor,
              debug: data.data.debug,
              source: data.data.source,
              model: data.data.model ?? null,
              quickReplies:
                current.length === 0 &&
                  !trimmedPrompt &&
                  !options.selectedAngle
                  ? [
                    {
                      kind: "example_reply",
                      value: "write a post in my voice",
                      label: "Write a post in my voice",
                    },
                    {
                      kind: "example_reply",
                      value: "help me figure out what to post about",
                      label: "Help me figure out what to post",
                    },
                    {
                      kind: "example_reply",
                      value: "analyze my recent posts and tell me what's working",
                      label: "Analyze my recent posts",
                    },
                  ]
                  : undefined,
            },
          ]);

          // Store returned memory blob
          if (data.data.memory) {
            setConversationMemory(data.data.memory);
          }
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
            debug: streamedResult.debug,
            source: streamedResult.source,
            model: streamedResult.model ?? null,
            quickReplies:
              current.length === 0 &&
                !trimmedPrompt &&
                !options.selectedAngle
                ? [
                  {
                    kind: "example_reply",
                    value: "write a post in my voice",
                    label: "Write a post in my voice",
                  },
                  {
                    kind: "example_reply",
                    value: "help me figure out what to post about",
                    label: "Help me figure out what to post",
                  },
                  {
                    kind: "example_reply",
                    value: "analyze my recent posts and tell me what's working",
                    label: "Analyze my recent posts",
                  },
                ]
                : undefined,
          },
        ]);

        // Store returned memory blob from stream
        if (streamedResult.memory) {
          setConversationMemory(streamedResult.memory);
        }
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
      conversationMemory,
      isSending,
      messages,
      providerPreference,
      pinnedEvidencePostIds,
      pinnedVoicePostIds,
      accountName,
    ],
  );

  useEffect(() => {
    if (
      !context ||
      !contract ||
      isSending ||
      !activeStrategyInputs ||
      !activeToneInputs
    ) {
      return;
    }

    async function initializeThread() {
      // If we have an active thread, try loading its history
      if (activeThreadId) {
        try {
          const res = await fetch(`/api/creator/v2/threads/${activeThreadId}`);
          const data = await res.json();
          if (data.ok && data.data?.messages?.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedMessages: ChatMessage[] = data.data.messages.map((m: any) => ({
              id: m.id,
              role: m.role as "assistant" | "user",
              content: m.content,
              ...(m.data || {}),
            }));
            setMessages(mappedMessages);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch historical messages", e);
        }
      }

      // If no history was loaded, and the screen is blank, fetch the Welcome message
      if (messages.length === 0) {
        if (welcomeFetchedRef.current) return;
        welcomeFetchedRef.current = true;

        try {
          setMessages([{
            id: `assistant-welcome-loading`,
            role: "assistant",
            content: "",
            isStreaming: true, // Show typing indicator
          }]);

          const res = await fetch(`/api/creator/v2/chat/welcome?runId=${context!.runId}&account=${encodeURIComponent(accountName ?? "there")}`);
          const data = await res.json();

          if (data.ok && data.data?.response) {
            setMessages([{
              id: `assistant-welcome-${Date.now()}`,
              role: "assistant",
              content: data.data.response,
            }]);
          } else {
            // Fallback if the LLM fails
            setMessages([{
              id: `assistant-welcome-fallback`,
              role: "assistant",
              content: `yo @${accountName ?? "there"} — what are we working on today? i can help you draft something, figure out what to post, or audit your recent posts.`,
            }]);
          }
        } catch (err) {
          console.error("Failed to fetch welcome message", err);
          setMessages([{
            id: `assistant-welcome-fallback`,
            role: "assistant",
            content: `yo @${accountName ?? "there"} — what are we working on today? i can help you draft something, figure out what to post, or audit your recent posts.`,
          }]);
        }
      }
    }

    void initializeThread();
  }, [
    activeThreadId,
    searchParams,
    activeContentFocus,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    isSending,
    messages.length,
  ]);

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
    (quickReply: ChatQuickReply) => {
      if (isSending) {
        return;
      }

      if (quickReply.kind === "content_focus") {
        setActiveContentFocus(quickReply.value as ChatContentFocus);
        setDraftInput(`i want to focus on ${quickReply.label.toLowerCase()}`);
        setErrorMessage(null);
        return;
      }

      if (quickReply.suggestedFocus) {
        setActiveContentFocus(quickReply.suggestedFocus);
      }

      setDraftInput(quickReply.value);
      setErrorMessage(null);
    },
    [isSending],
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
      strategyInputOverride: activeStrategyInputs,
      toneInputOverride: activeToneInputs,
      contentFocusOverride: activeContentFocus,
    });
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (
        !context ||
        !contract ||
        !activeStrategyInputs ||
        !activeToneInputs ||
        !draftInput.trim() ||
        isSending
      ) {
        return;
      }
      void handleComposerSubmit(event as unknown as FormEvent<HTMLFormElement>);
    }
  };

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={chatScanlineStyle} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="relative flex h-full min-h-0">
        <aside
          className={`sticky top-0 hidden h-full min-h-0 shrink-0 border-r border-white/10 bg-white/[0.02] transition-[width] duration-300 md:flex md:flex-col ${sidebarOpen ? "w-[18.5rem]" : "w-[4.75rem]"
            }`}
        >
          <div className="px-3 pt-3">
            <Link
              href="/"
              className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 transition hover:bg-white/[0.04] ${sidebarOpen ? "justify-start" : "justify-center"
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
              onClick={handleNewChat}
              className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-left transition hover:bg-white/[0.03] ${sidebarOpen ? "justify-start" : "justify-center"
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
                        onClick={() => {
                          if (section.section === "Chats" && item.id !== "current-workspace") {
                            setActiveThreadId(item.id);
                          }
                        }}
                        className={`block w-full rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03] ${activeThreadId === item.id ? "bg-white/[0.04]" : ""}`}
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
                    onClick={() => {
                      if (item.id !== "current-workspace") {
                        setActiveThreadId(item.id);
                      }
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white ${activeThreadId === item.id ? "ring-1 ring-white/20" : ""}`}
                    title={item.label}
                  >
                    {item.label.slice(0, 2)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative border-t border-white/10 px-3 py-4">
            {sidebarOpen ? (
              <>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className="flex w-full items-center justify-between rounded-xl p-2 transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black text-sm font-bold overflow-hidden">
                      {context?.avatarUrl ? (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${context.avatarUrl})` }}
                          role="img"
                          aria-label={`${accountName} profile photo`}
                        />
                      ) : (
                        accountName?.slice(0, 1).toUpperCase() ?? session?.user?.email?.slice(0, 1).toUpperCase() ?? "X"
                      )}
                    </div>
                    <div className="flex flex-col items-start overflow-hidden text-left">
                      <span className="truncate text-xs font-semibold text-zinc-100 w-full">
                        {accountName ? `@${accountName}` : (session?.user?.email ?? "Loading...")}
                      </span>
                      {accountName ? (
                        <span className="truncate text-[10px] text-zinc-500 w-full">
                          {session?.user?.email ?? ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                </button>

                {accountMenuOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 rounded-2xl border border-white/10 bg-zinc-950 p-1 shadow-2xl">
                    <div className="max-h-[200px] overflow-y-auto px-1 py-1">
                      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        X Accounts
                      </p>
                      {availableHandles.map((handleStr) => (
                        <button
                          key={handleStr}
                          onClick={() => switchActiveHandle(handleStr)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                        >
                          <span className="truncate">@{handleStr}</span>
                          {handleStr === accountName && <Check className="h-4 w-4 text-white" />}
                        </button>
                      ))}
                      <Link
                        href="/onboarding"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white mt-1"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Account</span>
                      </Link>
                    </div>

                    <div className="my-1 h-px bg-white/10" />

                    <div className="px-1 py-1">
                      <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black text-sm font-bold transition hover:opacity-80"
                  aria-label="Open account menu"
                >
                  {accountName?.slice(0, 1).toUpperCase() ?? session?.user?.email?.slice(0, 1).toUpperCase() ?? "X"}
                </button>
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
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 pb-32 pt-8 sm:px-6 sm:pb-24">
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
                      className={`max-w-[88%] px-4 py-3 text-sm leading-8 ${message.role === "assistant"
                        ? "text-zinc-100"
                        : "ml-auto rounded-[1.75rem] bg-white px-4 py-3 text-black"
                        }`}
                    >
                      <p className="whitespace-pre-wrap">
                        {message.role === "assistant" &&
                          message.id === latestAssistantMessageId ? (
                          <>
                            {message.content.slice(
                              0,
                              typedAssistantLengths[message.id] ?? 0,
                            )}
                            {(typedAssistantLengths[message.id] ?? 0) <
                              message.content.length ? (
                              <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-zinc-400 align-[-0.2em]" />
                            ) : null}
                          </>
                        ) : (
                          message.content
                        )}
                      </p>

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
                              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                            >
                              {quickReply.label}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                        message.outputShape !== "coach_question" &&
                        message.angles?.length ? (
                        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                          {message.angles.map((angle, index) => {
                            // Support both old string[] and new structured IdeaSchema objects
                            const isStructured = typeof angle === "object" && angle !== null;
                            const title = isStructured ? (angle as Record<string, string>).title : angle as string;
                            const whyThisWorks = isStructured ? (angle as Record<string, string>).why_this_works : null;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const openingLines = isStructured ? (angle as Record<string, any>).opening_lines : null;
                            const subtopics = isStructured ? (angle as Record<string, string>).subtopics : null;

                            // Old formats parsing
                            const premise = isStructured ? (angle as Record<string, string>).premise : null;
                            const format = isStructured ? (angle as Record<string, string>).format : null;

                            return (
                              <button
                                type="button"
                                onClick={() => setDraftInput(`> ${title}\n\n`)}
                                key={`${message.id}-angle-${index}`}
                                className="group relative w-full text-left rounded-lg py-2 hover:bg-white/[0.04] transition-colors cursor-pointer"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="mt-0.5 text-sm font-semibold text-zinc-500">{index + 1}.</span>
                                  <p className="text-sm font-medium leading-relaxed text-zinc-400 group-hover:text-zinc-100 transition-colors">
                                    {title}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {message.role === "assistant" &&
                        message.outputShape !== "coach_question" &&
                        message.draftArtifacts?.length ? (
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
                        message.outputShape !== "coach_question" &&
                        message.draft ? (() => {
                          const username = context?.creatorProfile?.identity?.username || "user";
                          const displayName = context?.creatorProfile?.identity?.displayName || username;
                          const isEditing = activeDraftEditor?.messageId === message.id;
                          return (
                            <div className="mt-4 border-t border-white/10 pt-4">
                              {/* X Post Card */}
                              <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
                                {/* Header: avatar + name + handle */}
                                <div className="flex items-start gap-3">
                                  <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-sm font-bold text-white uppercase">
                                    {displayName.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm font-bold text-white truncate">{displayName}</span>
                                      <svg viewBox="0 0 22 22" className="h-4 w-4 flex-shrink-0 text-blue-400" fill="currentColor">
                                        <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                                      </svg>
                                    </div>
                                    <span className="text-xs text-zinc-500">@{username}</span>
                                  </div>
                                </div>

                                {/* Post Content */}
                                <div className="mt-3">
                                  {isEditing ? (
                                    <textarea
                                      value={editorDraftText}
                                      onChange={(e) => setEditorDraftText(e.target.value)}
                                      className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[15px] leading-6 text-white outline-none focus:border-blue-500/40"
                                      rows={Math.max(6, (editorDraftText.match(/\n/g) || []).length + 3)}
                                    />
                                  ) : (
                                    <p className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100">
                                      {message.draft}
                                    </p>
                                  )}
                                </div>

                                {/* Timestamp */}
                                <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
                                  <span>Just now</span>
                                  <span>·</span>
                                  <span>{(isEditing ? editorDraftText : message.draft || "").split(/\s+/).filter(Boolean).length} words</span>
                                </div>

                                {/* Divider */}
                                <div className="mt-3 border-t border-white/[0.06]" />

                                {/* Action Buttons */}
                                <div className="mt-2 flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    {/* Edit / Save toggle */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isEditing) {
                                          setActiveDraftEditor(null);
                                        } else {
                                          setActiveDraftEditor({
                                            messageId: message.id,
                                            artifactIndex: 0,
                                          });
                                          setEditorDraftText(message.draft || "");
                                        }
                                      }}
                                      className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                                    >
                                      {isEditing ? "Done" : "Edit"}
                                    </button>
                                    {/* Copy */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const text = isEditing ? editorDraftText : (message.draft || "");
                                        void navigator.clipboard.writeText(text);
                                      }}
                                      className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                                    >
                                      Copy
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })() : null}

                      {message.role === "assistant" &&
                        message.supportAsset &&
                        !message.draftArtifacts?.length ? (
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Visual / Demo Ideas
                          </p>
                          <p className="mt-2 text-xs leading-6 text-zinc-300">
                            {message.supportAsset}
                          </p>
                        </div>
                      ) : null}

                      {showDevTools && message.role === "assistant" &&
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

                    </div>
                  ))}

                  {isSending ? <AssistantTypingBubble status={streamStatus} /> : null}
                </>
              )}
            </div>
          </section >

          <div className="shrink-0 border-t border-white/10 bg-black/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8">
              <form onSubmit={handleComposerSubmit}>
                <div className="relative flex w-full items-end overflow-hidden rounded-[1.5rem] bg-[#1a1a1f] p-2 shadow-[0_0_1px_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.5)] transition-all focus-within:ring-1 focus-within:ring-white/20">
                  <textarea
                    value={draftInput}
                    onChange={(event) => setDraftInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Send a message..."
                    disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                    className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 py-3 pb-12 text-[15px] leading-[22px] text-white outline-none placeholder:text-zinc-500 disabled:opacity-50 sm:pb-3 sm:pr-14"
                    rows={1}
                  />
                  <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4">
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
                      className="group flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-white/10"
                      aria-label="Send message"
                    >
                      {isSending ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-800" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="translate-x-[1px] translate-y-[-1px] transition-transform group-hover:translate-x-[2px] group-hover:translate-y-[-2px]">
                          <path d="M12 20L12 4M12 4L5 11M12 4L19 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div >
      </div >

      {
        selectedDraftArtifact ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-full border-l border-white/10 bg-black/95 backdrop-blur-xl sm:max-w-xl" >
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
                      Visual / Demo Ideas
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
        ) : activeDraftEditor && editorDraftText ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-full border-l border-white/10 bg-black/95 backdrop-blur-xl sm:max-w-xl" >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Post Draft
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    {editorDraftText.split(/\s+/).filter(Boolean).length} words · {editorDraftText.length} chars
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
              </div>

              <div className="border-t border-white/10 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Edit the draft, then copy it to post.
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
                  </div>
                </div>
              </div>
            </div>
          </aside>
        ) : null
      }

      {
        analysisOpen && context ? (
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
                          Pinned References
                        </p>
                        <p className="mt-2 text-sm text-zinc-300">
                          Pin up to 2 posts for voice and 2 for evidence. Voice pins shape tone and phrasing. Evidence pins shape facts, proof, and concrete grounding.
                        </p>
                      </div>
                      <div className="space-y-1 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        <p>{pinnedVoicePostIds.length} / 2 voice</p>
                        <p>{pinnedEvidencePostIds.length} / 2 evidence</p>
                      </div>
                    </div>

                    <ul className="mt-4 grid gap-3 md:grid-cols-2">
                      {pinnedReferenceCandidates.map((post) => {
                        const isVoicePinned = pinnedVoicePostIds.includes(post.id);
                        const isEvidencePinned = pinnedEvidencePostIds.includes(post.id);

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
                              <div className="flex shrink-0 flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => togglePinnedPostId(post.id, "voice")}
                                  className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${isVoicePinned
                                    ? "border-white/20 bg-white/[0.06] text-white"
                                    : "border-white/10 text-zinc-400 hover:bg-white/[0.04]"
                                    }`}
                                >
                                  {isVoicePinned ? "Voice Pinned" : "Pin Voice"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePinnedPostId(post.id, "evidence")}
                                  className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${isEvidencePinned
                                    ? "border-white/20 bg-white/[0.06] text-white"
                                    : "border-white/10 text-zinc-400 hover:bg-white/[0.04]"
                                    }`}
                                >
                                  {isEvidencePinned ? "Evidence Pinned" : "Pin Evidence"}
                                </button>
                              </div>
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
        ) : null
      }
    </main >
  );
}
