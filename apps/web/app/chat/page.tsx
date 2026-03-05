"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  Fragment,
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
import { ArrowUpRight, Ban, BarChart3, BookOpen, Bug, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Check, Copy, Edit3, ImagePlus, Lightbulb, List, LogOut, MessageSquareText, MoreVertical, Plus, Settings2, Smile, Sparkles, ThumbsDown, ThumbsUp, Trash2, Type } from "lucide-react";

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
  persistedAt?: string;
}

interface OnboardingRunFailure {
  ok: false;
  code?: "PLAN_REQUIRED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
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

interface BillingSnapshotPayload {
  plan: "free" | "pro" | "lifetime";
  status: "active" | "past_due" | "canceled" | "blocked_fair_use";
  billingCycle: "monthly" | "annual" | "lifetime";
  creditsRemaining: number;
  creditLimit: number;
  creditCycleResetsAt: string;
  showFirstPricingModal: boolean;
  lowCreditWarning: boolean;
  criticalCreditWarning: boolean;
  fairUse: {
    softWarningThreshold: number;
    reviewThreshold: number;
    hardStopThreshold: number;
    isSoftWarning: boolean;
    isReviewLevel: boolean;
    isHardStopped: boolean;
  };
}

interface BillingStatePayload {
  billing: BillingSnapshotPayload;
  lifetimeSlots: {
    total: number;
    sold: number;
    reserved: number;
    remaining: number;
  };
  offers: Array<{
    offer: "pro_monthly" | "pro_annual" | "lifetime";
    label: string;
    amountCents: number;
    cadence: "month" | "year" | "one_time";
    productCopy: string;
    enabled: boolean;
  }>;
  supportEmail: string;
}

interface BillingStateSuccess {
  ok: true;
  data: BillingStatePayload;
}

interface BillingStateFailure {
  ok: false;
  code?:
    | "INSUFFICIENT_CREDITS"
    | "PLAN_REQUIRED"
    | "RATE_LIMITED"
    | "SOLD_OUT"
    | "ALREADY_SUBSCRIBED"
    | "PLAN_SWITCH_IN_PORTAL";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
}

type BillingStateResponse = BillingStateSuccess | BillingStateFailure;

interface DraftInspectorSuccess {
  ok: true;
  data: {
    summary: string;
    prompt: string;
    userMessageId: string;
    assistantMessageId: string;
    billing?: BillingStatePayload;
  };
}

interface DraftInspectorFailure {
  ok: false;
  code?: "INSUFFICIENT_CREDITS" | "PLAN_REQUIRED" | "RATE_LIMITED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
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

type FeedbackCategory = "feature_request" | "feedback" | "bug_report";
type FeedbackReportStatus = "open" | "resolved" | "cancelled";
type FeedbackReportFilter = "all" | FeedbackReportStatus;

interface FeedbackAttachmentPayload {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending_upload";
  signatureHex?: string | null;
  thumbnailDataUrl?: string | null;
}

interface FeedbackSubmitSuccess {
  ok: true;
  data: {
    id: string;
    createdAt: string;
    profileId: string;
  };
}

interface FeedbackSubmitFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackSubmitResponse = FeedbackSubmitSuccess | FeedbackSubmitFailure;

interface FeedbackHistoryItem {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  status?: FeedbackReportStatus;
  statusUpdatedAt?: string;
  statusUpdatedByUserId?: string | null;
  title?: string | null;
  message: string;
  attachments: FeedbackAttachmentPayload[];
}

interface FeedbackHistorySuccess {
  ok: true;
  data: {
    submissions: FeedbackHistoryItem[];
  };
}

interface FeedbackHistoryFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackHistoryResponse = FeedbackHistorySuccess | FeedbackHistoryFailure;

interface FeedbackStatusUpdateSuccess {
  ok: true;
  data: {
    submission: FeedbackHistoryItem;
  };
}

interface FeedbackStatusUpdateFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackStatusUpdateResponse =
  | FeedbackStatusUpdateSuccess
  | FeedbackStatusUpdateFailure;

const FEEDBACK_HISTORY_FILTER_OPTIONS: Array<{
  value: FeedbackReportFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
];

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
    billing?: BillingStatePayload;
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
  code?: "INSUFFICIENT_CREDITS" | "PLAN_REQUIRED" | "RATE_LIMITED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
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

type MessageFeedbackValue = "up" | "down";

interface ChatMessage {
  id: string;
  threadId?: string;
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
  feedbackValue?: MessageFeedbackValue | null;
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

interface MessageFeedbackMutationSuccess {
  ok: true;
  data: {
    feedback: {
      id: string;
      userId: string;
      threadId: string;
      messageId: string;
      value: MessageFeedbackValue;
      createdAt: string;
      updatedAt: string;
    };
  };
}

interface MessageFeedbackMutationFailure {
  ok: false;
  errors: ValidationError[];
}

interface MessageFeedbackClearSuccess {
  ok: true;
  data: {
    messageId: string;
    cleared: boolean;
  };
}

type MessageFeedbackMutationResponse =
  | MessageFeedbackMutationSuccess
  | MessageFeedbackMutationFailure
  | MessageFeedbackClearSuccess;

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

function formatUsdPrice(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function parsePublicUsdToCents(rawValue: string | undefined, fallbackCents: number): number {
  if (!rawValue) {
    return fallbackCents;
  }

  const normalized = rawValue.trim().replace(/\$/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackCents;
  }

  return Math.round(parsed * 100);
}

const DEFAULT_MODAL_PRO_MONTHLY_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_MONTHLY_USD,
  1999,
);
const DEFAULT_MODAL_PRO_ANNUAL_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_PRO_ANNUAL_USD,
  19999,
);
const DEFAULT_MODAL_LIFETIME_CENTS = parsePublicUsdToCents(
  process.env.NEXT_PUBLIC_BILLING_PRICE_FOUNDER_PASS_USD ??
    process.env.NEXT_PUBLIC_BILLING_PRICE_LIFETIME_USD,
  49900,
);
const MODAL_FREE_CREDITS_PER_MONTH = 50;
const MODAL_PRO_CREDITS_PER_MONTH = 500;
const MODAL_CHAT_TURN_CREDIT_COST = 2;
const MODAL_DRAFT_TURN_CREDIT_COST = 5;
const MODAL_FREE_APPROX_CHAT_TURNS = Math.floor(
  MODAL_FREE_CREDITS_PER_MONTH / MODAL_CHAT_TURN_CREDIT_COST,
);
const MODAL_FREE_APPROX_DRAFT_TURNS = Math.floor(
  MODAL_FREE_CREDITS_PER_MONTH / MODAL_DRAFT_TURN_CREDIT_COST,
);
const MODAL_PRO_APPROX_CHAT_TURNS = Math.floor(
  MODAL_PRO_CREDITS_PER_MONTH / MODAL_CHAT_TURN_CREDIT_COST,
);
const MODAL_PRO_APPROX_DRAFT_TURNS = Math.floor(
  MODAL_PRO_CREDITS_PER_MONTH / MODAL_DRAFT_TURN_CREDIT_COST,
);

const BASE_HERO_QUICK_ACTIONS = [
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

function shouldUseLowercaseChipVoice(context: CreatorAgentContext | null): boolean {
  const voice = context?.creatorProfile.voice;
  return (
    voice?.primaryCasing === "lowercase" &&
    (voice.lowercaseSharePercent ?? 0) >= 70
  );
}

function applyChipVoiceCase(value: string, lowercase: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return lowercase ? normalized.toLowerCase() : normalized;
}

function buildHeroQuickActions(lowercase: boolean): Array<{ label: string; prompt: string }> {
  return BASE_HERO_QUICK_ACTIONS.map((action) => ({
    label: applyChipVoiceCase(action.label, lowercase),
    prompt: applyChipVoiceCase(action.prompt, lowercase),
  }));
}

function buildDefaultExampleQuickReplies(lowercase: boolean): ChatQuickReply[] {
  const baseReplies: ChatQuickReply[] = [
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
  ];

  return baseReplies.map((reply) => ({
    ...reply,
    value: applyChipVoiceCase(reply.value, lowercase),
    label: applyChipVoiceCase(reply.label, lowercase),
  }));
}

const HERO_EXIT_TRANSITION_MS = 720;
const DRAFT_TIMELINE_FOCUS_DELAY_MS = 0;
const FEEDBACK_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const FEEDBACK_MAX_FILES = 6;
const FEEDBACK_SUPPORTED_FILE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "video/mp4",
]);

interface FeedbackCategoryConfig {
  label: string;
  helper: string;
  defaultTitle: string;
  template: string;
  exampleTitle: string;
  exampleBody: string;
}

const FEEDBACK_CATEGORY_ORDER: FeedbackCategory[] = [
  "feedback",
  "feature_request",
  "bug_report",
];

const FEEDBACK_CATEGORY_CONFIG: Record<FeedbackCategory, FeedbackCategoryConfig> = {
  feature_request: {
    label: "Feature Request",
    helper: "Share the missing workflow and why it matters in your day-to-day.",
    defaultTitle: "Feature request",
    template:
      "**🚧 Problem:**\nWhat slows you down right now?\n\n**✨ Requested feature:**\nWhat should happen instead?\n\n**📈 Expected impact:**\nHow this would improve your workflow or outcomes.",
    exampleTitle: "Good example",
    exampleBody:
      "Problem: when i'm refining drafts, i keep opening each card to compare versions and lose context.\n\nRequested feature: add an inline diff toggle in the draft editor that shows added/removed lines between the selected version and current version.\n\nExpected impact: i'd ship revisions faster because i can compare changes in one view without bouncing around the thread.",
  },
  feedback: {
    label: "Feedback",
    helper: "Tell us what feels good and what still feels off in normal use.",
    defaultTitle: "Feedback",
    template:
      "**✅ What worked well:**\n\n**🤔 What felt confusing or slow:**\n\n**🛠️ Suggested improvement:**\n\n**📝 Anything else:**",
    exampleTitle: "Good example",
    exampleBody:
      "What worked well: the new growth guide is way easier to skim.\n\nWhat felt confusing or slow: evidence cards in profile analysis all look the same at first glance.\n\nSuggested improvement: add one-line labels that explain each card's unique signal before the post text.\n\nAnything else: i'm using this mostly on laptop + devtools split view.",
  },
  bug_report: {
    label: "Bug Report",
    helper: "Include repro steps + expected vs actual so we can fix it quickly.",
    defaultTitle: "Bug report",
    template:
      "**🐞 Summary:**\n\n**🧪 Steps to reproduce:**\n1.\n2.\n3.\n\n**✅ Expected result:**\n\n**❌ Actual result:**\n\n**📊 Frequency / impact:**",
    exampleTitle: "Good example",
    exampleBody:
      "Summary: draft editor jumps to 1/1 after pressing Back once.\n\nSteps to reproduce:\n1. open a draft with at least 3 versions.\n2. press Back in the version navigator.\n3. try pressing Forward.\n\nExpected result: forward returns to the newer version.\n\nActual result: it shows 1/1 and forward stays disabled.\n\nFrequency / impact: always reproducible. blocks revision workflow.",
  },
};

function buildDefaultFeedbackDrafts(): Record<FeedbackCategory, string> {
  return FEEDBACK_CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = FEEDBACK_CATEGORY_CONFIG[category].template;
      return acc;
    },
    {
      feature_request: "",
      feedback: "",
      bug_report: "",
    } as Record<FeedbackCategory, string>,
  );
}

function buildDefaultFeedbackTitles(): Record<FeedbackCategory, string> {
  return FEEDBACK_CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = FEEDBACK_CATEGORY_CONFIG[category].defaultTitle;
      return acc;
    },
    {
      feedback: "",
      feature_request: "",
      bug_report: "",
    } as Record<FeedbackCategory, string>,
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kb = sizeBytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

async function readFeedbackFileSignatureHex(file: File): Promise<string | null> {
  try {
    const signatureBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (signatureBytes.length === 0) {
      return null;
    }

    return Array.from(signatureBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function buildFeedbackImageThumbnailDataUrl(
  file: File,
): Promise<string | null> {
  if (!file.type.toLowerCase().startsWith("image/")) {
    return null;
  }

  try {
    const sourceDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Invalid image data"));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to decode image"));
      nextImage.src = sourceDataUrl;
    });

    const maxDimension = 220;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

function normalizeFeedbackStatus(
  status: FeedbackReportStatus | undefined,
): FeedbackReportStatus {
  return status ?? "open";
}

function formatFeedbackStatusLabel(status: FeedbackReportStatus): string {
  switch (status) {
    case "resolved":
      return "Resolved";
    case "cancelled":
      return "Cancelled";
    default:
      return "Open";
  }
}

function getFeedbackStatusPillClassName(status: FeedbackReportStatus): string {
  if (status === "resolved") {
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  }

  if (status === "cancelled") {
    return "border-rose-300/30 bg-rose-300/10 text-rose-200";
  }

  return "border-white/10 text-zinc-300";
}

function getFeedbackHistoryActivityTimestamp(entry: FeedbackHistoryItem): number {
  const candidate = entry.statusUpdatedAt ?? entry.createdAt;
  const parsed = Date.parse(candidate);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const createdAt = Date.parse(entry.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function isSupportedFeedbackFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (FEEDBACK_SUPPORTED_FILE_MIME_TYPES.has(mimeType)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".mp4")
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineMarkdown(value: string): string {
  return value
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
}

function renderFeedbackMarkdownToHtml(markdown: string): string {
  const source = escapeHtml(markdown).replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }

    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      flushList();
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const item = applyInlineMarkdown(trimmedLine.replace(/^[-*]\s+/, ""));
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${item}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const item = applyInlineMarkdown(trimmedLine.replace(/^\d+\.\s+/, ""));
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${item}</li>`);
      continue;
    }

    flushList();

    if (/^###\s+/.test(trimmedLine)) {
      html.push(`<h3>${applyInlineMarkdown(trimmedLine.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }

    if (/^##\s+/.test(trimmedLine)) {
      html.push(`<h2>${applyInlineMarkdown(trimmedLine.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (/^#\s+/.test(trimmedLine)) {
      html.push(`<h1>${applyInlineMarkdown(trimmedLine.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }

    if (/^>\s+/.test(trimmedLine)) {
      html.push(
        `<blockquote>${applyInlineMarkdown(trimmedLine.replace(/^>\s+/, ""))}</blockquote>`,
      );
      continue;
    }

    if (/^---+$/.test(trimmedLine)) {
      html.push("<hr />");
      continue;
    }

    html.push(`<p>${applyInlineMarkdown(rawLine)}</p>`);
  }

  flushList();

  if (html.length === 0) {
    return "<p>Start typing your feedback…</p>";
  }

  return html.join("");
}

function extractFeedbackTemplateFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const normalizedHeading = line.replace(/\*\*/g, "").trim();
    if (/^[^:]{1,80}:$/.test(normalizedHeading)) {
      if (currentKey && currentValue.length > 0) {
        fields[currentKey] = currentValue.join(" ").trim();
      }
      currentKey = normalizedHeading.replace(/:$/, "").toLowerCase();
      currentValue = [];
      continue;
    }

    if (!line) {
      continue;
    }

    if (currentKey) {
      currentValue.push(line.replace(/^\d+\.\s*/, ""));
    }
  }

  if (currentKey && currentValue.length > 0) {
    fields[currentKey] = currentValue.join(" ").trim();
  }

  return fields;
}

type PlaybookStageKey = "0-1k" | "1k-10k" | "10k-50k" | "50k+";
type PlaybookTemplateTab = "hook" | "reply" | "thread" | "cta";

interface PlaybookTemplate {
  id: string;
  label: string;
  text: string;
}

interface PlaybookDefinition {
  id: string;
  name: string;
  outcome: string;
  whenItWorks: string;
  difficulty: string;
  timePerDay: string;
  bestFor: string[];
  loop: {
    input: string;
    action: string;
    feedback: string;
  };
  checklist: {
    daily: string[];
    weekly: string[];
  };
  templates: PlaybookTemplate[];
  metrics: string[];
  rationale: string;
  mistakes: string[];
  examples: string[];
  quickStart: string[];
}

const PLAYBOOK_STAGE_ORDER: PlaybookStageKey[] = ["0-1k", "1k-10k", "10k-50k", "50k+"];

const PLAYBOOK_STAGE_META: Record<
  PlaybookStageKey,
  {
    label: string;
    highlight: string;
    winCondition: string;
    bottleneck: string;
    priorities: string[];
    contentMix: {
      replies: number;
      posts: number;
      threads: number;
    };
  }
> = {
  "0-1k": {
    label: "0→1k",
    highlight: "discovery + reps",
    winCondition: "win by getting discovered consistently and learning fast.",
    bottleneck: "your bottleneck is discovery. the win condition is consistent impressions from replies and proof posts.",
    priorities: ["discovery", "consistency", "proof"],
    contentMix: { replies: 60, posts: 30, threads: 10 },
  },
  "1k-10k": {
    label: "1k→10k",
    highlight: "consistent format + clear topic",
    winCondition: "win by becoming known for one clear topic.",
    bottleneck: "your bottleneck is clarity. people should quickly understand what you post about.",
    priorities: ["positioning", "formats", "proof"],
    contentMix: { replies: 40, posts: 40, threads: 20 },
  },
  "10k-50k": {
    label: "10k→50k",
    highlight: "distribution + collabs",
    winCondition: "win by getting your best posts seen through smart collaboration.",
    bottleneck: "your bottleneck is reach. focus on distribution and collaboration, not more generic posts.",
    priorities: ["distribution", "collabs", "systems"],
    contentMix: { replies: 35, posts: 35, threads: 30 },
  },
  "50k+": {
    label: "50k+",
    highlight: "systems + leverage",
    winCondition: "win by turning trust into leverage without losing signal.",
    bottleneck: "your bottleneck is leverage and trust maintenance. the writing needs to support a bigger operating system.",
    priorities: ["leverage", "systems", "trust"],
    contentMix: { replies: 20, posts: 35, threads: 45 },
  },
};

const PLAYBOOK_LIBRARY: Record<PlaybookStageKey, PlaybookDefinition[]> = {
  "0-1k": [
    {
      id: "reply-ladder",
      name: "Reply Ladder",
      outcome: "Get discovered by bigger accounts",
      whenItWorks: "best when your best ideas are still under-distributed",
      difficulty: "Easy",
      timePerDay: "15 min/day",
      bestFor: ["builders", "solo founders", "tech twitter"],
      loop: {
        input: "Find 10 prompts",
        action: "Write 3 replies + 1 post",
        feedback: "Track follows and profile clicks",
      },
      checklist: {
        daily: [
          "Reply to 10 posts (2 bigger accounts, 8 peers)",
          "Post 1 proof tweet (build progress, result, lesson)",
          "Save 3 high-performers to a swipe file",
        ],
        weekly: [
          "Turn your best reply into a standalone post",
          "Review which replies drove profile clicks",
        ],
      },
      templates: [
        {
          id: "reply-ladder-hook",
          label: "Hook",
          text: "i used to think ___, then i saw ___, now i do ___.",
        },
        {
          id: "reply-ladder-reply",
          label: "Reply",
          text: "this is true. the part ppl miss is ___. here's how i'd apply it: ___.",
        },
        {
          id: "reply-ladder-thread",
          label: "Thread skeleton",
          text: "1) what changed 2) what i tested 3) what happened 4) what i'd do next",
        },
      ],
      metrics: ["Replies/day", "Follows per 100 impressions", "7-day follower delta"],
      rationale: "This compounds because replies earn discovery before your own posts have enough reach to carry themselves.",
      mistakes: [
        "Writing generic agreement replies with no point of view",
        "Only replying to huge accounts",
        "Never turning the best replies into standalone posts",
      ],
      examples: [
        "a sharp disagree + example reply to a bigger account",
        "a build update that proves you're actually shipping",
        "a quick lesson post pulled from a winning reply",
      ],
      quickStart: [
        "Find 5 posts to reply to",
        "Write 3 replies using the template",
        "Turn the best reply into 1 original post",
      ],
    },
    {
      id: "daily-shipping-loop",
      name: "Daily Shipping Loop",
      outcome: "Build trust through visible proof",
      whenItWorks: "best when you need more reps and more proof",
      difficulty: "Easy",
      timePerDay: "20 min/day",
      bestFor: ["builders", "students", "indie hackers"],
      loop: {
        input: "Pick one thing you shipped",
        action: "Post the proof",
        feedback: "Track saves and replies",
      },
      checklist: {
        daily: [
          "Ship one small thing",
          "Screenshot or summarize the proof",
          "Post 1 proof tweet with a clear takeaway",
        ],
        weekly: [
          "Bundle 3 proof posts into a mini-thread",
          "Review which proof angle earned the most saves",
        ],
      },
      templates: [
        {
          id: "daily-shipping-hook",
          label: "Hook",
          text: "shipped ___ today. tiny win, but it fixed ___.",
        },
        {
          id: "daily-shipping-reply",
          label: "Reply",
          text: "i'd keep this simple: ship ___, share ___, then measure ___.",
        },
        {
          id: "daily-shipping-thread",
          label: "Thread skeleton",
          text: "1) what i built 2) why it mattered 3) what broke 4) what i learned",
        },
      ],
      metrics: ["Posts/week", "Save rate", "Reply count"],
      rationale: "At this stage, visible proof beats polished theory almost every time.",
      mistakes: [
        "Posting vague motivation with no artifact",
        "Skipping screenshots or concrete proof",
        "Turning every update into a long thread",
      ],
      examples: [
        "a before/after screenshot post",
        "a quick bug-fix lesson",
        "a short shipping recap with one takeaway",
      ],
      quickStart: [
        "Pick one thing you shipped today",
        "Capture the proof",
        "Write a quick proof-first hook",
      ],
    },
  ],
  "1k-10k": [
    {
      id: "weekly-series",
      name: "Weekly Series",
      outcome: "Build topic association and repeat engagement",
      whenItWorks: "best when people know you but not your signature format",
      difficulty: "Medium",
      timePerDay: "25 min/day",
      bestFor: ["builders", "operators", "career twitter"],
      loop: {
        input: "Pick one topic you'll post about every week",
        action: "Use one format people can recognize",
        feedback: "Track returning commenters and saves",
      },
      checklist: {
        daily: [
          "Collect one idea that fits the series",
          "Draft one hook for the next installment",
          "Reply on the same topic to reinforce your positioning",
        ],
        weekly: [
          "Ship 1 flagship post in the series",
          "Repurpose it into 1 smaller follow-up post",
        ],
      },
      templates: [
        {
          id: "weekly-series-hook",
          label: "Hook",
          text: "every tuesday i'm breaking down ___. here's this week's one:",
        },
        {
          id: "weekly-series-reply",
          label: "Reply",
          text: "this fits the same pattern i keep seeing: ___ -> ___ -> ___.",
        },
        {
          id: "weekly-series-thread",
          label: "Thread skeleton",
          text: "1) recurring problem 2) this week's example 3) the repeatable lesson",
        },
      ],
      metrics: ["Repeat commenters", "Series save rate", "Profile visits/post"],
      rationale: "Repeatable formats help people remember what you're known for faster than one-off posts.",
      mistakes: [
        "Changing topics every day",
        "Naming a series but not sticking to the cadence",
        "Overbuilding the format before validating it",
      ],
      examples: [
        "a weekly teardown format",
        "a recurring job-hunt update series",
        "a repeated build-in-public checkpoint post",
      ],
      quickStart: [
        "Pick one topic that already gets traction",
        "Name a simple recurring format",
        "Draft the next hook now",
      ],
    },
    {
      id: "contrarian-proof",
      name: "Contrarian Takes With Proof",
      outcome: "Sharpen positioning with stronger opinions",
      whenItWorks: "best when you have opinions and proof to back them up",
      difficulty: "Medium",
      timePerDay: "20 min/day",
      bestFor: ["experts", "founders", "niche educators"],
      loop: {
        input: "Spot a common opinion",
        action: "Post the inverse take with proof",
        feedback: "Track saves and quality replies",
      },
      checklist: {
        daily: [
          "Save one common take you disagree with",
          "Write one proof-backed counterpoint",
          "Reply to one thread with your contrarian lens",
        ],
        weekly: [
          "Ship 2 contrarian singles",
          "Expand the best one into a short thread",
        ],
      },
      templates: [
        {
          id: "contrarian-proof-hook",
          label: "Hook",
          text: "unpopular opinion: ___ is overrated. ___ matters more.",
        },
        {
          id: "contrarian-proof-reply",
          label: "Reply",
          text: "i think the better frame is ___. i've seen ___ prove it.",
        },
        {
          id: "contrarian-proof-thread",
          label: "Thread skeleton",
          text: "1) common belief 2) why it's wrong 3) proof 4) what to do instead",
        },
      ],
      metrics: ["Save rate", "Replies with substance", "Follower conversion"],
      rationale: "The take gets attention, but the proof is what keeps the take credible.",
      mistakes: [
        "Posting contrarian lines with no receipts",
        "Being edgy instead of useful",
        "Overexplaining before the hook lands",
      ],
      examples: [
        "a myth-busting post with one hard example",
        "a simple before/after result",
        "a short thread that starts with a clear disagreement",
      ],
      quickStart: [
        "Find one common belief you disagree with",
        "List one proof point",
        "Draft a short contrarian hook",
      ],
    },
  ],
  "10k-50k": [
    {
      id: "network-loops",
      name: "Network Loops",
      outcome: "Scale reach through high-signal relationships",
      whenItWorks: "best when the writing is solid but reach is capped",
      difficulty: "Medium",
      timePerDay: "30 min/day",
      bestFor: ["operators", "founders", "creators"],
      loop: {
        input: "Find 3 creators in your space",
        action: "Support each other with useful replies",
        feedback: "Track extra reach and profile follows",
      },
      checklist: {
        daily: [
          "Reply to 3 aligned peers with real value",
          "Amplify 1 post that matches your topic",
          "Open 1 useful conversation in DMs",
        ],
        weekly: [
          "Run 1 collaborative quote or thread",
          "Review which relationships grew your reach",
        ],
      },
      templates: [
        {
          id: "network-loops-hook",
          label: "Hook",
          text: "___ is the pattern i keep seeing across builders right now:",
        },
        {
          id: "network-loops-reply",
          label: "Reply",
          text: "this lines up with what i'm seeing too. one thing i'd add: ___.",
        },
        {
          id: "network-loops-thread",
          label: "Thread skeleton",
          text: "1) shared theme 2) your angle 3) collaborator proof 4) next move",
        },
      ],
      metrics: ["Shared reach", "Mutual reply rate", "Profile follows from collaborators"],
      rationale: "At this stage, getting shared by trusted peers beats posting alone.",
      mistakes: [
        "Treating networking like random outreach",
        "Only chasing bigger accounts",
        "Not turning repeated conversations into collaborative content",
      ],
      examples: [
        "a collaborative quote tweet",
        "a mutual reply chain that becomes a post",
        "a recap post with outside perspectives",
      ],
      quickStart: [
        "Pick 3 aligned accounts",
        "Write 1 useful reply for each",
        "Turn the strongest exchange into a post angle",
      ],
    },
    {
      id: "content-ip",
      name: "Content IP",
      outcome: "Build signature formats people recognize instantly",
      whenItWorks: "best when your audience needs a pattern they remember fast",
      difficulty: "Hard",
      timePerDay: "35 min/day",
      bestFor: ["educators", "creators", "operators"],
      loop: {
        input: "Pick one format you'll repeat",
        action: "Post it often so people recognize it",
        feedback: "Track repeat saves, shares, and mentions",
      },
      checklist: {
        daily: [
          "Collect one example for your format",
          "Refine the hook pattern, not the whole concept",
          "Post one lighter-format variant",
        ],
        weekly: [
          "Ship 1 flagship format post",
          "Repurpose it into 2 smaller spins",
        ],
      },
      templates: [
        {
          id: "content-ip-hook",
          label: "Hook",
          text: "pattern #__: if ___, then ___, because ___.",
        },
        {
          id: "content-ip-reply",
          label: "Reply",
          text: "this fits the same framework i use: ___ -> ___ -> ___.",
        },
        {
          id: "content-ip-thread",
          label: "Thread skeleton",
          text: "1) pattern name 2) setup 3) examples 4) when it fails 5) use it",
        },
      ],
      metrics: ["Mentions of your format", "Saves per flagship post", "Repeat audience"],
      rationale: "Signature formats make your writing easier to recognize and easier to share.",
      mistakes: [
        "Making the format too broad to feel distinct",
        "Changing the branding every week",
        "Posting the flagship too rarely to stick",
      ],
      examples: [
        "a signature teardown format",
        "a named framework post",
        "a repeatable weekly pattern post",
      ],
      quickStart: [
        "Name one format you'll repeat",
        "Write its base structure",
        "Draft a flagship version today",
      ],
    },
  ],
  "50k+": [
    {
      id: "narrative-arcs",
      name: "Narrative Arcs",
      outcome: "Keep trust high while scaling reach",
      whenItWorks: "best when your audience is following the bigger journey",
      difficulty: "Hard",
      timePerDay: "30 min/day",
      bestFor: ["founders", "creators", "operators"],
      loop: {
        input: "Pick the next chapter in your story",
        action: "Share it across posts, replies, and threads",
        feedback: "Track trust signals, replies, and conversions",
      },
      checklist: {
        daily: [
          "Check where your story currently stands",
          "Post one update that advances the arc",
          "Reply to key audience questions to keep trust high",
        ],
        weekly: [
          "Map the next three story chapters",
          "Review what moved attention vs what moved trust",
        ],
      },
      templates: [
        {
          id: "narrative-arcs-hook",
          label: "Hook",
          text: "quick update on ___: here's what's changed since last week.",
        },
        {
          id: "narrative-arcs-reply",
          label: "Reply",
          text: "the next piece of the story is ___. that's what i'm watching now.",
        },
        {
          id: "narrative-arcs-thread",
          label: "Thread skeleton",
          text: "1) where we were 2) what changed 3) what it means 4) what's next",
        },
      ],
      metrics: ["7-day follower delta", "High-signal replies", "Conversion quality"],
      rationale: "At scale, the story you reinforce matters as much as the single post that spikes.",
      mistakes: [
        "Optimizing only for spikes and losing trust",
        "Changing narrative direction too often",
        "Ignoring audience confusion signals",
      ],
      examples: [
        "a milestone update with context",
        "a product narrative checkpoint",
        "a community update with a clear next step",
      ],
      quickStart: [
        "Pick the next story chapter",
        "Write one update",
        "Decide what signal proves it worked",
      ],
    },
    {
      id: "community-flywheel",
      name: "Community Flywheel",
      outcome: "Turn audience attention into durable leverage",
      whenItWorks: "best when your audience already participates and responds",
      difficulty: "Hard",
      timePerDay: "40 min/day",
      bestFor: ["operators", "founders", "community-led brands"],
      loop: {
        input: "Pull signals from the audience",
        action: "Turn them into posts and product improvements",
        feedback: "Track retention and trust",
      },
      checklist: {
        daily: [
          "Collect 3 recurring audience questions",
          "Turn one into a post or reply cluster",
          "Close one loop with a clear next action",
        ],
        weekly: [
          "Ship one audience-led content asset",
          "Review what deepened trust vs what only spiked reach",
        ],
      },
      templates: [
        {
          id: "community-flywheel-hook",
          label: "Hook",
          text: "3 things my audience keeps asking me about ___:",
        },
        {
          id: "community-flywheel-reply",
          label: "Reply",
          text: "i keep hearing this too. the fix is usually ___ first, then ___.",
        },
        {
          id: "community-flywheel-thread",
          label: "Thread skeleton",
          text: "1) repeated audience pain 2) your answer 3) proof 4) invite the next conversation",
        },
      ],
      metrics: ["Repeat responders", "Community reply quality", "Retention signals"],
      rationale: "At this stage, the biggest upside comes from repeated trust, not just more reach.",
      mistakes: [
        "Treating the audience like an engagement machine",
        "Ignoring repeated questions that signal demand",
        "Optimizing only for vanity reach",
      ],
      examples: [
        "an audience FAQ post",
        "a post that turns comments into next week's content",
        "a product-led community checkpoint",
      ],
      quickStart: [
        "List 3 repeated audience questions",
        "Answer 1 publicly",
        "Use the replies to plan the next loop",
      ],
    },
  ],
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

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function personalizePlaybookTemplateText(params: {
  text: string;
  tab: PlaybookTemplateTab;
  playbook: PlaybookDefinition;
  context: CreatorAgentContext | null;
}): string {
  const { text, tab, playbook, context } = params;
  const dominantTopic =
    context?.creatorProfile.topics.dominantTopics[0]?.label?.trim() ?? "";
  const nicheTopic = context ? formatNicheSummary(context).toLowerCase() : "";
  const topic = (dominantTopic || nicheTopic || "your niche")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  const audience =
    context?.creatorProfile.topics.audienceSignals[0]?.trim().toLowerCase() ??
    "the right audience";
  const outcome = playbook.outcome.toLowerCase();

  const replacementsByTab: Record<PlaybookTemplateTab, string[]> = {
    hook: [topic, `the one update that drove ${outcome}`],
    reply: [topic, "a practical next step", `what's working for ${audience}`],
    thread: [topic, "what changed", "what i learned", "what to do next"],
    cta: [topic, "the exact checklist", "what to do this week"],
  };

  const replacements = replacementsByTab[tab];
  let replacementCursor = 0;
  let personalized = text.replace(/___/g, () => {
    const next =
      replacements[replacementCursor] ??
      replacements[replacements.length - 1] ??
      topic;
    replacementCursor += 1;
    return next;
  });

  if (!/___/.test(text) && tab === "cta") {
    const keyword = topic
      .split(/\s+/)
      .filter(Boolean)[0]
      ?.replace(/[^a-z0-9]/gi, "")
      .toUpperCase();
    personalized = `${personalized}\n\nreply "${keyword || "START"}" if you want the exact steps.`;
  }

  personalized = personalized
    .replace(/\s{2,}/g, " ")
    .replace(/ \./g, ".")
    .trim();

  const voice = context?.creatorProfile.voice;
  const shouldLowercase =
    voice?.primaryCasing === "lowercase" &&
    (voice?.lowercaseSharePercent ?? 0) >= 70;

  if (shouldLowercase) {
    return personalized.toLowerCase();
  }

  return applyNormalSentenceCasing(personalized);
}

function buildTemplateWhyItWorksPoints(tab: PlaybookTemplateTab): string[] {
  switch (tab) {
    case "hook":
      return [
        "clear first line that earns the stop.",
        "specific enough to attract the right audience.",
        "easy to expand into a full post without losing focus.",
      ];
    case "reply":
      return [
        "adds value fast instead of generic agreement.",
        "gives a practical next step people can use.",
        "sounds like a real conversation, not a canned comment.",
      ];
    case "thread":
      return [
        "simple structure makes it easy to scan.",
        "each step naturally leads to the next point.",
        "keeps readers to the end because flow is clear.",
      ];
    case "cta":
      return [
        "asks for one clear action with low friction.",
        "tells people exactly what to do next.",
        "ties the action to immediate value.",
      ];
    default:
      return [
        "short enough to read in one glance.",
        "specific enough to feel practical.",
        "clear enough to act on immediately.",
      ];
  }
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
  const isLongFormCreator =
    contract.planner.outputShape === "long_form_post" ||
    contract.planner.outputShape === "thread_seed" ||
    voice.multiLinePostRate >= 30 ||
    voice.averageLengthBand === "long";

  const stronglyLowercaseShortForm =
    voice.primaryCasing === "lowercase" &&
    voice.lowercaseSharePercent >= 75 &&
    voice.multiLinePostRate < 35;
  const overwhelminglyLowercaseLongForm =
    voice.primaryCasing === "lowercase" &&
    voice.lowercaseSharePercent >= 92 &&
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
    /\b(casual|playful|relaxed|unfiltered|fun|raw|loose)\b/.test(
      voiceSignals,
    );
  const hasSlangSignal = /\b(yo|dawg|nah|yep|haha|lol|lmao)\b/.test(voiceSignals);
  const isLowercaseHeavy =
    profile.voice.primaryCasing === "lowercase" &&
    profile.voice.lowercaseSharePercent >= 96;
  const isShortFormLeaning =
    profile.voice.averageLengthBand === "short" ||
    profile.voice.averageLengthBand === "medium";

  if (hasFormalSignal) {
    return false;
  }

  if (profile.identity.isVerified && !hasSlangSignal && !hasCasualSignal) {
    return false;
  }

  return hasSlangSignal || hasCasualSignal || (isLowercaseHeavy && isShortFormLeaning);
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
  const isOverLimit = usedCharacterCount > maxCharacterLimit;

  return {
    label: `${usedCharacterCount.toLocaleString()} / ${maxCharacterLimit.toLocaleString()} chars`,
    toneClassName: isOverLimit ? "text-red-400" : "text-zinc-500",
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

  const explicitIgnoreCues = [
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
    "that was a question",
    "i was asking",
    "what does",
    "what do you mean",
    "what did you mean",
    "where did you get",
    "where did that come from",
    "wrong thread",
    "explain this",
    "explain that",
    "explain the draft",
    "explain the tweet",
  ];

  if (explicitIgnoreCues.some((cue) => normalized.includes(cue))) {
    return "ignore";
  }

  const explicitReviseCues = [
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
    "too long",
    "too much",
    "make it punchier",
    "make it sharper",
    "fix this line",
    "rewrite this",
    "reword this",
    "revise this",
  ];

  if (explicitReviseCues.some((cue) => normalized.includes(cue))) {
    return "revise";
  }

  if (
    /["“'`](.+?)["”'`]/.test(prompt) &&
    /\b(remove|delete|replace|change|fix|cut|trim)\b/i.test(normalized)
  ) {
    return "revise";
  }

  if (/^(what|why|how|where|which)\b/.test(normalized) || normalized.endsWith("?")) {
    return "ignore";
  }

  return "ignore";
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

function inferCurrentPlaybookStage(
  context: CreatorAgentContext | null,
): PlaybookStageKey {
  const followersCount = context?.creatorProfile.identity.followersCount ?? 0;

  if (followersCount >= 50000) {
    return "50k+";
  }

  if (followersCount >= 10000) {
    return "10k-50k";
  }

  if (followersCount >= 1000) {
    return "1k-10k";
  }

  return "0-1k";
}

function buildPlaybookTemplateGroups(
  playbook: PlaybookDefinition,
): Record<PlaybookTemplateTab, PlaybookTemplate[]> {
  const groups: Record<PlaybookTemplateTab, PlaybookTemplate[]> = {
    hook: [],
    reply: [],
    thread: [],
    cta: [],
  };

  for (const template of playbook.templates) {
    const label = template.label.toLowerCase();
    if (label.includes("reply")) {
      groups.reply.push(template);
    } else if (label.includes("thread")) {
      groups.thread.push(template);
    } else if (label.includes("cta")) {
      groups.cta.push(template);
    } else {
      groups.hook.push(template);
    }
  }

  if (groups.hook.length === 0) {
    groups.hook.push({
      id: `${playbook.id}-hook-fallback`,
      label: "Hook",
      text: "i used to think ___, then i saw ___, now i do ___.",
    });
  }

  if (groups.reply.length === 0) {
    groups.reply.push({
      id: `${playbook.id}-reply-fallback`,
      label: "Reply",
      text: "this is true. the part people miss is ___. here's how i'd apply it: ___.",
    });
  }

  if (groups.thread.length === 0) {
    groups.thread.push({
      id: `${playbook.id}-thread-fallback`,
      label: "Thread",
      text: "hook\n\nwhat changed\n\n3 proof points\n\nwhat i learned\n\nwhat to do next",
    });
  }

  if (groups.cta.length === 0) {
    groups.cta.push({
      id: `${playbook.id}-cta-fallback`,
      label: "CTA",
      text: "if this helps, tell me what you're testing next.",
    });
  }

  return groups;
}

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
  const { data: session, status, update: refreshSession } = useSession();
  const searchParams = useSearchParams();
  const params = useParams();
  const threadIdRaw = params?.threadId as string | string[] | undefined;

  const threadIdParam = (Array.isArray(threadIdRaw) ? threadIdRaw[0]?.trim() : threadIdRaw?.trim()) ?? searchParams.get("threadId")?.trim() ?? null;
  const backfillJobId = searchParams.get("backfillJobId")?.trim() ?? "";
  const billingQueryStatus = searchParams.get("billing")?.trim() ?? "";

  const accountName = session?.user?.activeXHandle ?? null;
  const requiresXAccountGate = status === "authenticated" && !accountName;

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdParam);
  const [chatThreads, setChatThreads] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [threadTransitionPhase, setThreadTransitionPhase] = useState<"idle" | "out" | "in">("idle");
  const [isThreadHydrating, setIsThreadHydrating] = useState(false);

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
  const threadTransitionOutTimeoutRef = useRef<number | null>(null);
  const threadTransitionInTimeoutRef = useRef<number | null>(null);
  const shouldJumpToBottomAfterThreadSwitchRef = useRef(false);
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
    return () => {
      if (threadTransitionOutTimeoutRef.current) {
        window.clearTimeout(threadTransitionOutTimeoutRef.current);
      }
      if (threadTransitionInTimeoutRef.current) {
        window.clearTimeout(threadTransitionInTimeoutRef.current);
      }
    };
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

  useEffect(() => {
    if (!requiresXAccountGate) {
      return;
    }

    setIsAddAccountModalOpen(true);
    setAddAccountInput("");
    setAddAccountPreview(null);
    setAddAccountError(null);
    setReadyAccountHandle(null);
    setIsAddAccountPreviewLoading(false);
    setErrorMessage(null);
    setIsLoading(false);
  }, [requiresXAccountGate]);

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

  const switchToThreadWithTransition = useCallback(
    (nextThreadId: string) => {
      if (!nextThreadId || nextThreadId === activeThreadId || threadTransitionPhase === "out") {
        return;
      }

      if (threadTransitionOutTimeoutRef.current) {
        window.clearTimeout(threadTransitionOutTimeoutRef.current);
      }
      if (threadTransitionInTimeoutRef.current) {
        window.clearTimeout(threadTransitionInTimeoutRef.current);
      }

      setMenuOpenThreadId(null);
      setIsThreadHydrating(true);
      shouldJumpToBottomAfterThreadSwitchRef.current = true;
      setThreadTransitionPhase("out");

      threadTransitionOutTimeoutRef.current = window.setTimeout(() => {
        setActiveThreadId(nextThreadId);
        window.history.pushState({}, "", `/chat/${nextThreadId}`);
        setThreadTransitionPhase("in");

        threadTransitionInTimeoutRef.current = window.setTimeout(() => {
          setThreadTransitionPhase("idle");
        }, 280);
      }, 140);
    },
    [activeThreadId, threadTransitionPhase],
  );

  // Guard against initializeThread re-fetching when we just created a thread in-session
  const threadCreatedInSessionRef = useRef(false);
  const threadScrollRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const growthGuideSelectedPlaybookRef = useRef<HTMLElement | null>(null);

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageFeedbackPendingById, setMessageFeedbackPendingById] = useState<
    Record<string, boolean>
  >({});
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [billingState, setBillingState] = useState<BillingStatePayload | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [dismissedBillingWarningLevel, setDismissedBillingWarningLevel] = useState<
    "low" | "critical" | null
  >(null);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [checkoutLoadingOffer, setCheckoutLoadingOffer] = useState<
    "pro_monthly" | "pro_annual" | "lifetime" | null
  >(null);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [selectedModalProCadence, setSelectedModalProCadence] = useState<"monthly" | "annual">(
    "monthly",
  );

  const loadBillingState = useCallback(
    async (options?: { openModalIfFirstVisit?: boolean }) => {
      if (!session?.user?.id) {
        return;
      }

      setIsBillingLoading(true);
      try {
        const response = await fetch("/api/billing/state", {
          method: "GET",
        });
        const data = (await response.json()) as BillingStateResponse;

        if (!response.ok || !data.ok) {
          return;
        }

        setBillingState(data.data);
        if (options?.openModalIfFirstVisit && data.data.billing.showFirstPricingModal) {
          setPricingModalOpen(true);
        }
      } catch (error) {
        console.error("Failed to load billing state", error);
      } finally {
        setIsBillingLoading(false);
      }
    },
    [session?.user?.id],
  );

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

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    void loadBillingState({
      openModalIfFirstVisit: true,
    });
  }, [loadBillingState, session?.user?.id]);

  useEffect(() => {
    if (!billingQueryStatus || !session?.user?.id) {
      return;
    }

    if (billingQueryStatus === "success") {
      setPricingModalOpen(false);
      setErrorMessage(null);
      void loadBillingState();
    }
  }, [billingQueryStatus, loadBillingState, session?.user?.id]);

  useEffect(() => {
    const snapshot = billingState?.billing;
    if (!snapshot || (!snapshot.lowCreditWarning && !snapshot.criticalCreditWarning)) {
      setDismissedBillingWarningLevel(null);
    }
  }, [billingState?.billing?.criticalCreditWarning, billingState?.billing?.lowCreditWarning]);

  useEffect(() => {
    const snapshot = billingState?.billing;
    if (!snapshot) {
      return;
    }

    if (snapshot.plan === "pro") {
      setSelectedModalProCadence(snapshot.billingCycle === "annual" ? "annual" : "monthly");
    }
  }, [billingState?.billing?.billingCycle, billingState?.billing?.plan]);

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

  const acknowledgePricingModal = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/ack-pricing-modal", {
        method: "POST",
      });
      const data = (await response.json()) as BillingStateResponse;
      if (response.ok && data.ok) {
        setBillingState(data.data);
      }
    } catch (error) {
      console.error("Failed to acknowledge pricing modal", error);
    }
  }, []);

  const openCheckoutForOffer = useCallback(
    async (offer: "pro_monthly" | "pro_annual" | "lifetime") => {
      setCheckoutLoadingOffer(offer);
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            offer,
            successPath: "/chat",
            cancelPath: "/chat",
          }),
        });

        const data = (await response.json()) as
          | {
              ok: true;
              data: { checkoutUrl?: string | null };
            }
          | BillingStateFailure;

        if (!response.ok || !data.ok) {
          const failed = data as BillingStateFailure;
          setErrorMessage(
            failed.errors?.[0]?.message || "Failed to initialize checkout.",
          );
          if (failed.data?.billing && billingState) {
            setBillingState({
              ...billingState,
              billing: failed.data.billing,
            });
          } else if (failed.data?.billing) {
            void loadBillingState();
          }
          return;
        }

        if (data.data.checkoutUrl) {
          window.location.href = data.data.checkoutUrl;
          return;
        }

        setErrorMessage("Checkout did not return a valid URL.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to initialize checkout.",
        );
      } finally {
        setCheckoutLoadingOffer(null);
      }
    },
    [billingState, loadBillingState],
  );

  const openBillingPortal = useCallback(async () => {
    setIsOpeningBillingPortal(true);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = (await response.json()) as
        | { ok: true; data: { url?: string } }
        | { ok: false; errors?: ValidationError[] };

      if (!response.ok || !data.ok || !data.data?.url) {
        const message =
          !data.ok && data.errors?.[0]?.message
            ? data.errors[0].message
            : "Failed to open billing portal.";
        setErrorMessage(message);
        return;
      }

      window.open(data.data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open billing portal.",
      );
    } finally {
      setIsOpeningBillingPortal(false);
    }
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
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>("feedback");
  const [feedbackTitlesByCategory, setFeedbackTitlesByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackTitles());
  const [feedbackDraftsByCategory, setFeedbackDraftsByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackDrafts());
  const [feedbackImages, setFeedbackImages] = useState<
    Array<{
      id: string;
      file: File;
      previewUrl: string;
    }>
  >([]);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackSubmitNotice, setFeedbackSubmitNotice] = useState<string | null>(
    null,
  );
  const [isFeedbackDropActive, setIsFeedbackDropActive] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryItem[]>(
    [],
  );
  const [feedbackHistoryFilter, setFeedbackHistoryFilter] =
    useState<FeedbackReportFilter>("open");
  const [feedbackHistoryQuery, setFeedbackHistoryQuery] = useState("");
  const [isFeedbackHistoryLoading, setIsFeedbackHistoryLoading] = useState(false);
  const [feedbackStatusUpdatingIds, setFeedbackStatusUpdatingIds] = useState<
    Record<string, boolean>
  >({});
  const feedbackEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackImagesRef = useRef(feedbackImages);
  const [playbookStage, setPlaybookStage] = useState<PlaybookStageKey>("0-1k");
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null);
  const [pendingGrowthGuidePlaybookId, setPendingGrowthGuidePlaybookId] = useState<string | null>(null);
  const [playbookTemplateTab, setPlaybookTemplateTab] =
    useState<PlaybookTemplateTab>("hook");
  const [activePlaybookTemplateId, setActivePlaybookTemplateId] = useState<string | null>(null);
  const [copiedPlaybookTemplateId, setCopiedPlaybookTemplateId] = useState<string | null>(
    null,
  );
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
  const [expandedPriorityIndex, setExpandedPriorityIndex] = useState<number | null>(null);
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
  const currentPlaybookStage = useMemo(
    () => inferCurrentPlaybookStage(context),
    [context],
  );
  const stagePlaybooks = useMemo(
    () => PLAYBOOK_LIBRARY[playbookStage],
    [playbookStage],
  );
  const filteredStagePlaybooks = stagePlaybooks;
  const selectedPlaybook = useMemo(() => {
    const withinFiltered =
      filteredStagePlaybooks.find((playbook) => playbook.id === activePlaybookId) ??
      stagePlaybooks.find((playbook) => playbook.id === activePlaybookId);

    return withinFiltered ?? filteredStagePlaybooks[0] ?? stagePlaybooks[0] ?? null;
  }, [activePlaybookId, filteredStagePlaybooks, stagePlaybooks]);
  const selectedPlaybookTemplateGroups = useMemo(
    () => (selectedPlaybook ? buildPlaybookTemplateGroups(selectedPlaybook) : null),
    [selectedPlaybook],
  );
  const selectedPlaybookTemplates = useMemo(
    () => selectedPlaybookTemplateGroups?.[playbookTemplateTab] ?? [],
    [playbookTemplateTab, selectedPlaybookTemplateGroups],
  );
  const personalizedPlaybookTemplates = useMemo(
    () =>
      selectedPlaybookTemplates.map((template) => ({
        ...template,
        text: personalizePlaybookTemplateText({
          text: template.text,
          tab: playbookTemplateTab,
          playbook: selectedPlaybook as PlaybookDefinition,
          context,
        }),
      })),
    [context, playbookTemplateTab, selectedPlaybook, selectedPlaybookTemplates],
  );
  const activePlaybookTemplate = useMemo(() => {
    if (personalizedPlaybookTemplates.length === 0) {
      return null;
    }

    return (
      personalizedPlaybookTemplates.find(
        (template) => template.id === activePlaybookTemplateId,
      ) ?? personalizedPlaybookTemplates[0]
    );
  }, [activePlaybookTemplateId, personalizedPlaybookTemplates]);
  const playbookTemplatePreviewCounter = useMemo(() => {
    const previewText = activePlaybookTemplate?.text ?? "";
    const weightedCharacterCount = computeXWeightedCharacterCount(previewText);
    const characterLimit = getXCharacterLimitForAccount(isVerifiedAccount);

    return `${weightedCharacterCount}/${characterLimit} chars`;
  }, [activePlaybookTemplate?.text, isVerifiedAccount]);
  const activeFeedbackTitle = feedbackTitlesByCategory[feedbackCategory] ?? "";
  const activeFeedbackDraft = feedbackDraftsByCategory[feedbackCategory] ?? "";
  const activeFeedbackConfig = FEEDBACK_CATEGORY_CONFIG[feedbackCategory];
  const feedbackPreviewHtml = useMemo(
    () => renderFeedbackMarkdownToHtml(activeFeedbackDraft),
    [activeFeedbackDraft],
  );
  const feedbackIdentityHandle = useMemo(
    () => context?.account ?? accountName ?? "unknown",
    [accountName, context?.account],
  );
  const applyFeedbackMarkdownToken = useCallback(
    (token: "bold" | "italic" | "bullet" | "link") => {
      const textarea = feedbackEditorRef.current;
      if (!textarea) {
        return;
      }

      const currentText = feedbackDraftsByCategory[feedbackCategory] ?? "";
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? currentText.length;
      const selected = currentText.slice(start, end);

      let insertion = "";
      let nextCursorStart = start;
      let nextCursorEnd = start;

      if (token === "bold") {
        const content = selected || "bold text";
        insertion = `**${content}**`;
        nextCursorStart = start + 2;
        nextCursorEnd = nextCursorStart + content.length;
      } else if (token === "italic") {
        const content = selected || "italic text";
        insertion = `*${content}*`;
        nextCursorStart = start + 1;
        nextCursorEnd = nextCursorStart + content.length;
      } else if (token === "bullet") {
        const content = selected
          ? selected
              .split(/\r?\n/)
              .map((line) => (line.trim() ? `- ${line.trim()}` : "- "))
              .join("\n")
          : "- list item";
        insertion = content;
        nextCursorStart = start + insertion.length;
        nextCursorEnd = nextCursorStart;
      } else {
        const label = selected || "link text";
        insertion = `[${label}](https://example.com)`;
        const urlStart = insertion.indexOf("https://");
        nextCursorStart = start + urlStart;
        nextCursorEnd = nextCursorStart + "https://example.com".length;
      }

      const nextText =
        currentText.slice(0, start) + insertion + currentText.slice(end);
      setFeedbackDraftsByCategory((current) => ({
        ...current,
        [feedbackCategory]: nextText,
      }));
      setFeedbackSubmitNotice(null);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
    },
    [feedbackCategory, feedbackDraftsByCategory],
  );
  const handleFeedbackEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        applyFeedbackMarkdownToken("bold");
        return;
      }

      if (key === "i") {
        event.preventDefault();
        applyFeedbackMarkdownToken("italic");
        return;
      }

      if (key === "k") {
        event.preventDefault();
        applyFeedbackMarkdownToken("link");
      }
    },
    [applyFeedbackMarkdownToken],
  );
  const feedbackTrackedContextRows = useMemo(
    () => [
      `profile: @${context?.account ?? accountName ?? "unknown"}`,
      `thread: ${activeThreadId ?? "new chat"}`,
      `surface: chat`,
      `route: ${activeThreadId ? `/chat/${activeThreadId}` : "/chat"}`,
    ],
    [accountName, activeThreadId, context?.account],
  );
  const sortedFeedbackHistory = useMemo(
    () =>
      [...feedbackHistory].sort(
        (left, right) =>
          getFeedbackHistoryActivityTimestamp(right) -
          getFeedbackHistoryActivityTimestamp(left),
      ),
    [feedbackHistory],
  );
  const feedbackHistoryCounts = useMemo(
    () =>
      sortedFeedbackHistory.reduce(
        (acc, entry) => {
          const normalizedStatus = normalizeFeedbackStatus(entry.status);
          acc.all += 1;
          acc[normalizedStatus] += 1;
          return acc;
        },
        {
          all: 0,
          open: 0,
          resolved: 0,
          cancelled: 0,
        } as Record<FeedbackReportFilter, number>,
      ),
    [sortedFeedbackHistory],
  );
  const filteredFeedbackHistory = useMemo(() => {
    const normalizedQuery = feedbackHistoryQuery.trim().toLowerCase();
    return sortedFeedbackHistory.filter((entry) => {
      const statusMatches =
        feedbackHistoryFilter === "all" ||
        normalizeFeedbackStatus(entry.status) === feedbackHistoryFilter;
      if (!statusMatches) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const title = entry.title?.toLowerCase() ?? "";
      const message = entry.message.toLowerCase();
      const attachmentNames = entry.attachments
        .map((attachment) => attachment.name.toLowerCase())
        .join(" ");
      return (
        title.includes(normalizedQuery) ||
        message.includes(normalizedQuery) ||
        attachmentNames.includes(normalizedQuery)
      );
    });
  }, [feedbackHistoryFilter, feedbackHistoryQuery, sortedFeedbackHistory]);
  const feedbackOpenWithMediaCount = useMemo(
    () =>
      feedbackHistory.filter(
        (entry) =>
          normalizeFeedbackStatus(entry.status) === "open" &&
          entry.attachments.length > 0,
      ).length,
    [feedbackHistory],
  );
  const clearFeedbackImages = useCallback(() => {
    setFeedbackImages((current) => {
      for (const image of current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return [];
    });
  }, []);
  const resetFeedbackDrafts = useCallback(() => {
    clearFeedbackImages();
    setFeedbackCategory("feedback");
    setFeedbackTitlesByCategory(buildDefaultFeedbackTitles());
    setFeedbackDraftsByCategory(buildDefaultFeedbackDrafts());
    setIsFeedbackDropActive(false);
    setFeedbackSubmitNotice(null);
  }, [clearFeedbackImages]);
  const loadFeedbackHistory = useCallback(async () => {
    setIsFeedbackHistoryLoading(true);

    try {
      const response = await fetch("/api/creator/v2/feedback", {
        method: "GET",
      });
      const result: FeedbackHistoryResponse = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(
          !result.ok
            ? result.errors[0]?.message || "Failed to load feedback history."
            : "Failed to load feedback history.",
        );
      }

      setFeedbackHistory(result.data.submissions);
      setFeedbackStatusUpdatingIds({});
    } catch (error) {
      console.error("Failed to load feedback history", error);
      setFeedbackHistory([]);
    } finally {
      setIsFeedbackHistoryLoading(false);
    }
  }, []);
  const updateFeedbackSubmissionStatus = useCallback(
    async (submissionId: string, status: FeedbackReportStatus) => {
      setFeedbackStatusUpdatingIds((current) => ({
        ...current,
        [submissionId]: true,
      }));
      setFeedbackSubmitNotice(null);

      try {
        const response = await fetch("/api/creator/v2/feedback", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            submissionId,
            status,
          }),
        });
        const result: FeedbackStatusUpdateResponse = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(
            !result.ok
              ? result.errors[0]?.message || "Failed to update report status."
              : "Failed to update report status.",
          );
        }

        setFeedbackHistory((current) =>
          current.map((entry) =>
            entry.id === submissionId
              ? {
                  ...entry,
                  status: result.data.submission.status,
                  statusUpdatedAt: result.data.submission.statusUpdatedAt,
                }
              : entry,
          ),
        );
        setFeedbackSubmitNotice(
          `Report marked ${formatFeedbackStatusLabel(status).toLowerCase()}.`,
        );
      } catch (error) {
        const fallbackMessage =
          error instanceof Error
            ? error.message
            : "Something went wrong while updating the report status.";
        setFeedbackSubmitNotice(fallbackMessage);
      } finally {
        setFeedbackStatusUpdatingIds((current) => {
          const next = { ...current };
          delete next[submissionId];
          return next;
        });
      }
    },
    [],
  );
  const appendFeedbackImageFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter((file) => isSupportedFeedbackFile(file));
    if (supportedFiles.length === 0) {
      setFeedbackSubmitNotice("Only PNG, JPG, or MP4 files are supported.");
      return;
    }

    const withinSizeLimitFiles = supportedFiles.filter(
      (file) => file.size <= FEEDBACK_MAX_FILE_SIZE_BYTES,
    );
    if (withinSizeLimitFiles.length === 0) {
      setFeedbackSubmitNotice(
        `Files must be ${Math.round(FEEDBACK_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB or smaller.`,
      );
      return;
    }

    const oversizedCount = supportedFiles.length - withinSizeLimitFiles.length;

    let acceptedCount = 0;
    setFeedbackImages((current) => {
      const availableSlots = Math.max(0, FEEDBACK_MAX_FILES - current.length);
      const nextItems = withinSizeLimitFiles.slice(0, availableSlots).map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      acceptedCount = nextItems.length;
      return [...current, ...nextItems];
    });
    if (acceptedCount === 0) {
      setFeedbackSubmitNotice(`You can upload up to ${FEEDBACK_MAX_FILES} files.`);
      return;
    }

    if (oversizedCount > 0) {
      setFeedbackSubmitNotice(
        `${oversizedCount} file${oversizedCount === 1 ? "" : "s"} skipped for exceeding ${Math.round(
          FEEDBACK_MAX_FILE_SIZE_BYTES / (1024 * 1024),
        )} MB.`,
      );
      return;
    }

    setFeedbackSubmitNotice(null);
  }, []);
  const handleFeedbackImageSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      appendFeedbackImageFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [appendFeedbackImageFiles],
  );
  const handleFeedbackDropZoneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isFeedbackDropActive) {
        setIsFeedbackDropActive(true);
      }
    },
    [isFeedbackDropActive],
  );
  const handleFeedbackDropZoneDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsFeedbackDropActive(false);
    },
    [],
  );
  const handleFeedbackDropZoneDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsFeedbackDropActive(false);
      appendFeedbackImageFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [appendFeedbackImageFiles],
  );
  const removeFeedbackImage = useCallback((imageId: string) => {
    setFeedbackImages((current) => {
      const next = current.filter((image) => image.id !== imageId);
      const removed = current.find((image) => image.id === imageId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
  }, []);
  const submitFeedback = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const message = activeFeedbackDraft.trim();
      if (!message) {
        setFeedbackSubmitNotice("Add details before sending.");
        return;
      }

      setIsFeedbackSubmitting(true);
      setFeedbackSubmitNotice(null);

      try {
        const attachmentPayloads: FeedbackAttachmentPayload[] = await Promise.all(
          feedbackImages.map(async (image) => ({
            id: image.id,
            name: image.file.name,
            mimeType: image.file.type || "application/octet-stream",
            sizeBytes: image.file.size,
            status: "pending_upload",
            signatureHex: await readFeedbackFileSignatureHex(image.file),
            thumbnailDataUrl: await buildFeedbackImageThumbnailDataUrl(image.file),
          })),
        );

        const payload = {
          category: feedbackCategory,
          title: activeFeedbackTitle.trim() || null,
          message,
          fields: extractFeedbackTemplateFields(activeFeedbackDraft),
          context: {
            pagePath: activeThreadId ? `/chat/${activeThreadId}` : "/chat",
            threadId: activeThreadId,
            activeModal: "feedback",
            draftMessageId: activeDraftEditor?.messageId ?? null,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            userAgent: navigator.userAgent,
            appSurface: "chat",
          },
          attachments: attachmentPayloads,
        };

        const response = await fetch("/api/creator/v2/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result: FeedbackSubmitResponse = await response.json();
        if (!response.ok || !result.ok) {
          const fallbackMessage = !result.ok
            ? result.errors[0]?.message
            : "Failed to submit feedback.";
          throw new Error(fallbackMessage || "Failed to submit feedback.");
        }

        setFeedbackSubmitNotice("Feedback submitted. Thanks for helping improve Xpo.");
        resetFeedbackDrafts();
        await loadFeedbackHistory();
      } catch (error) {
        const fallbackMessage =
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting feedback.";
        setFeedbackSubmitNotice(fallbackMessage);
      } finally {
        setIsFeedbackSubmitting(false);
      }
    },
    [
      activeDraftEditor?.messageId,
      activeFeedbackDraft,
      activeFeedbackTitle,
      activeThreadId,
      feedbackCategory,
      feedbackImages,
      loadFeedbackHistory,
      resetFeedbackDrafts,
    ],
  );
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
  useEffect(() => {
    feedbackImagesRef.current = feedbackImages;
  }, [feedbackImages]);
  useEffect(() => {
    return () => {
      for (const image of feedbackImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);
  useEffect(() => {
    if (!feedbackModalOpen) {
      return;
    }

    void loadFeedbackHistory();
  }, [feedbackModalOpen, loadFeedbackHistory]);

  useEffect(() => {
    setPlaybookStage(currentPlaybookStage);
  }, [currentPlaybookStage]);

  useEffect(() => {
    const nextPlaybookId = stagePlaybooks[0]?.id ?? null;

    setActivePlaybookId((current) => {
      if (current && stagePlaybooks.some((playbook) => playbook.id === current)) {
        return current;
      }

      return nextPlaybookId;
    });
  }, [stagePlaybooks]);

  useEffect(() => {
    setPlaybookTemplateTab("hook");
  }, [selectedPlaybook?.id]);
  useEffect(() => {
    setActivePlaybookTemplateId(personalizedPlaybookTemplates[0]?.id ?? null);
  }, [personalizedPlaybookTemplates]);
  useEffect(() => {
    if (
      !playbookModalOpen ||
      !pendingGrowthGuidePlaybookId ||
      activePlaybookId !== pendingGrowthGuidePlaybookId
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      growthGuideSelectedPlaybookRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setPendingGrowthGuidePlaybookId(null);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePlaybookId, pendingGrowthGuidePlaybookId, playbookModalOpen]);

  const handleCopyPlaybookTemplate = useCallback(async (template: PlaybookTemplate) => {
    try {
      await navigator.clipboard.writeText(template.text);
      setCopiedPlaybookTemplateId(template.id);
      window.setTimeout(() => {
        setCopiedPlaybookTemplateId((current) =>
          current === template.id ? null : current,
        );
      }, 1800);
    } catch (error) {
      console.error("Failed to copy playbook template", error);
    }
  }, []);

  const handleApplyPlaybook = useCallback((playbookId: string) => {
    setActivePlaybookId(playbookId);
  }, []);
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
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [rateLimitsMenuOpen, setRateLimitsMenuOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
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

  useEffect(() => {
    if (!accountMenuOpen) {
      setRateLimitsMenuOpen(false);
    }
  }, [accountMenuOpen]);

  useEffect(() => {
    if (accountMenuOpen) {
      setAccountMenuVisible(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setAccountMenuVisible(false);
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accountMenuOpen]);

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
    if (isAddAccountSubmitting || requiresXAccountGate) {
      return;
    }

    setIsAddAccountModalOpen(false);
    setAddAccountInput("");
    setAddAccountPreview(null);
    setAddAccountError(null);
    setReadyAccountHandle(null);
    setIsAddAccountPreviewLoading(false);
  }, [isAddAccountSubmitting, requiresXAccountGate]);

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
        if (!data.ok && data.data?.billing) {
          setBillingState((current) =>
            current
              ? {
                  ...current,
                  billing: data.data?.billing ?? current.billing,
                }
              : current,
          );
        }
        if (response.status === 403) {
          setPricingModalOpen(true);
        }
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
      if (requiresXAccountGate) {
        setErrorMessage(null);
        setIsLoading(false);
        return { ok: false };
      }

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
    [activeStrategyInputs, activeToneInputs, accountName, requiresXAccountGate],
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

  const analysisPriorityItems = useMemo(
    () => context?.strategyDelta.adjustments.slice(0, 3) ?? [],
    [context],
  );
  const analysisFollowerProgress = useMemo(() => {
    if (!context) {
      return {
        currentFollowersLabel: "0",
        targetFollowersLabel: "1k",
        progressPercent: 0,
      };
    }

    const followers = Math.max(0, context.creatorProfile.identity.followersCount);
    let stageStart = 0;
    let stageEnd = 1000;
    let targetFollowersLabel = "1k";

    switch (currentPlaybookStage) {
      case "0-1k":
        stageStart = 0;
        stageEnd = 1000;
        targetFollowersLabel = "1k";
        break;
      case "1k-10k":
        stageStart = 1000;
        stageEnd = 10000;
        targetFollowersLabel = "10k";
        break;
      case "10k-50k":
        stageStart = 10000;
        stageEnd = 50000;
        targetFollowersLabel = "50k";
        break;
      case "50k+":
        stageStart = 50000;
        stageEnd = 100000;
        targetFollowersLabel = "100k";
        break;
      default:
        stageStart = 0;
        stageEnd = 1000;
        targetFollowersLabel = "1k";
        break;
    }

    const rawProgress =
      stageEnd > stageStart
        ? ((followers - stageStart) / (stageEnd - stageStart)) * 100
        : 0;

    return {
      currentFollowersLabel: new Intl.NumberFormat("en-US").format(followers),
      targetFollowersLabel,
      progressPercent: Math.max(0, Math.min(100, rawProgress)),
    };
  }, [context, currentPlaybookStage]);
  const analysisEvidencePosts = useMemo(() => {
    if (!context) {
      return [];
    }

    const seen = new Set<string>();
    const weakIds = new Set<string>([
      ...context.negativeAnchors.map((post) => post.id),
      ...context.creatorProfile.examples.cautionExamples.map((post) => post.id),
      ...context.creatorProfile.examples.goalConflictExamples.map((post) => post.id),
    ]);
    const replyIds = new Set<string>(
      context.creatorProfile.examples.replyVoiceAnchors.map((post) => post.id),
    );

    return [
      ...context.positiveAnchors,
      ...context.negativeAnchors,
      ...context.creatorProfile.examples.voiceAnchors,
      ...context.creatorProfile.examples.replyVoiceAnchors,
      ...context.creatorProfile.examples.quoteVoiceAnchors,
      ...context.creatorProfile.examples.bestPerforming,
      ...context.creatorProfile.examples.strategyAnchors,
      ...context.creatorProfile.examples.goalAnchors,
      ...context.creatorProfile.examples.cautionExamples,
      ...context.creatorProfile.examples.goalConflictExamples,
    ]
      .filter((post) => {
        if (seen.has(post.id)) {
          return false;
        }

        seen.add(post.id);
        return true;
      })
      .slice(0, 8)
      .map((post) => {
        const label = weakIds.has(post.id)
          ? "Weak anchor"
          : replyIds.has(post.id) || post.lane === "reply"
            ? "Reply anchor"
            : "Strong anchor";
        const reason =
          post.selectionReason ||
          (label === "Weak anchor"
            ? "xpo flagged this as a pattern to reduce."
            : label === "Reply anchor"
              ? "xpo flagged this as a representative reply voice sample."
              : "xpo flagged this as a strong profile signal to keep.");

        return { ...post, label, reason };
      });
  }, [context]);
  const analysisRecommendedPlaybooks = useMemo(() => {
    if (!context) {
      return [] as Array<{
        stage: PlaybookStageKey;
        playbook: PlaybookDefinition;
        whyFit: string;
      }>;
    }

    const currentStageIndex = PLAYBOOK_STAGE_ORDER.indexOf(currentPlaybookStage);
    const stageCandidates: PlaybookStageKey[] = [
      currentPlaybookStage,
      PLAYBOOK_STAGE_ORDER[Math.min(PLAYBOOK_STAGE_ORDER.length - 1, currentStageIndex + 1)],
      PLAYBOOK_STAGE_ORDER[Math.max(0, currentStageIndex - 1)],
    ].filter((stage): stage is PlaybookStageKey => Boolean(stage));

    const candidatePool: Array<{ stage: PlaybookStageKey; playbook: PlaybookDefinition }> =
      [];
    const seen = new Set<string>();

    for (const stage of stageCandidates) {
      for (const playbook of PLAYBOOK_LIBRARY[stage]) {
        const key = `${stage}:${playbook.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidatePool.push({ stage, playbook });
        }
      }
    }

    if (candidatePool.length < 3) {
      for (const stage of PLAYBOOK_STAGE_ORDER) {
        for (const playbook of PLAYBOOK_LIBRARY[stage]) {
          const key = `${stage}:${playbook.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidatePool.push({ stage, playbook });
          }
        }
      }
    }

    const gapText = `${context.strategyDelta.primaryGap} ${context.strategyDelta.adjustments
      .map((item) => `${item.area} ${item.note}`)
      .join(" ")}`.toLowerCase();

    const scorePlaybook = (playbookId: string, stage: PlaybookStageKey): number => {
      let score = stage === currentPlaybookStage ? 35 : 10;

      if (/\breply|conversation|discovery|reach\b/.test(gapText)) {
        if (playbookId.includes("reply") || playbookId.includes("network")) {
          score += 22;
        }
      }

      if (/\bformat|topic|position|consisten|identity|clarity\b/.test(gapText)) {
        if (playbookId.includes("weekly") || playbookId.includes("content-ip")) {
          score += 18;
        }
      }

      if (/\btrust|retention|community|conversion\b/.test(gapText)) {
        if (playbookId.includes("community") || playbookId.includes("narrative")) {
          score += 16;
        }
      }

      if (/\bproof|story|hook\b/.test(gapText)) {
        if (playbookId.includes("daily") || playbookId.includes("contrarian")) {
          score += 14;
        }
      }

      return score;
    };

    const buildWhyFit = (playbook: PlaybookDefinition): string => {
      if (playbook.id.includes("reply")) {
        return `your gap is ${context.strategyDelta.primaryGap.toLowerCase()}, and this strengthens discovery from replies.`;
      }
      if (playbook.id.includes("weekly") || playbook.id.includes("content-ip")) {
        return `your current signals need clearer repetition, and this builds a recognizable format.`;
      }
      if (playbook.id.includes("network")) {
        return `you already have a base signal; this helps expand reach through collaboration.`;
      }
      if (playbook.id.includes("daily") || playbook.id.includes("contrarian")) {
        return `this directly sharpens proof and positioning without adding complexity.`;
      }
      if (playbook.id.includes("community") || playbook.id.includes("narrative")) {
        return `this aligns with a trust-first growth path and tighter audience retention.`;
      }
      return `this targets the current gap: ${context.strategyDelta.primaryGap.toLowerCase()}.`;
    };

    return candidatePool
      .map(({ stage, playbook }) => ({
        stage,
        playbook,
        score: scorePlaybook(playbook.id, stage),
        whyFit: buildWhyFit(playbook),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [context, currentPlaybookStage]);
  const openGrowthGuideForRecommendation = useCallback(
    (stage: PlaybookStageKey, playbookId: string) => {
      setPlaybookStage(stage);
      setActivePlaybookId(playbookId);
      setPendingGrowthGuidePlaybookId(playbookId);
      setAnalysisOpen(false);
      setPlaybookModalOpen(true);
    },
    [],
  );
  const analysisDiagnosisSummary = useMemo(() => {
    if (!context) {
      return "insufficient data";
    }

    return `xpo sees a ${formatEnumLabel(context.creatorProfile.archetype).toLowerCase()} in ${formatNicheSummary(
      context,
    ).toLowerCase()}. biggest gap: ${context.strategyDelta.primaryGap.toLowerCase()}.`;
  }, [context]);
  const analysisSnapshotCards = useMemo(() => {
    if (!context) {
      return [] as Array<{ label: string; value: string; meta?: string }>;
    }

    return [
      {
        label: "Archetype",
        value: formatEnumLabel(context.creatorProfile.archetype),
      },
      {
        label: "Niche",
        value: formatNicheSummary(context),
      },
      {
        label: "Distribution loop",
        value: formatEnumLabel(context.creatorProfile.distribution.primaryLoop),
      },
      {
        label: "Readiness",
        value: `${context.readiness.score}`,
        meta: `sample ${context.confidence.sampleSize} posts`,
      },
    ];
  }, [context]);
  const analysisVoiceSignalChips = useMemo(() => {
    if (!context) {
      return [] as Array<{ label: string; value: string }>;
    }

    const lowerBoundedMultiLineRate =
      context.creatorProfile.voice.multiLinePostRate <= 1
        ? context.creatorProfile.voice.multiLinePostRate * 100
        : context.creatorProfile.voice.multiLinePostRate;
    const hasBulletSignal =
      context.creatorProfile.styleCard.punctuationGuidelines.some(
        (rule) => rule.includes("-") || rule.includes(">"),
      ) ||
      context.creatorProfile.voice.styleNotes.some((note) =>
        /bullet|list|hyphen|dash|angle/i.test(note),
      );
    const topTopic = context.creatorProfile.topics.dominantTopics[0];
    const topicConsistency = topTopic
      ? formatEnumLabel(topTopic.stability).toLowerCase()
      : context.creatorProfile.niche.confidence >= 70
        ? "high"
        : context.creatorProfile.niche.confidence >= 45
          ? "medium"
          : "low";
    const lowercaseShare = context.creatorProfile.voice.lowercaseSharePercent;
    const casingValue =
      context.creatorProfile.voice.primaryCasing === "lowercase"
        ? lowercaseShare >= 85
          ? "lowercase"
          : "mixed"
        : lowercaseShare >= 80
          ? "mixed"
          : "normal";
    const ctaRate = context.creatorProfile.execution.ctaUsageRate;
    const ctaUsageValue =
      ctaRate >= 25 ? "high" : ctaRate >= 10 ? "medium" : "low";

    return [
      {
        label: "casing",
        value: casingValue,
      },
      {
        label: "typical length",
        value: context.creatorProfile.voice.averageLengthBand
          ? formatEnumLabel(context.creatorProfile.voice.averageLengthBand).toLowerCase()
          : "insufficient data",
      },
      {
        label: "structure",
        value: hasBulletSignal
          ? "bullet-friendly"
          : lowerBoundedMultiLineRate >= 50
            ? "multi-line"
            : "single-line",
      },
      {
        label: "cta usage",
        value: ctaUsageValue,
      },
      {
        label: "topic consistency",
        value: topicConsistency,
      },
    ];
  }, [context]);
  const analysisKeepList = useMemo(() => {
    if (!context) {
      return [] as string[];
    }

    return dedupePreserveOrder([
      ...context.strategyDelta.preserveTraits,
      ...context.creatorProfile.strategy.currentStrengths,
      ...context.creatorProfile.playbook.toneGuidelines,
    ]).slice(0, 5);
  }, [context]);
  const analysisAvoidList = useMemo(() => {
    if (!context) {
      return [] as string[];
    }

    return dedupePreserveOrder([
      ...context.strategyDelta.shiftTraits,
      ...context.creatorProfile.strategy.currentWeaknesses,
      ...context.creatorProfile.styleCard.forbiddenPhrases,
    ]).slice(0, 5);
  }, [context]);

  useEffect(() => {
    if (!analysisOpen) {
      return;
    }

    setExpandedPriorityIndex(null);
  }, [analysisOpen, context?.account]);

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

  const submitAssistantMessageFeedback = useCallback(
    async (messageId: string, value: MessageFeedbackValue) => {
      if (
        messageId.startsWith("assistant-") ||
        messageId.startsWith("draft-inspector-assistant-")
      ) {
        return;
      }

      const targetMessage = messages.find((message) => message.id === messageId);
      if (!targetMessage || targetMessage.role !== "assistant" || targetMessage.isStreaming) {
        return;
      }
      const resolvedThreadId = targetMessage.threadId || activeThreadId;
      if (!resolvedThreadId || resolvedThreadId === "current-workspace") {
        return;
      }

      const previousValue = targetMessage.feedbackValue ?? null;
      const nextValue = previousValue === value ? null : value;

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                feedbackValue: nextValue,
              }
            : message,
        ),
      );
      setMessageFeedbackPendingById((current) => ({
        ...current,
        [messageId]: true,
      }));

      try {
        const response = await fetch(
          `/api/creator/v2/threads/${encodeURIComponent(resolvedThreadId)}/messages/${encodeURIComponent(messageId)}/feedback`,
          {
            method: nextValue ? "POST" : "DELETE",
            ...(nextValue
              ? {
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ value: nextValue }),
                }
              : {}),
          },
        );
        const responseBodyText = await response.text();
        let result: MessageFeedbackMutationResponse | null = null;
        if (responseBodyText) {
          try {
            result = JSON.parse(responseBodyText) as MessageFeedbackMutationResponse;
          } catch {
            result = null;
          }
        }

        if (!response.ok || !result?.ok) {
          const failureMessage =
            result && "errors" in result ? result.errors?.[0]?.message : null;
          throw new Error(
            failureMessage || `Failed to save message feedback (${response.status}).`,
          );
        }

        const savedValue =
          result && result.ok && "feedback" in result.data
            ? result.data.feedback?.value
            : null;
        if (savedValue === "up" || savedValue === "down") {
          setMessages((current) =>
            current.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    feedbackValue: savedValue,
                  }
                : message,
            ),
          );
        }
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  feedbackValue: previousValue,
                }
              : message,
          ),
        );
        console.error("Failed to save assistant message feedback", error);
      } finally {
        setMessageFeedbackPendingById((current) => {
          const next = { ...current };
          delete next[messageId];
          return next;
        });
      }
    },
    [activeThreadId, messages],
  );

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
          threadId: activeThreadId ?? undefined,
          role: "user",
          content: data.data.userMessage.content,
          createdAt: data.data.userMessage.createdAt,
        },
        {
          id: data.data.assistantMessage.id,
          threadId: activeThreadId ?? undefined,
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
          feedbackValue: null,
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
        threadId: activeThreadId ?? undefined,
        role: "user",
        content: prompt,
        createdAt: nowIso,
      },
      {
        id: temporaryAssistantMessageId,
        threadId: activeThreadId ?? undefined,
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
        const failure = data as DraftInspectorFailure;
        if (failure.data?.billing) {
          setBillingState((current) =>
            current
              ? {
                  ...current,
                  billing: failure.data?.billing ?? current.billing,
                }
              : current,
          );
        }
        if (response.status === 402 || response.status === 403) {
          setPricingModalOpen(true);
        }
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
          failure.errors[0]?.message ?? "The draft analysis failed.",
        );
        return;
      }

      if (data.data.billing) {
        setBillingState(data.data.billing);
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
          threadId: activeThreadId ?? undefined,
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
            ...resolvedToneInputs,
            ...resolvedStrategyInputs,
            ...(conversationMemory ? { memory: conversationMemory } : {}),
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          const data: CreatorChatResponse = await response.json();

          if (!response.ok || !data.ok) {
            const failure = data as CreatorChatFailure;
            if (failure.data?.billing) {
              setBillingState((current) =>
                current
                  ? {
                      ...current,
                      billing: failure.data?.billing ?? current.billing,
                    }
                  : current,
              );
            }
            if (response.status === 402 || response.status === 403) {
              setPricingModalOpen(true);
            }
            setErrorMessage(
              failure.errors?.[0]?.message ?? "Failed to generate a reply.",
            );
            return;
          }

          if (data.data.billing) {
            setBillingState(data.data.billing);
          }

          setMessages((current) => [
            ...current,
            {
              id: data.data.messageId ?? `assistant-${Date.now() + 1}`,
              threadId: data.data.newThreadId ?? activeThreadId ?? undefined,
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
              feedbackValue: null,
              quickReplies:
                data.data.quickReplies && data.data.quickReplies.length > 0
                  ? data.data.quickReplies
                  : current.length === 0 &&
                      !trimmedPrompt &&
                      !options.selectedAngle
                    ? buildDefaultExampleQuickReplies(shouldUseLowercaseChipVoice(context))
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

        if (streamedResult.billing) {
          setBillingState(streamedResult.billing);
        }

        setMessages((current) => [
          ...current,
          {
            id: streamedResult.messageId ?? `assistant-${Date.now() + 1}`,
            threadId: streamedResult.newThreadId ?? activeThreadId ?? undefined,
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
            feedbackValue: null,
            quickReplies:
              streamedResult.quickReplies && streamedResult.quickReplies.length > 0
                ? streamedResult.quickReplies
                : current.length === 0 &&
                    !trimmedPrompt &&
                    !options.selectedAngle
                  ? buildDefaultExampleQuickReplies(shouldUseLowercaseChipVoice(context))
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
          setIsThreadHydrating(false);
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
              threadId: typeof m.threadId === "string" ? m.threadId : activeThreadId ?? undefined,
              feedbackValue:
                m.feedbackValue === "up" || m.feedbackValue === "down"
                  ? m.feedbackValue
                  : null,
            }));
            setMessages(mappedMessages);

            if (shouldJumpToBottomAfterThreadSwitchRef.current) {
              shouldJumpToBottomAfterThreadSwitchRef.current = false;
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  const node = threadScrollRef.current;
                  if (!node) {
                    return;
                  }
                  node.scrollTop = node.scrollHeight;
                  setShowScrollToLatest(false);
                });
              });
            }

            setIsThreadHydrating(false);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch historical messages", e);
        }
      }

      shouldJumpToBottomAfterThreadSwitchRef.current = false;
      setIsThreadHydrating(false);
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
  const heroQuickActions = buildHeroQuickActions(
    shouldUseLowercaseChipVoice(context),
  );
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
  const activeBillingSnapshot = billingState?.billing ?? null;
  const billingOffers = billingState?.offers ?? [];
  const lifetimeOffer = billingOffers.find((offer) => offer.offer === "lifetime");
  const proMonthlyOffer = billingOffers.find((offer) => offer.offer === "pro_monthly");
  const proAnnualOffer = billingOffers.find((offer) => offer.offer === "pro_annual");
  const lifetimeSlotSummary = billingState?.lifetimeSlots ?? null;
  const modalMonthlyCents = proMonthlyOffer?.amountCents ?? DEFAULT_MODAL_PRO_MONTHLY_CENTS;
  const modalAnnualCents = proAnnualOffer?.amountCents ?? DEFAULT_MODAL_PRO_ANNUAL_CENTS;
  const isProActive =
    activeBillingSnapshot?.plan === "pro" && activeBillingSnapshot?.status === "active";
  const isProMonthlyCurrent = isProActive && activeBillingSnapshot?.billingCycle === "monthly";
  const isProAnnualCurrent = isProActive && activeBillingSnapshot?.billingCycle === "annual";
  const isFounderCurrent =
    activeBillingSnapshot?.plan === "lifetime" && activeBillingSnapshot?.status === "active";
  const pricingModalDismissLabel = activeBillingSnapshot?.plan === "free" ? "Continue Free" : "Close";
  const proMonthlyButtonLabel = isFounderCurrent
    ? "Included"
    : isProMonthlyCurrent
      ? "Current Plan"
      : isProAnnualCurrent
        ? "Switch to Monthly"
        : "Go Pro";
  const proAnnualButtonLabel = isFounderCurrent
    ? "Included"
    : isProAnnualCurrent
      ? "Current Plan"
      : isProMonthlyCurrent
        ? "Switch to Annual"
        : "Go Pro Annual";
  const selectedModalProIsAnnual = selectedModalProCadence === "annual";
  const selectedModalProCents = selectedModalProIsAnnual ? modalAnnualCents : modalMonthlyCents;
  const selectedModalProPriceSuffix = selectedModalProIsAnnual ? " / year" : " / month";
  const selectedModalProButtonLabel = selectedModalProIsAnnual
    ? proAnnualButtonLabel
    : proMonthlyButtonLabel;
  const selectedModalProOffer = selectedModalProIsAnnual ? "pro_annual" : "pro_monthly";
  const selectedModalProIsCurrent = selectedModalProIsAnnual
    ? isProAnnualCurrent
    : isProMonthlyCurrent;
  const selectedModalProNeedsPortalSwitch = selectedModalProIsAnnual
    ? isProMonthlyCurrent
    : isProAnnualCurrent;
  const selectedModalProOfferEnabled = selectedModalProIsAnnual
    ? proAnnualOffer?.enabled !== false
    : proMonthlyOffer?.enabled !== false;
  const isSelectedModalProCheckoutLoading = checkoutLoadingOffer === selectedModalProOffer;
  const billingCreditsLabel = activeBillingSnapshot
    ? `${Math.max(0, activeBillingSnapshot.creditsRemaining)}/${Math.max(
      0,
      activeBillingSnapshot.creditLimit,
    )} credits`
    : "Credits loading";
  const rateLimitsRemainingPercent = activeBillingSnapshot
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (Math.max(0, activeBillingSnapshot.creditsRemaining) /
              Math.max(1, activeBillingSnapshot.creditLimit)) *
              100,
          ),
        ),
      )
    : null;
  const rateLimitWindowLabel = activeBillingSnapshot
    ? activeBillingSnapshot.plan === "lifetime"
      ? "Founder Pass"
      : activeBillingSnapshot.plan === "pro"
        ? activeBillingSnapshot.billingCycle === "annual"
          ? "Pro Annual"
          : "Pro Monthly"
        : "Free"
    : "Free";
  const rateLimitResetLabel = activeBillingSnapshot
    ? new Date(activeBillingSnapshot.creditCycleResetsAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : isBillingLoading
      ? "Loading..."
      : "Unavailable";
  const rateLimitUpgradeLabel =
    activeBillingSnapshot?.plan === "pro" ? "Get Founder Pass" : "Upgrade to Pro";
  const showRateLimitUpgradeCta = activeBillingSnapshot?.plan !== "lifetime";
  const settingsPlanLabel = rateLimitWindowLabel;
  const settingsCreditsRemaining = activeBillingSnapshot
    ? Math.max(0, activeBillingSnapshot.creditsRemaining)
    : 0;
  const settingsCreditLimit = activeBillingSnapshot
    ? Math.max(0, activeBillingSnapshot.creditLimit)
    : 0;
  const settingsCreditsUsed = Math.max(0, settingsCreditLimit - settingsCreditsRemaining);
  const settingsCreditsRemainingPercent = rateLimitsRemainingPercent;
  const billingWarningLevel = activeBillingSnapshot?.criticalCreditWarning
    ? "critical"
    : activeBillingSnapshot?.lowCreditWarning
      ? "low"
      : "none";
  const showBillingWarningBanner =
    billingWarningLevel !== "none" &&
    dismissedBillingWarningLevel !== billingWarningLevel;
  const canAddAccount =
    !activeBillingSnapshot ||
    activeBillingSnapshot.plan !== "free" ||
    availableHandles.length < 1;
  const renderAccountMenuPanel = (className: string) =>
    accountMenuVisible ? (
      <div
        className={`${className} [&_button:not(:disabled)]:cursor-pointer origin-bottom transition-all duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          accountMenuOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
            : "pointer-events-none translate-y-2 scale-95 opacity-0 blur-[1px]"
        }`}
      >
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
            disabled={!canAddAccount}
            onClick={() => {
              if (!canAddAccount) {
                setPricingModalOpen(true);
                setAccountMenuOpen(false);
                return;
              }
              setAccountMenuOpen(false);
              setIsAddAccountModalOpen(true);
              setAddAccountError(null);
              setReadyAccountHandle(null);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>{canAddAccount ? "Add Account" : "Upgrade to add account"}</span>
          </button>
        </div>

        <div className="my-1 h-px bg-white/10" />

        <div className="px-1 py-1">
          <button
            type="button"
            onClick={() => {
              setAccountMenuOpen(false);
              setSettingsModalOpen(true);
            }}
            className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <span>Settings</span>
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setRateLimitsMenuOpen((current) => !current)}
            className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <span>Rate limits remaining</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                rateLimitsMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {rateLimitsMenuOpen ? (
            <div className="mb-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-300">{rateLimitWindowLabel}</span>
                <span className="font-semibold text-zinc-100">
                  {rateLimitsRemainingPercent !== null ? `${rateLimitsRemainingPercent}%` : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Resets {rateLimitResetLabel}</p>
              {showRateLimitUpgradeCta ? (
                <button
                  type="button"
                  onClick={() => {
                    setPricingModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  className="mt-2 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                >
                  <span>{rateLimitUpgradeLabel}</span>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
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
  const threadCanvasTransitionClassName = `transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[filter,opacity,transform] ${
    threadTransitionPhase === "out"
      ? "opacity-25 blur-[10px] scale-[0.995]"
      : "opacity-100 blur-0 scale-100"
  }`;
  const threadContentTransitionClassName = `transition-[opacity,filter,transform] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,filter,transform] ${
    isThreadHydrating ? "opacity-0 blur-[7px] translate-y-1" : "opacity-100 blur-0 translate-y-0"
  }`;

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
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
          className={`fixed inset-y-0 left-0 z-30 flex min-h-0 shrink-0 flex-col overflow-hidden transition-[width,transform] duration-300 md:sticky md:top-0 [&_button:not(:disabled)]:cursor-pointer [&_[role=button]]:cursor-pointer ${sidebarOpen
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
                    <span>Analysis</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaybookModalOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    <span>Playbook</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackSubmitNotice(null);
                      setFeedbackModalOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-200"
                  >
                    <MessageSquareText className="h-4 w-4 shrink-0" />
                    <span>Feedback</span>
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
                                switchToThreadWithTransition(item.id);
                              }
                            }}
                            className={`group block w-full cursor-pointer rounded-2xl px-2 py-2 text-left transition hover:bg-white/[0.03] ${activeThreadId === item.id ? "bg-white/[0.04]" : ""}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1 pr-1">
                                <span className="line-clamp-2 text-sm leading-6 text-zinc-200">
                                  {item.label}
                                </span>
                                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                  {item.meta}
                                </span>
                              </div>

                              {section.section === "Chats" && item.id !== "current-workspace" ? (
                                <div className="relative w-8 flex-shrink-0 pt-1" ref={menuOpenThreadId === item.id ? threadMenuRef : null}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuOpenThreadId(menuOpenThreadId === item.id ? null : item.id);
                                    }}
                                    className={`ml-auto flex h-6 w-6 items-center justify-center rounded p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white ${
                                      hoveredThreadId === item.id || menuOpenThreadId === item.id
                                        ? "pointer-events-auto opacity-100"
                                        : "pointer-events-none opacity-0"
                                    }`}
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
                              ) : null}
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
                className={`flex w-full items-center justify-between rounded-xl p-2 transition ${
                  accountMenuOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
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
                <ChevronUp
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-all duration-300 ${
                    accountMenuOpen ? "rotate-0 text-zinc-300" : "rotate-180"
                  }`}
                />
              </button>

              {renderAccountMenuPanel(
                "absolute bottom-full left-2 right-2 z-20 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl",
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
                className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/[0.04] hover:text-white"
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
                className={`flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-300 hover:opacity-85 ${
                  accountMenuOpen ? "scale-[1.04] ring-2 ring-white/30" : "scale-100 ring-0"
                }`}
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
                "absolute bottom-full left-0 z-20 w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl",
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
                <Image
                  src="/xpo-logo-white.webp"
                  alt="Xpo"
                  width={846}
                  height={834}
                  className="h-8 w-auto"
                  priority
                />
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
            <div className={`${chatCanvasClassName} ${threadCanvasTransitionClassName}`}>
              {isLoading && !context && !contract ? (
                <div className="text-sm text-zinc-400">Loading the agent context...</div>
              ) : (
                <div className={threadContentTransitionClassName}>
                  {errorMessage ? (
                    <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  {showBillingWarningBanner && activeBillingSnapshot ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-zinc-300">
                          <span
                            className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                              billingWarningLevel === "critical"
                                ? "bg-rose-300"
                                : "bg-amber-300"
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
                            onClick={() => setPricingModalOpen(true)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
                          >
                            Upgrade
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDismissedBillingWarningLevel(
                                billingWarningLevel as "low" | "critical",
                              )
                            }
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                            aria-label="Dismiss billing warning"
                          >
                            ×
                          </button>
                        </div>
                      </div>
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
                            {heroQuickActions.map((action) => (
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
                          className={`${index === 0
                            ? ""
                            : messages[index - 1]?.role !== message.role
                              ? "mt-6"
                              : "mt-3"
                            } max-w-[88%] px-4 py-3 text-sm leading-8 ${message.role === "assistant"
                            ? "text-zinc-100"
                            : "ml-auto w-fit rounded-[1.15rem] bg-white px-4 py-2 text-black"
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

                          {message.role === "assistant" && !message.isStreaming ? (
                            <div className="mt-2 flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  void submitAssistantMessageFeedback(message.id, "up");
                                }}
                                disabled={
                                  isMainChatLocked || Boolean(messageFeedbackPendingById[message.id])
                                }
                                aria-label="Thumbs up"
                                className={`inline-flex items-center rounded-full p-1.5 transition ${
                                  message.feedbackValue === "up"
                                    ? "bg-emerald-300/10 text-emerald-300"
                                    : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void submitAssistantMessageFeedback(message.id, "down");
                                }}
                                disabled={
                                  isMainChatLocked || Boolean(messageFeedbackPendingById[message.id])
                                }
                                aria-label="Thumbs down"
                                className={`inline-flex items-center rounded-full p-1.5 transition ${
                                  message.feedbackValue === "down"
                                    ? "bg-rose-300/10 text-rose-300"
                                    : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            message.quickReplies?.length &&
                            index === messages.length - 1 &&
                            !(
                              message.outputShape === "ideation_angles" &&
                              message.angles?.length
                            ) ? (
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
                            message.outputShape === "ideation_angles" &&
                            message.angles?.length &&
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
                              const canToggleDraftFormat =
                                isVerifiedAccount || isLongformPreview;
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
                                        {canToggleDraftFormat ? (
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
                                        ) : null}
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

                </div>
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
        settingsModalOpen ? (
          <div
            className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSettingsModalOpen(false);
              }
            }}
          >
            <div className="relative my-auto w-full max-w-4xl rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Settings
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white sm:text-[2rem]">
                    Account & Billing
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-zinc-400">
                    Review your current plan, usage, and billing actions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Current plan
                    </p>
                    <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
                      {activeBillingSnapshot?.status === "past_due"
                        ? "Past due"
                        : activeBillingSnapshot?.status === "blocked_fair_use"
                          ? "Fair use review"
                          : activeBillingSnapshot?.status === "canceled"
                            ? "Canceled"
                            : "Active"}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">{settingsPlanLabel}</p>
                  <p className="mt-2 text-sm text-zinc-500">Cycle resets {rateLimitResetLabel}</p>

                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={isOpeningBillingPortal}
                      onClick={() => {
                        void openBillingPortal();
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isOpeningBillingPortal ? "Opening…" : "Manage Billing"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                    {showRateLimitUpgradeCta ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsModalOpen(false);
                          setPricingModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
                      >
                        {rateLimitUpgradeLabel}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div className="rounded-full border border-white/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Founder plan active
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Usage
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                        Remaining
                      </p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {settingsCreditsRemaining.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Used</p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {settingsCreditsUsed.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Limit</p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {settingsCreditLimit.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-white/75 transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, settingsCreditsRemainingPercent ?? 0))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      {settingsCreditsRemainingPercent !== null
                        ? `${settingsCreditsRemainingPercent}% remaining`
                        : "Usage loading"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">
                  Need billing help? {billingState?.supportEmail ?? "shernanjavier@gmail.com"}
                </p>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-200 transition hover:bg-rose-300/10 hover:text-rose-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>

            </div>
          </div>
        ) : null
      }

      {
        pricingModalOpen ? (
          <div
            className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/85 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPricingModalOpen(false);
                void acknowledgePricingModal();
              }
            }}
          >
            <div className="relative my-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] p-6 shadow-2xl">
              <div className="pointer-events-none absolute -left-16 top-10 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl animate-pulse" />
              <div className="pointer-events-none absolute -right-14 top-24 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl animate-pulse" />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Pricing
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Choose your plan</h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Credits keep usage predictable. Start free, then upgrade when you need more scale.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPricingModalOpen(false);
                      void acknowledgePricingModal();
                      window.location.href = "/pricing";
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
                  >
                    More details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPricingModalOpen(false);
                      void acknowledgePricingModal();
                    }}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/[0.04]"
                  >
                    {pricingModalDismissLabel}
                  </button>
                </div>
              </div>

              <div className="relative mt-6 grid gap-4 md:grid-cols-3">
                <article className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.035]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Free
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">$0</p>
                  <p className="mt-2 text-sm text-zinc-400">Try it in minutes. No card required.</p>
                  <p className="mt-3 text-xs text-zinc-500">
                    {MODAL_FREE_CREDITS_PER_MONTH} credits / month
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs text-zinc-300">
                    <p>• Core chat + onboarding</p>
                    <p>• 1 workspace handle</p>
                    <p>
                      • ≈ {MODAL_FREE_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                      {MODAL_FREE_APPROX_DRAFT_TURNS} draft/review turns
                    </p>
                  </div>
                </article>

                <article className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/[0.05] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_14px_36px_rgba(255,255,255,0.1)]">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl transition-opacity duration-300 group-hover:opacity-90" />
                  <div className="flex items-start justify-between gap-3">
                    <p className="inline-flex whitespace-nowrap rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
                      {isProActive ? "Current plan" : "Most popular"}
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <div className="relative inline-flex w-full max-w-[172px] rounded-full border border-white/20 bg-black/35 p-0.5">
                        <span
                          className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-white transition-transform duration-200 ${
                            selectedModalProIsAnnual ? "translate-x-full" : "translate-x-0"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedModalProCadence("monthly")}
                          className={`relative z-10 flex-1 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                            selectedModalProIsAnnual ? "text-zinc-300 hover:text-white" : "text-black"
                          }`}
                        >
                          Monthly
                        </button>
                        <div className="relative z-10 flex-1">
                          <button
                            type="button"
                            onClick={() => setSelectedModalProCadence("annual")}
                            className={`w-full rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                              selectedModalProIsAnnual ? "text-black" : "text-zinc-300 hover:text-white"
                            }`}
                          >
                            Annual
                          </button>
                        </div>
                        <span className="pointer-events-none absolute left-3/4 top-full z-20 mt-1 w-max -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/35 bg-emerald-400/10 px-1.5 py-[3px] text-[7px] font-semibold uppercase leading-none tracking-[0.1em] text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.25)]">
                          2 months free
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                    Pro
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatUsdPrice(selectedModalProCents)}
                    <span className="text-sm font-medium text-zinc-400">
                      {selectedModalProPriceSuffix}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    Best for consistent creators. Save more with annual billing.
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs text-zinc-200">
                    <p>• {MODAL_PRO_CREDITS_PER_MONTH} credits/month</p>
                    <p>• Draft analysis + compare</p>
                    <p>• Up to 5 workspace handles</p>
                    <p>
                      • ≈ {MODAL_PRO_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                      {MODAL_PRO_APPROX_DRAFT_TURNS} draft/review turns
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (isFounderCurrent || selectedModalProIsCurrent) {
                          return;
                        }
                        if (selectedModalProNeedsPortalSwitch) {
                          void openBillingPortal();
                          return;
                        }
                        void openCheckoutForOffer(selectedModalProOffer);
                      }}
                      disabled={
                        checkoutLoadingOffer !== null ||
                        isOpeningBillingPortal ||
                        !selectedModalProOfferEnabled ||
                        isFounderCurrent ||
                        selectedModalProIsCurrent
                      }
                      className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-black transition hover:scale-[1.02] hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    >
                      {isSelectedModalProCheckoutLoading
                        ? "Opening…"
                        : isOpeningBillingPortal && selectedModalProNeedsPortalSwitch
                          ? "Opening…"
                          : selectedModalProButtonLabel}
                    </button>
                  </div>
                </article>

                <article className="group relative overflow-hidden rounded-2xl border border-amber-200/35 bg-amber-200/[0.08] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/70 hover:bg-amber-200/[0.12] hover:shadow-[0_16px_44px_rgba(251,191,36,0.24)]">
                  <div className="pointer-events-none absolute -left-10 top-4 h-28 w-28 rounded-full bg-amber-200/24 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
                  <div className="pointer-events-none absolute -right-14 -top-10 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl animate-pulse" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_22%,rgba(251,191,36,0.2)_50%,transparent_78%)] opacity-35 transition-opacity duration-500 group-hover:opacity-65" />
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                    <Sparkles className="h-3.5 w-3.5 text-amber-100" />
                    Founder Pass
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatUsdPrice(lifetimeOffer?.amountCents ?? DEFAULT_MODAL_LIFETIME_CENTS)}
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    One-time founder access with Pro limits and monthly Pro credits.
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {lifetimeSlotSummary
                      ? `${lifetimeSlotSummary.remaining}/${lifetimeSlotSummary.total} founder passes remaining`
                      : "Limited founder passes"}
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs text-zinc-200">
                    <p>• {MODAL_PRO_CREDITS_PER_MONTH} credits/month (same limits as Pro)</p>
                    <p>
                      • ≈ {MODAL_PRO_APPROX_CHAT_TURNS} chat turns or ≈{" "}
                      {MODAL_PRO_APPROX_DRAFT_TURNS} draft/review turns
                    </p>
                    <p>• No recurring subscription</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isFounderCurrent) {
                        return;
                      }
                      void openCheckoutForOffer("lifetime");
                    }}
                    disabled={
                      checkoutLoadingOffer !== null ||
                      isFounderCurrent ||
                      lifetimeOffer?.enabled === false ||
                      (lifetimeSlotSummary ? lifetimeSlotSummary.remaining <= 0 : false)
                    }
                    className="mt-4 inline-flex items-center rounded-full border border-amber-200/50 bg-amber-100/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.18)] transition hover:scale-[1.02] hover:bg-amber-100/18 hover:shadow-[0_0_24px_rgba(251,191,36,0.32)] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
                  >
                    {checkoutLoadingOffer === "lifetime"
                      ? "Opening…"
                      : isFounderCurrent
                        ? "Current Plan"
                      : lifetimeSlotSummary && lifetimeSlotSummary.remaining <= 0
                        ? "Sold out"
                        : "Get Founder Pass"}
                  </button>
                  <p className="mt-3 text-[11px] leading-5 text-amber-100/75">
                    Includes Pro plan limits and monthly Pro credits while Xpo and this plan are
                    offered. If this plan is retired, we honor your purchase with an equivalent plan
                    or account credit.
                  </p>
                </article>
              </div>

              <p className="relative mt-5 text-xs text-zinc-500">
                Need billing help? {billingState?.supportEmail ?? "shernanjavier@gmail.com"}
              </p>
              <p className="relative mt-1 text-xs text-zinc-500">
                Refunds: subscriptions within 7 days (up to 120 credits), Founder Pass within 72
                hours (up to 60 credits).{" "}
                <a href="/refund-policy" className="underline transition hover:text-zinc-300">
                  View refund policy
                </a>
              </p>
            </div>
          </div>
        ) : null
      }

      {
        feedbackModalOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setFeedbackModalOpen(false);
              }
            }}
          >
            <div className="relative my-auto flex w-full max-w-6xl flex-col rounded-[1.75rem] border border-white/10 bg-[#0F0F0F] shadow-2xl max-sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Feedback
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    Help us improve Xpo
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                    Choose a category, keep your message in the template, and submit. Switching tabs keeps your draft intact.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(false)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
                >
                  Close
                </button>
              </div>

              <form onSubmit={submitFeedback} className="flex min-h-0 flex-1 flex-col">
                <div className="overflow-y-auto px-6 py-6">
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        Message type
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {FEEDBACK_CATEGORY_ORDER.map((category) => {
                          const Icon =
                            category === "feature_request"
                              ? Lightbulb
                              : category === "bug_report"
                                ? Bug
                                : MessageSquareText;
                          const isActive = feedbackCategory === category;
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setFeedbackCategory(category)}
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                isActive
                                  ? "bg-white text-black"
                                  : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{FEEDBACK_CATEGORY_CONFIG[category].label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">{activeFeedbackConfig.helper}</p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              Submit your message
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">Markdown compatible.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => applyFeedbackMarkdownToken("bold")}
                              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                              aria-label="Insert bold markdown"
                              title="Bold"
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() => applyFeedbackMarkdownToken("italic")}
                              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] italic text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                              aria-label="Insert italic markdown"
                              title="Italic"
                            >
                              i
                            </button>
                            <button
                              type="button"
                              onClick={() => applyFeedbackMarkdownToken("bullet")}
                              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                              aria-label="Insert bullet markdown"
                              title="Bullet list"
                            >
                              •
                            </button>
                            <button
                              type="button"
                              onClick={() => applyFeedbackMarkdownToken("link")}
                              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                              aria-label="Insert link markdown"
                              title="Link"
                            >
                              🔗
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={activeFeedbackTitle}
                          onChange={(event) => {
                            const nextTitle = event.target.value;
                            setFeedbackTitlesByCategory((current) => ({
                              ...current,
                              [feedbackCategory]: nextTitle,
                            }));
                            setFeedbackSubmitNotice(null);
                          }}
                          placeholder={`${activeFeedbackConfig.label} title`}
                          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/20"
                        />
                        <textarea
                          ref={feedbackEditorRef}
                          value={activeFeedbackDraft}
                          onKeyDown={handleFeedbackEditorKeyDown}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setFeedbackDraftsByCategory((current) => ({
                              ...current,
                              [feedbackCategory]: nextValue,
                            }));
                            setFeedbackSubmitNotice(null);
                          }}
                          placeholder={activeFeedbackConfig.template}
                          className="mt-3 min-h-[14rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-white/20"
                        />
                        <p className="mt-2 text-[11px] text-zinc-500">
                          {activeFeedbackDraft.trim().length} chars
                        </p>

                        <div
                          className={`mt-3 rounded-2xl border border-dashed p-4 transition ${
                            isFeedbackDropActive
                              ? "border-white/25 bg-white/[0.06]"
                              : "border-white/10 bg-black/30"
                          }`}
                          onClick={() => feedbackFileInputRef.current?.click()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              feedbackFileInputRef.current?.click();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          onDragOver={handleFeedbackDropZoneDragOver}
                          onDragLeave={handleFeedbackDropZoneDragLeave}
                          onDrop={handleFeedbackDropZoneDrop}
                        >
                          <div className="flex flex-col items-center justify-center gap-2 text-center">
                            <ImagePlus className="h-4 w-4 text-zinc-400" />
                            <p className="text-xs text-zinc-300">
                              Drag and drop files here, or click to upload
                            </p>
                            <p className="text-xs text-zinc-500">
                              Supported files: PNG / JPG / MP4 • Max {Math.round(FEEDBACK_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB per file
                            </p>
                            <input
                              id="feedback-image-upload"
                              ref={feedbackFileInputRef}
                              type="file"
                              accept=".png,.jpg,.jpeg,.mp4,image/png,image/jpeg,video/mp4"
                              multiple
                              onChange={handleFeedbackImageSelection}
                              className="hidden"
                            />
                          </div>
                        </div>

                        {feedbackImages.length > 0 ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {feedbackImages.map((image) => (
                              <div
                                key={image.id}
                                className="rounded-2xl border border-white/10 bg-black/30 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  {image.file.type.toLowerCase() === "video/mp4" ? (
                                    <video
                                      src={image.previewUrl}
                                      className="h-14 w-14 rounded-xl object-cover"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <Image
                                      src={image.previewUrl}
                                      alt={image.file.name}
                                      width={56}
                                      height={56}
                                      unoptimized
                                      className="h-14 w-14 rounded-xl object-cover"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeFeedbackImage(image.id)}
                                    className="rounded-full border border-white/10 p-1 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                                    aria-label={`Remove ${image.file.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <p className="mt-2 line-clamp-1 text-xs text-zinc-300">
                                  {image.file.name}
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  {formatFileSize(image.file.size)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                          Live preview
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span className="text-zinc-300">
                            Submitting as <span className="font-semibold text-white">{session?.user?.email ?? "email unavailable"}</span>
                          </span>
                          <span>•</span>
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[10px] font-bold text-white uppercase">
                            {context?.avatarUrl ? (
                              <div
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${context.avatarUrl})` }}
                                role="img"
                                aria-label={`${feedbackIdentityHandle} profile photo`}
                              />
                            ) : (
                              feedbackIdentityHandle.charAt(0)
                            )}
                          </div>
                          <span>@{feedbackIdentityHandle}</span>
                        </div>
                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                          {activeFeedbackTitle.trim() ? (
                            <p className="text-xl font-semibold leading-8 text-white">
                              {activeFeedbackTitle.trim()}
                            </p>
                          ) : null}
                          <div
                            className="mt-3 h-[20rem] overflow-y-auto pr-1 space-y-2 text-sm leading-6 text-zinc-200 [&_a]:text-sky-300 [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:whitespace-pre-wrap [&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1.5 [&_code]:py-0.5 [&_del]:text-zinc-500 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-4 [&_li]:whitespace-pre-wrap [&_ol]:list-decimal [&_p]:text-zinc-200 [&_p]:whitespace-pre-wrap [&_strong]:font-semibold [&_ul]:list-disc md:h-[24rem]"
                            dangerouslySetInnerHTML={{ __html: feedbackPreviewHtml }}
                          />
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                          {activeFeedbackConfig.exampleTitle}
                        </p>
                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                          <p className="whitespace-pre-line text-sm leading-6 text-zinc-200">
                            {activeFeedbackConfig.exampleBody}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                          Auto-tracked context
                        </p>
                        <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                          {feedbackTrackedContextRows.map((row) => (
                            <li key={row}>• {row}</li>
                          ))}
                          <li>• timestamp: captured server-side on submit</li>
                          <li>• account + user identity: attached server-side</li>
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                          Submitted reports
                        </p>
                        {isFeedbackHistoryLoading ? (
                          <span className="text-xs text-zinc-500">Loading…</span>
                        ) : null}
                      </div>
                      {feedbackHistory.length > 0 ? (
                        <div className="mt-3">
                          <input
                            type="text"
                            value={feedbackHistoryQuery}
                            onChange={(event) => setFeedbackHistoryQuery(event.target.value)}
                            placeholder="Search reports by title, message, or attachment"
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/25"
                          />
                        </div>
                      ) : null}
                      {feedbackHistory.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {FEEDBACK_HISTORY_FILTER_OPTIONS.map((option) => {
                            const isActive = feedbackHistoryFilter === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setFeedbackHistoryFilter(option.value)}
                                className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                                  isActive
                                    ? "border-white/40 bg-white/[0.12] text-white"
                                    : "border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                                }`}
                              >
                                {option.label} ({feedbackHistoryCounts[option.value]})
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {filteredFeedbackHistory.length > 0 ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {filteredFeedbackHistory.map((entry) => (
                            <article
                              key={entry.id}
                              className="h-full rounded-2xl border border-white/10 bg-black/30 p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                                  {FEEDBACK_CATEGORY_CONFIG[entry.category].label}
                                </span>
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getFeedbackStatusPillClassName(
                                    normalizeFeedbackStatus(entry.status),
                                  )}`}
                                >
                                  {formatFeedbackStatusLabel(normalizeFeedbackStatus(entry.status))}
                                </span>
                                <span className="text-[11px] text-zinc-500">
                                  {new Date(entry.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-medium text-white">
                                {entry.title?.trim() || "Untitled report"}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                                {entry.message}
                              </p>
                              {entry.attachments.length > 0 ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-[11px] text-zinc-500">
                                    {entry.attachments.length} file
                                    {entry.attachments.length === 1 ? "" : "s"} attached
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {entry.attachments.slice(0, 3).map((attachment) => (
                                      <div
                                        key={attachment.id}
                                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2"
                                        title={`${attachment.name} • ${formatFileSize(attachment.sizeBytes)}`}
                                      >
                                        {attachment.thumbnailDataUrl &&
                                        attachment.mimeType.startsWith("image/") ? (
                                          <Image
                                            src={attachment.thumbnailDataUrl}
                                            alt={attachment.name}
                                            width={36}
                                            height={36}
                                            unoptimized
                                            className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-[10px] text-zinc-400">
                                            {attachment.mimeType === "video/mp4" ? "MP4" : "FILE"}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <p className="truncate text-[11px] text-zinc-300">
                                            {attachment.name}
                                          </p>
                                          <p className="text-[10px] text-zinc-500">
                                            {formatFileSize(attachment.sizeBytes)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                    {entry.attachments.length > 3 ? (
                                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500">
                                        +{entry.attachments.length - 3} more
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                              {entry.statusUpdatedAt ? (
                                <p className="mt-2 text-[11px] text-zinc-500">
                                  status updated{" "}
                                  {entry.statusUpdatedByUserId &&
                                  entry.statusUpdatedByUserId === session?.user?.id
                                    ? "by you"
                                    : "by account owner"}{" "}
                                  on {new Date(entry.statusUpdatedAt).toLocaleString()}
                                </p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {normalizeFeedbackStatus(entry.status) === "open" ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                                      onClick={() =>
                                        void updateFeedbackSubmissionStatus(entry.id, "resolved")
                                      }
                                      className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {feedbackStatusUpdatingIds[entry.id]
                                        ? "Updating"
                                        : "Mark resolved"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                                      onClick={() =>
                                        void updateFeedbackSubmissionStatus(entry.id, "cancelled")
                                      }
                                      className="rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {feedbackStatusUpdatingIds[entry.id]
                                        ? "Updating"
                                        : "Mark cancelled"}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                                    onClick={() =>
                                      void updateFeedbackSubmissionStatus(entry.id, "open")
                                    }
                                    className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {feedbackStatusUpdatingIds[entry.id] ? "Updating" : "Reopen"}
                                  </button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : feedbackHistory.length > 0 ? (
                        <p className="mt-4 text-sm text-zinc-500">
                          No reports match this filter.
                        </p>
                      ) : (
                        <p className="mt-4 text-sm text-zinc-500">
                          No feedback submitted yet for this profile.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">
                      {feedbackSubmitNotice ?? "submissions are tracked per profile to improve product quality."}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Open reports: {feedbackHistoryCounts.open} • Open with media:{" "}
                      {feedbackOpenWithMediaCount}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isFeedbackSubmitting || activeFeedbackDraft.trim().length === 0}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {isFeedbackSubmitting ? "Submitting" : "Submit feedback"}
                  </button>
                </div>
              </form>
            </div>
          </div>
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
        playbookModalOpen && context ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPlaybookModalOpen(false);
                setPendingGrowthGuidePlaybookId(null);
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
                    <p className="mt-1 text-xs text-zinc-500">read-only field guide • not profile-specific</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPlaybookModalOpen(false);
                      setPendingGrowthGuidePlaybookId(null);
                    }}
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
                          onClick={() => setPlaybookStage(stageKey)}
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
                              onClick={() => handleApplyPlaybook(playbook.id)}
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
                          🧭 Stage focus
                        </p>
                        <p className="text-base font-semibold text-white">
                          {PLAYBOOK_STAGE_META[playbookStage].highlight}
                        </p>
                        <p className="text-sm text-zinc-400">
                          🎯 win condition: {PLAYBOOK_STAGE_META[playbookStage].winCondition}
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
                          📊 Content mix
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
                    <section
                      ref={(node) => {
                        growthGuideSelectedPlaybookRef.current = node;
                      }}
                      className="space-y-4"
                    >
                      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                              📝 Playbook details
                            </p>
                            <h3 className="mt-2 text-xl font-semibold text-white">
                              {selectedPlaybook.name}
                            </h3>
                            <p className="mt-2 text-sm text-zinc-400">
                              {selectedPlaybook.outcome}
                            </p>
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
                            🔁 The loop
                          </p>
                          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                            {[
                              { label: "🧩 Input", value: selectedPlaybook.loop.input },
                              { label: "⚡ Action", value: selectedPlaybook.loop.action },
                              { label: "📈 Feedback", value: selectedPlaybook.loop.feedback },
                            ].map((step, index) => (
                              <Fragment key={step.label}>
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                    {step.label}
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                                    {step.value}
                                  </p>
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
                              <p className="text-sm font-semibold text-white">✅ What good looks like</p>
                              <p className="text-xs text-zinc-500">3–5 benchmarks worth tracking.</p>
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
                              <p className="text-sm font-semibold text-white">🗓️ Today’s checklist</p>
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
                              <p className="text-sm font-semibold text-white">🧰 Templates</p>
                              <p className="text-xs text-zinc-500">Hook / Reply / Thread / CTA</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                { key: "hook", label: "Hook" },
                                { key: "reply", label: "Reply" },
                                { key: "thread", label: "Thread" },
                                { key: "cta", label: "CTA" },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setPlaybookTemplateTab(tab.key)}
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
                                {activePlaybookTemplate?.text ||
                                  "pick a template on the right to preview it here."}
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
                              const isTemplateSelected = activePlaybookTemplate?.id === template.id;

                              return (
                                <div key={template.id} className="space-y-2">
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setActivePlaybookTemplateId(template.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setActivePlaybookTemplateId(template.id);
                                      }
                                    }}
                                    className={`rounded-2xl border p-4 transition ${
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
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleCopyPlaybookTemplate(template);
                                        }}
                                        className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                                        aria-label={`Copy ${template.label} template`}
                                      >
                                        {isCopied ? (
                                          <Check className="h-4 w-4" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                      Why This Works
                                    </p>
                                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                                      {buildTemplateWhyItWorksPoints(playbookTemplateTab).map((point) => (
                                        <li key={point} className="flex items-start gap-2">
                                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                                          <span>{point}</span>
                                        </li>
                                      ))}
                                    </ul>
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
                          <p className="text-sm font-semibold text-white">🚀 Start in 15 min</p>
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
                          <p className="text-sm font-semibold text-white">🧠 Why this playbook works</p>
                          <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300">
                            {selectedPlaybook.rationale}
                          </p>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                          <p className="text-sm font-semibold text-white">⚠️ Common mistakes</p>
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
                          <p className="text-sm font-semibold text-white">🧪 Examples</p>
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
                <p className="text-xs text-zinc-500">
                    work in progress: this guide is still being updated.
                  </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPlaybookModalOpen(false);
                      setPendingGrowthGuidePlaybookId(null);
                      setFeedbackSubmitNotice(null);
                      setFeedbackModalOpen(true);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                    aria-label="Open feedback"
                    title="Feedback"
                  >
                    <MessageSquareText className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPlaybookModalOpen(false);
                      setPendingGrowthGuidePlaybookId(null);
                      setAnalysisOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <span>Open Profile Analysis</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        analysisOpen && context ? (
          <div
            className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 sm:items-center sm:py-8"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setAnalysisOpen(false);
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
                  onClick={() => setAnalysisOpen(false)}
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
                        {card.meta ? (
                          <p className="mt-1 text-xs text-zinc-500">{card.meta}</p>
                        ) : null}
                      </article>
                    ))}
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
                        <p className="text-sm font-semibold text-white">Recommended playbooks for you</p>
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
                            <p className="mt-1 text-sm text-zinc-400">{recommendation.playbook.outcome}</p>
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
                                openGrowthGuideForRecommendation(
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
                              <span>{new Date(context.positiveAnchors[0].createdAt).toLocaleDateString()}</span>
                              <span>·</span>
                              <span>
                                {computeXWeightedCharacterCount(
                                  context.positiveAnchors[0].text,
                                )}
                                /
                                {getXCharacterLimitForAccount(
                                  context.creatorProfile.identity.isVerified,
                                )}{" "}
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
                          <article key={post.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
                <p className="text-xs text-zinc-500">
                  work in progress: profile analysis is still improving. share feedback so we can improve result quality :)
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisOpen(false);
                      setFeedbackSubmitNotice(null);
                      setFeedbackModalOpen(true);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                    aria-label="Open feedback"
                    title="Feedback"
                  >
                    <MessageSquareText className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisOpen(false);
                      setPlaybookStage(currentPlaybookStage);
                      setPendingGrowthGuidePlaybookId(null);
                      setPlaybookModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <span>Open Growth Guide</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
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
            if (!requiresXAccountGate && event.target === event.currentTarget) {
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
                  {!requiresXAccountGate ? (
                    <button
                      type="button"
                      onClick={closeAddAccountModal}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      Close
                    </button>
                  ) : null}
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
