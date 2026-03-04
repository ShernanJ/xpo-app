"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useSearchParams, useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ArrowUpRight, Ban, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Check, Copy, Edit3, List, LogOut, MoreVertical, Plus, Settings2, Smile, Trash2, Type } from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  buildDraftArtifact,
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import {
  buildDraftReviewFailureLabel,
  buildDraftReviewLoadingLabel,
  buildDraftReviewPrompt,
} from "@/lib/agent-v2/orchestrator/assistantReplyStyle";
import { buildPreferenceConstraintsFromPreferences } from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import type { UserPreferences } from "@/lib/agent-v2/core/styleProfile";
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

interface DraftInspectorSuccess {
  ok: true;
  data: {
    summary: string;
    prompt: string;
    userMessageId: string;
    assistantMessageId: string;
  };
}

interface DraftInspectorFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftInspectorResponse = DraftInspectorSuccess | DraftInspectorFailure;

interface DraftPromotionSuccess {
  ok: true;
  data: {
    userMessage: {
      id: string;
      role: "user";
      content: string;
      createdAt: string;
    };
    assistantMessage: {
      id: string;
      role: "assistant";
      content: string;
      createdAt: string;
      draft: string;
      drafts: string[];
      draftArtifacts: DraftArtifact[];
      draftVersions: DraftVersionEntry[];
      activeDraftVersionId: string;
      previousVersionSnapshot: DraftVersionSnapshot | null;
      revisionChainId?: string;
      supportAsset: string | null;
      outputShape: CreatorChatSuccess["data"]["outputShape"];
      source: "deterministic";
      model: string | null;
    };
  };
}

interface DraftPromotionFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftPromotionResponse = DraftPromotionSuccess | DraftPromotionFailure;

interface PreferencesSuccess {
  ok: true;
  data: {
    preferences: UserPreferences;
  };
}

interface PreferencesFailure {
  ok: false;
  errors: ValidationError[];
}

type PreferencesResponse = PreferencesSuccess | PreferencesFailure;

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
      formatPreference?: "shortform" | "longform";
    } | null;
    draft?: string | null;
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    draftVersions?: DraftVersionEntry[];
    activeDraftVersionId?: string;
    previousVersionSnapshot?: DraftVersionSnapshot | null;
    revisionChainId?: string;
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
        formatPreference?: "shortform" | "longform";
      } | null;
      clarificationState?: {
        branchKey: string;
        stepKey: string;
        seedTopic: string | null;
      } | null;
      assistantTurnCount?: number;
      formatPreference?: "shortform" | "longform" | null;
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
  revisionChainId?: string;
}

interface DraftDrawerSelection {
  messageId: string;
  versionId: string;
  revisionChainId?: string;
}

interface DraftTimelineEntry {
  messageId: string;
  versionId: string;
  content: string;
  createdAt: string;
  source: DraftVersionSource;
  revisionChainId: string;
  maxCharacterLimit: number;
  isCurrentMessageVersion: boolean;
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
  revisionChainId?: string;
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
type ChatIntent = "coach" | "ideate" | "plan" | "planner_feedback" | "draft" | "review" | "edit";
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
  formatPreference?: "shortform" | "longform";
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
const DRAFT_TIMELINE_FOCUS_DELAY_MS = 0;

function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAreaLabel(value: string): string {
  return formatEnumLabel(value);
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyNormalSentenceCasing(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, prefix: string, character: string) =>
      `${prefix}${character.toUpperCase()}`,
    )
    .replace(
      /(^|\n)(\s*(?:-|>)\s*)([a-z])/g,
      (_, prefix: string, marker: string, character: string) =>
        `${prefix}${marker}${character.toUpperCase()}`,
    );
}

function inferAutoBulletMarker(context: CreatorAgentContext | null): "-" | ">" {
  if (!context) {
    return "-";
  }

  let dashCount = 0;
  let angleCount = 0;
  const samples = [
    ...context.creatorProfile.examples.voiceAnchors,
    ...context.creatorProfile.examples.replyVoiceAnchors,
    ...context.creatorProfile.examples.quoteVoiceAnchors,
    ...context.creatorProfile.examples.bestPerforming,
  ];

  for (const sample of samples) {
    for (const line of sample.text.split("\n")) {
      if (/^\s*-\s+/.test(line)) {
        dashCount += 1;
      }

      if (/^\s*>\s+/.test(line)) {
        angleCount += 1;
      }
    }
  }

  return angleCount > dashCount ? ">" : "-";
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

function getDisplayedDraftCharacterLimit(
  storedMaxCharacterLimit: number,
  fallbackCharacterLimit: number,
): number {
  return Math.max(storedMaxCharacterLimit, fallbackCharacterLimit);
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

  const mappedVersions = rawVersions.map((version) => {
    const content = typeof version.content === "string" ? version.content : "";
    const maxCharacterLimit =
      typeof version.maxCharacterLimit === "number" && version.maxCharacterLimit > 0
        ? version.maxCharacterLimit
        : message.draftArtifacts?.[0]?.maxCharacterLimit ?? fallbackCharacterLimit;

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
    mappedVersions.some((version) => version.id === message.activeDraftVersionId)
      ? message.activeDraftVersionId
      : mappedVersions[mappedVersions.length - 1].id;
  const activeVersionIndex = mappedVersions.findIndex(
    (version) => version.id === activeVersionId,
  );
  const versions =
    activeVersionIndex >= 0 && activeVersionIndex < mappedVersions.length - 1
      ? [
          ...mappedVersions.slice(0, activeVersionIndex),
          ...mappedVersions.slice(activeVersionIndex + 1),
          mappedVersions[activeVersionIndex],
        ]
      : mappedVersions;
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

function inferSelectedDraftAction(prompt: string): "revise" | "ignore" {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return "ignore";
  }

  if (
    [
      "give me ideas",
      "post ideas",
      "write a new post",
      "write me a post",
      "write a post",
      "draft a post",
      "draft me a post",
      "different topic",
      "start over",
      "help me brainstorm",
      "brainstorm",
      "analyze my posts",
    ].some((cue) => normalized.includes(cue))
  ) {
    return "ignore";
  }

  if (
    [
      "why does it say",
      "why does it mention",
      "don't say",
      "dont say",
      "remove \"",
      "remove '",
      "remove the",
      "delete \"",
      "delete '",
      "make it shorter",
      "shorten it",
      "tighten this",
      "make this clearer",
      "change the hook",
      "remove the last line",
      "less hype",
      "more casual",
      "this part is weird",
      "that line is off",
      "this doesn't make sense",
      "this doesnt make sense",
      "too long",
      "too much",
      "make it punchier",
      "make it sharper",
      "fix this line",
    ].some((cue) => normalized.includes(cue))
  ) {
    return "revise";
  }

  if (/["“'`](.+?)["”'`]/.test(prompt)) {
    return "revise";
  }

  return "revise";
}

function buildDraftRevisionTimeline(args: {
  messages: ChatMessage[];
  activeDraftSelection: DraftDrawerSelection | null;
  fallbackCharacterLimit: number;
}): DraftTimelineEntry[] {
  if (!args.activeDraftSelection) {
    return [];
  }

  const selectedMessage =
    args.messages.find((message) => message.id === args.activeDraftSelection?.messageId) ?? null;
  if (!selectedMessage) {
    return [];
  }

  const selectedBundle = normalizeDraftVersionBundle(
    selectedMessage,
    args.fallbackCharacterLimit,
  );
  if (!selectedBundle) {
    return [];
  }

  const resolvedChainId =
    args.activeDraftSelection.revisionChainId?.trim() ||
    selectedMessage.revisionChainId?.trim() ||
    selectedMessage.previousVersionSnapshot?.revisionChainId?.trim() ||
    `legacy-chain-${selectedMessage.id}`;

  const chainedEntries = resolvedChainId
    ? args.messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          typeof message.revisionChainId === "string" &&
          message.revisionChainId.trim() === resolvedChainId,
      )
      .sort((left, right) =>
        (left.createdAt ?? "").localeCompare(right.createdAt ?? ""),
      )
      .flatMap((message) => {
        const bundle = normalizeDraftVersionBundle(message, args.fallbackCharacterLimit);
        if (!bundle) {
          return [];
        }

        return bundle.versions.map((version) => ({
          messageId: message.id,
          versionId: version.id,
          content: version.content,
          createdAt: version.createdAt,
          source: version.source,
          revisionChainId: resolvedChainId,
          maxCharacterLimit: version.maxCharacterLimit,
          isCurrentMessageVersion: message.id === selectedMessage.id,
        }));
      })
    : [];

  if (chainedEntries.length > 0) {
    const selectedMessageEntries = chainedEntries.some(
      (entry) => entry.messageId === selectedMessage.id,
    )
      ? []
      : selectedBundle.versions.map((version) => ({
          messageId: selectedMessage.id,
          versionId: version.id,
          content: version.content,
          createdAt: version.createdAt,
          source: version.source,
          revisionChainId: resolvedChainId,
          maxCharacterLimit: version.maxCharacterLimit,
          isCurrentMessageVersion: true,
        }));
    const combinedEntries = [...selectedMessageEntries, ...chainedEntries].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
    const previousSnapshot = selectedBundle.previousSnapshot;
    if (!previousSnapshot) {
      return combinedEntries;
    }

    const snapshotAlreadyPresent = combinedEntries.some(
      (entry) =>
        entry.messageId === previousSnapshot.messageId &&
        entry.versionId === previousSnapshot.versionId,
    );
    if (snapshotAlreadyPresent) {
      return combinedEntries;
    }

    return [
      {
        messageId: previousSnapshot.messageId,
        versionId: previousSnapshot.versionId,
        content: previousSnapshot.content,
        createdAt: previousSnapshot.createdAt,
        source: previousSnapshot.source,
        revisionChainId: previousSnapshot.revisionChainId?.trim() || resolvedChainId,
        maxCharacterLimit:
          previousSnapshot.maxCharacterLimit ?? selectedBundle.activeVersion.maxCharacterLimit,
        isCurrentMessageVersion: previousSnapshot.messageId === selectedMessage.id,
      },
      ...combinedEntries,
    ];
  }

  const legacyChainSourceId =
    args.activeDraftSelection.revisionChainId?.startsWith("legacy-chain-")
      ? args.activeDraftSelection.revisionChainId.slice("legacy-chain-".length)
      : "";
  const legacyChainSource =
    legacyChainSourceId && legacyChainSourceId !== selectedMessage.id
      ? args.messages.find((message) => message.id === legacyChainSourceId) ?? null
      : null;

  if (legacyChainSource) {
    const legacySourceBundle = normalizeDraftVersionBundle(
      legacyChainSource,
      args.fallbackCharacterLimit,
    );
    if (legacySourceBundle) {
      const currentEntries = selectedBundle.versions.map((version) => ({
        messageId: selectedMessage.id,
        versionId: version.id,
        content: version.content,
        createdAt: version.createdAt,
        source: version.source,
        revisionChainId: resolvedChainId,
        maxCharacterLimit: version.maxCharacterLimit,
        isCurrentMessageVersion: true,
      }));
      const anchorEntries = legacySourceBundle.versions.map((version) => ({
        messageId: legacyChainSource.id,
        versionId: version.id,
        content: version.content,
        createdAt: version.createdAt,
        source: version.source,
        revisionChainId: resolvedChainId,
        maxCharacterLimit: version.maxCharacterLimit,
        isCurrentMessageVersion: false,
      }));

      return [...currentEntries, ...anchorEntries].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    }
  }

  const fallbackEntries = selectedBundle.versions.map((version) => ({
    messageId: selectedMessage.id,
    versionId: version.id,
    content: version.content,
    createdAt: version.createdAt,
    source: version.source,
    revisionChainId: resolvedChainId,
    maxCharacterLimit: version.maxCharacterLimit,
    isCurrentMessageVersion: true,
  }));
  const previousSnapshot = selectedBundle.previousSnapshot;

  if (!previousSnapshot) {
    return fallbackEntries;
  }

  const snapshotAlreadyPresent = fallbackEntries.some(
    (entry) =>
      entry.messageId === previousSnapshot.messageId &&
      entry.versionId === previousSnapshot.versionId,
  );
  if (snapshotAlreadyPresent) {
    return fallbackEntries;
  }

  return [
    {
      messageId: previousSnapshot.messageId,
      versionId: previousSnapshot.versionId,
      content: previousSnapshot.content,
      createdAt: previousSnapshot.createdAt,
      source: previousSnapshot.source,
      revisionChainId: previousSnapshot.revisionChainId?.trim() || resolvedChainId,
      maxCharacterLimit:
        previousSnapshot.maxCharacterLimit ?? selectedBundle.activeVersion.maxCharacterLimit,
      isCurrentMessageVersion: previousSnapshot.messageId === selectedMessage.id,
    },
    ...fallbackEntries,
  ];
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
    case "Analyzing this draft.":
      return "reviewing what works and what doesn't";
    case "Comparing versions.":
      return "comparing these versions";
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
  const threadMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const normalizedAddAccount = normalizeAccountHandle(addAccountInput);
  const hasValidAddAccountPreview =
    Boolean(addAccountPreview) &&
    normalizeAccountHandle(addAccountPreview?.username ?? "") === normalizedAddAccount;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (threadMenuRef.current && !threadMenuRef.current.contains(target)) {
        setMenuOpenThreadId(null);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
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
  const threadScrollRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
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
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(false);
  const [isPreferencesSaving, setIsPreferencesSaving] = useState(false);
  const [preferenceCasing, setPreferenceCasing] = useState<
    "auto" | "normal" | "lowercase" | "uppercase"
  >("auto");
  const [preferenceBulletStyle, setPreferenceBulletStyle] = useState<
    "auto" | "-" | ">"
  >("auto");
  const [preferenceWritingMode, setPreferenceWritingMode] = useState<
    "voice" | "balanced" | "growth"
  >("balanced");
  const [preferenceUseEmojis, setPreferenceUseEmojis] = useState(false);
  const [preferenceAllowProfanity, setPreferenceAllowProfanity] = useState(false);
  const [preferenceBlacklistedTerms, setPreferenceBlacklistedTerms] = useState<
    string[]
  >([]);
  const [preferenceBlacklistInput, setPreferenceBlacklistInput] = useState("");
  const [preferenceMaxCharacters, setPreferenceMaxCharacters] = useState(25000);
  const [, setBackfillNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
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
  const [isDraftInspectorLoading, setIsDraftInspectorLoading] = useState(false);
  const [hasCopiedDraftEditorText, setHasCopiedDraftEditorText] = useState(false);
  const [copiedPreviewDraftMessageId, setCopiedPreviewDraftMessageId] = useState<string | null>(null);
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
  const effectivePreferenceMaxCharacters = isVerifiedAccount
    ? Math.min(Math.max(preferenceMaxCharacters || 250, 250), 25000)
    : 250;
  const autoPreferenceBulletMarker = useMemo(
    () => inferAutoBulletMarker(context),
    [context],
  );
  const commitPreferenceBlacklistedTerm = useCallback((rawValue: string) => {
    const normalizedValue = rawValue.trim().replace(/^,+|,+$/g, "").trim();

    if (!normalizedValue) {
      return;
    }

    setPreferenceBlacklistedTerms((current) => {
      if (
        current.some(
          (term) => term.toLowerCase() === normalizedValue.toLowerCase(),
        )
      ) {
        return current;
      }

      return [...current, normalizedValue];
    });
  }, []);
  const removePreferenceBlacklistedTerm = useCallback((termIndex: number) => {
    setPreferenceBlacklistedTerms((current) =>
      current.filter((_, index) => index !== termIndex),
    );
  }, []);
  const handlePreferenceBlacklistInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      if (!nextValue.includes(",")) {
        setPreferenceBlacklistInput(nextValue);
        return;
      }

      const segments = nextValue.split(",");

      for (const segment of segments.slice(0, -1)) {
        commitPreferenceBlacklistedTerm(segment);
      }

      setPreferenceBlacklistInput(
        segments.length > 0 ? segments[segments.length - 1] : "",
      );
    },
    [commitPreferenceBlacklistedTerm],
  );
  const handlePreferenceBlacklistInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitPreferenceBlacklistedTerm(preferenceBlacklistInput);
        setPreferenceBlacklistInput("");
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        preferenceBlacklistInput.length === 0 &&
        preferenceBlacklistedTerms.length > 0
      ) {
        event.preventDefault();
        setPreferenceBlacklistedTerms((current) => {
          if (event.key === "Delete") {
            return current.slice(1);
          }

          return current.slice(0, -1);
        });
      }
    },
    [
      commitPreferenceBlacklistedTerm,
      preferenceBlacklistInput,
      preferenceBlacklistedTerms.length,
    ],
  );
  const preferencesPreviewDraft = useMemo(() => {
    const bullet =
      preferenceBulletStyle === "auto"
        ? autoPreferenceBulletMarker
        : preferenceBulletStyle;
    const lines =
      preferenceWritingMode === "voice"
        ? [
            "building xpo in public means shipping what feels real, not what sounds polished.",
            preferenceAllowProfanity
              ? "this grind gets fucking real, but the reps are worth it."
              : "this grind gets real, but the reps are worth it.",
            `${bullet} sharing what i'm learning as it happens`,
            `${bullet} keeping the rough edges in instead of over-polishing`,
            `${bullet} shipping again when the next fix is obvious`,
            "if you're building too, keep going.",
          ]
        : preferenceWritingMode === "growth"
          ? [
              "most people wait too long to ship. building xpo in public keeps the loop tight.",
              preferenceAllowProfanity
                ? "this grind gets fucking real, but the reps are worth it."
                : "this grind gets real, but the reps are worth it.",
              `${bullet} ship faster`,
              `${bullet} learn what people actually care about`,
              `${bullet} turn every post into a feedback loop`,
              "if you're building too, post the next rep today.",
            ]
          : [
              "building xpo in public means shipping before it feels perfect.",
              preferenceAllowProfanity
                ? "this grind gets fucking real, but the reps are worth it."
                : "this grind gets real, but the reps are worth it.",
              `${bullet} testing ideas fast`,
              `${bullet} listening to what people actually need`,
              `${bullet} fixing what breaks and shipping again`,
              "if you're building too, keep going.",
            ];

    let nextDraft = lines.join("\n");

    if (preferenceUseEmojis) {
      nextDraft = nextDraft.replace(
        lines[0],
        `${lines[0]} ${preferenceWritingMode === "growth" ? "📈" : "🚀"}`,
      );
      nextDraft = nextDraft.replace(
        lines[lines.length - 1],
        `${lines[lines.length - 1]} ${preferenceWritingMode === "voice" ? "🙂" : "🔥"}`,
      );
    }

    for (const blockedTerm of preferenceBlacklistedTerms) {
      nextDraft = nextDraft.replace(
        new RegExp(escapeRegexLiteral(blockedTerm), "gi"),
        "",
      );
    }

    nextDraft = nextDraft
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();

    if (preferenceCasing === "normal") {
      nextDraft = applyNormalSentenceCasing(nextDraft);
    } else if (preferenceCasing === "lowercase") {
      nextDraft = nextDraft.toLowerCase();
    } else if (preferenceCasing === "uppercase") {
      nextDraft = nextDraft.toUpperCase();
    }

    return nextDraft;
  }, [
    autoPreferenceBulletMarker,
    preferenceAllowProfanity,
    preferenceBlacklistedTerms,
    preferenceBulletStyle,
    preferenceCasing,
    preferenceUseEmojis,
    preferenceWritingMode,
  ]);
  const preferencesPreviewCounter = useMemo(
    () =>
      getXCharacterCounterMeta(
        preferencesPreviewDraft,
        effectivePreferenceMaxCharacters,
      ),
    [effectivePreferenceMaxCharacters, preferencesPreviewDraft],
  );
  const currentPreferencePayload = useMemo<UserPreferences>(
    () => ({
      casing: preferenceCasing,
      bulletStyle:
        preferenceBulletStyle === "auto"
          ? "auto"
          : preferenceBulletStyle === "-"
            ? "dash"
            : "angle",
      emojiUsage: preferenceUseEmojis ? "on" : "off",
      profanity: preferenceAllowProfanity ? "on" : "off",
      blacklist: preferenceBlacklistedTerms,
      writingGoal:
        preferenceWritingMode === "voice"
          ? "voice_first"
          : preferenceWritingMode === "growth"
            ? "growth_first"
            : "balanced",
      verifiedMaxChars: isVerifiedAccount ? effectivePreferenceMaxCharacters : null,
    }),
    [
      effectivePreferenceMaxCharacters,
      isVerifiedAccount,
      preferenceAllowProfanity,
      preferenceBlacklistedTerms,
      preferenceBulletStyle,
      preferenceCasing,
      preferenceUseEmojis,
      preferenceWritingMode,
    ],
  );
  const preferenceConstraintRules = useMemo(
    () =>
      buildPreferenceConstraintsFromPreferences(currentPreferencePayload, {
        isVerifiedAccount,
      }),
    [
      currentPreferencePayload,
      isVerifiedAccount,
    ],
  );

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

  const applyPersistedPreferences = useCallback((preferences: UserPreferences) => {
    setPreferenceCasing(preferences.casing);
    setPreferenceBulletStyle(
      preferences.bulletStyle === "dash"
        ? "-"
        : preferences.bulletStyle === "angle"
          ? ">"
          : "auto",
    );
    setPreferenceWritingMode(
      preferences.writingGoal === "voice_first"
        ? "voice"
        : preferences.writingGoal === "growth_first"
          ? "growth"
          : "balanced",
    );
    setPreferenceUseEmojis(preferences.emojiUsage === "on");
    setPreferenceAllowProfanity(preferences.profanity === "on");
    setPreferenceBlacklistedTerms(preferences.blacklist);
    setPreferenceBlacklistInput("");
    setPreferenceMaxCharacters(preferences.verifiedMaxChars ?? 25000);
  }, []);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    let isMounted = true;
    setIsPreferencesLoading(true);

    fetch("/api/creator/v2/preferences")
      .then((res) => res.json())
      .then((data: PreferencesResponse) => {
        if (!isMounted || !data.ok) {
          return;
        }

        applyPersistedPreferences(data.data.preferences);
      })
      .catch((err) => console.error("Failed to load profile preferences:", err))
      .finally(() => {
        if (isMounted) {
          setIsPreferencesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountName, applyPersistedPreferences]);

  const savePreferences = useCallback(async () => {
    setIsPreferencesSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/creator/v2/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences: currentPreferencePayload,
        }),
      });

      const data: PreferencesResponse = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(
          data.ok ? "Failed to save preferences." : (data.errors[0]?.message ?? "Failed to save preferences."),
        );
      }

      applyPersistedPreferences(data.data.preferences);
      setPreferencesOpen(false);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to save preferences.");
    } finally {
      setIsPreferencesSaving(false);
    }
  }, [applyPersistedPreferences, currentPreferencePayload]);

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

    const trimmedQuery = sidebarSearchQuery.trim().toLowerCase();
    const filteredThreads = trimmedQuery
      ? chatThreads.filter((thread) =>
          (thread.title || "Chat").toLowerCase().includes(trimmedQuery),
        )
      : chatThreads;
    const recentItems = filteredThreads.slice(0, 10).map((t) => ({
      id: t.id,
      label: t.title || "Chat",
      meta: new Date(t.updatedAt).toLocaleDateString(),
    }));

    return [
      {
        section: "Chats",
        items:
          trimmedQuery || recentItems.length > 0
            ? recentItems
            : [
                {
                  id: activeThreadId ?? "current-workspace",
                  label: "New Chat",
                  meta: "Active",
                },
              ],
      },
    ];
  }, [context, contract, chatThreads, activeThreadId, sidebarSearchQuery]);
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
    if (!activeDraftEditor || !selectedDraftVersion || !selectedDraftMessage) {
      return null;
    }

    return {
      messageId: activeDraftEditor.messageId,
      versionId: selectedDraftVersion.id,
      content: editorDraftText.trim() || selectedDraftVersion.content,
      source: selectedDraftVersion.source,
      createdAt: selectedDraftVersion.createdAt,
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
      revisionChainId:
        activeDraftEditor.revisionChainId ?? selectedDraftMessage.revisionChainId,
    };
  }, [activeDraftEditor, editorDraftText, selectedDraftMessage, selectedDraftVersion]);
  const selectedDraftTimeline = useMemo(
    () =>
      buildDraftRevisionTimeline({
        messages,
        activeDraftSelection: activeDraftEditor,
        fallbackCharacterLimit: composerCharacterLimit,
      }),
    [activeDraftEditor, composerCharacterLimit, messages],
  );
  const selectedDraftTimelineIndex = useMemo(
    () =>
      selectedDraftTimeline.findIndex(
        (entry) =>
          entry.messageId === activeDraftEditor?.messageId &&
          entry.versionId === activeDraftEditor?.versionId,
      ),
    [activeDraftEditor, selectedDraftTimeline],
  );
  const selectedDraftVersionId = selectedDraftVersion?.id ?? null;
  const selectedDraftVersionContent = selectedDraftVersion?.content ?? "";
  const selectedDraftMessageId = activeDraftEditor?.messageId ?? null;
  const selectedDraftTimelinePosition =
    selectedDraftTimelineIndex >= 0 ? selectedDraftTimelineIndex + 1 : 0;
  const latestDraftTimelineEntry =
    selectedDraftTimeline.length > 0
      ? selectedDraftTimeline[selectedDraftTimeline.length - 1]
      : null;
  const canNavigateDraftBack = selectedDraftTimelineIndex > 0;
  const canNavigateDraftForward =
    selectedDraftTimelineIndex >= 0 &&
    selectedDraftTimelineIndex < selectedDraftTimeline.length - 1;
  const isViewingHistoricalDraftVersion =
    selectedDraftTimelineIndex >= 0 &&
    selectedDraftTimelineIndex < selectedDraftTimeline.length - 1;
  const hasDraftEditorChanges =
    selectedDraftVersion !== null &&
    editorDraftText.trim().length > 0 &&
    editorDraftText.trim() !== selectedDraftVersion.content.trim();
  const shouldShowRevertDraftCta =
    isViewingHistoricalDraftVersion && !hasDraftEditorChanges;
  const draftEditorPrimaryActionLabel = shouldShowRevertDraftCta
    ? "Revert to this Version"
    : "Save As New Version";
  const isDraftEditorPrimaryActionDisabled =
    shouldShowRevertDraftCta
      ? false
      : !editorDraftText.trim() || !hasDraftEditorChanges;
  const draftInspectorActionLabel = isViewingHistoricalDraftVersion
    ? "Compare to Current"
    : "Analyze this Draft";
  const isMainChatLocked = isSending || isDraftInspectorLoading;

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
      setHasCopiedDraftEditorText(false);
      return;
    }

    setEditorDraftText(selectedDraftVersionContent);
    setHasCopiedDraftEditorText(false);
  }, [
    activeDraftEditor?.messageId,
    activeDraftEditor?.versionId,
    selectedDraftVersionContent,
    selectedDraftVersionId,
  ]);

  const navigateDraftTimeline = useCallback(
    (direction: "back" | "forward") => {
      if (selectedDraftTimelineIndex < 0) {
        return;
      }

      const targetIndex =
        direction === "back"
          ? selectedDraftTimelineIndex - 1
          : selectedDraftTimelineIndex + 1;
      const targetEntry = selectedDraftTimeline[targetIndex];
      if (!targetEntry) {
        return;
      }

      if (targetEntry.messageId !== activeDraftEditor?.messageId) {
        window.requestAnimationFrame(() => {
          messageRefs.current[targetEntry.messageId]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
        window.setTimeout(() => {
          setActiveDraftEditor({
            messageId: targetEntry.messageId,
            versionId: targetEntry.versionId,
            revisionChainId: targetEntry.revisionChainId,
          });
        }, DRAFT_TIMELINE_FOCUS_DELAY_MS);
        return;
      }

      setActiveDraftEditor({
        messageId: targetEntry.messageId,
        versionId: targetEntry.versionId,
        revisionChainId: targetEntry.revisionChainId,
      });
    },
    [activeDraftEditor?.messageId, selectedDraftTimeline, selectedDraftTimelineIndex],
  );

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
      revisionChainId: message.revisionChainId ?? undefined,
    });
  }, [composerCharacterLimit, messages]);

  const scrollThreadToBottom = useCallback(() => {
    setShowScrollToLatest(false);
    window.requestAnimationFrame(() => {
      const node = threadScrollRef.current;
      if (!node) {
        return;
      }

      node.scrollTo({
        top: node.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    const node = threadScrollRef.current;
    if (!node) {
      return;
    }

    const updateScrollPosition = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;
      setShowScrollToLatest(distanceFromBottom > 140);
    };

    updateScrollPosition();
    node.addEventListener("scroll", updateScrollPosition, { passive: true });
    window.requestAnimationFrame(updateScrollPosition);

    return () => {
      node.removeEventListener("scroll", updateScrollPosition);
    };
  }, [activeThreadId, messages.length]);

  const saveDraftEditor = useCallback(async () => {
    if (
      !activeDraftEditor ||
      !selectedDraftMessage ||
      !selectedDraftVersion ||
      !activeThreadId
    ) {
      return;
    }

    const nextContent = editorDraftText.trim();
    if (!nextContent) {
      return;
    }

    if (nextContent === selectedDraftVersion.content.trim()) {
      return;
    }

    const revisionChainId =
      selectedDraftMessage.revisionChainId ||
      activeDraftEditor.revisionChainId ||
      `revision-chain-${selectedDraftMessage.id}`;

    try {
      const response = await fetch(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/draft-promotions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: nextContent,
            outputShape: selectedDraftMessage.outputShape ?? "short_form_post",
            supportAsset:
              selectedDraftVersion.supportAsset ??
              getDraftVersionSupportAsset(selectedDraftMessage),
            maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
            revisionChainId,
            basedOn: {
              messageId: selectedDraftMessage.id,
              versionId: selectedDraftVersion.id,
              content: selectedDraftVersion.content,
              source: selectedDraftVersion.source,
              createdAt: selectedDraftVersion.createdAt,
              maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
              revisionChainId,
            },
          }),
        },
      );
      if (!response.ok) {
        throw new Error("promotion failed");
      }

      const data = (await response.json()) as DraftPromotionResponse;
      if (!data.ok) {
        throw new Error(data.errors[0]?.message || "promotion failed");
      }

      setMessages((current) => [
        ...current,
        {
          id: data.data.userMessage.id,
          role: "user",
          content: data.data.userMessage.content,
          createdAt: data.data.userMessage.createdAt,
        },
        {
          id: data.data.assistantMessage.id,
          role: "assistant",
          content: data.data.assistantMessage.content,
          createdAt: data.data.assistantMessage.createdAt,
          draft: data.data.assistantMessage.draft,
          drafts: data.data.assistantMessage.drafts,
          draftArtifacts: data.data.assistantMessage.draftArtifacts,
          draftVersions: data.data.assistantMessage.draftVersions,
          activeDraftVersionId: data.data.assistantMessage.activeDraftVersionId,
          previousVersionSnapshot: data.data.assistantMessage.previousVersionSnapshot,
          revisionChainId: data.data.assistantMessage.revisionChainId,
          supportAsset: data.data.assistantMessage.supportAsset,
          outputShape: data.data.assistantMessage.outputShape,
          source: data.data.assistantMessage.source,
          model: data.data.assistantMessage.model,
        },
      ]);
      setActiveDraftEditor({
        messageId: data.data.assistantMessage.id,
        versionId: data.data.assistantMessage.activeDraftVersionId,
        revisionChainId: data.data.assistantMessage.revisionChainId,
      });
      scrollThreadToBottom();
    } catch {
      setErrorMessage("The draft could not be promoted yet.");
    }
  }, [
    activeDraftEditor,
    activeThreadId,
    editorDraftText,
    selectedDraftMessage,
    selectedDraftVersion,
    scrollThreadToBottom,
  ]);

  const revertToSelectedDraftVersion = useCallback(async () => {
    if (!selectedDraftVersion || !selectedDraftMessage) {
      return;
    }

    const nextContent = selectedDraftVersion.content.trim();
    if (!nextContent) {
      return;
    }

    const revisionChainId =
      selectedDraftMessage.revisionChainId ??
      activeDraftEditor?.revisionChainId ??
      `revision-chain-${selectedDraftMessage.id}`;
    const nextVersions =
      selectedDraftMessage.draftVersions && selectedDraftMessage.draftVersions.length > 0
        ? selectedDraftMessage.draftVersions
        : (selectedDraftBundle?.versions ?? [selectedDraftVersion]);
    const sourceArtifact = selectedDraftMessage.draftArtifacts?.[0];
    const activeDraftArtifact = buildDraftArtifactWithLimit({
      id: sourceArtifact?.id ?? `${selectedDraftMessage.id}-${selectedDraftVersion.id}`,
      title: sourceArtifact?.title ?? "Draft",
      kind: sourceArtifact?.kind ?? resolveDraftArtifactKind(selectedDraftMessage.outputShape),
      content: nextContent,
      supportAsset: selectedDraftVersion.supportAsset ?? getDraftVersionSupportAsset(selectedDraftMessage),
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
    });

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== selectedDraftMessage.id) {
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
          activeDraftVersionId: selectedDraftVersion.id,
          revisionChainId,
        };
      }),
    );

    setActiveDraftEditor({
      messageId: selectedDraftMessage.id,
      versionId: selectedDraftVersion.id,
      revisionChainId,
    });

    if (!activeThreadId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(selectedDraftMessage.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftVersions: nextVersions,
            activeDraftVersionId: selectedDraftVersion.id,
            draft: nextContent,
            drafts:
              selectedDraftMessage.drafts && selectedDraftMessage.drafts.length > 1
                ? [nextContent, ...selectedDraftMessage.drafts.slice(1)]
                : [nextContent],
            draftArtifacts:
              selectedDraftMessage.draftArtifacts && selectedDraftMessage.draftArtifacts.length > 1
                ? [activeDraftArtifact, ...selectedDraftMessage.draftArtifacts.slice(1)]
                : [activeDraftArtifact],
            revisionChainId,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("persist failed");
      }
    } catch {
      setErrorMessage("The current version could not be updated yet.");
    }
  }, [
    activeDraftEditor?.revisionChainId,
    activeThreadId,
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
      setHasCopiedDraftEditorText(true);
      window.setTimeout(() => {
        setHasCopiedDraftEditorText(false);
      }, 2200);
    } catch {
      setErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [editorDraftText]);

  const shareDraftEditorToX = useCallback(() => {
    window.open("https://x.com/compose/post", "_blank", "noopener,noreferrer");
  }, []);

  const copyPreviewDraft = useCallback(async (messageId: string, content: string) => {
    const nextContent = content.trim();
    if (!nextContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextContent);
      setCopiedPreviewDraftMessageId(messageId);
      window.setTimeout(() => {
        setCopiedPreviewDraftMessageId((current) =>
          current === messageId ? null : current,
        );
      }, 2200);
    } catch {
      setErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, []);

  const runDraftInspector = useCallback(async () => {
    if (!selectedDraftVersion || !activeThreadId) {
      return;
    }

    const inspectedDraft = editorDraftText.trim() || selectedDraftVersion.content.trim();
    if (!inspectedDraft) {
      return;
    }

    const shouldCompare =
      isViewingHistoricalDraftVersion &&
      !!latestDraftTimelineEntry &&
      (latestDraftTimelineEntry.messageId !== activeDraftEditor?.messageId ||
        latestDraftTimelineEntry.versionId !== activeDraftEditor?.versionId);
    const currentDraft =
      shouldCompare && latestDraftTimelineEntry
        ? latestDraftTimelineEntry.content.trim()
        : "";

    if (shouldCompare && !currentDraft) {
      setErrorMessage("There isn't a current draft version to compare against yet.");
      return;
    }

    const prompt = buildDraftReviewPrompt(shouldCompare ? "compare" : "analyze");
    const nowIso = new Date().toISOString();
    const temporaryUserMessageId = `draft-inspector-user-${Date.now()}`;
    const temporaryAssistantMessageId = `draft-inspector-assistant-${Date.now() + 1}`;

    setMessages((current) => [
      ...current,
      {
        id: temporaryUserMessageId,
        role: "user",
        content: prompt,
        createdAt: nowIso,
      },
      {
        id: temporaryAssistantMessageId,
        role: "assistant",
        content: buildDraftReviewLoadingLabel(shouldCompare ? "compare" : "analyze"),
        createdAt: nowIso,
        isStreaming: true,
      },
    ]);
    scrollThreadToBottom();
    setIsDraftInspectorLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/creator/v2/draft-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: shouldCompare ? "compare" : "analyze",
          draft: inspectedDraft,
          threadId: activeThreadId,
          ...(shouldCompare ? { currentDraft } : {}),
        }),
      });

      const data = (await response.json()) as DraftInspectorResponse;

      if (!response.ok || !data.ok) {
        setMessages((current) =>
          current.map((message) =>
            message.id === temporaryAssistantMessageId
              ? {
                  ...message,
                  content: buildDraftReviewFailureLabel(),
                  isStreaming: false,
                }
              : message,
          ),
        );
        setErrorMessage(
          data.ok
            ? "The draft analysis failed."
            : (data.errors[0]?.message ?? "The draft analysis failed."),
        );
        return;
      }

      setMessages((current) =>
        current.map((message) => {
          if (message.id === temporaryUserMessageId) {
            return {
              ...message,
              id: data.data.userMessageId,
              content: data.data.prompt,
            };
          }

          if (message.id === temporaryAssistantMessageId) {
            return {
              ...message,
              id: data.data.assistantMessageId,
              content: data.data.summary.trim(),
              isStreaming: false,
            };
          }

          return message;
        }),
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === temporaryAssistantMessageId
            ? {
                ...message,
                content: buildDraftReviewFailureLabel(),
                isStreaming: false,
              }
            : message,
        ),
      );
      setErrorMessage("The draft analysis failed.");
    } finally {
      setIsDraftInspectorLoading(false);
    }
  }, [
    activeThreadId,
    activeDraftEditor?.messageId,
    activeDraftEditor?.versionId,
    editorDraftText,
    isViewingHistoricalDraftVersion,
    latestDraftTimelineEntry,
    selectedDraftVersion,
    scrollThreadToBottom,
  ]);

  const requestAssistantReply = useCallback(
    async (options: {
      prompt?: string;
      appendUserMessage: boolean;
      displayUserMessage?: string;
      includeUserMessageInHistory?: boolean;
      selectedAngle?: string | null;
      intent?: ChatIntent;
      formatPreferenceOverride?: "shortform" | "longform" | null;
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
        isMainChatLocked
      ) {
        return;
      }

      const trimmedPrompt = options.prompt?.trim() ?? "";
      const selectedDraftAction =
        selectedDraftContext && trimmedPrompt
          ? inferSelectedDraftAction(trimmedPrompt)
          : "ignore";
      const effectiveIntent =
        options.intent ??
        (selectedDraftContext && selectedDraftAction === "revise" ? "edit" : undefined);
      const effectiveSelectedDraftContext =
        options.selectedDraftContextOverride !== undefined
          ? options.selectedDraftContextOverride
          : selectedDraftContext &&
              !options.selectedAngle &&
              (effectiveIntent === "edit" || effectiveIntent === "review")
            ? selectedDraftContext
            : null;
      const hasStructuredIntent =
        !!options.selectedAngle ||
        (effectiveIntent === "coach" &&
          (!trimmedPrompt || !!resolvedContentFocus)) ||
        ((effectiveIntent === "ideate" || effectiveIntent === "coach") &&
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
        scrollThreadToBottom();
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
            intent: effectiveIntent,
            ...(options.formatPreferenceOverride
              ? { formatPreference: options.formatPreferenceOverride }
              : {}),
            ...(resolvedContentFocus ? { contentFocus: resolvedContentFocus } : {}),
            selectedAngle: options.selectedAngle ?? null,
            ...(effectiveSelectedDraftContext
              ? { selectedDraftContext: effectiveSelectedDraftContext }
              : {}),
            preferenceSettings: currentPreferencePayload,
            ...(preferenceConstraintRules.length > 0
              ? { preferenceConstraints: preferenceConstraintRules }
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
              revisionChainId: data.data.revisionChainId,
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
          scrollThreadToBottom();

          const nextDraftVersionId =
            data.data.activeDraftVersionId ??
            (data.data.draftVersions && data.data.draftVersions.length > 0
              ? data.data.draftVersions[data.data.draftVersions.length - 1]?.id
              : null);

          if (
            effectiveSelectedDraftContext &&
            data.data.messageId &&
            nextDraftVersionId
          ) {
            setActiveDraftEditor({
              messageId: data.data.messageId,
              versionId: nextDraftVersionId,
              revisionChainId: data.data.revisionChainId,
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
            revisionChainId: streamedResult.revisionChainId,
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
        scrollThreadToBottom();

        if (
          effectiveSelectedDraftContext &&
          streamedResult.messageId &&
          streamedResult.activeDraftVersionId &&
          streamedResult.draft
        ) {
          setActiveDraftEditor({
            messageId: streamedResult.messageId,
            versionId: streamedResult.activeDraftVersionId,
            revisionChainId: streamedResult.revisionChainId,
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
      currentPreferencePayload,
      isMainChatLocked,
      messages,
      providerPreference,
      pinnedEvidencePostIds,
      pinnedVoicePostIds,
      preferenceConstraintRules,
      selectedDraftContext,
      scrollThreadToBottom,
      accountName,
      activeThreadId,
      syncThreadTitle,
    ],
  );

  const requestDraftCardRevision = useCallback(
    async (messageId: string, prompt: string) => {
      const message = messages.find((item) => item.id === messageId);
      if (!message) {
        return;
      }

      const bundle = normalizeDraftVersionBundle(message, composerCharacterLimit);
      if (!bundle) {
        return;
      }

      const selectedVersion = bundle.activeVersion;
      const revisionChainId =
        message.revisionChainId ??
        message.previousVersionSnapshot?.revisionChainId ??
        `legacy-chain-${messageId}`;

      setActiveDraftEditor({
        messageId,
        versionId: selectedVersion.id,
        revisionChainId,
      });

      await requestAssistantReply({
        prompt,
        appendUserMessage: true,
        intent: "edit",
        selectedDraftContextOverride: {
          messageId,
          versionId: selectedVersion.id,
          content: selectedVersion.content,
          source: selectedVersion.source,
          createdAt: selectedVersion.createdAt,
          maxCharacterLimit: selectedVersion.maxCharacterLimit,
          revisionChainId,
        },
      });
    },
    [composerCharacterLimit, messages, requestAssistantReply],
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
      if (!activeStrategyInputs || !activeToneInputs || isMainChatLocked) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: `> ${angle}`,
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
      isMainChatLocked,
      requestAssistantReply,
    ],
  );

  const handleQuickReplySelect = useCallback(
    async (quickReply: ChatQuickReply) => {
      if (isMainChatLocked) {
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
          formatPreferenceOverride: quickReply.formatPreference ?? null,
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
      isMainChatLocked,
      requestAssistantReply,
    ],
  );

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = draftInput.trim();
    if (!trimmedInput || !context || !contract || isMainChatLocked) {
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
      if (!trimmedPrompt || !context || !contract || isMainChatLocked) {
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
      isMainChatLocked,
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
        isMainChatLocked
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
  const accountAvatarFallback =
    accountName?.slice(0, 1).toUpperCase() ??
    session?.user?.email?.slice(0, 1).toUpperCase() ??
    "X";
  const accountProfileAriaLabel = `${accountName ?? session?.user?.email ?? "X"} profile photo`;
  const shouldCenterHero = isNewChatHero || isLeavingHero;
  const renderAccountMenuPanel = (className: string) =>
    accountMenuOpen ? (
      <div className={className}>
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
    ) : null;
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
  const chatCanvasClassName = `relative mx-auto flex min-h-full w-full flex-col gap-6 px-4 pb-44 pt-8 sm:px-6 sm:pb-32 ${shouldCenterHero ? "justify-center" : ""
    } ${isInlineDraftEditorOpen ? "max-w-[86rem] lg:pr-[28rem] xl:pr-[29rem]" : "max-w-4xl"}`;

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={chatScanlineStyle} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="relative flex h-full min-h-0">
        {sidebarOpen ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            aria-label="Close sidebar overlay"
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-30 flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width,transform] duration-300 md:sticky md:top-0 ${sidebarOpen
            ? "w-[18.5rem] border-r border-white/10 bg-white/[0.02]"
            : "w-[18.5rem] -translate-x-full border-r border-white/10 bg-white/[0.02] md:w-0 md:translate-x-0 md:border-r-0 md:bg-transparent"
            }`}
        >
          {sidebarOpen ? (
            <div className="flex items-center px-3 py-4">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
                aria-label="Collapse sidebar"
              >
                ×
              </button>
            </div>
          ) : null}

          {sidebarOpen ? (
            <>
              <div className="px-3">
                <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-3">
                  <span className="text-sm text-zinc-500">⌕</span>
                  <input
                    type="text"
                    value={sidebarSearchQuery}
                    onChange={(event) => setSidebarSearchQuery(event.target.value)}
                    placeholder="Search chats"
                    className="w-full bg-transparent text-sm text-zinc-300 outline-none placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="px-3 pt-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
                >
                  <span className="text-sm text-zinc-400">✎</span>
                  <span className="text-sm font-medium text-white">New Chat</span>
                </button>
              </div>

              <div className="px-3 pt-1">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setPreferencesOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                  >
                    <Settings2 className="h-4 w-4 shrink-0" />
                    <span>Preferences</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                  >
                    <BarChart3 className="h-4 w-4 shrink-0" />
                    <span>View Profile Analysis</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybookModalOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    <span>Playbook</span>
                  </button>
                </div>
              </div>
            </>
          ) : null}

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
                                <div className="relative flex-shrink-0 pt-1" ref={menuOpenThreadId === item.id ? threadMenuRef : null}>
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
                    {section.items.length === 0 && sidebarSearchQuery.trim() ? (
                      <div className="rounded-2xl px-2 py-3 text-sm text-zinc-500">
                        No matching chats
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full" />
            )}
          </div>

          {sidebarOpen ? (
            <div ref={accountMenuRef} className="relative border-t border-white/10 px-3 py-4">
              <button
                type="button"
                onClick={() => {
                  setMenuOpenThreadId(null);
                  setAccountMenuOpen((current) => !current);
                }}
                className="flex w-full items-center justify-between rounded-xl p-2 transition hover:bg-white/[0.04]"
                aria-label="Open account menu"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black">
                    {context?.avatarUrl ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${context.avatarUrl})` }}
                        role="img"
                        aria-label={accountProfileAriaLabel}
                      />
                    ) : (
                      accountAvatarFallback
                    )}
                  </div>
                  <div className="flex flex-col items-start overflow-hidden text-left">
                    <span className="flex w-full items-center gap-1 truncate text-xs font-semibold text-zinc-100">
                      <span className="truncate">
                        {accountName ? `@${accountName}` : (session?.user?.email ?? "Loading...")}
                      </span>
                      {isVerifiedAccount ? (
                        <Image
                          src="/x-verified.svg"
                          alt="Verified account"
                          width={14}
                          height={14}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                      ) : null}
                    </span>
                    {accountName ? (
                      <span className="w-full truncate text-[10px] text-zinc-500">
                        {session?.user?.email ?? ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
              </button>

              {renderAccountMenuPanel(
                "absolute bottom-[calc(100%+8px)] left-2 right-2 z-20 rounded-2xl border border-white/10 bg-zinc-950 p-1 shadow-2xl",
              )}
            </div>
          ) : null}
        </aside>

        {!sidebarOpen ? (
          <>
            <div className="pointer-events-none absolute left-4 top-4 z-20 hidden md:block">
              <button
                type="button"
                onClick={() => {
                  setMenuOpenThreadId(null);
                  setAccountMenuOpen(false);
                  setSidebarOpen(true);
                }}
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
                aria-label="Expand sidebar"
              >
                ≡
              </button>
            </div>

            <div ref={accountMenuRef} className="absolute bottom-4 left-4 z-20 hidden md:block">
              <button
                type="button"
                onClick={() => {
                  setMenuOpenThreadId(null);
                  setAccountMenuOpen((current) => !current);
                }}
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition hover:opacity-85"
                aria-label="Open account menu"
              >
                {context?.avatarUrl ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${context.avatarUrl})` }}
                    role="img"
                    aria-label={accountProfileAriaLabel}
                  />
                ) : (
                  accountAvatarFallback
                )}
              </button>
              {renderAccountMenuPanel(
                "absolute bottom-[calc(100%+10px)] left-0 z-20 w-64 rounded-2xl border border-white/10 bg-zinc-950 p-1 shadow-2xl",
              )}
            </div>
          </>
        ) : null}

        <div className="relative flex h-full min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((current) => !current)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white md:hidden"
                  aria-label="Toggle sidebar"
                >
                  ≡
                </button>
              </div>
              <div className="flex justify-center">
                <div className="rounded-full border border-white/10 px-4 py-2">
                  <Image
                    src="/xpo-logo-white.svg"
                    alt="Xpo"
                    width={846}
                    height={834}
                    className="h-5 w-auto"
                    priority
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setExtensionModalOpen(true)}
                  className="hidden items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.04] md:inline-flex"
                >
                  <span>Companion App</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </header>

          <section ref={threadScrollRef} className="min-h-0 flex-1 overflow-y-auto">
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
                                disabled={isMainChatLocked || !activeStrategyInputs || !activeToneInputs}
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
                                    isMainChatLocked
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
                                disabled={isMainChatLocked || !activeStrategyInputs || !activeToneInputs}
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
                          ref={(node) => {
                            messageRefs.current[message.id] = node;
                          }}
                          className={`max-w-[88%] px-4 py-3 text-sm leading-8 ${message.role === "assistant"
                            ? "text-zinc-100"
                            : "ml-auto rounded-[1.75rem] bg-white px-4 py-3 text-black"
                            }`}
                        >
                          {message.role === "assistant" && message.isStreaming ? (
                            <AssistantTypingBubble status={message.content || null} />
                          ) : (
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
                          )}

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
                                  disabled={isMainChatLocked || !activeStrategyInputs || !activeToneInputs}
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
                                    onClick={() => {
                                      void handleAngleSelect(title);
                                    }}
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
                            message.outputShape !== "long_form_post" &&
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
                                getDisplayedDraftCharacterLimit(
                                  draftBundle?.activeVersion.maxCharacterLimit ?? composerCharacterLimit,
                                  composerCharacterLimit,
                                ),
                              );
                              const isLongformPreview =
                                message.outputShape === "long_form_post" ||
                                (draftBundle?.activeVersion.maxCharacterLimit ?? 280) > 280;
                              const transformDraftPrompt = isLongformPreview
                                ? "turn this into a shortform post under 280 characters"
                                : "turn this into a longform post with more detail";
                              const isFocusedDraftPreview =
                                selectedDraftMessageId === message.id;
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
                                    className={`cursor-pointer rounded-2xl bg-[#000000] p-4 transition-[border-color,box-shadow,background-color] duration-300 ${
                                      isFocusedDraftPreview
                                        ? "border border-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_34px_rgba(255,255,255,0.16)]"
                                        : "border border-white/[0.08] hover:border-white/15 hover:bg-[#0F0F0F]"
                                    }`}
                                    aria-current={isFocusedDraftPreview ? "true" : undefined}
                                  >
                                    {/* Header: avatar + name + handle */}
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex min-w-0 flex-1 items-start gap-3">
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
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1">
                                            <span className="truncate text-sm font-bold text-white">{displayName}</span>
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
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDraftEditor(message.id);
                                        }}
                                        className="rounded-full p-2 text-zinc-500"
                                        aria-label="Edit draft"
                                      >
                                        <Edit3 className="h-4 w-4" />
                                      </button>
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
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={isMainChatLocked}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void requestDraftCardRevision(
                                              message.id,
                                              "make it shorter",
                                            );
                                          }}
                                          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                                        >
                                          Shorter
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isMainChatLocked}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void requestDraftCardRevision(
                                              message.id,
                                              "make it longer and more detailed",
                                            );
                                          }}
                                          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                                        >
                                          Longer
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isMainChatLocked}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void requestDraftCardRevision(
                                              message.id,
                                              transformDraftPrompt,
                                            );
                                          }}
                                          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
                                        >
                                          {isLongformPreview
                                            ? "Turn into Shortform"
                                            : "Turn into Longform"}
                                        </button>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void copyPreviewDraft(message.id, previewDraft);
                                          }}
                                          className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                                          aria-label="Copy draft"
                                        >
                                          {copiedPreviewDraftMessageId === message.id ? (
                                            <Check className="h-4 w-4" />
                                          ) : (
                                            <Copy className="h-4 w-4" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            shareDraftEditorToX();
                                          }}
                                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
                                        >
                                          Post
                                          <ArrowUpRight className="h-3.5 w-3.5" />
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
              {showScrollToLatest && !shouldCenterHero ? (
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={scrollThreadToBottom}
                    className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0F0F0F]/90 text-zinc-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
                    aria-label="Jump to latest message"
                  >
                    <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                  </button>
                </div>
              ) : null}
              <form onSubmit={handleComposerSubmit}>
                <div className={dockComposerSurfaceClassName}>
                  <textarea
                    value={draftInput}
                    onChange={(event) => setDraftInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Send a message..."
                    disabled={isMainChatLocked || !activeStrategyInputs || !activeToneInputs}
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
                        isMainChatLocked
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
            <div className="pointer-events-none fixed bottom-32 right-4 top-24 z-20 hidden lg:block xl:right-6">
              <div className="pointer-events-auto flex h-full w-[25.5rem] max-w-[calc(100vw-24rem)] flex-col overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                  <div className="px-5 pb-3 pt-5">
                    <div className="flex items-start justify-between gap-4">
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

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigateDraftTimeline("back")}
                            disabled={!canNavigateDraftBack}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Previous draft version"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateDraftTimeline("forward")}
                            disabled={!canNavigateDraftForward}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Next draft version"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="truncate text-[11px] font-medium text-zinc-500">
                          Version {selectedDraftTimelinePosition}
                          {" "}of {selectedDraftTimeline.length}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void (shouldShowRevertDraftCta
                            ? revertToSelectedDraftVersion()
                            : saveDraftEditor());
                        }}
                        disabled={isDraftEditorPrimaryActionDisabled}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {draftEditorPrimaryActionLabel}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden px-5 pb-5">
                    {isViewingHistoricalDraftVersion ? (
                      <div className="h-full min-h-full overflow-y-auto whitespace-pre-wrap text-[16px] leading-8 text-white">
                        {editorDraftText}
                      </div>
                    ) : (
                      <textarea
                        value={editorDraftText}
                        onChange={(event) => setEditorDraftText(event.target.value)}
                        className="h-full min-h-full w-full resize-none overflow-y-auto bg-transparent pr-1 text-[16px] leading-8 text-white outline-none placeholder:text-zinc-600"
                        placeholder="Draft content"
                      />
                    )}
                  </div>

                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          void runDraftInspector();
                        }}
                        disabled={isDraftInspectorLoading}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {draftInspectorActionLabel}
                      </button>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-500">
                          {computeXWeightedCharacterCount(editorDraftText)}/
                          {getDisplayedDraftCharacterLimit(
                            selectedDraftVersion.maxCharacterLimit,
                            composerCharacterLimit,
                          )} chars
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            void copyDraftEditor();
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                          aria-label="Copy current draft"
                        >
                          {hasCopiedDraftEditorText ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            shareDraftEditorToX();
                          }}
                          className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-200"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
            </div>

            <div className="fixed inset-x-4 bottom-20 top-20 z-20 lg:hidden sm:inset-x-6 sm:bottom-16 sm:top-16 md:left-auto md:right-6 md:top-24 md:bottom-24 md:w-[26rem] md:max-w-[calc(100vw-3rem)]">
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                <div className="px-4 pb-3 pt-4">
                  <div className="flex items-start justify-between gap-4">
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

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => navigateDraftTimeline("back")}
                          disabled={!canNavigateDraftBack}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Previous draft version"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateDraftTimeline("forward")}
                          disabled={!canNavigateDraftForward}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Next draft version"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="truncate text-[11px] text-zinc-500">
                        Version {selectedDraftTimelinePosition}
                        {" "}of {selectedDraftTimeline.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void (shouldShowRevertDraftCta
                          ? revertToSelectedDraftVersion()
                          : saveDraftEditor());
                      }}
                      disabled={isDraftEditorPrimaryActionDisabled}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {draftEditorPrimaryActionLabel}
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
                  {isViewingHistoricalDraftVersion ? (
                    <div className="h-full min-h-full overflow-y-auto whitespace-pre-wrap text-[15px] leading-7 text-white">
                      {editorDraftText}
                    </div>
                  ) : (
                    <textarea
                      value={editorDraftText}
                      onChange={(event) => setEditorDraftText(event.target.value)}
                      className="h-full min-h-full w-full resize-none overflow-y-auto bg-transparent pr-1 text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600"
                      placeholder="Draft content"
                    />
                  )}
                </div>

                <div className="border-t border-white/10 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void runDraftInspector();
                      }}
                      disabled={isDraftInspectorLoading}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {draftInspectorActionLabel}
                    </button>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-zinc-500">
                        {computeXWeightedCharacterCount(editorDraftText)}/
                        {getDisplayedDraftCharacterLimit(
                          selectedDraftVersion.maxCharacterLimit,
                          composerCharacterLimit,
                        )} chars
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void copyDraftEditor();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                        aria-label="Copy current draft"
                      >
                        {hasCopiedDraftEditorText ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          shareDraftEditorToX();
                        }}
                        className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-200"
                      >
                        Share
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
        extensionModalOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setExtensionModalOpen(false);
              }
            }}
          >
            <div className="relative my-auto w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl max-sm:max-h-[calc(100vh-2rem)] max-sm:overflow-y-auto">
              <button
                type="button"
                onClick={() => setExtensionModalOpen(false)}
                className="absolute right-4 top-4 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
              >
                Close
              </button>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Companion App
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Companion App
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">
                    We&apos;ll wire the real extension flow next. For now, this is the placeholder entry point.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {}}
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.04]"
                >
                  Link to download
                </button>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        preferencesOpen && context ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPreferencesOpen(false);
              }
            }}
          >
            <div className="relative my-auto flex w-full max-w-5xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Preferences
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Tune how Xpo writes for this profile
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                    Set defaults for formatting, tone, and verified-only character controls. The preview updates instantly and does not need the model.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={savePreferences}
                    disabled={isPreferencesLoading || isPreferencesSaving}
                    className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {isPreferencesSaving ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesOpen(false)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-6 py-6">
                <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex items-center gap-3">
                        <Settings2 className="h-4 w-4 text-zinc-500" />
                        <div>
                          <p className="text-sm font-semibold text-white">Core Settings</p>
                          <p className="text-xs text-zinc-500">Quick defaults for formatting and tone.</p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-5">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                            <Type className="h-4 w-4 text-zinc-500" />
                            <span>Default casing</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: "Auto", value: "auto" },
                              { label: "Normal", value: "normal" },
                              { label: "Lowercase", value: "lowercase" },
                              { label: "Uppercase", value: "uppercase" },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setPreferenceCasing(
                                    option.value as
                                      | "auto"
                                      | "normal"
                                      | "lowercase"
                                      | "uppercase",
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  preferenceCasing === option.value
                                    ? "bg-white text-black"
                                    : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                            <List className="h-4 w-4 text-zinc-500" />
                            <span>Bullet style</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: "Auto", value: "auto" },
                              { label: "Dash (-)", value: "-" },
                              { label: "Angle (>)", value: ">" },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setPreferenceBulletStyle(
                                    option.value as "auto" | "-" | ">",
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  preferenceBulletStyle === option.value
                                    ? "bg-white text-black"
                                    : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                            <BarChart3 className="h-4 w-4 text-zinc-500" />
                            <span>Writing goal</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: "Closer to my voice", value: "voice" },
                              { label: "Balanced", value: "balanced" },
                              { label: "Optimize for growth", value: "growth" },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setPreferenceWritingMode(
                                    option.value as "voice" | "balanced" | "growth",
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  preferenceWritingMode === option.value
                                    ? "bg-white text-black"
                                    : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setPreferenceUseEmojis((current) => !current)}
                            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                              preferenceUseEmojis
                                ? "border-white/20 bg-white/[0.06]"
                                : "border-white/10 bg-black/20"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Smile className="h-4 w-4 text-zinc-500" />
                              <span className="text-sm text-zinc-300">Use emojis</span>
                            </div>
                            <span
                              className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
                                preferenceUseEmojis ? "bg-emerald-500/70" : "bg-zinc-800"
                              }`}
                            >
                              <span
                                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                  preferenceUseEmojis ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreferenceAllowProfanity((current) => !current)}
                            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                              preferenceAllowProfanity
                                ? "border-white/20 bg-white/[0.06]"
                                : "border-white/10 bg-black/20"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-zinc-500" />
                              <span className="text-sm text-zinc-300">Allow profanity</span>
                            </div>
                            <span
                              className={`relative flex h-6 w-11 items-center rounded-full px-1 transition ${
                                preferenceAllowProfanity ? "bg-emerald-500/70" : "bg-zinc-800"
                              }`}
                            >
                              <span
                                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                  preferenceAllowProfanity ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                            <Ban className="h-4 w-4 text-zinc-500" />
                            <span>Blacklist words or emojis</span>
                          </label>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={preferenceBlacklistInput}
                                onChange={handlePreferenceBlacklistInputChange}
                                onKeyDown={handlePreferenceBlacklistInputKeyDown}
                                placeholder="type a word, then press enter or comma"
                                className="min-w-[12rem] flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                              />
                              {preferenceBlacklistedTerms.map((term, index) => (
                                <span
                                  key={`${term}-${index}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300"
                                >
                                  <span>{term}</span>
                                  <button
                                    type="button"
                                    onClick={() => removePreferenceBlacklistedTerm(index)}
                                    className="text-zinc-500 transition hover:text-white"
                                    aria-label={`Remove ${term} from blacklist`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex items-center gap-3">
                        {isVerifiedAccount ? (
                          <Image
                            src="/x-verified.svg"
                            alt="Verified settings"
                            width={16}
                            height={16}
                            className="h-4 w-4"
                          />
                        ) : (
                          <BarChart3 className="h-4 w-4 text-zinc-500" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-white">Verified Settings</p>
                          <p className="text-xs text-zinc-500">
                            Custom max length only applies to verified accounts. Unverified users are capped to 250 characters.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-sm font-medium text-zinc-300">Maximum character count</label>
                          <input
                            type="number"
                            min={250}
                            max={25000}
                            step={10}
                            value={effectivePreferenceMaxCharacters}
                            disabled={!isVerifiedAccount}
                            onChange={(event) =>
                              setPreferenceMaxCharacters(
                                Number.parseInt(event.target.value || "250", 10) || 250,
                              )
                            }
                            className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right text-sm text-white outline-none disabled:cursor-not-allowed disabled:text-zinc-600"
                          />
                        </div>
                        <input
                          type="range"
                          min={250}
                          max={25000}
                          step={50}
                          value={effectivePreferenceMaxCharacters}
                          disabled={!isVerifiedAccount}
                          onChange={(event) =>
                            setPreferenceMaxCharacters(
                              Number.parseInt(event.target.value || "250", 10) || 250,
                            )
                          }
                          className="w-full accent-white disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                          <span>250</span>
                          <span>25,000</span>
                        </div>
                      </div>
                    </div>
                  </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Preview Tweet
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      The preview updates as you change settings.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-[#0F0F0F] p-4">
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
                          (context.creatorProfile.identity.displayName || context.creatorProfile.identity.username || "X").charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-bold text-white">
                            {context.creatorProfile.identity.displayName || context.creatorProfile.identity.username}
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

                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                      {preferencesPreviewDraft}
                    </p>

                    <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500">
                      <span>Just now</span>
                      <span>·</span>
                      <span className={preferencesPreviewCounter.toneClassName}>
                        {preferencesPreviewCounter.label}
                      </span>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        playbookModalOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPlaybookModalOpen(false);
              }
            }}
          >
            <div className="relative my-auto w-full max-w-lg rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl max-sm:max-h-[calc(100vh-2rem)] max-sm:overflow-y-auto">
              <button
                type="button"
                onClick={() => setPlaybookModalOpen(false)}
                className="absolute right-4 top-4 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
              >
                Close
              </button>

              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Playbook
                </p>
                <h2 className="text-2xl font-semibold text-white">
                  Playbook coming soon
                </h2>
                <p className="text-sm leading-7 text-zinc-400">
                  We&apos;ll add the full playbook flow here next.
                </p>
              </div>
            </div>
          </div>
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
