"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ChevronUp, Check, LogOut, Plus, MoreVertical, Trash2, Edit3 } from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
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
  XPublicProfile,
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

interface OnboardingPreviewSuccess {
  ok: true;
  account: string;
  preview: XPublicProfile | null;
}

interface OnboardingPreviewFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingPreviewResponse = OnboardingPreviewSuccess | OnboardingPreviewFailure;

interface OnboardingRunSuccess {
  ok: true;
  runId: string;
}

interface OnboardingRunFailure {
  ok: false;
  errors: ValidationError[];
}

type OnboardingRunResponse = OnboardingRunSuccess | OnboardingRunFailure;

const CHAT_ONBOARDING_LOADING_STEPS = [
  "collecting the account...",
  "reading how they write...",
  "mapping the growth signals...",
  "building the workspace...",
  "locking in the new profile...",
] as const;

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
    angles: unknown[];
    quickReplies?: ChatQuickReply[];
    plan?: {
      objective: string;
      angle: string;
      targetLane: "original" | "reply" | "quote";
      mustInclude: string[];
      mustAvoid: string[];
      hookType: string;
      pitchResponse: string;
    } | null;
    draft?: string | null;
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    draftVersions?: DraftVersionEntry[];
    activeDraftVersionId?: string;
    previousVersionSnapshot?: DraftVersionSnapshot | null;
    supportAsset: string | null;
    outputShape:
    | "coach_question"
    | "ideation_angles"
    | "planning_outline"
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
    newThreadId?: string;
    messageId?: string;
    threadTitle?: string;
    memory?: {
      conversationState: string;
      activeConstraints: string[];
      topicSummary: string | null;
      concreteAnswerCount: number;
      currentDraftArtifactId: string | null;
      rollingSummary?: string | null;
      pendingPlan?: {
        objective: string;
        angle: string;
        targetLane: "original" | "reply" | "quote";
        mustInclude: string[];
        mustAvoid: string[];
        hookType: string;
        pitchResponse: string;
      } | null;
      clarificationState?: {
        branchKey: string;
        stepKey: string;
        seedTopic: string | null;
      } | null;
      assistantTurnCount?: number;
      voiceFidelity?: "balanced";
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
type DraftVersionSource = "assistant_generated" | "assistant_revision" | "manual_save";

interface DraftVersionEntry {
  id: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  basedOnVersionId: string | null;
  weightedCharacterCount: number;
  maxCharacterLimit: number;
  supportAsset: string | null;
}

interface DraftVersionSnapshot {
  messageId: string;
  versionId: string;
  content: string;
  source: DraftVersionSource;
  createdAt: string;
  maxCharacterLimit?: number;
}

interface DraftDrawerSelection {
  messageId: string;
  versionId: string;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt?: string;
  excludeFromHistory?: boolean;
  quickReplies?: ChatQuickReply[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  angles?: any[];
  plan?: CreatorChatSuccess["data"]["plan"];
  draft?: string | null;
  drafts?: string[];
  draftArtifacts?: DraftArtifact[];
  draftVersions?: DraftVersionEntry[];
  activeDraftVersionId?: string;
  previousVersionSnapshot?: DraftVersionSnapshot | null;
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
type ChatIntent = "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review";
type ChatContentFocus =
  | "project_showcase"
  | "technical_insight"
  | "build_in_public"
  | "operator_lessons"
  | "social_observation";

interface ChatQuickReply {
  kind: "content_focus" | "example_reply" | "planner_action" | "clarification_choice";
  value: string;
  label: string;
  suggestedFocus?: ChatContentFocus;
  explicitIntent?: ChatIntent;
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
const HERO_QUICK_ACTIONS = [
  {
    label: "Give me post ideas",
    prompt: "Give me post ideas",
  },
  {
    label: "Draft a post for me",
    prompt: "Draft a post for me",
  },
  {
    label: "Give me a random post I would use",
    prompt: "Give me a random post I would use",
  },
] as const;
const HERO_EXIT_TRANSITION_MS = 720;

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

function normalizeAccountHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
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

function getComposerCharacterLimit(context: CreatorAgentContext | null): number {
  return getXCharacterLimitForAccount(Boolean(context?.creatorProfile.identity.isVerified));
}

function isClearlyCasualGreetingProfile(
  context: CreatorAgentContext | null,
  accountName: string | null,
): boolean {
  if (!context) {
    return false;
  }

  const profile = context.creatorProfile;
  const resolvedHandle = normalizeAccountHandle(
    accountName ?? profile.identity.username ?? context.account,
  );

  if (resolvedHandle === "shernanjavier") {
    return true;
  }

  const voiceSignals = [
    ...profile.voice.styleNotes,
    ...profile.styleCard.preferredOpeners,
    ...profile.styleCard.signaturePhrases,
  ]
    .join(" ")
    .toLowerCase();

  const hasFormalSignal =
    /\b(formal|professional|polished|executive|authoritative|analytical|structured)\b/.test(
      voiceSignals,
    );
  const hasCasualSignal =
    /\b(casual|playful|relaxed|direct|conversational|unfiltered|fun|raw|loose)\b/.test(
      voiceSignals,
    );
  const hasSlangSignal = /\b(yo|dawg|nah|yep|haha|lol|lmao)\b/.test(voiceSignals);
  const isLowercaseHeavy =
    profile.voice.primaryCasing === "lowercase" &&
    profile.voice.lowercaseSharePercent >= 82;
  const isShortFormLeaning =
    profile.voice.averageLengthBand === "short" ||
    profile.voice.averageLengthBand === "medium";

  if (hasFormalSignal) {
    return false;
  }

  return hasCasualSignal || hasSlangSignal || (isLowercaseHeavy && isShortFormLeaning);
}

function buildHeroGreeting(params: {
  context: CreatorAgentContext | null;
  accountName: string | null;
}): string {
  const resolvedHandle = normalizeAccountHandle(
    params.accountName ??
      params.context?.creatorProfile.identity.username ??
      params.context?.account ??
      "",
  );
  const opener = isClearlyCasualGreetingProfile(
    params.context,
    params.accountName,
  )
    ? "yo"
    : "Hey";

  return resolvedHandle ? `${opener} @${resolvedHandle}` : `${opener} there`;
}

function getXCharacterCounterMeta(text: string, maxCharacterLimit: number): {
  label: string;
  toneClassName: string;
} {
  const usedCharacterCount = computeXWeightedCharacterCount(text);
  const isNearLimit = usedCharacterCount >= Math.floor(maxCharacterLimit * 0.9);

  return {
    label: `${usedCharacterCount.toLocaleString()} / ${maxCharacterLimit.toLocaleString()} chars`,
    toneClassName: isNearLimit ? "text-red-400" : "text-zinc-500",
  };
}

function buildDraftVersionId(): string {
  return `draft-version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveDraftArtifactKind(
  outputShape?: CreatorChatSuccess["data"]["outputShape"],
): DraftArtifact["kind"] {
  switch (outputShape) {
    case "long_form_post":
    case "thread_seed":
    case "reply_candidate":
    case "quote_candidate":
    case "short_form_post":
      return outputShape;
    default:
      return "short_form_post";
  }
}

function getDraftVersionSupportAsset(message: ChatMessage): string | null {
  return message.supportAsset ?? message.draftArtifacts?.[0]?.supportAsset ?? null;
}

function buildDraftArtifactWithLimit(params: {
  id: string;
  title: string;
  kind: DraftArtifact["kind"];
  content: string;
  supportAsset: string | null;
  maxCharacterLimit: number;
}): DraftArtifact {
  const artifact = buildDraftArtifact({
    id: params.id,
    title: params.title,
    kind: params.kind,
    content: params.content,
    supportAsset: params.supportAsset,
  });

  if (artifact.maxCharacterLimit === params.maxCharacterLimit) {
    return artifact;
  }

  return {
    ...artifact,
    maxCharacterLimit: params.maxCharacterLimit,
    isWithinXLimit: artifact.weightedCharacterCount <= params.maxCharacterLimit,
  };
}

function normalizeDraftVersionBundle(
  message: ChatMessage,
  fallbackCharacterLimit: number,
): {
  versions: DraftVersionEntry[];
  activeVersionId: string;
  activeVersion: DraftVersionEntry;
  previousSnapshot: DraftVersionSnapshot | null;
} | null {
  const supportAsset = getDraftVersionSupportAsset(message);
  const rawVersions =
    message.draftVersions?.length
      ? message.draftVersions
      : (() => {
          const fallbackContent =
            message.draft ??
            message.drafts?.[0] ??
            message.draftArtifacts?.[0]?.content ??
            null;

          if (!fallbackContent) {
            return [];
          }

          return [
            {
              id: `${message.id}-v1`,
              content: fallbackContent,
              source: "assistant_generated" as const,
              createdAt: message.createdAt ?? new Date(0).toISOString(),
              basedOnVersionId: null,
              weightedCharacterCount: computeXWeightedCharacterCount(fallbackContent),
              maxCharacterLimit:
                message.draftArtifacts?.[0]?.maxCharacterLimit ?? fallbackCharacterLimit,
              supportAsset,
            },
          ];
        })();

  if (!rawVersions.length) {
    return null;
  }

  const versions = rawVersions.map((version) => {
    const content = typeof version.content === "string" ? version.content : "";
    const maxCharacterLimit =
      typeof version.maxCharacterLimit === "number" && version.maxCharacterLimit > 0
        ? version.maxCharacterLimit
        : fallbackCharacterLimit;

    return {
      id: version.id,
      content,
      source: version.source,
      createdAt: version.createdAt,
      basedOnVersionId: version.basedOnVersionId ?? null,
      weightedCharacterCount: computeXWeightedCharacterCount(content),
      maxCharacterLimit,
      supportAsset: version.supportAsset ?? supportAsset,
    };
  });

  const activeVersionId =
    message.activeDraftVersionId &&
    versions.some((version) => version.id === message.activeDraftVersionId)
      ? message.activeDraftVersionId
      : versions[versions.length - 1].id;
  const currentVersionIndex = Math.max(
    0,
    versions.findIndex((version) => version.id === activeVersionId),
  );
  const activeVersion = versions[currentVersionIndex];
  const inferredPreviousVersion =
    (activeVersion.basedOnVersionId
      ? versions.find((version) => version.id === activeVersion.basedOnVersionId) ?? null
      : null) ?? (currentVersionIndex > 0 ? versions[currentVersionIndex - 1] : null);
  const previousSnapshot = message.previousVersionSnapshot
    ? message.previousVersionSnapshot
    : inferredPreviousVersion
      ? {
          messageId: message.id,
          versionId: inferredPreviousVersion.id,
          content: inferredPreviousVersion.content,
          source: inferredPreviousVersion.source,
          createdAt: inferredPreviousVersion.createdAt,
        }
      : null;
  return {
    versions,
    activeVersionId,
    activeVersion,
    previousSnapshot,
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
  const { data: session, update: refreshSession } = useSession();
  const searchParams = useSearchParams();
  const params = useParams();
  const threadIdRaw = params?.threadId as string | string[] | undefined;

  const threadIdParam = (Array.isArray(threadIdRaw) ? threadIdRaw[0]?.trim() : threadIdRaw?.trim()) ?? searchParams.get("threadId")?.trim() ?? null;
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";

  const accountName = session?.user?.activeXHandle ?? null;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdParam);
  const [chatThreads, setChatThreads] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);

  // Sidebar Edit States
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [menuOpenThreadId, setMenuOpenThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [threadToDelete, setThreadToDelete] = useState<{ id: string, title: string } | null>(null);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountInput, setAddAccountInput] = useState("");
  const [addAccountPreview, setAddAccountPreview] = useState<XPublicProfile | null>(null);
  const [isAddAccountPreviewLoading, setIsAddAccountPreviewLoading] = useState(false);
  const [isAddAccountSubmitting, setIsAddAccountSubmitting] = useState(false);
  const [addAccountLoadingStepIndex, setAddAccountLoadingStepIndex] = useState(0);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [readyAccountHandle, setReadyAccountHandle] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const normalizedAddAccount = normalizeAccountHandle(addAccountInput);
  const hasValidAddAccountPreview =
    Boolean(addAccountPreview) &&
    normalizeAccountHandle(addAccountPreview?.username ?? "") === normalizedAddAccount;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenThreadId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isAddAccountSubmitting) {
      setAddAccountLoadingStepIndex(0);
      return;
    }

    setAddAccountLoadingStepIndex(0);
    const interval = window.setInterval(() => {
      setAddAccountLoadingStepIndex((current) =>
        Math.min(current + 1, CHAT_ONBOARDING_LOADING_STEPS.length - 1),
      );
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAddAccountSubmitting]);

  useEffect(() => {
    if (!isAddAccountModalOpen) {
      setAddAccountPreview(null);
      setIsAddAccountPreviewLoading(false);
      return;
    }

    const trimmed = addAccountInput.trim();
    if (!trimmed || trimmed.length < 2 || readyAccountHandle) {
      if (!readyAccountHandle) {
        setAddAccountPreview(null);
      }
      setIsAddAccountPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsAddAccountPreviewLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/onboarding/preview?account=${encodeURIComponent(trimmed)}`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        const text = await response.text();
        let data: OnboardingPreviewResponse | null = null;

        try {
          data = JSON.parse(text) as OnboardingPreviewResponse;
        } catch {
          data = null;
        }

        if (!response.ok || !data || !data.ok) {
          setAddAccountPreview(null);
          return;
        }

        setAddAccountPreview(data.preview);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setAddAccountPreview(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsAddAccountPreviewLoading(false);
        }
      }
    }, 650);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [addAccountInput, isAddAccountModalOpen, readyAccountHandle]);

  const handleRenameSubmit = async (threadId: string) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    const cleanTitle = editingTitle.trim();
    setChatThreads(current => current.map(t => t.id === threadId ? { ...t, title: cleanTitle } : t));
    setEditingThreadId(null);

    try {
      await fetch(`/api/creator/v2/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle })
      });
    } catch (e) {
      console.error("Failed to rename thread", e);
    }
  };

  const requestDeleteThread = (id: string, title: string) => {
    setThreadToDelete({ id, title });
    setMenuOpenThreadId(null);
  }

  const confirmDeleteThread = async () => {
    if (!threadToDelete) return;

    const deletingThread = threadToDelete;

    try {
      const response = await fetch(`/api/creator/v2/threads/${deletingThread.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || data?.data?.deleted !== true) {
        throw new Error("Failed to delete thread");
      }

      setChatThreads((current) => current.filter((thread) => thread.id !== deletingThread.id));

      if (activeThreadId === deletingThread.id) {
        setActiveThreadId(null);
        threadCreatedInSessionRef.current = false;
        setMessages([]);
        setDraftInput("");
        setConversationMemory(null);
        setActiveDraftEditor(null);
        setEditorDraftText("");
        setTypedAssistantLengths({});
        setErrorMessage(null);
        setIsLeavingHero(false);

        window.history.replaceState({}, "", "/chat");
      }
    } catch (e) {
      console.error("Failed to delete thread", e);
      setErrorMessage("Failed to delete the chat. Try again.");
    } finally {
      setThreadToDelete(null);
    }
  };

  // Guard against initializeThread re-fetching when we just created a thread in-session
  const threadCreatedInSessionRef = useRef(false);

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
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

  const syncThreadTitle = useCallback((threadId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return;
    }

    setChatThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
            ...thread,
            title: cleanTitle,
            updatedAt: new Date().toISOString(),
          }
          : thread,
      ),
    );
  }, []);

  const handleNewChat = useCallback(() => {
    if (!accountName) return;

    setActiveThreadId(null);
    threadCreatedInSessionRef.current = false;
    setMessages([]);
    setDraftInput("");
    setConversationMemory(null);
    setActiveDraftEditor(null);
    setEditorDraftText("");
    setTypedAssistantLengths({});
    setErrorMessage(null);
    setIsLeavingHero(false);

    window.history.pushState({}, '', '/chat');
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
  const [activeDraftEditor, setActiveDraftEditor] = useState<DraftDrawerSelection | null>(null);
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
  const composerCharacterLimit = useMemo(
    () => getComposerCharacterLimit(context),
    [context],
  );
  const isVerifiedAccount = Boolean(context?.creatorProfile?.identity?.isVerified);

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
    const normalizedHandle = normalizeAccountHandle(handle);
    if (!normalizedHandle || normalizedHandle === normalizeAccountHandle(accountName ?? "")) {
      return;
    }

    setAccountMenuOpen(false);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const resp = await fetch("/api/creator/profile/handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: normalizedHandle }),
      });
      if (!resp.ok) {
        throw new Error("Failed to switch handle");
      }

      await refreshSession({ activeXHandle: normalizedHandle });
      window.location.href = "/chat";
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not switch to account @" + normalizedHandle);
      setIsLoading(false);
    }
  }, [accountName, refreshSession]);

  const closeAddAccountModal = useCallback(() => {
    if (isAddAccountSubmitting) {
      return;
    }

    setIsAddAccountModalOpen(false);
    setAddAccountInput("");
    setAddAccountPreview(null);
    setAddAccountError(null);
    setReadyAccountHandle(null);
    setIsAddAccountPreviewLoading(false);
  }, [isAddAccountSubmitting]);

  const finalizeAddedAccount = useCallback(async () => {
    if (!readyAccountHandle) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await refreshSession();
      closeAddAccountModal();
      window.location.href = "/chat";
    } catch (error) {
      console.error(error);
      setErrorMessage(`Could not switch to @${readyAccountHandle}`);
      setIsLoading(false);
    }
  }, [closeAddAccountModal, readyAccountHandle, refreshSession]);

  const handleAddAccountSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readyAccountHandle) {
      await finalizeAddedAccount();
      return;
    }

    if (!normalizedAddAccount) {
      setAddAccountError("Enter an X username first.");
      return;
    }

    if (normalizedAddAccount === accountName) {
      setAddAccountError("That account is already active.");
      return;
    }

    if (isAddAccountPreviewLoading) {
      setAddAccountError("Wait for the profile preview to finish loading.");
      return;
    }

    if (!hasValidAddAccountPreview) {
      setAddAccountError("Enter an active X account that resolves in preview first.");
      return;
    }

    setIsAddAccountSubmitting(true);
    setAddAccountError(null);

    try {
      const startedAt = Date.now();
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: normalizedAddAccount,
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: { casing: "lowercase", risk: "safe" },
        }),
      });

      const data = (await response.json()) as OnboardingRunResponse;

      if (!response.ok || !data.ok) {
        throw new Error(
          data.ok ? "Failed to add account." : (data.errors[0]?.message ?? "Failed to add account."),
        );
      }

      const remainingDelay = Math.max(0, 2600 - (Date.now() - startedAt));
      if (remainingDelay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
      }

      setAvailableHandles((current) =>
        current.includes(normalizedAddAccount)
          ? current
          : [...current, normalizedAddAccount],
      );
      setReadyAccountHandle(normalizedAddAccount);
    } catch (error) {
      console.error(error);
      setAddAccountError(
        error instanceof Error ? error.message : "Failed to analyze account. Please try again.",
      );
    } finally {
      setIsAddAccountSubmitting(false);
    }
  }, [
    accountName,
    finalizeAddedAccount,
    hasValidAddAccountPreview,
    isAddAccountPreviewLoading,
    normalizedAddAccount,
    readyAccountHandle,
  ]);

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
    setIsLeavingHero(false);
  }, [accountName]);

  useEffect(() => {
    if (!isLeavingHero) {
      return;
    }

    if (messages.length > 0) {
      const timeoutId = window.setTimeout(() => {
        setIsLeavingHero(false);
      }, HERO_EXIT_TRANSITION_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [isLeavingHero, messages.length]);

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
            label: "New Chat",
            meta: "Active",
          },
        ],
      },
    ].filter((section) => section.items.length > 0);
  }, [context, contract, chatThreads, activeThreadId]);
  const selectedDraftMessage = useMemo(
    () =>
      activeDraftEditor
        ? messages.find((item) => item.id === activeDraftEditor.messageId) ?? null
        : null,
    [activeDraftEditor, messages],
  );
  const selectedDraftBundle = useMemo(
    () =>
      selectedDraftMessage
        ? normalizeDraftVersionBundle(selectedDraftMessage, composerCharacterLimit)
        : null,
    [composerCharacterLimit, selectedDraftMessage],
  );
  const selectedDraftVersion = useMemo(() => {
    if (!activeDraftEditor || !selectedDraftBundle) {
      return null;
    }

    return (
      selectedDraftBundle.versions.find(
        (version) => version.id === activeDraftEditor.versionId,
      ) ?? selectedDraftBundle.activeVersion
    );
  }, [activeDraftEditor, selectedDraftBundle]);
  const selectedDraftContext = useMemo(() => {
    if (!activeDraftEditor || !selectedDraftVersion) {
      return null;
    }

    return {
      messageId: activeDraftEditor.messageId,
      versionId: selectedDraftVersion.id,
      content: editorDraftText.trim() || selectedDraftVersion.content,
      source: selectedDraftVersion.source,
      createdAt: selectedDraftVersion.createdAt,
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
    };
  }, [activeDraftEditor, editorDraftText, selectedDraftVersion]);
  const selectedDraftVersionId = selectedDraftVersion?.id ?? null;
  const selectedDraftVersionContent = selectedDraftVersion?.content ?? "";

  const latestAssistantMessageId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.length > 0)
        ?.id ?? null,
    [messages],
  );

  useEffect(() => {
    if (!selectedDraftVersionId) {
      setEditorDraftText("");
      return;
    }

    setEditorDraftText(selectedDraftVersionContent);
  }, [
    activeDraftEditor?.messageId,
    activeDraftEditor?.versionId,
    selectedDraftVersionContent,
    selectedDraftVersionId,
  ]);

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

  const openDraftEditor = useCallback((messageId: string, versionId?: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!message) {
      return;
    }

    const bundle = normalizeDraftVersionBundle(message, composerCharacterLimit);
    if (!bundle) {
      return;
    }

    setActiveDraftEditor({
      messageId,
      versionId:
        versionId && bundle.versions.some((version) => version.id === versionId)
          ? versionId
          : bundle.activeVersionId,
    });
  }, [composerCharacterLimit, messages]);

  const saveDraftEditor = useCallback(async () => {
    if (!activeDraftEditor || !selectedDraftMessage || !selectedDraftVersion) {
      return;
    }

    const nextContent = editorDraftText.trim();
    if (!nextContent) {
      return;
    }

    if (nextContent === selectedDraftVersion.content.trim()) {
      return;
    }

    const nextVersion: DraftVersionEntry = {
      id: buildDraftVersionId(),
      content: nextContent,
      source: "manual_save",
      createdAt: new Date().toISOString(),
      basedOnVersionId: selectedDraftVersion.id,
      weightedCharacterCount: computeXWeightedCharacterCount(nextContent),
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
      supportAsset:
        selectedDraftVersion.supportAsset ?? getDraftVersionSupportAsset(selectedDraftMessage),
    };
    const baseVersions = selectedDraftBundle?.versions ?? [selectedDraftVersion];
    const nextVersions = [...baseVersions, nextVersion];
    const sourceArtifact = selectedDraftMessage.draftArtifacts?.[0];
    const activeDraftArtifact = buildDraftArtifactWithLimit({
      id: sourceArtifact?.id ?? `${selectedDraftMessage.id}-${nextVersion.id}`,
      title: sourceArtifact?.title ?? "Draft",
      kind: sourceArtifact?.kind ?? resolveDraftArtifactKind(selectedDraftMessage.outputShape),
      content: nextContent,
      supportAsset: nextVersion.supportAsset,
      maxCharacterLimit: nextVersion.maxCharacterLimit,
    });

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== activeDraftEditor.messageId) {
          return message;
        }

        return {
          ...message,
          draft: nextContent,
          drafts:
            message.drafts && message.drafts.length > 1
              ? [nextContent, ...message.drafts.slice(1)]
              : [nextContent],
          draftArtifacts:
            message.draftArtifacts && message.draftArtifacts.length > 1
              ? [activeDraftArtifact, ...message.draftArtifacts.slice(1)]
              : [activeDraftArtifact],
          draftVersions: nextVersions,
          activeDraftVersionId: nextVersion.id,
        };
      }),
    );
    setActiveDraftEditor({
      messageId: activeDraftEditor.messageId,
      versionId: nextVersion.id,
    });

    if (!activeThreadId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(activeDraftEditor.messageId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftVersions: nextVersions,
            activeDraftVersionId: nextVersion.id,
            draft: nextContent,
            drafts:
              selectedDraftMessage.drafts && selectedDraftMessage.drafts.length > 1
                ? [nextContent, ...selectedDraftMessage.drafts.slice(1)]
                : [nextContent],
            draftArtifacts:
              selectedDraftMessage.draftArtifacts && selectedDraftMessage.draftArtifacts.length > 1
                ? [activeDraftArtifact, ...selectedDraftMessage.draftArtifacts.slice(1)]
                : [activeDraftArtifact],
          }),
        },
      );
      if (!response.ok) {
        throw new Error("persist failed");
      }
    } catch {
      setErrorMessage("The draft saved locally, but it could not be persisted yet.");
    }
  }, [
    activeDraftEditor,
    activeThreadId,
    editorDraftText,
    selectedDraftBundle,
    selectedDraftMessage,
    selectedDraftVersion,
  ]);

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
      selectedDraftContextOverride?: DraftVersionSnapshot | null;
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
      const effectiveSelectedDraftContext =
        options.selectedDraftContextOverride !== undefined
          ? options.selectedDraftContextOverride
          : selectedDraftContext &&
              !options.selectedAngle &&
              (!resolvedIntent || resolvedIntent === "draft" || resolvedIntent === "review")
            ? selectedDraftContext
            : null;
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
            ...(effectiveSelectedDraftContext
              ? { selectedDraftContext: effectiveSelectedDraftContext }
              : {}),
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
              id: data.data.messageId ?? `assistant-${Date.now() + 1}`,
              role: "assistant",
              content: data.data.reply,
              createdAt: new Date().toISOString(),
              angles: data.data.angles,
              plan: data.data.plan ?? null,
              draft: data.data.draft || null,
              drafts: data.data.drafts,
              draftArtifacts: data.data.draftArtifacts,
              draftVersions: data.data.draftVersions,
              activeDraftVersionId: data.data.activeDraftVersionId,
              previousVersionSnapshot: data.data.previousVersionSnapshot ?? null,
              supportAsset: data.data.supportAsset,
              outputShape: data.data.outputShape,
              whyThisWorks: data.data.whyThisWorks,
              watchOutFor: data.data.watchOutFor,
              debug: data.data.debug,
              source: data.data.source,
              model: data.data.model ?? null,
              quickReplies:
                data.data.quickReplies && data.data.quickReplies.length > 0
                  ? data.data.quickReplies
                  : current.length === 0 &&
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

          if (
            effectiveSelectedDraftContext &&
            data.data.messageId &&
            data.data.activeDraftVersionId &&
            data.data.draft
          ) {
            setActiveDraftEditor({
              messageId: data.data.messageId,
              versionId: data.data.activeDraftVersionId,
            });
          }

          // Store returned memory blob
          if (data.data.memory) {
            setConversationMemory(data.data.memory);
          }

          const responseThreadId = data.data.newThreadId ?? activeThreadId;
          if (responseThreadId && data.data.threadTitle) {
            syncThreadTitle(responseThreadId, data.data.threadTitle);
          }

          // Re-map the newly created backend thread if we just instantiated it
          if (data.data.newThreadId) {
            const newId = data.data.newThreadId as string;
            setActiveThreadId(newId);
            threadCreatedInSessionRef.current = true;
            window.history.replaceState({}, '', `/chat/${newId}`);
            setChatThreads((current) => {
              // If the thread is already in the list (remapping), update it
              const exists = current.some(t => t.id === "current-workspace" || t.id === activeThreadId);
              if (exists) {
                return current.map(t =>
                  t.id === "current-workspace" || t.id === activeThreadId
                    ? { ...t, id: newId }
                    : t
                );
              }
              // Otherwise, insert the new thread at the top
              const newTitle = data.data.threadTitle?.trim() || "New Chat";
              return [
                { id: newId, title: newTitle, xHandle: accountName || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                ...current
              ];
            });
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
            id: streamedResult.messageId ?? `assistant-${Date.now() + 1}`,
            role: "assistant",
            content: streamedResult.reply,
            createdAt: new Date().toISOString(),
            angles: streamedResult.angles,
            plan: streamedResult.plan ?? null,
            draft: streamedResult.draft || null,
            drafts: streamedResult.drafts,
            draftArtifacts: streamedResult.draftArtifacts,
            draftVersions: streamedResult.draftVersions,
            activeDraftVersionId: streamedResult.activeDraftVersionId,
            previousVersionSnapshot: streamedResult.previousVersionSnapshot ?? null,
            supportAsset: streamedResult.supportAsset,
            outputShape: streamedResult.outputShape,
            whyThisWorks: streamedResult.whyThisWorks,
            watchOutFor: streamedResult.watchOutFor,
            debug: streamedResult.debug,
            source: streamedResult.source,
            model: streamedResult.model ?? null,
            quickReplies:
              streamedResult.quickReplies && streamedResult.quickReplies.length > 0
                ? streamedResult.quickReplies
                : current.length === 0 &&
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

        if (
          effectiveSelectedDraftContext &&
          streamedResult.messageId &&
          streamedResult.activeDraftVersionId &&
          streamedResult.draft
        ) {
          setActiveDraftEditor({
            messageId: streamedResult.messageId,
            versionId: streamedResult.activeDraftVersionId,
          });
        }

        // Store returned memory blob from stream
        if (streamedResult.memory) {
          setConversationMemory(streamedResult.memory);
        }

        const responseThreadId = streamedResult.newThreadId ?? activeThreadId;
        if (responseThreadId && streamedResult.threadTitle) {
          syncThreadTitle(responseThreadId, streamedResult.threadTitle);
        }

        // Re-map the newly created backend thread if we just instantiated it
        if (streamedResult.newThreadId) {
          const generatedId = streamedResult.newThreadId;
          setActiveThreadId(generatedId);
          threadCreatedInSessionRef.current = true;
          window.history.replaceState({}, '', `/chat/${generatedId}`);
          setChatThreads((current) => {
            const exists = current.some(t => t.id === "current-workspace" || t.id === activeThreadId);
            if (exists) {
              return current.map(t =>
                t.id === "current-workspace" || t.id === activeThreadId
                  ? { ...t, id: generatedId }
                  : t
              );
            }
            const newTitle = streamedResult.threadTitle?.trim() || "New Chat";
            return [
              { id: generatedId, title: newTitle, xHandle: accountName || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              ...current
            ];
          });
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
      selectedDraftContext,
      accountName,
      activeThreadId,
      syncThreadTitle,
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
        // Skip re-fetch if this thread was just created in the current session
        if (threadCreatedInSessionRef.current) {
          return;
        }
        try {
          const res = await fetch(`/api/creator/v2/threads/${activeThreadId}`);
          const data = await res.json();
          if (data.ok && data.data?.messages?.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedMessages: ChatMessage[] = data.data.messages.map((m: any) => ({
              id: m.id,
              role: m.role as "assistant" | "user",
              content: m.content,
              createdAt: typeof m.createdAt === "string" ? m.createdAt : undefined,
              ...(m.data || {}),
            }));
            setMessages(mappedMessages);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch historical messages", e);
        }
      }

    }

    void initializeThread();
  }, [
    accountName,
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
    async (quickReply: ChatQuickReply) => {
      if (isSending) {
        return;
      }

      if (quickReply.kind === "content_focus") {
        setActiveContentFocus(quickReply.value as ChatContentFocus);
        setDraftInput(`i want to focus on ${quickReply.label.toLowerCase()}`);
        setErrorMessage(null);
        return;
      }

      if (quickReply.explicitIntent) {
        if (!activeStrategyInputs || !activeToneInputs) {
          setErrorMessage("The planning model is still loading.");
          return;
        }

        await requestAssistantReply({
          prompt: quickReply.value,
          displayUserMessage: quickReply.label,
          appendUserMessage: true,
          intent: quickReply.explicitIntent,
          strategyInputOverride: activeStrategyInputs,
          toneInputOverride: activeToneInputs,
          contentFocusOverride: activeContentFocus,
        });
        return;
      }

      if (quickReply.suggestedFocus) {
        setActiveContentFocus(quickReply.suggestedFocus);
      }

      setDraftInput(quickReply.value);
      setErrorMessage(null);
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      isSending,
      requestAssistantReply,
    ],
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

    const shouldAnimateHeroExit = !activeThreadId && messages.length === 0;

    if (shouldAnimateHeroExit) {
      setIsLeavingHero(true);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, HERO_EXIT_TRANSITION_MS);
      });
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

  const submitQuickStarter = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || !context || !contract || isSending) {
        return;
      }

      if (!activeStrategyInputs || !activeToneInputs) {
        setErrorMessage("The planning model is still loading.");
        return;
      }

      const shouldAnimateHeroExit = !activeThreadId && messages.length === 0;

      if (shouldAnimateHeroExit) {
        setIsLeavingHero(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, HERO_EXIT_TRANSITION_MS);
        });
      }

      setDraftInput("");

      await requestAssistantReply({
        prompt: trimmedPrompt,
        appendUserMessage: true,
        strategyInputOverride: activeStrategyInputs,
        toneInputOverride: activeToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    },
    [
      activeContentFocus,
      activeThreadId,
      activeStrategyInputs,
      activeToneInputs,
      contract,
      context,
      isSending,
      messages.length,
      requestAssistantReply,
    ],
  );

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

  const isNewChatHero =
    !activeThreadId && messages.length === 0 && Boolean(context) && !isLeavingHero;
  const heroGreeting = buildHeroGreeting({
    context,
    accountName,
  });
  const heroIdentityLabel =
    context?.creatorProfile.identity.displayName ??
    context?.creatorProfile.identity.username ??
    accountName ??
    context?.account ??
    "X";
  const heroInitials = heroIdentityLabel
    .replace(/^@+/, "")
    .slice(0, 2)
    .toUpperCase();
  const shouldCenterHero = isNewChatHero || isLeavingHero;
  const composerChromeClassName =
    "relative flex w-full items-end overflow-hidden border border-white/10 bg-white/[0.06] backdrop-blur-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 ease-out focus-within:border-white/15 focus-within:ring-1 focus-within:ring-white/15";
  const heroInlineComposerSurfaceClassName =
    `${composerChromeClassName} rounded-[1.4rem] p-1.5 sm:p-2`;
  const dockComposerSurfaceClassName =
    `${composerChromeClassName} rounded-[1.12rem] p-1.5 sm:p-2`;
  const heroProfileMotionClassName = `flex flex-col items-center gap-4 transition-all duration-500 ease-out ${isLeavingHero
    ? "-translate-y-8 scale-[0.97] opacity-0 blur-[2px]"
    : "translate-y-0 scale-100 opacity-100 blur-0"
    }`;
  const heroChipsMotionClassName = `flex flex-wrap items-center justify-center gap-2.5 transition-all duration-300 ease-out ${isLeavingHero
    ? "-translate-y-4 opacity-0 blur-[2px]"
    : "translate-y-0 opacity-100 blur-0"
    }`;
  const dockComposerWrapperClassName = `absolute inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)] transition-all duration-[720ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isNewChatHero
    ? "pointer-events-none opacity-0 -translate-y-[14.5rem] sm:-translate-y-[17rem]"
    : "pointer-events-auto opacity-100 translate-y-0"
    }`;
  const isInlineDraftEditorOpen = Boolean(
    selectedDraftVersion && selectedDraftBundle,
  );
  const chatCanvasClassName = `relative mx-auto flex min-h-full w-full flex-col gap-6 px-4 pb-32 pt-8 sm:px-6 sm:pb-24 ${shouldCenterHero ? "justify-center" : ""
    } ${isInlineDraftEditorOpen ? "max-w-[92rem] lg:pr-[31rem]" : "max-w-4xl"}`;

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
                      <div
                        key={item.id}
                        className="relative"
                        onMouseEnter={() => setHoveredThreadId(item.id)}
                        onMouseLeave={() => setHoveredThreadId(null)}
                      >
                        {editingThreadId === item.id ? (
                          <div className={`flex w-full items-center rounded-2xl px-2 py-2 ${activeThreadId === item.id ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}`}>
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSubmit(item.id);
                                if (e.key === "Escape") setEditingThreadId(null);
                              }}
                              onBlur={() => handleRenameSubmit(item.id)}
                              className="w-full bg-transparent text-sm leading-6 text-zinc-200 outline-none"
                            />
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (section.section === "Chats" && item.id !== "current-workspace") {
                                setActiveThreadId(item.id);
                                window.history.pushState({}, '', `/chat/${item.id}`);
                              }
                            }}
                            className={`group block w-full rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03] ${activeThreadId === item.id ? "bg-white/[0.04]" : ""}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 pr-4">
                                <span className="line-clamp-2 text-sm leading-6 text-zinc-200">
                                  {item.label}
                                </span>
                                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                  {item.meta}
                                </span>
                              </div>

                              {section.section === "Chats" && item.id !== "current-workspace" && (hoveredThreadId === item.id || menuOpenThreadId === item.id) && (
                                <div className="relative flex-shrink-0 pt-1" ref={menuOpenThreadId === item.id ? menuRef : null}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuOpenThreadId(menuOpenThreadId === item.id ? null : item.id);
                                    }}
                                    className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>

                                  {menuOpenThreadId === item.id && (
                                    <div className="absolute right-0 top-full mt-1 z-50 w-32 rounded-lg border border-white/10 bg-zinc-900 p-1 shadow-xl">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTitle(item.label);
                                          setEditingThreadId(item.id);
                                          setMenuOpenThreadId(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                                      >
                                        <Edit3 className="h-3 w-3" />
                                        Rename
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          requestDeleteThread(item.id, item.label);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
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
                        window.history.pushState({}, '', `/chat/${item.id}`);
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
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setIsAddAccountModalOpen(true);
                          setAddAccountError(null);
                          setReadyAccountHandle(null);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Account</span>
                      </button>
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

        <div className="relative flex h-full min-h-0 flex-1 flex-col">
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
            <div className={chatCanvasClassName}>
              {isLoading && !context && !contract ? (
                <div className="text-sm text-zinc-400">Loading the agent context...</div>
              ) : (
                <>
                  {errorMessage ? (
                    <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  {isNewChatHero || isLeavingHero ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-10 py-10 text-center">
                      <div className="w-full max-w-xl">
                        <div className={heroProfileMotionClassName}>
                          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-[0_14px_42px_rgba(0,0,0,0.32)] sm:h-24 sm:w-24">
                            {context?.avatarUrl ? (
                              <div
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${context.avatarUrl})` }}
                                role="img"
                                aria-label={`${heroIdentityLabel} profile photo`}
                              />
                            ) : (
                              <span className="text-2xl font-semibold text-white">{heroInitials}</span>
                            )}
                          </div>

                          <div className="flex items-center justify-center gap-2">
                            <p className="text-xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
                              {heroGreeting}
                            </p>
                            {isVerifiedAccount ? (
                              <Image
                                src="/x-verified.svg"
                                alt="Verified account"
                                width={18}
                                height={18}
                                className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                              />
                            ) : null}
                          </div>
                        </div>

                        {isNewChatHero ? (
                          <form onSubmit={handleComposerSubmit} className="mt-3">
                            <div className={heroInlineComposerSurfaceClassName}>
                              <textarea
                                value={draftInput}
                                onChange={(event) => setDraftInput(event.target.value)}
                                onKeyDown={handleComposerKeyDown}
                                placeholder="What are we creating today?"
                                disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                                className="max-h-[180px] min-h-[44px] w-full resize-none bg-transparent px-4 py-3 pb-10 text-[14px] leading-5 text-white outline-none placeholder:text-zinc-400 disabled:opacity-50 sm:pr-14"
                                rows={1}
                              />
                              <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3">
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
                                  className="group flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-white/10 sm:h-9 sm:w-9"
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
                        ) : null}

                        <div className={`${heroChipsMotionClassName} mt-4`}>
                            {HERO_QUICK_ACTIONS.map((action) => (
                              <button
                                key={action.prompt}
                                type="button"
                                onClick={() => {
                                  void submitQuickStarter(action.prompt);
                                }}
                                disabled={isSending || !activeStrategyInputs || !activeToneInputs}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 sm:px-3.5 sm:text-[13px]"
                              >
                                {action.label}
                              </button>
                            ))}
	                        </div>
	                    </div>
	                  </div>
	                  ) : (
                    <>
                      {messages.map((message, index) => (
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

                          {message.role === "assistant" &&
                            message.quickReplies?.length &&
                            index === messages.length - 1 ? (
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
                            message.outputShape !== "short_form_post" &&
                            message.draftArtifacts?.length ? (
                            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                              {message.draftArtifacts.map((artifact, index) => {
                                const artifactVersionId =
                                  normalizeDraftVersionBundle(
                                    message,
                                    composerCharacterLimit,
                                  )?.versions[index]?.id;

                                return (
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
                                      onClick={() =>
                                        openDraftEditor(message.id, artifactVersionId)
                                      }
                                      className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap leading-7 text-zinc-100">
                                    {artifact.content}
                                  </p>
                                </div>
                                );
                              })}
                            </div>
                          ) : null}

                          {message.plan ? (
                            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.02] p-4 text-left">
                              <div className="mb-3 flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] text-blue-400">
                                  S
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                                  Strategy Outline
                                </span>
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Objective</span>
                                  <p className="mt-0.5 text-[14px] leading-snug text-zinc-300">{message.plan.objective}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Angle</span>
                                  <p className="mt-0.5 text-[15px] font-medium leading-snug text-white">{message.plan.angle}</p>
                                </div>
                                <div className="flex gap-6">
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">Lane</span>
                                    <p className="mt-0.5 text-[13px] text-zinc-400 capitalize">{message.plan.targetLane}</p>
                                  </div>
                                  {message.plan.hookType && (
                                    <div>
                                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">Hook Trigger</span>
                                      <p className="mt-0.5 text-[13px] text-zinc-400">{message.plan.hookType}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            message.outputShape !== "coach_question" &&
                            message.draft ? (() => {
                              const username = context?.creatorProfile?.identity?.username || "user";
                              const displayName = context?.creatorProfile?.identity?.displayName || username;
                              const avatarUrl = context?.avatarUrl || null;
                              const draftBundle = normalizeDraftVersionBundle(
                                message,
                                composerCharacterLimit,
                              );
                              const previewDraft =
                                draftBundle?.activeVersion.content ?? message.draft ?? "";
                              const draftCounter = getXCharacterCounterMeta(
                                previewDraft,
                                draftBundle?.activeVersion.maxCharacterLimit ?? composerCharacterLimit,
                              );
                              return (
                                <div className="mt-4 border-t border-white/10 pt-4">
                                  {/* X Post Card */}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openDraftEditor(message.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        openDraftEditor(message.id);
                                      }
                                    }}
                                    className="rounded-2xl border border-white/[0.08] bg-[#000000] p-4 transition hover:border-white/15 hover:bg-[#0F0F0F] cursor-pointer"
                                  >
                                    {/* Header: avatar + name + handle */}
                                    <div className="flex items-start gap-3">
                                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                                        {avatarUrl ? (
                                          <div
                                            className="h-full w-full bg-cover bg-center"
                                            style={{ backgroundImage: `url(${avatarUrl})` }}
                                            role="img"
                                            aria-label={`${displayName} profile photo`}
                                          />
                                        ) : (
                                          displayName.charAt(0)
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                          <span className="text-sm font-bold text-white truncate">{displayName}</span>
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
                                        <span className="text-xs text-zinc-500">@{username}</span>
                                      </div>
                                    </div>

                                    {/* Post Content */}
                                    <div className="mt-3">
                                      <p className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100">
                                        {previewDraft}
                                      </p>
                                    </div>

                                    {/* Timestamp */}
                                    <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
                                      <span>Just now</span>
                                      <span>·</span>
                                      <span className={draftCounter.toneClassName}>{draftCounter.label}</span>
                                    </div>

                                    {/* Divider */}
                                    <div className="mt-3 border-t border-white/[0.06]" />

                                    {/* Action Buttons */}
                                    <div className="mt-2 flex items-center justify-between">
                                      <div className="flex items-center gap-1">
                                        {/* Edit / Save toggle */}
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openDraftEditor(message.id);
                                          }}
                                          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                                        >
                                          Edit
                                        </button>
                                        {/* Copy */}
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void navigator.clipboard.writeText(previewDraft);
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

                </>
              )}
            </div>
          </section >

          <div className={dockComposerWrapperClassName}>
            <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8">
              <form onSubmit={handleComposerSubmit}>
                <div className={dockComposerSurfaceClassName}>
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
        selectedDraftVersion && selectedDraftBundle ? (
          <>
            <div className="pointer-events-none fixed inset-0 z-20 hidden lg:block">
              <div className="mx-auto flex h-full w-full max-w-[92rem] justify-end px-6 pb-32 pt-24">
                <div className="pointer-events-auto flex w-[28rem] max-w-[28rem] flex-col overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                  <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                        {context?.avatarUrl ? (
                          <div
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${context.avatarUrl})` }}
                            role="img"
                            aria-label={`${heroIdentityLabel} profile photo`}
                          />
                        ) : (
                          heroInitials.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[15px] font-semibold text-white">
                            {context?.creatorProfile.identity.displayName ??
                              context?.creatorProfile.identity.username ??
                              accountName ??
                              "You"}
                          </p>
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
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">
                          @{context?.creatorProfile.identity.username ?? accountName ?? "x"}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-zinc-500">
                          Version {selectedDraftBundle.versions.findIndex(
                            (version) => version.id === selectedDraftVersion.id,
                          ) + 1}
                          {" "}of {selectedDraftBundle.versions.length} · {computeXWeightedCharacterCount(
                            editorDraftText,
                          )}/{selectedDraftVersion.maxCharacterLimit}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveDraftEditor(null)}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                      aria-label="Close draft editor"
                    >
                      ×
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 pb-5">
                    <div className="p-0">
                      <textarea
                        value={editorDraftText}
                        onChange={(event) => setEditorDraftText(event.target.value)}
                        className="min-h-[19rem] w-full resize-none bg-transparent text-[16px] leading-8 text-white outline-none placeholder:text-zinc-600"
                        placeholder="Draft content"
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-500">
                        {computeXWeightedCharacterCount(editorDraftText) <=
                        selectedDraftVersion.maxCharacterLimit
                          ? "Ready to revise or save."
                          : "This version is over the X limit."}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void copyDraftEditor();
                          }}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void saveDraftEditor();
                          }}
                          className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-200"
                        >
                          Save As New Version
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="fixed inset-x-4 bottom-20 top-20 z-20 lg:hidden sm:inset-x-6 sm:bottom-16 sm:top-16 md:left-auto md:right-6 md:top-24 md:bottom-24 md:w-[26rem] md:max-w-[calc(100vw-3rem)]">
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                      {context?.avatarUrl ? (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${context.avatarUrl})` }}
                          role="img"
                          aria-label={`${heroIdentityLabel} profile photo`}
                        />
                      ) : (
                        heroInitials.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-white">
                          {context?.creatorProfile.identity.displayName ??
                            context?.creatorProfile.identity.username ??
                            accountName ??
                            "You"}
                        </p>
                        {isVerifiedAccount ? (
                          <Image
                            src="/x-verified.svg"
                            alt="Verified account"
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        @{context?.creatorProfile.identity.username ?? accountName ?? "x"}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Version {selectedDraftBundle.versions.findIndex(
                          (version) => version.id === selectedDraftVersion.id,
                        ) + 1}
                        {" "}of {selectedDraftBundle.versions.length} · {computeXWeightedCharacterCount(
                          editorDraftText,
                        )}/{selectedDraftVersion.maxCharacterLimit}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDraftEditor(null)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                    aria-label="Close draft editor"
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <div className="p-0">
                    <textarea
                      value={editorDraftText}
                      onChange={(event) => setEditorDraftText(event.target.value)}
                      className="min-h-[15rem] w-full resize-none bg-transparent text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600"
                      placeholder="Draft content"
                    />
                  </div>
                </div>

                <div className="border-t border-white/10 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">
                      {computeXWeightedCharacterCount(editorDraftText)}/{selectedDraftVersion.maxCharacterLimit}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void copyDraftEditor();
                        }}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void saveDraftEditor();
                        }}
                        className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-200"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
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

      {isAddAccountModalOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAddAccountModal();
            }
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950 shadow-2xl animate-in fade-in zoom-in-95 duration-300"
            onClick={(event) => event.stopPropagation()}
          >
            {isAddAccountSubmitting ? (
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col items-center text-center">
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-white/10" />
                    <div className="absolute inset-2 rounded-full border border-white/15 animate-ping" />
                    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white">
                      {addAccountPreview?.avatarUrl ? (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${addAccountPreview.avatarUrl})` }}
                          role="img"
                          aria-label={`${addAccountPreview.name} profile photo`}
                        />
                      ) : (
                        (addAccountPreview?.name?.slice(0, 2) || normalizedAddAccount.slice(0, 2) || "X").toUpperCase()
                      )}
                    </div>
                  </div>

                  <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Mapping Account
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    @{normalizedAddAccount}
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {CHAT_ONBOARDING_LOADING_STEPS[addAccountLoadingStepIndex]}
                  </p>

                  <div className="mt-6 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-[1200ms] ease-linear"
                      style={{
                        width: `${((addAccountLoadingStepIndex + 1) / CHAT_ONBOARDING_LOADING_STEPS.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddAccountSubmit} className="px-6 py-6 sm:px-8 sm:py-7">
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
                  <button
                    type="button"
                    onClick={closeAddAccountModal}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <span className="mr-2 text-lg font-medium text-zinc-600">@</span>
                    <input
                      value={addAccountInput}
                      onChange={(event) => {
                        if (readyAccountHandle) {
                          return;
                        }
                        setAddAccountInput(event.target.value);
                        setAddAccountError(null);
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
                      isAddAccountSubmitting ||
                      (!readyAccountHandle &&
                        (!hasValidAddAccountPreview || isAddAccountPreviewLoading || !normalizedAddAccount))
                    }
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {readyAccountHandle
                      ? `Continue as @${readyAccountHandle}`
                      : "Analyze Account"}
                  </button>
                </div>

                {addAccountError ? (
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-rose-400">
                    {addAccountError}
                  </p>
                ) : readyAccountHandle ? (
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
                    all set. the profile is ready to switch into.
                  </p>
                ) : null}

                <div className="mt-5 min-h-[112px]">
                  {isAddAccountPreviewLoading ? (
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        Loading Preview
                      </p>
                    </div>
                  ) : addAccountPreview ? (
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white">
                          {addAccountPreview.avatarUrl ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${addAccountPreview.avatarUrl})` }}
                              role="img"
                              aria-label={`${addAccountPreview.name} profile photo`}
                            />
                          ) : (
                            addAccountPreview.name.slice(0, 2).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-base font-semibold text-white">
                              {addAccountPreview.name}
                            </p>
                            {addAccountPreview.isVerified ? (
                              <Image
                                src="/x-verified.svg"
                                alt="Verified account"
                                width={16}
                                height={16}
                                className="h-4 w-4 shrink-0"
                              />
                            ) : null}
                          </div>
                          <p className="truncate text-sm text-zinc-500">
                            @{addAccountPreview.username}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">
                            {new Intl.NumberFormat("en-US", {
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(addAccountPreview.followersCount)}
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Followers
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : normalizedAddAccount ? (
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
      )}

      {threadToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Delete chat?</h3>
              <p className="text-sm text-zinc-400">
                This will delete <strong className="text-zinc-200">&quot;{threadToDelete.title}&quot;</strong>.
              </p>
            </div>
            <div className="flex gap-2 border-t border-white/10 bg-zinc-900/50 p-4 justify-end">
              <button
                type="button"
                onClick={() => setThreadToDelete(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteThread}
                className="rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500 flex items-center gap-2 hover:text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main >
  );
}
