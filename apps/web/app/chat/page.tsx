"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams, useParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth/client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import {
  getXCharacterLimitForAccount,
  type ThreadFramingStyle,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import {
  buildDraftReviewFailureLabel,
  buildDraftReviewLoadingLabel,
  buildDraftReviewPrompt,
} from "@/lib/agent-v2/orchestrator/assistantReplyStyle";
import type {
  ChatArtifactContext,
  ChatTurnSource,
  SelectedAngleFormatHint,
} from "@/lib/agent-v2/contracts/turnContract";
import type { CreatorGenerationContract } from "@/lib/onboarding/contracts/generationContract";
import type {
  XPublicProfile,
  PostingCadenceCapacity,
  ReplyBudgetPerDay,
  ToneCasing,
  ToneRisk,
  TransformationMode,
  UserGoal,
} from "@/lib/onboarding/types";
import {
  type PlaybookDefinition,
  type PlaybookTemplateTab,
} from "@/lib/creator/playbooks";
import {
  ObservedMetricsModal,
  type ObservedMetricsFormState,
} from "./_dialogs/ObservedMetricsModal";
import {
  resolveBillingViewState,
  type BillingSnapshotPayload,
  type BillingStatePayload,
} from "./_features/billing/billingViewState";
import { PricingDialog } from "./_features/billing/PricingDialog";
import { SettingsDialog } from "./_features/billing/SettingsDialog";
import {
  DesktopDraftEditorDock,
  MobileDraftEditorDock,
} from "./_features/draft-editor/DraftEditorDock";
import { DraftEditorPanel } from "./_features/draft-editor/DraftEditorPanel";
import {
  buildChatWorkspaceUrl,
  buildWorkspaceHandleHeaders,
} from "@/lib/workspaceHandle";
import {
  type PendingStatusPlan,
  type PendingStatusWorkflow,
} from "./_features/composer/pendingStatus";
import { ChatComposerDock } from "./_features/composer/ChatComposerDock";
import { ChatHero } from "./_features/composer/ChatHero";
import { resolveComposerViewState } from "./_features/composer/composerViewState";
import { prepareAssistantReplyTransport } from "./_features/transport/chatTransport";
import {
  prepareComposerSubmission,
  resolveComposerQuickReplyUpdate,
} from "./_features/composer/chatComposerState";
import {
  addThreadDraftPost as addThreadDraftPostState,
  buildDraftEditorHydrationState,
  buildDraftEditorSerializedContent,
  buildEditableThreadPosts,
  clampThreadPostIndex,
  ensureEditableThreadPosts,
  mergeThreadDraftPostDown as mergeThreadDraftPostDownState,
  moveThreadDraftPost as moveThreadDraftPostState,
  removeThreadDraftPost as removeThreadDraftPostState,
  splitThreadDraftPost as splitThreadDraftPostState,
} from "./_features/draft-editor/chatDraftEditorState";
import {
  resolveDraftCardRevisionAction,
  resolveSelectedThreadFramingChangeAction,
} from "./_features/draft-editor/chatDraftActionState";
import {
  prepareDraftPromotionRequest,
  resolveDraftVersionRevertUpdate,
} from "./_features/draft-editor/chatDraftPersistenceState";
import {
  getThreadFramingStyle,
  resolvePrimaryDraftRevealKey,
} from "./_features/draft-editor/chatDraftPreviewState";
import {
  type DraftCandidateStatus,
} from "./_features/draft-queue/draftQueueViewState";
import {
  DraftQueueDialog,
  type DraftQueueObservedMetricsCandidate,
} from "./_features/draft-queue/DraftQueueDialog";
import {
  FEEDBACK_MAX_FILE_SIZE_BYTES,
  FEEDBACK_MAX_FILES,
  buildDefaultFeedbackDrafts,
  buildDefaultFeedbackTitles,
  buildFeedbackImageThumbnailDataUrl,
  extractFeedbackTemplateFields,
  formatFeedbackStatusLabel,
  isSupportedFeedbackFile,
  readFeedbackFileSignatureHex,
  type FeedbackAttachmentPayload,
  type FeedbackCategory,
  type FeedbackHistoryItem,
  type FeedbackImageDraft,
  type FeedbackReportFilter,
  type FeedbackReportStatus,
} from "./_features/feedback/feedbackState";
import { FeedbackDialog } from "./_features/feedback/FeedbackDialog";
import { resolveThreadHistoryHydration } from "./_features/thread-history/chatThreadHistoryState";
import {
  buildDraftRevisionTimeline,
  normalizeDraftVersionBundle,
  resolveDraftTimelineNavigation,
  resolveDraftTimelineState,
  resolveOpenDraftEditorState,
} from "./_features/draft-editor/chatDraftSessionState";
import {
  readChatResponseStream,
  resolveAssistantReplyJsonOutcome,
  resolveAssistantReplyPlan,
} from "./_features/reply/chatReplyState";
import type { AssistantReplyPlan as ResolvedAssistantReplyPlan } from "./_features/reply/chatReplyState";
import {
  buildChatWorkspaceReset,
  resolveCreatedThreadWorkspaceUpdate,
  resolveWorkspaceHandle,
  type ChatWorkspaceReset,
} from "./_features/workspace/chatWorkspaceState";
import { resolveWorkspaceLoadState } from "./_features/workspace/chatWorkspaceLoadState";
import { usePendingStatusLabel } from "./_features/composer/usePendingStatusLabel";
import { ChatMessageRow } from "./_features/thread-history/ChatMessageRow";
import { MessageArtifactSections } from "./_features/thread-history/MessageArtifactSections";
import { MessageContent } from "./_features/thread-history/MessageContent";
import { ChatThreadView } from "./_features/thread-history/ChatThreadView";
import { resolveThreadViewState } from "./_features/thread-history/threadViewState";
import { useThreadViewState } from "./_features/thread-history/useThreadViewState";
import { AddAccountDialog } from "./_features/workspace-chrome/AddAccountDialog";
import { ChatHeader } from "./_features/workspace-chrome/ChatHeader";
import { ChatSidebar } from "./_features/workspace-chrome/ChatSidebar";
import { ExtensionDialog } from "./_features/workspace-chrome/ExtensionDialog";
import { ThreadDeleteDialog } from "./_features/workspace-chrome/ThreadDeleteDialog";
import { useWorkspaceChromeState } from "./_features/workspace-chrome/useWorkspaceChromeState";
import {
  resolveAccountAvatarFallback,
  resolveAccountProfileAriaLabel,
  resolveSidebarThreadSections,
  WORKSPACE_CHROME_TOOLS,
} from "./_features/workspace-chrome/workspaceChromeViewState";
import { SourceMaterialsDialog } from "./_features/source-materials/SourceMaterialsDialog";
import { useSourceMaterialsState } from "./_features/source-materials/useSourceMaterialsState";
import { PreferencesDialog } from "./_features/preferences/PreferencesDialog";
import { usePreferencesState } from "./_features/preferences/usePreferencesState";
import { GrowthGuideDialog } from "./_features/growth-guide/GrowthGuideDialog";
import { useGrowthGuideState } from "./_features/growth-guide/useGrowthGuideState";
import { ProfileAnalysisDialog } from "./_features/analysis/ProfileAnalysisDialog";
import { useAnalysisState } from "./_features/analysis/useAnalysisState";
import { resolveDraftEditorIdentity } from "./_features/draft-editor/draftEditorViewState";
import {
  type SourceMaterialAsset,
} from "./_features/source-materials/sourceMaterialsState";

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
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
  errors: ValidationError[];
}

type CreatorAgentContextResponse = CreatorAgentContextSuccess | CreatorAgentContextFailure;

interface CreatorGenerationContractSuccess {
  ok: true;
  data: CreatorGenerationContract;
}

interface CreatorGenerationContractFailure {
  ok: false;
  code?: "MISSING_ONBOARDING_RUN" | "ONBOARDING_SOURCE_INVALID";
  errors: ValidationError[];
}

type CreatorGenerationContractResponse =
  | CreatorGenerationContractSuccess
  | CreatorGenerationContractFailure;

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
      groundingSources?: DraftArtifact["groundingSources"];
      outputShape: CreatorChatSuccess["data"]["outputShape"];
      replyArtifacts?: ReplyArtifacts | null;
      source: "deterministic";
      model: string | null;
    };
    promotedSourceMaterials?: {
      count: number;
      assets: SourceMaterialAsset[];
    };
  };
}

interface DraftPromotionFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftPromotionResponse = DraftPromotionSuccess | DraftPromotionFailure;

interface DraftQueueCandidate {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: CreatorChatSuccess["data"]["outputShape"] | string;
  status: DraftCandidateStatus;
  artifact: DraftArtifact;
  voiceTarget: DraftArtifact["voiceTarget"];
  noveltyNotes: string[] | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  editedAt: string | null;
  postedAt: string | null;
  observedAt: string | null;
  observedMetrics: Record<string, unknown> | null;
}

interface DraftQueueSuccess {
  ok: true;
  data: {
    candidates: DraftQueueCandidate[];
  };
}

interface DraftQueueFailure {
  ok: false;
  errors: ValidationError[];
}

type DraftQueueResponse = DraftQueueSuccess | DraftQueueFailure;

interface DraftQueueCandidateMutationSuccess {
  ok: true;
  data: {
    candidate: DraftQueueCandidate;
  };
}

type DraftQueueCandidateMutationResponse =
  | DraftQueueCandidateMutationSuccess
  | DraftQueueFailure;

function createEmptyObservedMetricsForm(): ObservedMetricsFormState {
  return {
    likeCount: "",
    replyCount: "",
    profileClicks: "",
    followerDelta: "",
  };
}

function normalizeObservedMetricValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildObservedMetricsPayload(
  value: ObservedMetricsFormState,
): Record<string, number> | null {
  const likeCount = normalizeObservedMetricValue(value.likeCount);
  const replyCount = normalizeObservedMetricValue(value.replyCount);
  if (likeCount === undefined || replyCount === undefined) {
    return null;
  }

  const profileClicks = normalizeObservedMetricValue(value.profileClicks);
  const followerDelta = normalizeObservedMetricValue(value.followerDelta);

  return {
    likeCount,
    replyCount,
    ...(profileClicks !== undefined ? { profileClicks } : {}),
    ...(followerDelta !== undefined ? { followerDelta } : {}),
  };
}

interface SourceMaterialsSuccess {
  ok: true;
  data: {
    assets: SourceMaterialAsset[];
  };
}

interface SourceMaterialMutationSuccess {
  ok: true;
  data: {
    asset?: SourceMaterialAsset;
    deletedId?: string;
  };
}

interface SourceMaterialsFailure {
  ok: false;
  errors: ValidationError[];
}

type SourceMaterialsResponse =
  | SourceMaterialsSuccess
  | SourceMaterialMutationSuccess
  | SourceMaterialsFailure;

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
      formatPreference?: "shortform" | "longform" | "thread";
    } | null;
    draft?: string | null;
    drafts: string[];
    draftArtifacts: DraftArtifact[];
    draftVersions?: DraftVersionEntry[];
    activeDraftVersionId?: string;
    draftBundle?: DraftBundlePayload | null;
    previousVersionSnapshot?: DraftVersionSnapshot | null;
    revisionChainId?: string;
    supportAsset: string | null;
    groundingSources?: DraftArtifact["groundingSources"];
    autoSavedSourceMaterials?: {
      count: number;
      assets: Array<{
        id: string;
        title: string;
        deletable: boolean;
      }>;
    } | null;
    outputShape:
    | "coach_question"
    | "ideation_angles"
    | "planning_outline"
    | "short_form_post"
    | "long_form_post"
    | "thread_seed"
    | "reply_candidate"
    | "quote_candidate";
    surfaceMode?:
      | "answer_directly"
      | "ask_one_question"
      | "revise_and_return"
      | "offer_options"
      | "generate_full_output";
    replyArtifacts?: ReplyArtifacts | null;
    replyParse?: ReplyParseEnvelope | null;
    contextPacket?: {
      version: string;
      summary: string;
    } | null;
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
      activeDraftRef?: {
        messageId: string;
        versionId: string;
        revisionChainId?: string | null;
      } | null;
      rollingSummary?: string | null;
      pendingPlan?: {
        objective: string;
        angle: string;
        targetLane: "original" | "reply" | "quote";
        mustInclude: string[];
        mustAvoid: string[];
        hookType: string;
        pitchResponse: string;
        formatPreference?: "shortform" | "longform" | "thread";
      } | null;
      clarificationState?: {
        branchKey: string;
        stepKey: string;
        seedTopic: string | null;
      } | null;
      assistantTurnCount?: number;
      latestRefinementInstruction?: string | null;
      unresolvedQuestion?: string | null;
      clarificationQuestionsAsked?: number;
      preferredSurfaceMode?: "natural" | "structured" | null;
      formatPreference?: "shortform" | "longform" | "thread" | null;
      activeReplyContext?: {
        sourceText: string;
        sourceUrl: string | null;
        authorHandle: string | null;
        selectedReplyOptionId: string | null;
      } | null;
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
  artifact?: DraftArtifact;
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

interface DraftBundleOption {
  id: string;
  label: string;
  framing?: string;
  versionId: string;
  content: string;
  artifact: DraftArtifact;
}

interface DraftBundlePayload {
  kind: "sibling_options";
  selectedOptionId: string;
  options: DraftBundleOption[];
}

interface ReplyIntentMetadata {
  label: string;
  strategyPillar: string;
  anchor: string;
  rationale: string;
}

interface ReplyArtifactOption {
  id: string;
  label: string;
  text: string;
  intent?: ReplyIntentMetadata;
}

type ReplyArtifacts =
  | {
      kind: "reply_options";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ReplyArtifactOption[];
      groundingNotes: string[];
      warnings: string[];
      selectedOptionId: string | null;
    }
  | {
      kind: "reply_draft";
      sourceText: string;
      sourceUrl: string | null;
      authorHandle: string | null;
      options: ReplyArtifactOption[];
      notes: string[];
      selectedOptionId: string | null;
    };

interface ReplyParseEnvelope {
  detected: boolean;
  confidence: "low" | "medium" | "high";
  needsConfirmation: boolean;
  parseReason: string;
}

interface DraftDrawerSelection {
  messageId: string;
  versionId: string;
  revisionChainId?: string;
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
  draftBundle?: DraftBundlePayload | null;
  previousVersionSnapshot?: DraftVersionSnapshot | null;
  revisionChainId?: string;
  supportAsset?: string | null;
  groundingSources?: DraftArtifact["groundingSources"];
  autoSavedSourceMaterials?: {
    count: number;
    assets: Array<{
      id: string;
      title: string;
      deletable: boolean;
    }>;
  } | null;
  promotedSourceMaterials?: {
    count: number;
    assets: SourceMaterialAsset[];
  } | null;
  whyThisWorks?: string[];
  watchOutFor?: string[];
  outputShape?: CreatorChatSuccess["data"]["outputShape"];
  surfaceMode?: CreatorChatSuccess["data"]["surfaceMode"];
  replyArtifacts?: ReplyArtifacts | null;
  replyParse?: ReplyParseEnvelope | null;
  contextPacket?: {
    version: string;
    summary: string;
  } | null;
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
  formatPreference?: "shortform" | "longform" | "thread";
}

type CreatorAssistantReplyPlan = ResolvedAssistantReplyPlan<
  ChatQuickReply,
  CreatorChatSuccess["data"]["plan"],
  DraftArtifact,
  DraftVersionEntry,
  DraftBundlePayload,
  DraftVersionSnapshot,
  ReplyArtifacts,
  ReplyParseEnvelope,
  CreatorChatSuccess["data"]["contextPacket"],
  CreatorChatSuccess["data"]["memory"],
  BillingStatePayload
>;

const DRAFT_REVEAL_DURATION_MS = 1250;
const DRAFT_SHELL_LINE_WIDTHS = ["96%", "82%", "90%"] as const;

function isDraftPendingWorkflow(
  workflow: PendingStatusWorkflow | null | undefined,
): workflow is "plan_then_draft" | "revise_draft" {
  return workflow === "plan_then_draft" || workflow === "revise_draft";
}

function messageHasDraftOutput(message: ChatMessage): boolean {
  return Boolean(
    message.draft?.trim() ||
      message.draftArtifacts?.length ||
      message.draftBundle?.options?.length ||
      message.draftVersions?.length,
  );
}

function hasActiveDraftReveal(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(activeDraftRevealByMessageId, messageId);
}

function resolveDraftRevealPhase(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): "none" | "primary" | "secondary" {
  const primaryDraftRevealKey = activeDraftRevealByMessageId[messageId];
  if (!primaryDraftRevealKey) {
    return "none";
  }

  return primaryDraftRevealKey === draftKey ? "primary" : "secondary";
}

function buildDraftRevealClassName(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): string {
  const phase = resolveDraftRevealPhase(
    activeDraftRevealByMessageId,
    messageId,
    draftKey,
  );
  if (phase === "primary") {
    return "animate-draft-card-reveal";
  }
  if (phase === "secondary") {
    return "animate-draft-option-stagger";
  }
  return "";
}

function shouldAnimateDraftRevealLines(
  activeDraftRevealByMessageId: Record<string, string>,
  messageId: string,
  draftKey: string,
): boolean {
  return (
    resolveDraftRevealPhase(activeDraftRevealByMessageId, messageId, draftKey) ===
    "primary"
  );
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

const BASE_HERO_QUICK_ACTIONS = [
  {
    label: "Write a post",
    prompt: "write a post",
  },
  {
    label: "Give me feedback",
    prompt: "give me feedback",
  },
  {
    label: "Write a thread",
    prompt: "write a thread",
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

function buildDefaultExampleQuickReplies(lowercase: boolean): ChatQuickReply[] {
  return BASE_HERO_QUICK_ACTIONS.map((action) => ({
    kind: "example_reply",
    value: applyChipVoiceCase(action.prompt, lowercase),
    label: applyChipVoiceCase(action.label, lowercase),
  }));
}

const HERO_EXIT_TRANSITION_MS = 720;
const DRAFT_TIMELINE_FOCUS_DELAY_MS = 0;
function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function shouldShowQuickRepliesForMessage(message: ChatMessage): boolean {
  if (!message.quickReplies?.length) {
    return false;
  }

  if (!message.surfaceMode) {
    return true;
  }

  return (
    message.surfaceMode === "ask_one_question" ||
    message.surfaceMode === "offer_options"
  );
}

function shouldShowOptionArtifactsForMessage(message: ChatMessage): boolean {
  if (!message.surfaceMode) {
    return true;
  }

  return message.surfaceMode === "offer_options";
}

function shouldShowDraftOutputForMessage(message: ChatMessage): boolean {
  if (!message.surfaceMode) {
    return true;
  }

  return (
    message.surfaceMode === "generate_full_output" ||
    message.surfaceMode === "revise_and_return"
  );
}

// V3: inferComposerIntent was removed. The backend turn planner and LLM
// classifier are now fully authoritative for intent classification.
// See: lib/agent-v2/orchestrator/turnPlanner.ts

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

function AssistantTypingBubble(props: { label?: string | null }) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      startTransition(() => {
        setDotCount((current) => (current >= 3 ? 1 : current + 1));
      });
    }, 420);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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
      {props.label ? (
        <p className="mt-3 text-xs text-zinc-400">
          {props.label}
          {".".repeat(dotCount)}
        </p>
      ) : null}
    </div>
  );
}

function PendingDraftShell(props: {
  workflow: "plan_then_draft" | "revise_draft";
  label?: string | null;
}) {
  const eyebrow =
    props.workflow === "revise_draft" ? "Revision in progress" : "Draft in progress";
  const title =
    props.workflow === "revise_draft" ? "Reworking the draft" : "Building the draft";

  return (
    <div
      className="max-w-[88%] px-4 py-3 text-zinc-100 animate-fade-in-slide-up"
      aria-live="polite"
      aria-label={title}
    >
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#050505] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="draft-shell-shimmer h-10 w-10 rounded-full bg-white/[0.06]" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {eyebrow}
              </p>
              <div className="draft-shell-shimmer mt-2 h-3 w-28 rounded-full bg-white/[0.06]" />
              <div className="draft-shell-shimmer mt-2 h-2.5 w-20 rounded-full bg-white/[0.05]" />
            </div>
          </div>
          <div className="draft-shell-shimmer h-8 w-8 rounded-full bg-white/[0.05]" />
        </div>

        <div className="mt-4 space-y-2.5">
          {DRAFT_SHELL_LINE_WIDTHS.map((width, index) => (
            <div
              key={`${props.workflow}-shell-line-${index}`}
              className="draft-shell-shimmer h-3 rounded-full bg-white/[0.06]"
              style={{ width }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
          <span className="inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {title}
          </span>
          {props.label ? <span>{props.label}</span> : null}
        </div>
      </div>
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
  const billingQuerySessionId = searchParams.get("session_id")?.trim() ?? "";

  const accountName = useMemo(
    () =>
      resolveWorkspaceHandle({
        searchHandle: searchParams.get("xHandle"),
        sessionHandle: session?.user?.activeXHandle ?? null,
      }),
    [searchParams, session?.user?.activeXHandle],
  );
  const requiresXAccountGate = status === "authenticated" && !accountName;
  const sourceMaterialsBootstrapKey = useMemo(() => {
    const normalizedHandle = normalizeAccountHandle(accountName ?? "");
    const accountKey = normalizedHandle || session?.user?.id?.trim() || "default";
    return `xpo:stories-proof-bootstrap:${accountKey}`;
  }, [accountName, session?.user?.id]);
  const buildWorkspaceHeaders = useCallback(
    (headers?: HeadersInit) => buildWorkspaceHandleHeaders(accountName, headers),
    [accountName],
  );
  const fetchWorkspace = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        headers: buildWorkspaceHeaders(init?.headers),
      }),
    [buildWorkspaceHeaders],
  );
  const buildWorkspaceChatHref = useCallback(
    (threadId?: string | null) => buildChatWorkspaceUrl({ threadId, xHandle: accountName }),
    [accountName],
  );

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadIdParam);
  const [chatThreads, setChatThreads] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const {
    hoveredThreadId,
    setHoveredThreadId,
    menuOpenThreadId,
    setMenuOpenThreadId,
    editingThreadId,
    setEditingThreadId,
    editingTitle,
    setEditingTitle,
    threadToDelete,
    requestDeleteThread,
    clearThreadToDelete,
    sidebarOpen,
    setSidebarOpen,
    sidebarSearchQuery,
    setSidebarSearchQuery,
    openSidebar,
    closeSidebar,
    accountMenuOpen,
    closeAccountMenu,
    toggleAccountMenu,
    accountMenuVisible,
    toolsMenuOpen,
    setToolsMenuOpen,
    rateLimitsMenuOpen,
    setRateLimitsMenuOpen,
    setAvailableHandles,
    availableHandles,
    threadMenuRef,
    accountMenuRef,
    toolsMenuRef,
  } = useWorkspaceChromeState({ accountName });
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountInput, setAddAccountInput] = useState("");
  const [addAccountPreview, setAddAccountPreview] = useState<XPublicProfile | null>(null);
  const [isAddAccountPreviewLoading, setIsAddAccountPreviewLoading] = useState(false);
  const [isAddAccountSubmitting, setIsAddAccountSubmitting] = useState(false);
  const [addAccountLoadingStepIndex, setAddAccountLoadingStepIndex] = useState(0);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [readyAccountHandle, setReadyAccountHandle] = useState<string | null>(null);
  const chatThreadsRef = useRef(chatThreads);
  const normalizedAddAccount = normalizeAccountHandle(addAccountInput);
  const hasValidAddAccountPreview =
    Boolean(addAccountPreview) &&
    normalizeAccountHandle(addAccountPreview?.username ?? "") === normalizedAddAccount;

  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    const url = new URL(window.location.href);
    const currentUrlHandle = normalizeAccountHandle(url.searchParams.get("xHandle") ?? "");
    if (currentUrlHandle === accountName) {
      return;
    }

    url.searchParams.set("xHandle", accountName);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [accountName]);

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
      await fetchWorkspace(`/api/creator/v2/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle })
      });
    } catch (e) {
      console.error("Failed to rename thread", e);
    }
  };

  const confirmDeleteThread = async () => {
    if (!threadToDelete) return;

    const deletingThread = threadToDelete;

    try {
      const response = await fetchWorkspace(`/api/creator/v2/threads/${deletingThread.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || data?.data?.deleted !== true) {
        throw new Error("Failed to delete thread");
      }

      setChatThreads((current) => current.filter((thread) => thread.id !== deletingThread.id));

      if (activeThreadId === deletingThread.id) {
        applyChatWorkspaceReset(buildChatWorkspaceReset("thread"));
        window.history.replaceState({}, "", buildWorkspaceChatHref(null));
      }
    } catch (e) {
      console.error("Failed to delete thread", e);
      setErrorMessage("Failed to delete the chat. Try again.");
    } finally {
      clearThreadToDelete();
    }
  };

  // Guard against initializeThread re-fetching when we just created a thread in-session
  const threadCreatedInSessionRef = useRef(false);
  const growthGuideSelectedPlaybookRef = useRef<HTMLElement | null>(null);
  const missingOnboardingSetupAttemptedRef = useRef<Set<string>>(new Set());

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const {
    threadTransitionPhase,
    isThreadHydrating,
    setIsThreadHydrating,
    showScrollToLatest,
    threadScrollRef,
    registerMessageRef,
    shouldJumpToBottomAfterThreadSwitchRef,
    switchToThreadWithTransition,
    scrollThreadToBottom,
    jumpThreadToBottomImmediately,
    scrollMessageIntoView,
  } = useThreadViewState({
    activeThreadId,
    buildWorkspaceChatHref,
    messagesLength: messages.length,
    onBeforeThreadSwitch: () => {
      setMenuOpenThreadId(null);
    },
    setActiveThreadId,
  });
  const {
    sourceMaterialsOpen,
    setSourceMaterialsOpen,
    openSourceMaterials,
    sourceMaterials,
    mergeSourceMaterials,
    removeSourceMaterialsByIds,
    isSourceMaterialsLoading,
    isSourceMaterialsSaving,
    sourceMaterialsNotice,
    clearSourceMaterialsNotice,
    sourceMaterialDraft,
    resetSourceMaterialDraft,
    applyClaimExample,
    updateSourceMaterialTitle,
    updateSourceMaterialType,
    toggleSourceMaterialVerified,
    updateSourceMaterialClaims,
    sourceMaterialAdvancedOpen,
    toggleSourceMaterialAdvancedOpen,
    updateSourceMaterialTags,
    updateSourceMaterialSnippets,
    updateSourceMaterialDoNotClaim,
    sourceMaterialsLibraryOpen,
    toggleSourceMaterialsLibraryOpen,
    selectSourceMaterial,
    openSourceMaterialEditor,
    saveSourceMaterial,
    seedSourceMaterials,
    deleteSourceMaterial,
  } = useSourceMaterialsState({
    fetchWorkspace,
    sourceMaterialsBootstrapKey,
  });
  const [messageFeedbackPendingById, setMessageFeedbackPendingById] = useState<
    Record<string, boolean>
  >({});
  const [autoSavedSourceUndoPendingByMessageId, setAutoSavedSourceUndoPendingByMessageId] =
    useState<Record<string, boolean>>({});
  const [dismissedAutoSavedSourceByMessageId, setDismissedAutoSavedSourceByMessageId] =
    useState<Record<string, boolean>>({});
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkspaceInitializing, setIsWorkspaceInitializing] = useState(false);
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
  const [draftQueueOpen, setDraftQueueOpen] = useState(false);
  const [draftQueueItems, setDraftQueueItems] = useState<DraftQueueCandidate[]>([]);
  const [isDraftQueueLoading, setIsDraftQueueLoading] = useState(false);
  const [draftQueueActionById, setDraftQueueActionById] = useState<Record<string, string>>({});
  const [draftQueueError, setDraftQueueError] = useState<string | null>(null);
  const [expandedInlineThreadPreviewId, setExpandedInlineThreadPreviewId] = useState<string | null>(null);
  const [selectedThreadPostByMessageId, setSelectedThreadPostByMessageId] = useState<
    Record<string, number>
  >({});
  const [editingDraftCandidateId, setEditingDraftCandidateId] = useState<string | null>(null);
  const [editingDraftCandidateText, setEditingDraftCandidateText] = useState("");
  const [observedMetricsCandidateId, setObservedMetricsCandidateId] = useState<string | null>(null);
  const [observedMetricsForm, setObservedMetricsForm] = useState<ObservedMetricsFormState>(
    createEmptyObservedMetricsForm(),
  );

  const loadBillingState = useCallback(
    async (options?: {
      openModalIfFirstVisit?: boolean;
      checkoutSessionId?: string;
    }) => {
      if (!session?.user?.id) {
        return;
      }

      setIsBillingLoading(true);
      try {
        const checkoutSessionId = options?.checkoutSessionId?.trim();
        const query = checkoutSessionId
          ? `?session_id=${encodeURIComponent(checkoutSessionId)}`
          : "";
        const response = await fetch(`/api/billing/state${query}`, {
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
    fetchWorkspace("/api/creator/v2/threads")
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.data?.threads) {
          setChatThreads(data.data.threads);
        }
      })
      .catch(err => console.error("Failed to fetch threads:", err));
  }, [accountName, fetchWorkspace]);

  const loadDraftQueue = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setIsDraftQueueLoading(true);
    setDraftQueueError(null);

    try {
      const query = activeThreadId
        ? `?threadId=${encodeURIComponent(activeThreadId)}`
        : "";
      const response = await fetchWorkspace(`/api/creator/v2/draft-candidates${query}`, {
        method: "GET",
      });
      const data = (await response.json()) as DraftQueueResponse;

      if (!response.ok || !data.ok) {
        const failure = data as DraftQueueFailure;
        throw new Error(failure.errors?.[0]?.message || "Failed to load the draft queue.");
      }

      setDraftQueueItems(data.data.candidates);
    } catch (error) {
      setDraftQueueItems([]);
      setDraftQueueError(
        error instanceof Error ? error.message : "Failed to load the draft queue.",
      );
    } finally {
      setIsDraftQueueLoading(false);
    }
  }, [activeThreadId, fetchWorkspace, session?.user?.id]);

  const mutateDraftQueueCandidate = useCallback(
    async (
      candidateId: string,
      payload: {
        action: "approve" | "reject" | "edit" | "posted" | "observed" | "regenerate";
        content?: string;
        rejectionReason?: string;
        observedMetrics?: Record<string, unknown>;
      },
    ) => {
      setDraftQueueActionById((current) => ({
        ...current,
        [candidateId]: payload.action,
      }));
      setDraftQueueError(null);

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/draft-candidates/${encodeURIComponent(candidateId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json()) as DraftQueueCandidateMutationResponse;

        if (!response.ok || !data.ok) {
          const failure = data as DraftQueueFailure;
          throw new Error(failure.errors?.[0]?.message || "Failed to update the candidate.");
        }

        setDraftQueueItems((current) =>
          current.map((candidate) =>
            candidate.id === candidateId ? data.data.candidate : candidate,
          ),
        );

        if (payload.action === "edit") {
          setEditingDraftCandidateId(null);
          setEditingDraftCandidateText("");
        }
        return true;
      } catch (error) {
        setDraftQueueError(
          error instanceof Error ? error.message : "Failed to update the candidate.",
        );
        return false;
      } finally {
        setDraftQueueActionById((current) => {
          const next = { ...current };
          delete next[candidateId];
          return next;
        });
      }
    },
    [fetchWorkspace],
  );

  const observedMetricsCandidate = useMemo(
    () =>
      observedMetricsCandidateId
        ? draftQueueItems.find((candidate) => candidate.id === observedMetricsCandidateId) ?? null
        : null,
    [draftQueueItems, observedMetricsCandidateId],
  );

  const closeObservedMetricsModal = useCallback(() => {
    setObservedMetricsCandidateId(null);
    setObservedMetricsForm(createEmptyObservedMetricsForm());
  }, []);

  const openObservedMetricsModal = useCallback((candidate: DraftQueueObservedMetricsCandidate) => {
    const metrics = (candidate.observedMetrics ?? {}) as Record<string, unknown>;
    setObservedMetricsCandidateId(candidate.id);
    setObservedMetricsForm({
      likeCount:
        typeof metrics.likeCount === "number" || typeof metrics.likeCount === "string"
          ? String(metrics.likeCount)
          : "",
      replyCount:
        typeof metrics.replyCount === "number" || typeof metrics.replyCount === "string"
          ? String(metrics.replyCount)
          : "",
      profileClicks:
        typeof metrics.profileClicks === "number" || typeof metrics.profileClicks === "string"
          ? String(metrics.profileClicks)
          : "",
      followerDelta:
        typeof metrics.followerDelta === "number" || typeof metrics.followerDelta === "string"
          ? String(metrics.followerDelta)
          : "",
    });
  }, []);

  const submitObservedMetrics = useCallback(async () => {
    if (!observedMetricsCandidateId) {
      return;
    }

    const observedMetrics = buildObservedMetricsPayload(observedMetricsForm);
    if (!observedMetrics) {
      setDraftQueueError("Likes and replies are required before saving observed metrics.");
      return;
    }

    const didSave = await mutateDraftQueueCandidate(observedMetricsCandidateId, {
      action: "observed",
      observedMetrics,
    });
    if (didSave) {
      closeObservedMetricsModal();
    }
  }, [
    closeObservedMetricsModal,
    mutateDraftQueueCandidate,
    observedMetricsCandidateId,
    observedMetricsForm,
  ]);

  useEffect(() => {
    if (!draftQueueOpen) {
      return;
    }

    void loadDraftQueue();
  }, [draftQueueOpen, loadDraftQueue]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    void loadBillingState({
      openModalIfFirstVisit: true,
      checkoutSessionId:
        billingQueryStatus === "success" && billingQuerySessionId
          ? billingQuerySessionId
          : undefined,
    });
  }, [billingQuerySessionId, billingQueryStatus, loadBillingState, session?.user?.id]);

  useEffect(() => {
    if (!billingQueryStatus || !session?.user?.id) {
      return;
    }

    if (billingQueryStatus === "success") {
      setPricingModalOpen(false);
      setErrorMessage(null);
      void loadBillingState({
        checkoutSessionId: billingQuerySessionId || undefined,
      });
    }
  }, [billingQuerySessionId, billingQueryStatus, loadBillingState, session?.user?.id]);

  useEffect(() => {
    const lowCreditWarning = billingState?.billing?.lowCreditWarning ?? false;
    const criticalCreditWarning =
      billingState?.billing?.criticalCreditWarning ?? false;

    if (!lowCreditWarning && !criticalCreditWarning) {
      setDismissedBillingWarningLevel(null);
    }
  }, [billingState?.billing?.criticalCreditWarning, billingState?.billing?.lowCreditWarning]);

  useEffect(() => {
    const billingPlan = billingState?.billing?.plan ?? null;
    const billingCycle = billingState?.billing?.billingCycle ?? null;

    if (!billingPlan) {
      return;
    }

    if (billingPlan === "pro") {
      setSelectedModalProCadence(billingCycle === "annual" ? "annual" : "monthly");
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
  const applyCreatedThreadWorkspaceUpdate = useCallback(
    (newThreadId?: string | null, threadTitle?: string | null) => {
      const createdThreadUpdate = resolveCreatedThreadWorkspaceUpdate({
        currentThreads: chatThreadsRef.current,
        newThreadId,
        threadTitle,
        activeThreadId,
        accountName,
      });
      if (!createdThreadUpdate) {
        return;
      }

      setActiveThreadId(createdThreadUpdate.nextActiveThreadId);
      threadCreatedInSessionRef.current = createdThreadUpdate.threadCreatedInSession;
      window.history.replaceState(
        {},
        "",
        buildWorkspaceChatHref(createdThreadUpdate.nextHistoryThreadId),
      );
      setChatThreads(createdThreadUpdate.nextChatThreads);
    },
    [accountName, activeThreadId, buildWorkspaceChatHref],
  );

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

  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [pendingStatusPlan, setPendingStatusPlan] = useState<PendingStatusPlan | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>("feedback");
  const [feedbackTitlesByCategory, setFeedbackTitlesByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackTitles());
  const [feedbackDraftsByCategory, setFeedbackDraftsByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackDrafts());
  const [feedbackImages, setFeedbackImages] = useState<FeedbackImageDraft[]>([]);
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
  const [, setBackfillNotice] = useState<string | null>(null);
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
  const [editorDraftPosts, setEditorDraftPosts] = useState<string[]>([]);
  const [isDraftInspectorLoading, setIsDraftInspectorLoading] = useState(false);
  const [hasCopiedDraftEditorText, setHasCopiedDraftEditorText] = useState(false);
  const [copiedPreviewDraftMessageId, setCopiedPreviewDraftMessageId] = useState<string | null>(null);
  const [, setConversationMemory] = useState<
    CreatorChatSuccess["data"]["memory"] | null
  >(null);
  const [typedAssistantLengths, setTypedAssistantLengths] = useState<
    Record<string, number>
  >({});
  const [activeDraftRevealByMessageId, setActiveDraftRevealByMessageId] = useState<
    Record<string, string>
  >({});
  const [revealedDraftMessageIds, setRevealedDraftMessageIds] = useState<
    Record<string, boolean>
  >({});
  const draftRevealTimeoutsRef = useRef<Record<string, number>>({});
  const typedAssistantLengthsRef = useRef<Record<string, number>>({});
  const hasHydratedDraftRevealRef = useRef(false);

  useEffect(() => {
    typedAssistantLengthsRef.current = typedAssistantLengths;
  }, [typedAssistantLengths]);

  const composerCharacterLimit = useMemo(
    () => getComposerCharacterLimit(context),
    [context],
  );
  const isVerifiedAccount = Boolean(context?.creatorProfile?.identity?.isVerified);
  const {
    preferencesOpen,
    setPreferencesOpen,
    openPreferences,
    savePreferences,
    isPreferencesLoading,
    isPreferencesSaving,
    preferenceCasing,
    setPreferenceCasing,
    preferenceBulletStyle,
    setPreferenceBulletStyle,
    preferenceWritingMode,
    setPreferenceWritingMode,
    preferenceUseEmojis,
    togglePreferenceUseEmojis,
    preferenceAllowProfanity,
    togglePreferenceAllowProfanity,
    preferenceBlacklistInput,
    handlePreferenceBlacklistInputChange,
    handlePreferenceBlacklistInputKeyDown,
    preferenceBlacklistedTerms,
    removePreferenceBlacklistedTerm,
    effectivePreferenceMaxCharacters,
    setPreferenceMaxCharacters,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    preferencesPreviewDraft,
    preferencesPreviewCounter,
    currentPreferencePayload,
    preferenceConstraintRules,
  } = usePreferencesState({
    accountName,
    context,
    fetchWorkspace,
    isVerifiedAccount,
    onErrorMessage: setErrorMessage,
  });
  const {
    playbookModalOpen,
    handleGrowthGuideOpenChange,
    openGrowthGuide,
    openGrowthGuideForRecommendation,
    playbookStage,
    setPlaybookStage,
    currentPlaybookStage,
    filteredStagePlaybooks,
    selectedPlaybook,
    handleApplyPlaybook,
    playbookTemplateTab,
    setPlaybookTemplateTab,
    personalizedPlaybookTemplates,
    activePlaybookTemplate,
    setActivePlaybookTemplateId,
    playbookTemplatePreviewCounter,
    copiedPlaybookTemplateId,
    handleCopyPlaybookTemplate,
    previewDisplayName: growthGuidePreviewDisplayName,
    previewUsername: growthGuidePreviewUsername,
    previewAvatarUrl: growthGuidePreviewAvatarUrl,
  } = useGrowthGuideState({
    accountName,
    context,
    isVerifiedAccount,
    selectedPlaybookRef: growthGuideSelectedPlaybookRef,
    personalizePlaybookTemplateText,
  });
  const activeFeedbackTitle = feedbackTitlesByCategory[feedbackCategory] ?? "";
  const activeFeedbackDraft = feedbackDraftsByCategory[feedbackCategory] ?? "";
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
      const response = await fetchWorkspace("/api/creator/v2/feedback", {
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
  }, [fetchWorkspace]);
  const updateFeedbackSubmissionStatus = useCallback(
    async (submissionId: string, status: FeedbackReportStatus) => {
      setFeedbackStatusUpdatingIds((current) => ({
        ...current,
        [submissionId]: true,
      }));
      setFeedbackSubmitNotice(null);

      try {
        const response = await fetchWorkspace("/api/creator/v2/feedback", {
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
    [fetchWorkspace],
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

        const response = await fetchWorkspace("/api/creator/v2/feedback", {
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
      fetchWorkspace,
      feedbackImages,
      loadFeedbackHistory,
      resetFeedbackDrafts,
    ],
  );
  const trackProductEvent = useCallback(
    async (params: {
      eventType: string;
      messageId?: string;
      candidateId?: string;
      properties?: Record<string, unknown>;
    }) => {
      try {
        await fetchWorkspace("/api/creator/v2/product-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          keepalive: true,
          body: JSON.stringify({
            eventType: params.eventType,
            threadId: activeThreadId ?? null,
            ...(params.messageId ? { messageId: params.messageId } : {}),
            ...(params.candidateId ? { candidateId: params.candidateId } : {}),
            properties: params.properties || {},
          }),
        });
      } catch (error) {
        console.error("Failed to record product event:", error);
      }
    },
    [activeThreadId, fetchWorkspace],
  );
  const undoAutoSavedSourceMaterials = useCallback(
    async (
      messageId: string,
      autoSavedSourceMaterials: NonNullable<ChatMessage["autoSavedSourceMaterials"]>,
    ) => {
      const deletableAssets = autoSavedSourceMaterials.assets.filter((asset) => asset.deletable);
      if (deletableAssets.length === 0) {
        return;
      }

      setAutoSavedSourceUndoPendingByMessageId((current) => ({
        ...current,
        [messageId]: true,
      }));
      setErrorMessage(null);

      try {
        const deletedIds: string[] = [];

        for (const asset of deletableAssets) {
          const response = await fetchWorkspace(`/api/creator/v2/source-materials/${asset.id}`, {
            method: "DELETE",
          });
          const result: SourceMaterialsResponse = await response.json();
          if (!response.ok || !result.ok) {
            const fallbackMessage = result.ok
              ? "Failed to remove saved source material."
              : result.errors[0]?.message;
            throw new Error(fallbackMessage || "Failed to remove saved source material.");
          }
          if (!("deletedId" in result.data) || !result.data.deletedId) {
            throw new Error("Failed to remove saved source material.");
          }

          deletedIds.push(result.data.deletedId);
        }

        removeSourceMaterialsByIds(deletedIds);
        setDismissedAutoSavedSourceByMessageId((current) => ({
          ...current,
          [messageId]: true,
        }));
        await trackProductEvent({
          eventType: "source_auto_save_undone",
          messageId,
          properties: {
            deletedCount: deletedIds.length,
            deletedTitles: deletableAssets.map((asset) => asset.title).slice(0, 3),
          },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to remove saved source material.",
        );
      } finally {
        setAutoSavedSourceUndoPendingByMessageId((current) => ({
          ...current,
          [messageId]: false,
        }));
      }
    },
    [fetchWorkspace, removeSourceMaterialsByIds, trackProductEvent],
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

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const switchActiveHandle = useCallback(async (handle: string) => {
    const normalizedHandle = normalizeAccountHandle(handle);
    if (!normalizedHandle || normalizedHandle === normalizeAccountHandle(accountName ?? "")) {
      return;
    }

    closeAccountMenu();
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
      window.location.href = buildChatWorkspaceUrl({ xHandle: normalizedHandle });
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not switch to account @" + normalizedHandle);
      setIsLoading(false);
    }
  }, [accountName, closeAccountMenu, refreshSession]);

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
      window.location.href = buildChatWorkspaceUrl({ xHandle: readyAccountHandle });
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
    setAvailableHandles,
  ]);

  const runMissingOnboardingSetup = useCallback(async (): Promise<boolean> => {
    const normalizedHandle = normalizeAccountHandle(accountName ?? "");
    if (!normalizedHandle) {
      setErrorMessage("This account is not ready yet. Select a valid X handle first.");
      return false;
    }

    if (missingOnboardingSetupAttemptedRef.current.has(normalizedHandle)) {
      setErrorMessage(
        "Setup for this account is still incomplete. Try refreshing chat in a few seconds.",
      );
      return false;
    }
    missingOnboardingSetupAttemptedRef.current.add(normalizedHandle);

    setIsWorkspaceInitializing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: normalizedHandle,
          goal: "followers",
          timeBudgetMinutes: 30,
          tone: { casing: "lowercase", risk: "safe" },
        }),
      });

      const data = (await response.json().catch(() => null)) as OnboardingRunResponse | null;
      if (!response.ok || !data || !data.ok) {
        if (data && !data.ok && data.data?.billing) {
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
        const errorText =
          data && !data.ok
            ? (data.errors[0]?.message ?? "Could not finish setup for this account.")
            : "Could not finish setup for this account.";
        missingOnboardingSetupAttemptedRef.current.delete(normalizedHandle);
        setErrorMessage(errorText);
        return false;
      }

      return true;
    } catch {
      missingOnboardingSetupAttemptedRef.current.delete(normalizedHandle);
      setErrorMessage(
        "Could not finish setting up this account automatically. Run onboarding once, then reopen chat.",
      );
      return false;
    } finally {
      setIsWorkspaceInitializing(false);
    }
  }, [accountName]);

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
          fetchWorkspace("/api/creator/context", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
          fetchWorkspace("/api/creator/generation-contract", {
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

        const workspaceLoadState = resolveWorkspaceLoadState({
          contextResponseOk: contextResponse.ok,
          contextStatus: contextResponse.status,
          contextData,
          contractResponseOk: contractResponse.ok,
          contractStatus: contractResponse.status,
          contractData,
        });

        if (workspaceLoadState.status === "retry_after_onboarding") {
          const didSetup = await runMissingOnboardingSetup();
          if (didSetup) {
            return await loadWorkspace(overrides, toneOverrides);
          }
          return { ok: false };
        }

        if (workspaceLoadState.status === "error") {
          setErrorMessage(workspaceLoadState.errorMessage);
          return { ok: false };
        }

        setContext(workspaceLoadState.contextData);
        setContract(workspaceLoadState.contractData);
        return {
          ok: true,
          contextData: workspaceLoadState.contextData,
          contractData: workspaceLoadState.contractData,
        };
      } catch {
        setErrorMessage("Network error while loading the chat workspace.");
        return { ok: false };
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeStrategyInputs,
      activeToneInputs,
      fetchWorkspace,
      requiresXAccountGate,
      runMissingOnboardingSetup,
    ],
  );
  const {
    analysisOpen,
    setAnalysisOpen,
    openAnalysis,
    closeAnalysis,
    isAnalysisScrapeRefreshing,
    setIsAnalysisScrapeRefreshing,
    analysisScrapeNotice,
    setAnalysisScrapeNotice,
    analysisScrapeNoticeTone,
    setAnalysisScrapeCooldownUntil,
    isAnalysisScrapeCoolingDown,
    analysisScrapeCooldownLabel,
    handleManualProfileScrapeRefresh,
    analysisPriorityItems,
    analysisFollowerProgress,
    analysisEvidencePosts,
    analysisRecommendedPlaybooks,
    analysisDiagnosisSummary,
    analysisSnapshotCards,
    analysisVoiceSignalChips,
    analysisKeepList,
    analysisAvoidList,
    analysisPositioningIsTentative,
    analysisLearningStrengths,
    analysisLearningCautions,
    analysisLearningExperiments,
    analysisReplyConversionHighlights,
  } = useAnalysisState({
    accountName,
    context,
    currentPlaybookStage,
    fetchWorkspace,
    loadWorkspace,
    dedupePreserveOrder,
    formatEnumLabel,
    formatNicheSummary,
  });
  const applyChatWorkspaceReset = useCallback((
    reset: ChatWorkspaceReset<ChatToneInputs, ChatStrategyInputs>,
  ) => {
    if ("activeThreadId" in reset) {
      setActiveThreadId(reset.activeThreadId);
    }
    if ("threadCreatedInSession" in reset) {
      threadCreatedInSessionRef.current = reset.threadCreatedInSession;
    }
    if ("context" in reset) {
      setContext(reset.context);
    }
    if ("contract" in reset) {
      setContract(reset.contract);
    }
    if ("conversationMemory" in reset) {
      setConversationMemory(reset.conversationMemory);
    }
    if ("streamStatus" in reset) {
      setStreamStatus(reset.streamStatus);
    }
    if ("isWorkspaceInitializing" in reset) {
      setIsWorkspaceInitializing(reset.isWorkspaceInitializing);
    }
    if ("analysisOpen" in reset) {
      setAnalysisOpen(reset.analysisOpen);
    }
    if ("backfillNotice" in reset) {
      setBackfillNotice(reset.backfillNotice);
    }
    if ("isAnalysisScrapeRefreshing" in reset) {
      setIsAnalysisScrapeRefreshing(reset.isAnalysisScrapeRefreshing);
    }
    if ("analysisScrapeNotice" in reset) {
      setAnalysisScrapeNotice(reset.analysisScrapeNotice);
    }
    if ("analysisScrapeCooldownUntil" in reset) {
      setAnalysisScrapeCooldownUntil(reset.analysisScrapeCooldownUntil);
    }
    if ("activeContentFocus" in reset) {
      setActiveContentFocus(reset.activeContentFocus);
    }
    if ("toneInputs" in reset) {
      setToneInputs(reset.toneInputs);
    }
    if ("activeToneInputs" in reset) {
      setActiveToneInputs(reset.activeToneInputs);
    }
    if ("activeStrategyInputs" in reset) {
      setActiveStrategyInputs(reset.activeStrategyInputs);
    }
    if ("draftQueueItems" in reset) {
      setDraftQueueItems(reset.draftQueueItems);
    }
    if ("draftQueueError" in reset) {
      setDraftQueueError(reset.draftQueueError);
    }
    if ("editingDraftCandidateId" in reset) {
      setEditingDraftCandidateId(reset.editingDraftCandidateId);
    }
    if ("editingDraftCandidateText" in reset) {
      setEditingDraftCandidateText(reset.editingDraftCandidateText);
    }

    setMessages(reset.messages);
    setDraftInput(reset.draftInput);
    setErrorMessage(reset.errorMessage);
    setActiveDraftEditor(reset.activeDraftEditor);
    setEditorDraftText(reset.editorDraftText);
    setEditorDraftPosts(reset.editorDraftPosts);
    setTypedAssistantLengths(reset.typedAssistantLengths);
    setActiveDraftRevealByMessageId(reset.activeDraftRevealByMessageId);
    setRevealedDraftMessageIds(reset.revealedDraftMessageIds);
    setIsLeavingHero(reset.isLeavingHero);
  }, [
    setAnalysisOpen,
    setAnalysisScrapeCooldownUntil,
    setAnalysisScrapeNotice,
    setIsAnalysisScrapeRefreshing,
  ]);
  const handleNewChat = useCallback(() => {
    if (!accountName) return;

    applyChatWorkspaceReset(buildChatWorkspaceReset("thread"));
    window.history.pushState({}, "", buildWorkspaceChatHref(null));
  }, [accountName, applyChatWorkspaceReset, buildWorkspaceChatHref]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    missingOnboardingSetupAttemptedRef.current.clear();
    applyChatWorkspaceReset(
      buildChatWorkspaceReset("workspace", {
        defaultToneInputs: DEFAULT_CHAT_TONE_INPUTS,
        defaultStrategyInputs: DEFAULT_CHAT_STRATEGY_INPUTS,
      }),
    );
  }, [accountName, applyChatWorkspaceReset]);

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
    const currentLength = typedAssistantLengthsRef.current[latestAssistantMessage.id];

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
    return () => {
      Object.values(draftRevealTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      draftRevealTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      Object.values(draftRevealTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      draftRevealTimeoutsRef.current = {};
      const hadHydratedRevealState = hasHydratedDraftRevealRef.current;
      hasHydratedDraftRevealRef.current = false;
      if (
        hadHydratedRevealState ||
        Object.keys(activeDraftRevealByMessageId).length > 0 ||
        Object.keys(revealedDraftMessageIds).length > 0
      ) {
        setActiveDraftRevealByMessageId({});
        setRevealedDraftMessageIds({});
      }
      return;
    }

    if (!hasHydratedDraftRevealRef.current) {
      hasHydratedDraftRevealRef.current = true;
      const hydratedIds = Object.fromEntries(
        messages
          .filter(
            (message) => message.role === "assistant" && messageHasDraftOutput(message),
          )
          .map((message) => [message.id, true]),
      );
      setRevealedDraftMessageIds(hydratedIds);
      return;
    }

    const nextRevealCandidate = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          messageHasDraftOutput(message) &&
          !revealedDraftMessageIds[message.id] &&
          !hasActiveDraftReveal(activeDraftRevealByMessageId, message.id) &&
          !draftRevealTimeoutsRef.current[message.id],
      );

    if (!nextRevealCandidate) {
      return;
    }

    const primaryKey = resolvePrimaryDraftRevealKey(nextRevealCandidate);
    setActiveDraftRevealByMessageId((current) => ({
      ...current,
      [nextRevealCandidate.id]: primaryKey,
    }));
    draftRevealTimeoutsRef.current[nextRevealCandidate.id] = window.setTimeout(() => {
      setActiveDraftRevealByMessageId((current) => {
        const next = { ...current };
        delete next[nextRevealCandidate.id];
        return next;
      });
      setRevealedDraftMessageIds((current) => ({
        ...current,
        [nextRevealCandidate.id]: true,
      }));
      delete draftRevealTimeoutsRef.current[nextRevealCandidate.id];
    }, DRAFT_REVEAL_DURATION_MS);
  }, [messages, activeDraftRevealByMessageId, revealedDraftMessageIds]);

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
  const selectedDraftArtifact = useMemo(
    () => selectedDraftVersion?.artifact ?? selectedDraftMessage?.draftArtifacts?.[0] ?? null,
    [selectedDraftMessage?.draftArtifacts, selectedDraftVersion?.artifact],
  );
  const isSelectedDraftThread =
    selectedDraftArtifact?.kind === "thread_seed" ||
    selectedDraftMessage?.outputShape === "thread_seed";
  const selectedDraftThreadFramingStyle = useMemo(
    () =>
      isSelectedDraftThread
        ? getThreadFramingStyle(
            selectedDraftArtifact,
            selectedDraftVersion?.content ?? selectedDraftMessage?.draft ?? undefined,
          )
        : null,
    [
      isSelectedDraftThread,
      selectedDraftArtifact,
      selectedDraftMessage?.draft,
      selectedDraftVersion?.content,
    ],
  );
  const pendingStatusLabel = usePendingStatusLabel({
    isActive: isSending,
    plan: pendingStatusPlan,
    backendStatus: streamStatus,
  });
  const pendingDraftWorkflow = isDraftPendingWorkflow(pendingStatusPlan?.workflow)
    ? pendingStatusPlan.workflow
    : null;
  const shouldShowPendingDraftShell = isSending && pendingDraftWorkflow !== null;
  const selectedDraftThreadPostCount = useMemo(() => {
    if (!isSelectedDraftThread) {
      return 0;
    }

    return ensureEditableThreadPosts(
      editorDraftPosts.length > 0
        ? editorDraftPosts
        : buildEditableThreadPosts(selectedDraftArtifact, selectedDraftVersion?.content ?? ""),
    ).length;
  }, [
    editorDraftPosts,
    isSelectedDraftThread,
    selectedDraftArtifact,
    selectedDraftVersion?.content,
  ]);
  const selectedDraftThreadPostIndex = useMemo(() => {
    const activeMessageId = activeDraftEditor?.messageId;
    if (!activeMessageId || !isSelectedDraftThread || selectedDraftThreadPostCount === 0) {
      return 0;
    }

    const rawIndex = selectedThreadPostByMessageId[activeMessageId] ?? 0;
    return clampThreadPostIndex(rawIndex, selectedDraftThreadPostCount);
  }, [
    activeDraftEditor?.messageId,
    isSelectedDraftThread,
    selectedDraftThreadPostCount,
    selectedThreadPostByMessageId,
  ]);
  const draftEditorSerializedContent = useMemo(
    () =>
      buildDraftEditorSerializedContent({
        isThreadDraft: isSelectedDraftThread,
        editorDraftPosts,
        editorDraftText,
      }),
    [editorDraftPosts, editorDraftText, isSelectedDraftThread],
  );
  const selectedDraftContext = useMemo(() => {
    if (!activeDraftEditor || !selectedDraftVersion || !selectedDraftMessage) {
      return null;
    }

    return {
      messageId: activeDraftEditor.messageId,
      versionId: selectedDraftVersion.id,
      content: draftEditorSerializedContent.trim() || selectedDraftVersion.content,
      source: selectedDraftVersion.source,
      createdAt: selectedDraftVersion.createdAt,
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
      revisionChainId:
        activeDraftEditor.revisionChainId ?? selectedDraftMessage.revisionChainId,
    };
  }, [
    activeDraftEditor,
    draftEditorSerializedContent,
    selectedDraftMessage,
    selectedDraftVersion,
  ]);
  const selectedDraftTimeline = useMemo(
    () =>
      buildDraftRevisionTimeline({
        messages,
        activeDraftSelection: activeDraftEditor,
        fallbackCharacterLimit: composerCharacterLimit,
      }),
    [activeDraftEditor, composerCharacterLimit, messages],
  );
  const selectedDraftVersionId = selectedDraftVersion?.id ?? null;
  const selectedDraftVersionContent = selectedDraftVersion?.content ?? "";
  const selectedDraftMessageId = activeDraftEditor?.messageId ?? null;
  const {
    selectedDraftTimelineIndex,
    selectedDraftTimelinePosition,
    latestDraftTimelineEntry,
    canNavigateDraftBack,
    canNavigateDraftForward,
    isViewingHistoricalDraftVersion,
    hasDraftEditorChanges,
    shouldShowRevertDraftCta,
  } = useMemo(
    () =>
      resolveDraftTimelineState({
        timeline: selectedDraftTimeline,
        activeDraftSelection: activeDraftEditor,
        serializedContent: draftEditorSerializedContent,
        selectedDraftVersionContent,
      }),
    [
      activeDraftEditor,
      draftEditorSerializedContent,
      selectedDraftTimeline,
      selectedDraftVersionContent,
    ],
  );
  const draftEditorPrimaryActionLabel = shouldShowRevertDraftCta
    ? "Revert to this Version"
    : "Save As New Version";
  const isDraftEditorPrimaryActionDisabled =
    shouldShowRevertDraftCta
      ? false
      : !draftEditorSerializedContent.trim() || !hasDraftEditorChanges;
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
    const hydratedDraftEditorState = buildDraftEditorHydrationState({
      selectedDraftVersionId,
      isThreadDraft: isSelectedDraftThread,
      artifact: selectedDraftArtifact,
      content: selectedDraftVersionContent,
    });

    setEditorDraftText(hydratedDraftEditorState.editorDraftText);
    setEditorDraftPosts(hydratedDraftEditorState.editorDraftPosts);
    setHasCopiedDraftEditorText(false);
  }, [
    activeDraftEditor?.messageId,
    activeDraftEditor?.versionId,
    isSelectedDraftThread,
    selectedDraftArtifact,
    selectedDraftVersionContent,
    selectedDraftVersionId,
  ]);

  useEffect(() => {
    const activeMessageId = activeDraftEditor?.messageId;
    if (!activeMessageId || !isSelectedDraftThread || selectedDraftThreadPostCount <= 0) {
      return;
    }

    setSelectedThreadPostByMessageId((current) => {
      const rawIndex = current[activeMessageId] ?? 0;
      const clampedIndex = clampThreadPostIndex(rawIndex, selectedDraftThreadPostCount);

      if (rawIndex === clampedIndex) {
        return current;
      }

      return {
        ...current,
        [activeMessageId]: clampedIndex,
      };
    });
  }, [
    activeDraftEditor?.messageId,
    isSelectedDraftThread,
    selectedDraftThreadPostCount,
  ]);

  const navigateDraftTimeline = useCallback(
    (direction: "back" | "forward") => {
      const navigation = resolveDraftTimelineNavigation({
        direction,
        timeline: selectedDraftTimeline,
        selectedDraftTimelineIndex,
        activeDraftSelection: activeDraftEditor,
      });
      if (!navigation) {
        return;
      }

      if (navigation.scrollToMessageId) {
        scrollMessageIntoView(navigation.scrollToMessageId);
        window.setTimeout(() => {
          setActiveDraftEditor(navigation.targetSelection);
        }, DRAFT_TIMELINE_FOCUS_DELAY_MS);
        return;
      }

      setActiveDraftEditor(navigation.targetSelection);
    },
    [
      activeDraftEditor,
      scrollMessageIntoView,
      selectedDraftTimeline,
      selectedDraftTimelineIndex,
    ],
  );

  const selectDraftBundleOption = useCallback(
    (messageId: string, optionId: string, versionId: string) => {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          return {
            ...message,
            activeDraftVersionId: versionId,
            draftBundle: message.draftBundle
              ? {
                  ...message.draftBundle,
                  selectedOptionId: optionId,
                }
              : message.draftBundle,
          };
        }),
      );
    },
    [],
  );

  const openDraftEditor = useCallback((
    messageId: string,
    versionId?: string,
    threadPostIndex?: number,
  ) => {
    const openState = resolveOpenDraftEditorState({
      message: messages.find((item) => item.id === messageId) ?? null,
      fallbackCharacterLimit: composerCharacterLimit,
      versionId,
      threadPostIndex,
    });
    if (!openState) {
      return;
    }

    if (openState.shouldExpandInlineThreadPreview) {
      setExpandedInlineThreadPreviewId(messageId);
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: openState.selectedThreadPostIndex,
      }));
    }

    setActiveDraftEditor(openState.selection);
  }, [composerCharacterLimit, messages]);

  const updateThreadDraftPost = useCallback((index: number, content: string) => {
    setEditorDraftPosts((current) =>
      current.map((post, postIndex) => (postIndex === index ? content : post)),
    );
  }, []);

  const moveThreadDraftPost = useCallback((index: number, direction: "up" | "down") => {
    const messageId = activeDraftEditor?.messageId;
    let nextSelectedIndex: number | null = null;
    setEditorDraftPosts((current) => {
      const nextState = moveThreadDraftPostState({
        posts: current,
        index,
        direction,
      });
      if (!nextState) {
        return current;
      }

      nextSelectedIndex = nextState.selectedIndex;
      return nextState.posts;
    });
    if (messageId && nextSelectedIndex !== null) {
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: nextSelectedIndex!,
      }));
    }
  }, [activeDraftEditor?.messageId]);

  const splitThreadDraftPost = useCallback((index: number) => {
    const messageId = activeDraftEditor?.messageId;
    let nextSelectedIndex: number | null = null;
    setEditorDraftPosts((current) => {
      const nextState = splitThreadDraftPostState({
        posts: current,
        index,
      });
      if (!nextState) {
        return current;
      }

      nextSelectedIndex = nextState.selectedIndex;
      return nextState.posts;
    });
    if (messageId && nextSelectedIndex !== null) {
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: nextSelectedIndex!,
      }));
    }
  }, [activeDraftEditor?.messageId]);

  const mergeThreadDraftPostDown = useCallback((index: number) => {
    const messageId = activeDraftEditor?.messageId;
    let nextSelectedIndex: number | null = null;
    setEditorDraftPosts((current) => {
      const nextState = mergeThreadDraftPostDownState({
        posts: current,
        index,
      });
      if (!nextState) {
        return current;
      }

      nextSelectedIndex = nextState.selectedIndex;
      return nextState.posts;
    });
    if (messageId && nextSelectedIndex !== null) {
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: nextSelectedIndex!,
      }));
    }
  }, [activeDraftEditor?.messageId]);

  const addThreadDraftPost = useCallback((index?: number) => {
    const messageId = activeDraftEditor?.messageId;
    let nextSelectedIndex = 0;
    setEditorDraftPosts((current) => {
      const nextState = addThreadDraftPostState({
        posts: current,
        index,
      });
      nextSelectedIndex = nextState.selectedIndex;
      return nextState.posts;
    });
    if (messageId) {
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: nextSelectedIndex,
      }));
    }
  }, [activeDraftEditor?.messageId]);

  const removeThreadDraftPost = useCallback((index: number) => {
    const messageId = activeDraftEditor?.messageId;
    let nextSelectedIndex = 0;
    setEditorDraftPosts((current) => {
      const nextState = removeThreadDraftPostState({
        posts: current,
        index,
      });
      nextSelectedIndex = nextState.selectedIndex;
      return nextState.posts;
    });
    if (messageId) {
      setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [messageId]: nextSelectedIndex,
      }));
    }
  }, [activeDraftEditor?.messageId]);

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
          const response = await fetchWorkspace(
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
    [activeThreadId, fetchWorkspace, messages],
  );

  const saveDraftEditor = useCallback(async () => {
    if (
      !activeDraftEditor ||
      !selectedDraftMessage ||
      !selectedDraftVersion ||
      !activeThreadId
    ) {
      return;
    }

    const draftPromotion = prepareDraftPromotionRequest({
      activeDraftEditorRevisionChainId: activeDraftEditor.revisionChainId,
      selectedDraftMessage,
      selectedDraftVersion,
      selectedDraftArtifact,
      isSelectedDraftThread,
      editorDraftPosts,
      editorDraftText,
    });
    if (draftPromotion.status !== "ready") {
      return;
    }

    try {
      const response = await fetchWorkspace(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/draft-promotions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(draftPromotion.requestBody),
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
          promotedSourceMaterials: data.data.promotedSourceMaterials ?? null,
          outputShape: data.data.assistantMessage.outputShape,
          replyArtifacts: data.data.assistantMessage.replyArtifacts ?? null,
          feedbackValue: null,
        },
      ]);
      if (data.data.promotedSourceMaterials?.assets?.length) {
        mergeSourceMaterials(data.data.promotedSourceMaterials.assets);
      }
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
    editorDraftPosts,
    editorDraftText,
    fetchWorkspace,
    isSelectedDraftThread,
    mergeSourceMaterials,
    selectedDraftArtifact,
    selectedDraftMessage,
    selectedDraftVersion,
    scrollThreadToBottom,
  ]);

  const revertToSelectedDraftVersion = useCallback(async () => {
    if (!selectedDraftVersion || !selectedDraftMessage) {
      return;
    }

    const revertUpdate = resolveDraftVersionRevertUpdate({
      activeDraftEditorRevisionChainId: activeDraftEditor?.revisionChainId,
      selectedDraftMessage,
      selectedDraftVersion,
      selectedDraftBundleVersions: selectedDraftBundle?.versions,
      isSelectedDraftThread,
      fallbackCharacterLimit: getXCharacterLimitForAccount(isVerifiedAccount),
    });
    if (!revertUpdate) {
      return;
    }

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== selectedDraftMessage.id) {
          return message;
        }

        return {
          ...message,
          draft: revertUpdate.nextDraftCollections.draft,
          drafts: revertUpdate.nextDraftCollections.drafts,
          draftArtifacts: revertUpdate.nextDraftCollections.draftArtifacts,
          draftVersions: revertUpdate.nextDraftVersions,
          activeDraftVersionId: selectedDraftVersion.id,
          draftBundle: revertUpdate.nextDraftBundle,
          revisionChainId: revertUpdate.revisionChainId,
        };
      }),
    );

    setActiveDraftEditor({
      messageId: selectedDraftMessage.id,
      versionId: selectedDraftVersion.id,
      revisionChainId: revertUpdate.revisionChainId,
    });

    if (!activeThreadId) {
      return;
    }

    try {
      const response = await fetchWorkspace(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(selectedDraftMessage.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftVersions: revertUpdate.nextDraftVersions,
            activeDraftVersionId: selectedDraftVersion.id,
            draft: revertUpdate.nextDraftCollections.draft,
            drafts: revertUpdate.nextDraftCollections.drafts,
            draftArtifacts: revertUpdate.nextDraftCollections.draftArtifacts,
            draftBundle: revertUpdate.nextDraftBundle,
            revisionChainId: revertUpdate.revisionChainId,
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
    fetchWorkspace,
    isVerifiedAccount,
    isSelectedDraftThread,
    selectedDraftBundle,
    selectedDraftMessage,
    selectedDraftVersion,
  ]);

  const copyDraftEditor = useCallback(async () => {
    if (!draftEditorSerializedContent.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draftEditorSerializedContent);
      setHasCopiedDraftEditorText(true);
      window.setTimeout(() => {
        setHasCopiedDraftEditorText(false);
      }, 2200);
    } catch {
      setErrorMessage("Copy failed. Try selecting the text manually.");
    }
  }, [draftEditorSerializedContent]);

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

    const inspectedDraft =
      draftEditorSerializedContent.trim() || selectedDraftVersion.content.trim();
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
      const response = await fetchWorkspace("/api/creator/v2/draft-analysis", {
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
    draftEditorSerializedContent,
    fetchWorkspace,
    isViewingHistoricalDraftVersion,
    latestDraftTimelineEntry,
    selectedDraftVersion,
    scrollThreadToBottom,
  ]);

  const applyAssistantReplyPlan = useCallback(
    (replyPlan: CreatorAssistantReplyPlan) => {
      startTransition(() => {
        if (replyPlan.nextBilling) {
          setBillingState(replyPlan.nextBilling);
        }

        setMessages((current) => [
          ...current,
          replyPlan.buildAssistantMessage(current.length),
        ]);

        if (replyPlan.nextDraftEditor) {
          setActiveDraftEditor(replyPlan.nextDraftEditor);
        }

        if (replyPlan.nextConversationMemory) {
          setConversationMemory(replyPlan.nextConversationMemory);
        }

        if (replyPlan.nextThreadTitle) {
          syncThreadTitle(
            replyPlan.nextThreadTitle.threadId,
            replyPlan.nextThreadTitle.title,
          );
        }

        if (replyPlan.createdThreadPlan) {
          applyCreatedThreadWorkspaceUpdate(
            replyPlan.createdThreadPlan.threadId,
            replyPlan.createdThreadPlan.title,
          );
        }
      });
      scrollThreadToBottom();
    },
    [
      applyCreatedThreadWorkspaceUpdate,
      scrollThreadToBottom,
      syncThreadTitle,
    ],
  );

  const requestAssistantReply = useCallback(
    async (options: {
      prompt?: string;
      appendUserMessage: boolean;
      displayUserMessage?: string;
      includeUserMessageInHistory?: boolean;
      turnSource?: ChatTurnSource;
      artifactContext?: ChatArtifactContext | null;
      intent?: ChatIntent;
      formatPreferenceOverride?: "shortform" | "longform" | "thread" | null;
      threadFramingStyleOverride?: ThreadFramingStyle | null;
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

      const historySeed = (options.historySeed ?? messages)
        .filter((message) => !message.excludeFromHistory)
        .slice();
      const preparedRequest = prepareAssistantReplyTransport({
        prompt: options.prompt,
        history: historySeed,
        runId: resolvedContext.runId,
        threadId: activeThreadId,
        workspaceHandle: accountName,
        provider: providerPreference,
        turnSource: options.turnSource,
        artifactContext: options.artifactContext ?? null,
        intent: options.intent,
        formatPreferenceOverride: options.formatPreferenceOverride ?? null,
        threadFramingStyleOverride: options.threadFramingStyleOverride ?? null,
        selectedDraftContext,
        selectedDraftContextOverride:
          options.selectedDraftContextOverride !== undefined
            ? options.selectedDraftContextOverride
            : undefined,
        contentFocus: resolvedContentFocus,
        preferenceSettings: currentPreferencePayload,
        preferenceConstraints: preferenceConstraintRules,
        strategyInputs: resolvedStrategyInputs,
        toneInputs: resolvedToneInputs,
      });

      if (preparedRequest.shouldSkip || !preparedRequest.transportRequest) {
        return;
      }
      const {
        trimmedPrompt,
        effectiveSelectedDraftContext,
      } = preparedRequest;

      let history = historySeed;

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
          history = [...history, userMessage];
        }
      }

      setIsSending(true);
      setStreamStatus(null);
      setPendingStatusPlan(preparedRequest.pendingStatusPlan);
      setErrorMessage(null);

      try {
        const response = await fetchWorkspace("/api/creator/v2/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...preparedRequest.transportRequest,
            history,
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";
        const starterQuickReplies = buildDefaultExampleQuickReplies(
          shouldUseLowercaseChipVoice(context),
        );
        const replyPlanArgs = {
          activeThreadId,
          trimmedPrompt,
          artifactKind: options.artifactContext?.kind ?? null,
          defaultQuickReplies: starterQuickReplies,
          selectedDraftContext: effectiveSelectedDraftContext,
          accountName,
        } as const;

        if (contentType.includes("application/json")) {
          const data: CreatorChatResponse = await response.json();
          const outcome = resolveAssistantReplyJsonOutcome({
            responseOk: response.ok,
            responseStatus: response.status,
            response: data,
            failureMessage: "Failed to generate a reply.",
            replyPlanArgs: {
              ...replyPlanArgs,
              mode: "json",
            },
          });

          if (outcome.kind === "failure") {
            const nextBillingSnapshot =
              outcome.nextBillingSnapshot as BillingSnapshotPayload | null;

            if (nextBillingSnapshot) {
              setBillingState((current) =>
                current
                  ? {
                    ...current,
                    billing: nextBillingSnapshot,
                  }
                  : current,
              );
            }
            if (outcome.shouldOpenPricingModal) {
              setPricingModalOpen(true);
            }
            setErrorMessage(outcome.errorMessage);
            return;
          }

          applyAssistantReplyPlan(outcome.replyPlan as CreatorAssistantReplyPlan);

          return;
        }

        if (!response.body) {
          throw new Error("The chat stream did not return a readable body.");
        }

        const streamedResult = await readChatResponseStream<CreatorChatSuccess["data"]>({
          body: response.body,
          onStatus: (message) => setStreamStatus(message),
        });
        applyAssistantReplyPlan(
          resolveAssistantReplyPlan({
            ...replyPlanArgs,
            result: streamedResult,
            mode: "stream",
          }) as CreatorAssistantReplyPlan,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The live model failed before the backend could return a response.",
        );
      } finally {
        setIsSending(false);
        setStreamStatus(null);
        setPendingStatusPlan(null);
      }
    },
    [
      activeContentFocus,
      activeStrategyInputs,
      activeToneInputs,
      contract,
      context,
      currentPreferencePayload,
      fetchWorkspace,
      isMainChatLocked,
      messages,
      providerPreference,
      preferenceConstraintRules,
      selectedDraftContext,
      scrollThreadToBottom,
      applyAssistantReplyPlan,
      accountName,
      activeThreadId,
    ],
  );

  const requestDraftCardRevision = useCallback(
    async (
      messageId: string,
      prompt: string,
      threadFramingStyleOverride?: ThreadFramingStyle | null,
    ) => {
      const draftAction = resolveDraftCardRevisionAction({
        messageId,
        prompt,
        messages,
        composerCharacterLimit,
        threadFramingStyleOverride,
      });
      if (!draftAction) {
        return;
      }

      setActiveDraftEditor(draftAction.activeDraftEditor);
      await requestAssistantReply(draftAction.request);
    },
    [composerCharacterLimit, messages, requestAssistantReply],
  );

  const requestSelectedThreadFramingChange = useCallback(
    async (style: ThreadFramingStyle) => {
      const draftAction = resolveSelectedThreadFramingChangeAction({
        selectedDraftMessage,
        selectedDraftVersion,
        selectedDraftThreadFramingStyle,
        nextStyle: style,
      });
      if (!draftAction) {
        return;
      }

      setActiveDraftEditor(draftAction.activeDraftEditor);
      await requestAssistantReply(draftAction.request);
    },
    [
      requestAssistantReply,
      selectedDraftMessage,
      selectedDraftThreadFramingStyle,
      selectedDraftVersion,
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
          setIsThreadHydrating(false);
          return;
        }
        try {
          const res = await fetchWorkspace(`/api/creator/v2/threads/${activeThreadId}`);
          const data = await res.json();
          if (data.ok && data.data?.messages?.length > 0) {
            const hydration = resolveThreadHistoryHydration<ChatMessage>({
              rawMessages: data.data.messages,
              activeThreadId,
              shouldJumpToBottomAfterSwitch:
                shouldJumpToBottomAfterThreadSwitchRef.current,
            });
            setMessages(hydration.messages);

            if (hydration.shouldJumpToBottom) {
              shouldJumpToBottomAfterThreadSwitchRef.current = false;
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  jumpThreadToBottomImmediately();
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
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    messages.length,
    setIsThreadHydrating,
    shouldJumpToBottomAfterThreadSwitchRef,
  ]);

  const handleAngleSelect = useCallback(
    async (angle: string, formatHint: SelectedAngleFormatHint) => {
      if (!activeStrategyInputs || !activeToneInputs || isMainChatLocked) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: `> ${angle}`,
        includeUserMessageInHistory: false,
        turnSource: "ideation_pick",
        artifactContext: {
          kind: "selected_angle",
          angle,
          formatHint,
        },
        appendUserMessage: true,
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

  const handleReplyOptionSelect = useCallback(
    async (optionIndex: number) => {
      if (!activeStrategyInputs || !activeToneInputs || isMainChatLocked) {
        return;
      }

      await requestAssistantReply({
        prompt: "",
        displayUserMessage: `> option ${optionIndex + 1}`,
        includeUserMessageInHistory: false,
        turnSource: "reply_action",
        artifactContext: {
          kind: "reply_option_select",
          optionIndex,
        },
        appendUserMessage: true,
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
    (quickReply: ChatQuickReply) => {
      const quickReplyUpdate = resolveComposerQuickReplyUpdate({
        quickReply,
        isMainChatLocked,
      });
      if (!quickReplyUpdate.shouldApply) {
        return;
      }

      if (quickReplyUpdate.nextActiveContentFocus) {
        setActiveContentFocus(quickReplyUpdate.nextActiveContentFocus);
      }

      setDraftInput(quickReplyUpdate.nextDraftInput);
      if (quickReplyUpdate.shouldClearError) {
        setErrorMessage(null);
      }
    },
    [isMainChatLocked],
  );

  const submitComposerPrompt = useCallback(
    async (prompt: string) => {
      const submission = prepareComposerSubmission({
        prompt,
        hasContext: Boolean(context),
        hasContract: Boolean(contract),
        hasStrategyInputs: Boolean(activeStrategyInputs),
        hasToneInputs: Boolean(activeToneInputs),
        isMainChatLocked,
        activeThreadId,
        messagesLength: messages.length,
      });

      if (submission.status === "skip") {
        return;
      }

      if (submission.status === "blocked") {
        setErrorMessage(submission.errorMessage);
        return;
      }

      if (submission.shouldAnimateHeroExit) {
        setIsLeavingHero(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, HERO_EXIT_TRANSITION_MS);
        });
      }

      setDraftInput("");

      await requestAssistantReply({
        prompt: submission.trimmedPrompt,
        appendUserMessage: true,
        turnSource: "free_text",
        strategyInputOverride: activeStrategyInputs as ChatStrategyInputs,
        toneInputOverride: activeToneInputs as ChatToneInputs,
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

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitComposerPrompt(draftInput);
  }

  const submitQuickStarter = useCallback(
    async (prompt: string) => {
      await submitComposerPrompt(prompt);
    },
    [submitComposerPrompt],
  );

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitComposerPrompt(draftInput);
    }
  };

  const {
    heroGreeting,
    heroInitials,
    heroIdentityLabel,
    heroQuickActions,
    isNewChatHero,
    shouldCenterHero,
  } = resolveComposerViewState({
    context,
    accountName,
    activeThreadId,
    messagesLength: messages.length,
    isLeavingHero,
  });
  const accountAvatarFallback = resolveAccountAvatarFallback({
    accountName,
    sessionEmail: session?.user?.email ?? null,
  });
  const accountProfileAriaLabel = resolveAccountProfileAriaLabel({
    accountName,
    sessionEmail: session?.user?.email ?? null,
  });
  const billingOffers = billingState?.offers ?? [];
  const lifetimeOffer = billingOffers.find((offer) => offer.offer === "lifetime");
  const lifetimeSlotSummary = billingState?.lifetimeSlots ?? null;
  const billingViewState = useMemo(
    () =>
      resolveBillingViewState({
        billingState,
        dismissedBillingWarningLevel,
        isBillingLoading,
        selectedModalProCadence,
      }),
    [
      billingState,
      dismissedBillingWarningLevel,
      isBillingLoading,
      selectedModalProCadence,
    ],
  );
  const {
    activeBillingSnapshot,
    billingCreditsLabel,
    billingWarningLevel,
    isFounderCurrent,
    isProActive,
    pricingModalDismissLabel,
    rateLimitResetLabel,
    rateLimitUpgradeLabel,
    rateLimitWindowLabel,
    rateLimitsRemainingPercent,
    selectedModalProButtonLabel,
    selectedModalProCents,
    selectedModalProIsAnnual,
    selectedModalProIsCurrent,
    selectedModalProNeedsPortalSwitch,
    selectedModalProOffer,
    selectedModalProOfferEnabled,
    selectedModalProPriceSuffix,
    settingsCreditsRemaining,
    settingsCreditsRemainingPercent,
    settingsCreditsUsed,
    settingsCreditLimit,
    settingsPlanLabel,
    showBillingWarningBanner,
    showRateLimitUpgradeCta,
  } = billingViewState;
  const isSelectedModalProCheckoutLoading = checkoutLoadingOffer === selectedModalProOffer;
  const canAddAccount = true;
  const isInlineDraftEditorOpen = Boolean(
    selectedDraftVersion && selectedDraftBundle,
  );
  const {
    chatCanvasClassName,
    threadCanvasTransitionClassName,
    threadContentTransitionClassName,
  } = resolveThreadViewState({
    shouldCenterHero,
    isInlineDraftEditorOpen,
    threadTransitionPhase,
    isThreadHydrating,
  });
  const draftEditorIdentity = resolveDraftEditorIdentity({
    context,
    accountName,
    heroIdentityLabel,
    heroInitials,
  });
  const sidebarThreads = resolveSidebarThreadSections({
    hasWorkspace: Boolean(context && contract),
    chatThreads,
    activeThreadId,
    sidebarSearchQuery,
  });
  const headerTools = WORKSPACE_CHROME_TOOLS.map((tool) => ({
    key: tool.key,
    label: tool.label,
    onSelect: () => {
      setToolsMenuOpen(false);
      if (tool.key === "source_materials") {
        resetSourceMaterialDraft();
        openSourceMaterials();
        return;
      }
      if (tool.key === "draft_review") {
        setDraftQueueError(null);
        setDraftQueueOpen(true);
        return;
      }
      if (tool.key === "profile_breakdown") {
        openAnalysis();
        return;
      }

      openGrowthGuide();
    },
  }));

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="relative flex h-full min-h-0">
        <ChatSidebar
          sidebarOpen={sidebarOpen}
          sidebarSearchQuery={sidebarSearchQuery}
          onSidebarSearchQueryChange={setSidebarSearchQuery}
          onCloseSidebar={closeSidebar}
          onOpenSidebar={openSidebar}
          onNewChat={handleNewChat}
          sections={sidebarThreads}
          activeThreadId={activeThreadId}
          hoveredThreadId={hoveredThreadId}
          onHoveredThreadIdChange={setHoveredThreadId}
          menuOpenThreadId={menuOpenThreadId}
          onMenuOpenThreadIdChange={setMenuOpenThreadId}
          editingThreadId={editingThreadId}
          editingTitle={editingTitle}
          onEditingTitleChange={setEditingTitle}
          onEditingThreadIdChange={setEditingThreadId}
          onRenameSubmit={(threadId) => {
            void handleRenameSubmit(threadId);
          }}
          onSwitchToThread={switchToThreadWithTransition}
          onRequestDeleteThread={requestDeleteThread}
          onOpenPreferences={openPreferences}
          onOpenFeedback={() => {
            setFeedbackSubmitNotice(null);
            setFeedbackModalOpen(true);
          }}
          threadMenuRef={threadMenuRef}
          accountMenuRef={accountMenuRef}
          accountMenuOpen={accountMenuOpen}
          onToggleAccountMenu={toggleAccountMenu}
          accountMenuVisible={accountMenuVisible}
          availableHandles={availableHandles}
          accountName={accountName}
          canAddAccount={canAddAccount}
          onSwitchActiveHandle={switchActiveHandle}
          onOpenAddAccount={() => {
            closeAccountMenu();
            setIsAddAccountModalOpen(true);
            setAddAccountError(null);
            setReadyAccountHandle(null);
          }}
          onOpenSettings={() => {
            closeAccountMenu();
            setSettingsModalOpen(true);
          }}
          rateLimitsMenuOpen={rateLimitsMenuOpen}
          onToggleRateLimitsMenu={() => setRateLimitsMenuOpen((current) => !current)}
          rateLimitWindowLabel={rateLimitWindowLabel}
          rateLimitsRemainingPercent={rateLimitsRemainingPercent}
          rateLimitResetLabel={rateLimitResetLabel}
          showRateLimitUpgradeCta={showRateLimitUpgradeCta}
          rateLimitUpgradeLabel={rateLimitUpgradeLabel}
          onOpenPricing={() => {
            setPricingModalOpen(true);
            closeAccountMenu();
          }}
          avatarUrl={context?.avatarUrl ?? null}
          accountAvatarFallback={accountAvatarFallback}
          accountProfileAriaLabel={accountProfileAriaLabel}
          isVerifiedAccount={isVerifiedAccount}
          sessionEmail={session?.user?.email ?? null}
        />

        <div className="relative flex h-full min-h-0 flex-1 flex-col">
          <ChatHeader
            toolsMenuRef={toolsMenuRef}
            toolsMenuOpen={toolsMenuOpen}
            onToggleToolsMenu={() => setToolsMenuOpen((current) => !current)}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
            onOpenCompanionApp={() => setExtensionModalOpen(true)}
            tools={headerTools}
          />

          <ChatThreadView
            threadScrollRef={threadScrollRef}
            chatCanvasClassName={chatCanvasClassName}
            threadCanvasTransitionClassName={threadCanvasTransitionClassName}
            threadContentTransitionClassName={threadContentTransitionClassName}
            isLoading={isLoading}
            isWorkspaceInitializing={isWorkspaceInitializing}
            hasContext={Boolean(context)}
            hasContract={Boolean(contract)}
            errorMessage={errorMessage}
            showBillingWarningBanner={showBillingWarningBanner && Boolean(activeBillingSnapshot)}
            billingWarningLevel={
              billingWarningLevel === "none" ? null : billingWarningLevel
            }
            billingCreditsLabel={billingCreditsLabel}
            onOpenPricing={() => setPricingModalOpen(true)}
            onDismissBillingWarning={() =>
              setDismissedBillingWarningLevel(billingWarningLevel as "low" | "critical")
            }
            hero={
              isNewChatHero || isLeavingHero ? (
                <ChatHero
                  avatarUrl={context?.avatarUrl ?? null}
                  heroIdentityLabel={heroIdentityLabel}
                  heroInitials={heroInitials}
                  heroGreeting={heroGreeting}
                  isVerifiedAccount={isVerifiedAccount}
                  isLeavingHero={isLeavingHero}
                  draftInput={draftInput}
                  onDraftInputChange={setDraftInput}
                  onComposerKeyDown={handleComposerKeyDown}
                  onSubmit={handleComposerSubmit}
                  isSubmitDisabled={
                    isMainChatLocked ||
                    !context ||
                    !contract ||
                    !activeStrategyInputs ||
                    !activeToneInputs ||
                    !draftInput.trim()
                  }
                  isSending={isSending}
                  heroQuickActions={heroQuickActions}
                  onQuickAction={(prompt) => {
                    void submitQuickStarter(prompt);
                  }}
                />
              ) : null
            }
            threadContent={
              !isNewChatHero && !isLeavingHero ? (
                    <>
                      {messages.map((message, index) => {
                        const buildDraftRevealClasses = (draftKey: string) =>
                          buildDraftRevealClassName(
                            activeDraftRevealByMessageId,
                            message.id,
                            draftKey,
                          );
                        const shouldAnimateDraftLines = (draftKey: string) =>
                          shouldAnimateDraftRevealLines(
                            activeDraftRevealByMessageId,
                            message.id,
                            draftKey,
                          );

                        return (
                          <ChatMessageRow
                            key={message.id}
                            messageId={message.id}
                            role={message.role}
                            previousRole={messages[index - 1]?.role}
                            index={index}
                            onRegisterRef={registerMessageRef}
                          >
                            <MessageContent
                              role={message.role}
                              content={message.content}
                              isStreaming={Boolean(message.isStreaming)}
                              isLatestAssistantMessage={message.id === latestAssistantMessageId}
                              typedLength={typedAssistantLengths[message.id] ?? 0}
                              assistantTypingBubble={
                                <AssistantTypingBubble label={message.content || null} />
                              }
                            />

                            <MessageArtifactSections
                              message={message}
                              index={index}
                              messagesLength={messages.length}
                              composerCharacterLimit={composerCharacterLimit}
                              isVerifiedAccount={isVerifiedAccount}
                              isMainChatLocked={isMainChatLocked}
                              showDevTools={showDevTools}
                              selectedDraftMessageId={selectedDraftMessageId}
                              selectedDraftVersionId={selectedDraftVersionId}
                              selectedThreadPreviewPostIndex={
                                selectedThreadPostByMessageId[message.id]
                              }
                              expandedInlineThreadPreviewId={expandedInlineThreadPreviewId}
                              copiedPreviewDraftMessageId={copiedPreviewDraftMessageId}
                              dismissedAutoSavedSource={Boolean(
                                dismissedAutoSavedSourceByMessageId[message.id],
                              )}
                              autoSavedSourceUndoPending={Boolean(
                                autoSavedSourceUndoPendingByMessageId[message.id],
                              )}
                              messageFeedbackPending={Boolean(
                                messageFeedbackPendingById[message.id],
                              )}
                              canRunReplyActions={
                                !isMainChatLocked &&
                                Boolean(activeStrategyInputs && activeToneInputs)
                              }
                              contextIdentity={{
                                username:
                                  context?.creatorProfile?.identity?.username || "user",
                                displayName:
                                  context?.creatorProfile?.identity?.displayName ||
                                  context?.creatorProfile?.identity?.username ||
                                  "user",
                                avatarUrl: context?.avatarUrl || null,
                              }}
                              getRevealClassName={buildDraftRevealClasses}
                              shouldAnimateRevealLines={shouldAnimateDraftLines}
                              shouldShowQuickReplies={(candidate) =>
                                shouldShowQuickRepliesForMessage(candidate as ChatMessage)
                              }
                              shouldShowOptionArtifacts={(candidate) =>
                                shouldShowOptionArtifactsForMessage(candidate as ChatMessage)
                              }
                              shouldShowDraftOutput={(candidate) =>
                                shouldShowDraftOutputForMessage(candidate as ChatMessage)
                              }
                              onOpenSourceMaterialEditor={(params) => {
                                void openSourceMaterialEditor(params);
                              }}
                              onUndoAutoSavedSourceMaterials={() => {
                                if (!message.autoSavedSourceMaterials) {
                                  return;
                                }

                                void undoAutoSavedSourceMaterials(
                                  message.id,
                                  message.autoSavedSourceMaterials,
                                );
                              }}
                              onSubmitAssistantMessageFeedback={(value) => {
                                void submitAssistantMessageFeedback(message.id, value);
                              }}
                              onQuickReplySelect={(quickReply) => {
                                void handleQuickReplySelect(quickReply as ChatQuickReply);
                              }}
                              onAngleSelect={(title, selectedAngleFormatHint) => {
                                void handleAngleSelect(title, selectedAngleFormatHint);
                              }}
                              onReplyOptionSelect={(optionIndex) => {
                                void handleReplyOptionSelect(optionIndex);
                              }}
                              onSelectDraftBundleOption={(optionId, versionId) => {
                                selectDraftBundleOption(message.id, optionId, versionId);
                              }}
                              onOpenDraftEditor={(versionId, threadPostIndex) => {
                                openDraftEditor(message.id, versionId, threadPostIndex);
                              }}
                              onRequestDraftCardRevision={(
                                prompt,
                                threadFramingStyleOverride,
                              ) => {
                                void requestDraftCardRevision(
                                  message.id,
                                  prompt,
                                  threadFramingStyleOverride ?? undefined,
                                );
                              }}
                              onToggleExpandedInlineThreadPreview={() => {
                                setExpandedInlineThreadPreviewId((current) =>
                                  current === message.id ? null : message.id,
                                );
                              }}
                              onCopyPreviewDraft={(messageId, content) => {
                                void copyPreviewDraft(messageId, content);
                              }}
                              onShareDraftEditor={shareDraftEditorToX}
                            />

                          </ChatMessageRow>
                        );
                      })}

                      {shouldShowPendingDraftShell && pendingDraftWorkflow ? (
                        <PendingDraftShell
                          workflow={pendingDraftWorkflow}
                          label={pendingStatusLabel}
                        />
                      ) : isSending ? (
                        <AssistantTypingBubble label={pendingStatusLabel} />
                      ) : null}
                    </>
              ) : null
            }
          />

          <ChatComposerDock
            isNewChatHero={isNewChatHero}
            showScrollToLatest={showScrollToLatest}
            shouldCenterHero={shouldCenterHero}
            onScrollToBottom={scrollThreadToBottom}
            draftInput={draftInput}
            onDraftInputChange={setDraftInput}
            onComposerKeyDown={handleComposerKeyDown}
            onSubmit={handleComposerSubmit}
            isSubmitDisabled={
              isMainChatLocked ||
              !context ||
              !contract ||
              !activeStrategyInputs ||
              !activeToneInputs ||
              !draftInput.trim()
            }
            isSending={isSending}
          />
        </div >
      </div >

      {
        selectedDraftVersion && selectedDraftBundle ? (
          <>
            <DesktopDraftEditorDock>
              <DraftEditorPanel
                layout="desktop"
                identity={draftEditorIdentity}
                isVerifiedAccount={isVerifiedAccount}
                timelinePosition={selectedDraftTimelinePosition}
                timelineLength={selectedDraftTimeline.length}
                canNavigateDraftBack={canNavigateDraftBack}
                canNavigateDraftForward={canNavigateDraftForward}
                onNavigateTimeline={navigateDraftTimeline}
                onClose={() => setActiveDraftEditor(null)}
                primaryActionLabel={draftEditorPrimaryActionLabel}
                isPrimaryActionDisabled={isDraftEditorPrimaryActionDisabled}
                onPrimaryAction={() => {
                  void (shouldShowRevertDraftCta
                    ? revertToSelectedDraftVersion()
                    : saveDraftEditor());
                }}
                isSelectedDraftThread={isSelectedDraftThread}
                selectedDraftArtifact={selectedDraftArtifact}
                selectedDraftThreadFramingStyle={selectedDraftThreadFramingStyle}
                onChangeThreadFraming={(style) => {
                  void requestSelectedThreadFramingChange(style);
                }}
                isMainChatLocked={isMainChatLocked}
                isViewingHistoricalDraftVersion={isViewingHistoricalDraftVersion}
                editorDraftPosts={editorDraftPosts}
                selectedDraftThreadPostIndex={selectedDraftThreadPostIndex}
                selectedDraftMessageId={selectedDraftMessageId}
                onSelectThreadPost={(index) =>
                  setSelectedThreadPostByMessageId((current) => ({
                    ...current,
                    [selectedDraftMessageId!]: index,
                  }))
                }
                onUpdateThreadDraftPost={updateThreadDraftPost}
                onMoveThreadDraftPost={moveThreadDraftPost}
                onSplitThreadDraftPost={splitThreadDraftPost}
                onMergeThreadDraftPostDown={mergeThreadDraftPostDown}
                onAddThreadDraftPost={addThreadDraftPost}
                onRemoveThreadDraftPost={removeThreadDraftPost}
                draftEditorSerializedContent={draftEditorSerializedContent}
                composerCharacterLimit={composerCharacterLimit}
                selectedDraftMaxCharacterLimit={selectedDraftVersion.maxCharacterLimit}
                editorDraftText={editorDraftText}
                onChangeEditorDraftText={setEditorDraftText}
                draftInspectorActionLabel={draftInspectorActionLabel}
                isDraftInspectorLoading={isDraftInspectorLoading}
                onRunDraftInspector={() => {
                  void runDraftInspector();
                }}
                hasCopiedDraftEditorText={hasCopiedDraftEditorText}
                onCopyDraftEditor={() => {
                  void copyDraftEditor();
                }}
                onShareDraftEditor={shareDraftEditorToX}
              />
            </DesktopDraftEditorDock>

            <MobileDraftEditorDock>
              <DraftEditorPanel
                layout="mobile"
                identity={draftEditorIdentity}
                isVerifiedAccount={isVerifiedAccount}
                timelinePosition={selectedDraftTimelinePosition}
                timelineLength={selectedDraftTimeline.length}
                canNavigateDraftBack={canNavigateDraftBack}
                canNavigateDraftForward={canNavigateDraftForward}
                onNavigateTimeline={navigateDraftTimeline}
                onClose={() => setActiveDraftEditor(null)}
                primaryActionLabel={draftEditorPrimaryActionLabel}
                isPrimaryActionDisabled={isDraftEditorPrimaryActionDisabled}
                onPrimaryAction={() => {
                  void (shouldShowRevertDraftCta
                    ? revertToSelectedDraftVersion()
                    : saveDraftEditor());
                }}
                isSelectedDraftThread={isSelectedDraftThread}
                selectedDraftArtifact={selectedDraftArtifact}
                selectedDraftThreadFramingStyle={selectedDraftThreadFramingStyle}
                onChangeThreadFraming={(style) => {
                  void requestSelectedThreadFramingChange(style);
                }}
                isMainChatLocked={isMainChatLocked}
                isViewingHistoricalDraftVersion={isViewingHistoricalDraftVersion}
                editorDraftPosts={editorDraftPosts}
                selectedDraftThreadPostIndex={selectedDraftThreadPostIndex}
                selectedDraftMessageId={selectedDraftMessageId}
                onSelectThreadPost={(index) =>
                  setSelectedThreadPostByMessageId((current) => ({
                    ...current,
                    [selectedDraftMessageId!]: index,
                  }))
                }
                onUpdateThreadDraftPost={updateThreadDraftPost}
                onMoveThreadDraftPost={moveThreadDraftPost}
                onSplitThreadDraftPost={splitThreadDraftPost}
                onMergeThreadDraftPostDown={mergeThreadDraftPostDown}
                onAddThreadDraftPost={addThreadDraftPost}
                onRemoveThreadDraftPost={removeThreadDraftPost}
                draftEditorSerializedContent={draftEditorSerializedContent}
                composerCharacterLimit={composerCharacterLimit}
                selectedDraftMaxCharacterLimit={selectedDraftVersion.maxCharacterLimit}
                editorDraftText={editorDraftText}
                onChangeEditorDraftText={setEditorDraftText}
                draftInspectorActionLabel={draftInspectorActionLabel}
                isDraftInspectorLoading={isDraftInspectorLoading}
                onRunDraftInspector={() => {
                  void runDraftInspector();
                }}
                hasCopiedDraftEditorText={hasCopiedDraftEditorText}
                onCopyDraftEditor={() => {
                  void copyDraftEditor();
                }}
                onShareDraftEditor={shareDraftEditorToX}
              />
            </MobileDraftEditorDock>
          </>
        ) : null
      }

      <DraftQueueDialog
        open={draftQueueOpen}
        isLoading={isDraftQueueLoading}
        errorMessage={draftQueueError}
        items={draftQueueItems}
        editingCandidateId={editingDraftCandidateId}
        editingCandidateText={editingDraftCandidateText}
        actionById={draftQueueActionById}
        copiedPreviewDraftMessageId={copiedPreviewDraftMessageId}
        canGenerateInChat={Boolean(context?.runId)}
        isVerifiedAccount={isVerifiedAccount}
        onOpenChange={(open) => {
          if (!open) {
            setDraftQueueOpen(false);
            setEditingDraftCandidateId(null);
            setEditingDraftCandidateText("");
          }
        }}
        onGenerateInChat={() => {
          setDraftQueueOpen(false);
          void submitQuickStarter("draft 4 posts from what you know about me");
        }}
        onStartEditingCandidate={(candidateId, content) => {
          setEditingDraftCandidateId(candidateId);
          setEditingDraftCandidateText(content);
        }}
        onCancelEditingCandidate={() => {
          setEditingDraftCandidateId(null);
          setEditingDraftCandidateText("");
        }}
        onEditCandidateTextChange={setEditingDraftCandidateText}
        onMutateCandidate={(candidateId, payload) => {
          void mutateDraftQueueCandidate(candidateId, payload);
        }}
        onOpenObservedMetrics={openObservedMetricsModal}
        onOpenSourceMaterial={(params) => {
          void openSourceMaterialEditor(params);
        }}
        onCopyCandidateDraft={(candidateId, content) => {
          void copyPreviewDraft(candidateId, content);
        }}
        onOpenX={shareDraftEditorToX}
      />
      <ObservedMetricsModal
        open={Boolean(observedMetricsCandidate)}
        candidateTitle={observedMetricsCandidate?.title ?? null}
        value={observedMetricsForm}
        isSubmitting={draftQueueActionById[observedMetricsCandidateId || ""] === "observed"}
        errorMessage={draftQueueError}
        onChange={(field, nextValue) => {
          setObservedMetricsForm((current) => ({
            ...current,
            [field]: nextValue,
          }));
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeObservedMetricsModal();
          }
        }}
        onSubmit={() => {
          void submitObservedMetrics();
        }}
      />

      <SettingsDialog
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        planStatusLabel={
          activeBillingSnapshot?.status === "past_due"
            ? "Past due"
            : activeBillingSnapshot?.status === "blocked_fair_use"
              ? "Fair use review"
              : activeBillingSnapshot?.status === "canceled"
                ? "Canceled"
                : "Active"
        }
        settingsPlanLabel={settingsPlanLabel}
        rateLimitResetLabel={rateLimitResetLabel}
        isOpeningBillingPortal={isOpeningBillingPortal}
        onOpenBillingPortal={() => {
          void openBillingPortal();
        }}
        showRateLimitUpgradeCta={showRateLimitUpgradeCta}
        rateLimitUpgradeLabel={rateLimitUpgradeLabel}
        onOpenPricing={() => {
          setSettingsModalOpen(false);
          setPricingModalOpen(true);
        }}
        settingsCreditsRemaining={settingsCreditsRemaining}
        settingsCreditsUsed={settingsCreditsUsed}
        settingsCreditLimit={settingsCreditLimit}
        settingsCreditsRemainingPercent={settingsCreditsRemainingPercent}
        supportEmail={billingState?.supportEmail ?? "shernanjavier@gmail.com"}
        onSignOut={() => {
          void signOut({ callbackUrl: "/" });
        }}
      />

      <PricingDialog
        open={pricingModalOpen}
        onOpenChange={(open) => {
          setPricingModalOpen(open);
          if (!open) {
            void acknowledgePricingModal();
          }
        }}
        onOpenPricingPage={() => {
          setPricingModalOpen(false);
          void acknowledgePricingModal();
          window.location.href = "/pricing";
        }}
        dismissLabel={pricingModalDismissLabel}
        selectedModalProIsAnnual={selectedModalProIsAnnual}
        selectedModalProCents={selectedModalProCents}
        selectedModalProPriceSuffix={selectedModalProPriceSuffix}
        setSelectedModalProCadence={setSelectedModalProCadence}
        isProActive={isProActive}
        isFounderCurrent={isFounderCurrent}
        selectedModalProIsCurrent={selectedModalProIsCurrent}
        selectedModalProNeedsPortalSwitch={selectedModalProNeedsPortalSwitch}
        selectedModalProOfferEnabled={selectedModalProOfferEnabled}
        selectedModalProButtonLabel={selectedModalProButtonLabel}
        isSelectedModalProCheckoutLoading={isSelectedModalProCheckoutLoading}
        isOpeningBillingPortal={isOpeningBillingPortal}
        onOpenBillingPortal={() => {
          void openBillingPortal();
        }}
        onOpenCheckout={(offer) => {
          void openCheckoutForOffer(offer);
        }}
        selectedModalProOffer={selectedModalProOffer}
        lifetimeAmountCents={lifetimeOffer?.amountCents ?? 0}
        lifetimeSlotSummary={lifetimeSlotSummary}
        lifetimeOfferEnabled={lifetimeOffer?.enabled !== false}
        supportEmail={billingState?.supportEmail ?? "shernanjavier@gmail.com"}
      />

      <FeedbackDialog
        open={feedbackModalOpen}
        onOpenChange={setFeedbackModalOpen}
        onSubmit={submitFeedback}
        feedbackCategory={feedbackCategory}
        onFeedbackCategoryChange={setFeedbackCategory}
        activeFeedbackTitle={activeFeedbackTitle}
        onActiveFeedbackTitleChange={(value) => {
          setFeedbackTitlesByCategory((current) => ({
            ...current,
            [feedbackCategory]: value,
          }));
          setFeedbackSubmitNotice(null);
        }}
        activeFeedbackDraft={activeFeedbackDraft}
        onActiveFeedbackDraftChange={(value) => {
          setFeedbackDraftsByCategory((current) => ({
            ...current,
            [feedbackCategory]: value,
          }));
          setFeedbackSubmitNotice(null);
        }}
        feedbackEditorRef={feedbackEditorRef}
        onFeedbackEditorKeyDown={handleFeedbackEditorKeyDown}
        onInsertMarkdownToken={applyFeedbackMarkdownToken}
        feedbackImages={feedbackImages}
        feedbackFileInputRef={feedbackFileInputRef}
        isFeedbackDropActive={isFeedbackDropActive}
        onFeedbackImageSelection={handleFeedbackImageSelection}
        onFeedbackDropZoneDragOver={handleFeedbackDropZoneDragOver}
        onFeedbackDropZoneDragLeave={handleFeedbackDropZoneDragLeave}
        onFeedbackDropZoneDrop={handleFeedbackDropZoneDrop}
        onRemoveFeedbackImage={removeFeedbackImage}
        profileHandle={context?.account ?? accountName ?? "unknown"}
        avatarUrl={context?.avatarUrl ?? null}
        submittingEmail={session?.user?.email ?? "email unavailable"}
        activeThreadId={activeThreadId}
        feedbackHistory={feedbackHistory}
        feedbackHistoryFilter={feedbackHistoryFilter}
        onFeedbackHistoryFilterChange={setFeedbackHistoryFilter}
        feedbackHistoryQuery={feedbackHistoryQuery}
        onFeedbackHistoryQueryChange={setFeedbackHistoryQuery}
        isFeedbackHistoryLoading={isFeedbackHistoryLoading}
        feedbackStatusUpdatingIds={feedbackStatusUpdatingIds}
        onUpdateFeedbackSubmissionStatus={(submissionId, status) => {
          void updateFeedbackSubmissionStatus(submissionId, status);
        }}
        currentUserId={session?.user?.id ?? null}
        feedbackSubmitNotice={feedbackSubmitNotice}
        isFeedbackSubmitting={isFeedbackSubmitting}
      />

      <ExtensionDialog
        open={extensionModalOpen}
        onOpenChange={setExtensionModalOpen}
      />

      <SourceMaterialsDialog
        open={sourceMaterialsOpen}
        onOpenChange={setSourceMaterialsOpen}
        onSeedSourceMaterials={() => {
          void seedSourceMaterials();
        }}
        isSourceMaterialsLoading={isSourceMaterialsLoading}
        isSourceMaterialsSaving={isSourceMaterialsSaving}
        sourceMaterialsNotice={sourceMaterialsNotice}
        sourceMaterialDraft={sourceMaterialDraft}
        onClearDraft={() => {
          resetSourceMaterialDraft();
          clearSourceMaterialsNotice();
        }}
        onApplyClaimExample={applyClaimExample}
        onDraftTitleChange={updateSourceMaterialTitle}
        onDraftTypeChange={updateSourceMaterialType}
        onToggleDraftVerified={toggleSourceMaterialVerified}
        onDraftClaimsChange={updateSourceMaterialClaims}
        sourceMaterialAdvancedOpen={sourceMaterialAdvancedOpen}
        onToggleSourceMaterialAdvancedOpen={toggleSourceMaterialAdvancedOpen}
        onDraftTagsChange={updateSourceMaterialTags}
        onDraftSnippetsChange={updateSourceMaterialSnippets}
        onDraftDoNotClaimChange={updateSourceMaterialDoNotClaim}
        onDeleteSourceMaterial={() => {
          void deleteSourceMaterial();
        }}
        onSaveSourceMaterial={() => {
          void saveSourceMaterial();
        }}
        sourceMaterialsLibraryOpen={sourceMaterialsLibraryOpen}
        onToggleSourceMaterialsLibraryOpen={toggleSourceMaterialsLibraryOpen}
        sourceMaterials={sourceMaterials}
        onSelectSourceMaterial={selectSourceMaterial}
      />

      {context ? (
        <PreferencesDialog
          open={preferencesOpen}
          onOpenChange={setPreferencesOpen}
          onSave={() => {
            void savePreferences();
          }}
          isPreferencesLoading={isPreferencesLoading}
          isPreferencesSaving={isPreferencesSaving}
          preferenceCasing={preferenceCasing}
          onPreferenceCasingChange={setPreferenceCasing}
          preferenceBulletStyle={preferenceBulletStyle}
          onPreferenceBulletStyleChange={setPreferenceBulletStyle}
          preferenceWritingMode={preferenceWritingMode}
          onPreferenceWritingModeChange={setPreferenceWritingMode}
          preferenceUseEmojis={preferenceUseEmojis}
          onTogglePreferenceUseEmojis={togglePreferenceUseEmojis}
          preferenceAllowProfanity={preferenceAllowProfanity}
          onTogglePreferenceAllowProfanity={togglePreferenceAllowProfanity}
          preferenceBlacklistInput={preferenceBlacklistInput}
          onPreferenceBlacklistInputChange={handlePreferenceBlacklistInputChange}
          onPreferenceBlacklistInputKeyDown={handlePreferenceBlacklistInputKeyDown}
          preferenceBlacklistedTerms={preferenceBlacklistedTerms}
          onRemovePreferenceBlacklistedTerm={removePreferenceBlacklistedTerm}
          isVerifiedAccount={isVerifiedAccount}
          effectivePreferenceMaxCharacters={effectivePreferenceMaxCharacters}
          onPreferenceMaxCharactersChange={setPreferenceMaxCharacters}
          previewDisplayName={previewDisplayName}
          previewUsername={previewUsername}
          previewAvatarUrl={previewAvatarUrl}
          preferencesPreviewDraft={preferencesPreviewDraft}
          preferencesPreviewCounter={preferencesPreviewCounter}
        />
      ) : null}

      {context ? (
        <GrowthGuideDialog
          open={playbookModalOpen}
          onOpenChange={handleGrowthGuideOpenChange}
          playbookStage={playbookStage}
          onPlaybookStageChange={setPlaybookStage}
          filteredStagePlaybooks={filteredStagePlaybooks}
          selectedPlaybook={selectedPlaybook}
          onSelectPlaybook={handleApplyPlaybook}
          selectedPlaybookRef={growthGuideSelectedPlaybookRef}
          playbookTemplateTab={playbookTemplateTab}
          onPlaybookTemplateTabChange={setPlaybookTemplateTab}
          personalizedPlaybookTemplates={personalizedPlaybookTemplates}
          activePlaybookTemplateId={activePlaybookTemplate?.id ?? null}
          onActivePlaybookTemplateChange={setActivePlaybookTemplateId}
          activePlaybookTemplateText={activePlaybookTemplate?.text ?? null}
          playbookTemplatePreviewCounter={playbookTemplatePreviewCounter}
          copiedPlaybookTemplateId={copiedPlaybookTemplateId}
          onCopyPlaybookTemplate={(template) => {
            void handleCopyPlaybookTemplate(template);
          }}
          templateWhyItWorksPoints={buildTemplateWhyItWorksPoints(playbookTemplateTab)}
          previewDisplayName={growthGuidePreviewDisplayName}
          previewUsername={growthGuidePreviewUsername}
          previewAvatarUrl={growthGuidePreviewAvatarUrl}
          isVerifiedAccount={isVerifiedAccount}
          onOpenFeedback={() => {
            handleGrowthGuideOpenChange(false);
            setFeedbackSubmitNotice(null);
            setFeedbackModalOpen(true);
          }}
          onOpenProfileAnalysis={() => {
            handleGrowthGuideOpenChange(false);
            openAnalysis();
          }}
        />
      ) : null}

      {context ? (
        <ProfileAnalysisDialog
          key={`${context.account}-${analysisOpen ? "open" : "closed"}`}
          open={analysisOpen}
          onOpenChange={setAnalysisOpen}
          context={context}
          accountName={accountName}
          isVerifiedAccount={isVerifiedAccount}
          currentPlaybookStage={currentPlaybookStage}
          analysisFollowerProgress={analysisFollowerProgress}
          analysisDiagnosisSummary={analysisDiagnosisSummary}
          analysisSnapshotCards={analysisSnapshotCards}
          analysisPositioningIsTentative={analysisPositioningIsTentative}
          analysisPriorityItems={analysisPriorityItems}
          analysisRecommendedPlaybooks={analysisRecommendedPlaybooks}
          analysisLearningStrengths={analysisLearningStrengths}
          analysisLearningCautions={analysisLearningCautions}
          analysisLearningExperiments={analysisLearningExperiments}
          analysisReplyConversionHighlights={analysisReplyConversionHighlights}
          analysisVoiceSignalChips={analysisVoiceSignalChips}
          analysisKeepList={analysisKeepList}
          analysisAvoidList={analysisAvoidList}
          analysisEvidencePosts={analysisEvidencePosts}
          analysisScrapeNotice={analysisScrapeNotice}
          analysisScrapeNoticeTone={analysisScrapeNoticeTone}
          isAnalysisScrapeCoolingDown={isAnalysisScrapeCoolingDown}
          analysisScrapeCooldownLabel={analysisScrapeCooldownLabel}
          isAnalysisScrapeRefreshing={isAnalysisScrapeRefreshing}
          onRefreshScrape={() => {
            void handleManualProfileScrapeRefresh();
          }}
          onOpenFeedback={() => {
            closeAnalysis();
            setFeedbackSubmitNotice(null);
            setFeedbackModalOpen(true);
          }}
          onOpenGrowthGuide={() => {
            closeAnalysis();
            openGrowthGuide();
          }}
          onOpenGrowthGuideForRecommendation={(stage, playbookId) => {
            closeAnalysis();
            openGrowthGuideForRecommendation(stage, playbookId);
          }}
        />
      ) : null}

      <AddAccountDialog
        open={isAddAccountModalOpen}
        requiresXAccountGate={requiresXAccountGate}
        isSubmitting={isAddAccountSubmitting}
        preview={addAccountPreview}
        normalizedHandle={normalizedAddAccount}
        loadingStepIndex={addAccountLoadingStepIndex}
        loadingSteps={CHAT_ONBOARDING_LOADING_STEPS}
        onOpenChange={(open) => {
          if (!open) {
            closeAddAccountModal();
          }
        }}
        onSubmit={handleAddAccountSubmit}
        inputValue={addAccountInput}
        onInputValueChange={(value) => {
          setAddAccountInput(value);
          setAddAccountError(null);
        }}
        readyAccountHandle={readyAccountHandle}
        hasValidPreview={hasValidAddAccountPreview}
        isPreviewLoading={isAddAccountPreviewLoading}
        errorMessage={addAccountError}
      />

      <ThreadDeleteDialog
        open={Boolean(threadToDelete)}
        threadTitle={threadToDelete?.title ?? null}
        onOpenChange={(open) => {
          if (!open) {
            clearThreadToDelete();
          }
        }}
        onConfirmDelete={() => {
          void confirmDeleteThread();
        }}
      />
    </main >
  );
}
