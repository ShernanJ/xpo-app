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
import Image from "next/image";
import { useSearchParams, useParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth/client";
import { ArrowUpRight, BarChart3, BookOpen, ChevronDown, ChevronRight, ChevronUp, Check, Copy, Edit3, Lightbulb, List, MessageSquareText, MoreVertical, RotateCw, Settings2, Sparkles, ThumbsDown, ThumbsUp, Trash2, Wrench } from "lucide-react";

import type { CreatorAgentContext } from "@/lib/onboarding/agentContext";
import {
  computeXWeightedCharacterCount,
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
import { buildPreferenceConstraintsFromPreferences } from "@/lib/agent-v2/orchestrator/preferenceConstraints";
import type { UserPreferences } from "@/lib/agent-v2/core/styleProfile";
import {
  assistantMarkdownClassName,
  renderMarkdownToHtml,
  renderStreamingMarkdownToHtml,
} from "@/lib/ui/markdown";
import { getChatRenderMode } from "@/lib/ui/chatRenderMode";
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
import {
  PLAYBOOK_LIBRARY,
  PLAYBOOK_STAGE_META,
  PLAYBOOK_STAGE_ORDER,
  buildPlaybookTemplateGroups,
  buildRecommendedPlaybooks,
  inferCurrentPlaybookStage,
  type PlaybookDefinition,
  type PlaybookStageKey,
  type PlaybookTemplate,
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
  getThreadPostCharacterLimit,
  prepareDraftPromotionRequest,
  resolveDraftVersionRevertUpdate,
} from "./_features/draft-editor/chatDraftPersistenceState";
import {
  buildDraftArtifactRevealKey,
  buildDraftBundleRevealKey,
  buildDraftCharacterCounterMeta,
  getThreadFramingStyle,
  resolveDisplayedDraftCharacterLimit,
  resolveInlineDraftPreviewState,
  resolvePrimaryDraftRevealKey,
} from "./_features/draft-editor/chatDraftPreviewState";
import {
  AnimatedDraftText,
  InlineDraftPreviewCard,
} from "./_features/draft-editor/chatDraftPreviewCard";
import {
  getDraftGroundingLabel,
  getDraftGroundingToneClasses,
  summarizeGroundingSource,
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
import { AddAccountDialog } from "./_features/workspace-chrome/AddAccountDialog";
import { AccountMenuPanel } from "./_features/workspace-chrome/AccountMenuPanel";
import { ThreadDeleteDialog } from "./_features/workspace-chrome/ThreadDeleteDialog";
import { SourceMaterialsDialog } from "./_features/source-materials/SourceMaterialsDialog";
import { PreferencesDialog } from "./_features/preferences/PreferencesDialog";
import {
  buildEmptySourceMaterialDraft,
  buildSourceMaterialDraftFromAsset,
  deriveSourceMaterialTitle,
  hasAdvancedSourceMaterialDraftFields,
  normalizeSourceMaterialLookupValue,
  parseCommaSeparatedList,
  parseLineSeparatedList,
  sortSourceMaterials,
  type SourceMaterialAsset,
  type SourceMaterialDraftState,
  type SourceMaterialSeedOptions,
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

interface ProfileScrapeRefreshSuccess {
  ok: true;
  refreshed: boolean;
  reason:
  | "manual_refresh"
  | "new_posts_detected"
  | "fresh_enough"
  | "no_new_posts_detected"
  | "probe_failed"
  | "missing_onboarding_run";
  runId?: string;
  persistedAt?: string;
  cooldownUntil?: string | null;
  retryAfterSeconds?: number;
}

interface ProfileScrapeRefreshFailure {
  ok: false;
  code?: "COOLDOWN";
  errors: ValidationError[];
  cooldownUntil?: string | null;
  retryAfterSeconds?: number;
}

type ProfileScrapeRefreshResponse =
  | ProfileScrapeRefreshSuccess
  | ProfileScrapeRefreshFailure;

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

function buildHeroQuickActions(lowercase: boolean): Array<{ label: string; prompt: string }> {
  return BASE_HERO_QUICK_ACTIONS.map((action) => ({
    label: applyChipVoiceCase(action.label, lowercase),
    prompt: applyChipVoiceCase(action.prompt, lowercase),
  }));
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

function formatDurationCompact(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
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
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const chatThreadsRef = useRef(chatThreads);
  const threadTransitionOutTimeoutRef = useRef<number | null>(null);
  const threadTransitionInTimeoutRef = useRef<number | null>(null);
  const shouldJumpToBottomAfterThreadSwitchRef = useRef(false);
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
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (threadMenuRef.current && !threadMenuRef.current.contains(target)) {
        setMenuOpenThreadId(null);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }

      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setToolsMenuOpen(false);
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
      await fetchWorkspace(`/api/creator/v2/threads/${threadId}`, {
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
        window.history.pushState({}, "", buildWorkspaceChatHref(nextThreadId));
        setThreadTransitionPhase("in");

        threadTransitionInTimeoutRef.current = window.setTimeout(() => {
          setThreadTransitionPhase("idle");
        }, 280);
      }, 140);
    },
    [activeThreadId, buildWorkspaceChatHref, threadTransitionPhase],
  );

  // Guard against initializeThread re-fetching when we just created a thread in-session
  const threadCreatedInSessionRef = useRef(false);
  const threadScrollRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const growthGuideSelectedPlaybookRef = useRef<HTMLElement | null>(null);
  const missingOnboardingSetupAttemptedRef = useRef<Set<string>>(new Set());
  const sourceMaterialsBootstrapAttemptedRef = useRef<Set<string>>(new Set());

  const [context, setContext] = useState<CreatorAgentContext | null>(null);
  const [contract, setContract] = useState<CreatorGenerationContract | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageFeedbackPendingById, setMessageFeedbackPendingById] = useState<
    Record<string, boolean>
  >({});
  const [autoSavedSourceUndoPendingByMessageId, setAutoSavedSourceUndoPendingByMessageId] =
    useState<Record<string, boolean>>({});
  const [dismissedAutoSavedSourceByMessageId, setDismissedAutoSavedSourceByMessageId] =
    useState<Record<string, boolean>>({});
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
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

  const handleNewChat = useCallback(() => {
    if (!accountName) return;

    applyChatWorkspaceReset(buildChatWorkspaceReset("thread"));
    window.history.pushState({}, "", buildWorkspaceChatHref(null));
  }, [accountName, buildWorkspaceChatHref]);
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [pendingStatusPlan, setPendingStatusPlan] = useState<PendingStatusPlan | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [isAnalysisScrapeRefreshing, setIsAnalysisScrapeRefreshing] = useState(false);
  const [analysisScrapeNotice, setAnalysisScrapeNotice] = useState<string | null>(null);
  const [analysisScrapeNoticeTone, setAnalysisScrapeNoticeTone] = useState<
    "info" | "success" | "error"
  >("info");
  const [analysisScrapeCooldownUntil, setAnalysisScrapeCooldownUntil] = useState<string | null>(
    null,
  );
  const [analysisScrapeClockMs, setAnalysisScrapeClockMs] = useState<number>(() => Date.now());
  const dailyScrapeTriggerRef = useRef<string | null>(null);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [playbookModalOpen, setPlaybookModalOpen] = useState(false);
  const [sourceMaterialsOpen, setSourceMaterialsOpen] = useState(false);
  const [sourceMaterials, setSourceMaterials] = useState<SourceMaterialAsset[]>([]);
  const [isSourceMaterialsLoading, setIsSourceMaterialsLoading] = useState(false);
  const [isSourceMaterialsSaving, setIsSourceMaterialsSaving] = useState(false);
  const [sourceMaterialsNotice, setSourceMaterialsNotice] = useState<string | null>(null);
  const [sourceMaterialDraft, setSourceMaterialDraft] = useState<SourceMaterialDraftState>(
    () => buildEmptySourceMaterialDraft(),
  );
  const [sourceMaterialAdvancedOpen, setSourceMaterialAdvancedOpen] = useState(false);
  const [sourceMaterialsLibraryOpen, setSourceMaterialsLibraryOpen] = useState(false);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [editorDraftPosts, setEditorDraftPosts] = useState<string[]>([]);
  const [isDraftInspectorLoading, setIsDraftInspectorLoading] = useState(false);
  const [hasCopiedDraftEditorText, setHasCopiedDraftEditorText] = useState(false);
  const [copiedPreviewDraftMessageId, setCopiedPreviewDraftMessageId] = useState<string | null>(null);
  const [expandedPriorityIndex, setExpandedPriorityIndex] = useState<number | null>(null);
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

  function applyChatWorkspaceReset(
    reset: ChatWorkspaceReset<ChatToneInputs, ChatStrategyInputs>,
  ) {
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
  }
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
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktopMediaQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebarToViewport = (isDesktopViewport: boolean) => {
      setSidebarOpen(isDesktopViewport);
    };

    syncSidebarToViewport(desktopMediaQuery.matches);

    const handleViewportChange = (event: MediaQueryListEvent) => {
      syncSidebarToViewport(event.matches);
    };

    desktopMediaQuery.addEventListener("change", handleViewportChange);
    return () => {
      desktopMediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);
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
  const resetSourceMaterialDraft = useCallback(() => {
    setSourceMaterialDraft(buildEmptySourceMaterialDraft());
    setSourceMaterialAdvancedOpen(false);
    setSourceMaterialsLibraryOpen(false);
  }, []);
  const selectSourceMaterial = useCallback((asset: SourceMaterialAsset) => {
    const nextDraft = buildSourceMaterialDraftFromAsset(asset);
    setSourceMaterialDraft(nextDraft);
    setSourceMaterialAdvancedOpen(hasAdvancedSourceMaterialDraftFields(nextDraft));
    setSourceMaterialsLibraryOpen(true);
    setSourceMaterialsNotice(null);
  }, []);
  const loadSourceMaterials = useCallback(async (): Promise<SourceMaterialAsset[]> => {
    setIsSourceMaterialsLoading(true);

    try {
      const response = await fetchWorkspace("/api/creator/v2/source-materials");
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to load source materials."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to load source materials.");
      }
      if (!("assets" in result.data)) {
        throw new Error("Failed to load source materials.");
      }

      const nextAssets = sortSourceMaterials(result.data.assets);
      setSourceMaterials(nextAssets);
      setSourceMaterialDraft((current) => {
        if (current.id) {
          const activeAsset = nextAssets.find((asset) => asset.id === current.id);
          if (activeAsset) {
            return buildSourceMaterialDraftFromAsset(activeAsset);
          }

          return buildEmptySourceMaterialDraft();
        }

        return current;
      });
      return nextAssets;
    } catch (error) {
      setSourceMaterials([]);
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to load source materials.",
      );
      return [];
    } finally {
      setIsSourceMaterialsLoading(false);
    }
  }, [fetchWorkspace]);
  const openSourceMaterialEditor = useCallback(
    async (params: {
      assetId?: string | null;
      title?: string | null;
      fallbackNotice?: string;
    }) => {
      setSourceMaterialsOpen(true);
      setSourceMaterialsNotice(null);

      const normalizedTitle = normalizeSourceMaterialLookupValue(params.title);
      let assets = sourceMaterials;
      const needsRefresh =
        assets.length === 0 ||
        (params.assetId && !assets.some((asset) => asset.id === params.assetId)) ||
        (normalizedTitle &&
          !assets.some(
            (asset) => normalizeSourceMaterialLookupValue(asset.title) === normalizedTitle,
          ));

      if (needsRefresh) {
        assets = await loadSourceMaterials();
      }

      const matchedAsset =
        (params.assetId
          ? assets.find((asset) => asset.id === params.assetId)
          : null) ||
        (normalizedTitle
          ? assets.find(
            (asset) => normalizeSourceMaterialLookupValue(asset.title) === normalizedTitle,
          )
          : null);

      if (matchedAsset) {
        selectSourceMaterial(matchedAsset);
        return;
      }

      resetSourceMaterialDraft();
      setSourceMaterialsLibraryOpen(true);
      setSourceMaterialsNotice(
        params.fallbackNotice ||
          "Couldn't find that saved source, but you can review or add it here.",
      );
    },
    [loadSourceMaterials, resetSourceMaterialDraft, selectSourceMaterial, sourceMaterials],
  );
  const saveSourceMaterial = useCallback(async () => {
    const claims = parseLineSeparatedList(sourceMaterialDraft.claimsInput);
    const snippets = parseLineSeparatedList(sourceMaterialDraft.snippetsInput);
    if (claims.length === 0 && snippets.length === 0) {
      setSourceMaterialsNotice("Add one real story, lesson, or proof point first.");
      return;
    }

    const title = deriveSourceMaterialTitle(sourceMaterialDraft);

    setIsSourceMaterialsSaving(true);
    setSourceMaterialsNotice(null);

    try {
      const payload = {
        asset: {
          type: sourceMaterialDraft.type,
          title,
          verified: sourceMaterialDraft.verified,
          tags: parseCommaSeparatedList(sourceMaterialDraft.tagsInput),
          claims,
          snippets,
          doNotClaim: parseLineSeparatedList(sourceMaterialDraft.doNotClaimInput),
        },
      };
      const isEditing = Boolean(sourceMaterialDraft.id);
      const endpoint = isEditing
        ? `/api/creator/v2/source-materials/${sourceMaterialDraft.id}`
        : "/api/creator/v2/source-materials";
      const method = isEditing ? "PATCH" : "POST";
      const response = await fetchWorkspace(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to save source material."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to save source material.");
      }
      if (!("asset" in result.data) || !result.data.asset) {
        throw new Error("Failed to save source material.");
      }

      const savedAsset = result.data.asset;
      setSourceMaterials((current) =>
        sortSourceMaterials([
          savedAsset,
          ...current.filter((asset) => asset.id !== savedAsset.id),
        ]),
      );
      setSourceMaterialDraft(buildEmptySourceMaterialDraft());
      setSourceMaterialAdvancedOpen(false);
      setSourceMaterialsLibraryOpen(true);
      setSourceMaterialsNotice(
        isEditing ? "Updated. Xpo will reuse the latest version." : "Saved. Xpo can now reuse that without asking again.",
      );
    } catch (error) {
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to save source material.",
      );
    } finally {
      setIsSourceMaterialsSaving(false);
    }
  }, [fetchWorkspace, sourceMaterialDraft]);
  const seedSourceMaterials = useCallback(async (
    options: SourceMaterialSeedOptions = {},
  ): Promise<SourceMaterialAsset[]> => {
    setIsSourceMaterialsSaving(true);
    if (!options.silentIfEmpty) {
      setSourceMaterialsNotice(null);
    }

    try {
      const response = await fetchWorkspace("/api/creator/v2/source-materials/seed", {
        method: "POST",
      });
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to import source materials."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to import source materials.");
      }
      if (!("assets" in result.data)) {
        throw new Error("Failed to import source materials.");
      }

      await loadSourceMaterials();
      if (result.data.assets.length > 0) {
        setSourceMaterialsNotice(
          options.successNotice ??
            `Imported ${result.data.assets.length} source material${result.data.assets.length === 1 ? "" : "s"} from onboarding and grounded drafts.`,
        );
      } else if (!options.silentIfEmpty) {
        setSourceMaterialsNotice("No new source materials were found to import.");
      }
      return result.data.assets;
    } catch (error) {
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to import source materials.",
      );
      return [];
    } finally {
      setIsSourceMaterialsSaving(false);
    }
  }, [fetchWorkspace, loadSourceMaterials]);
  const deleteSourceMaterial = useCallback(async () => {
    if (!sourceMaterialDraft.id) {
      return;
    }

    const draftId = sourceMaterialDraft.id;
    const draftTitle = sourceMaterialDraft.title.trim() || "this source";
    if (!window.confirm(`Delete "${draftTitle}" from the source vault?`)) {
      return;
    }

    setIsSourceMaterialsSaving(true);
    setSourceMaterialsNotice(null);

    try {
      const response = await fetchWorkspace(`/api/creator/v2/source-materials/${draftId}`, {
        method: "DELETE",
      });
      const result: SourceMaterialsResponse = await response.json();
      if (!response.ok || !result.ok) {
        const fallbackMessage = result.ok
          ? "Failed to delete source material."
          : result.errors[0]?.message;
        throw new Error(fallbackMessage || "Failed to delete source material.");
      }
      if (!("deletedId" in result.data)) {
        throw new Error("Failed to delete source material.");
      }

      setSourceMaterials((current) => {
        const nextAssets = current.filter((asset) => asset.id !== draftId);
        setSourceMaterialDraft(buildEmptySourceMaterialDraft());
        setSourceMaterialAdvancedOpen(false);
        return nextAssets;
      });
      setSourceMaterialsNotice("Source material deleted.");
    } catch (error) {
      setSourceMaterialsNotice(
        error instanceof Error ? error.message : "Failed to delete source material.",
      );
    } finally {
      setIsSourceMaterialsSaving(false);
    }
  }, [fetchWorkspace, sourceMaterialDraft.id, sourceMaterialDraft.title]);
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

        setSourceMaterials((current) => {
          const nextAssets = current.filter((asset) => !deletedIds.includes(asset.id));
          setSourceMaterialDraft((draft) => {
            if (!draft.id || !deletedIds.includes(draft.id)) {
              return draft;
            }

            return nextAssets[0]
              ? buildSourceMaterialDraftFromAsset(nextAssets[0])
              : buildEmptySourceMaterialDraft();
          });
          return nextAssets;
        });
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
    [fetchWorkspace, trackProductEvent],
  );
  useEffect(() => {
    if (!sourceMaterialsOpen) {
      return;
    }

    let cancelled = false;

    async function bootstrapSourceMaterials() {
      const existingAssets = await loadSourceMaterials();
      if (cancelled || existingAssets.length > 0) {
        return;
      }

      const bootstrapKey = sourceMaterialsBootstrapKey;
      let alreadyAttempted = sourceMaterialsBootstrapAttemptedRef.current.has(bootstrapKey);
      if (!alreadyAttempted) {
        try {
          alreadyAttempted = window.localStorage.getItem(bootstrapKey) === "1";
        } catch {
          alreadyAttempted = false;
        }
      }

      if (alreadyAttempted) {
        return;
      }

      sourceMaterialsBootstrapAttemptedRef.current.add(bootstrapKey);
      try {
        window.localStorage.setItem(bootstrapKey, "1");
      } catch {
        // Ignore storage failures and keep the in-memory guard.
      }

      const importedAssets = await seedSourceMaterials({
        silentIfEmpty: true,
        successNotice: "Pulled in a few stories from onboarding and grounded drafts to get you started.",
      });

      if (cancelled || importedAssets.length === 0) {
        return;
      }
    }

    void bootstrapSourceMaterials();
    return () => {
      cancelled = true;
    };
  }, [loadSourceMaterials, seedSourceMaterials, sourceMaterialsBootstrapKey, sourceMaterialsOpen]);
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
      buildDraftCharacterCounterMeta(
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
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
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

    fetchWorkspace("/api/creator/v2/preferences")
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
  }, [accountName, applyPersistedPreferences, fetchWorkspace]);

  const savePreferences = useCallback(async () => {
    setIsPreferencesSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetchWorkspace("/api/creator/v2/preferences", {
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
  }, [applyPersistedPreferences, currentPreferencePayload, fetchWorkspace]);

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
      window.location.href = buildChatWorkspaceUrl({ xHandle: normalizedHandle });
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

  const analysisScrapeCooldownRemainingMs = useMemo(() => {
    if (!analysisScrapeCooldownUntil) {
      return 0;
    }

    const cooldownUntilMs = new Date(analysisScrapeCooldownUntil).getTime();
    if (!Number.isFinite(cooldownUntilMs)) {
      return 0;
    }

    return Math.max(0, cooldownUntilMs - analysisScrapeClockMs);
  }, [analysisScrapeClockMs, analysisScrapeCooldownUntil]);

  const isAnalysisScrapeCoolingDown = analysisScrapeCooldownRemainingMs > 0;
  const analysisScrapeCooldownLabel = useMemo(
    () => formatDurationCompact(analysisScrapeCooldownRemainingMs),
    [analysisScrapeCooldownRemainingMs],
  );

  const runProfileScrapeRefresh = useCallback(
    async (
      trigger: "manual" | "daily_login",
    ): Promise<
      | { ok: true; data: ProfileScrapeRefreshSuccess }
      | { ok: false; data: ProfileScrapeRefreshFailure | null }
    > => {
      try {
        const response = await fetchWorkspace("/api/creator/profile/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trigger }),
        });

        let data: ProfileScrapeRefreshResponse | null = null;
        try {
          data = (await response.json()) as ProfileScrapeRefreshResponse;
        } catch {
          data = null;
        }

        if (data && "cooldownUntil" in data) {
          setAnalysisScrapeCooldownUntil(data.cooldownUntil ?? null);
          setAnalysisScrapeClockMs(Date.now());
        }

        if (!response.ok || !data || !data.ok) {
          return { ok: false, data: data && !data.ok ? data : null };
        }

        if (data.refreshed) {
          await loadWorkspace();
        }

        return { ok: true, data };
      } catch {
        return { ok: false, data: null };
      }
    },
    [fetchWorkspace, loadWorkspace],
  );

  const handleManualProfileScrapeRefresh = useCallback(async () => {
    if (isAnalysisScrapeRefreshing || isAnalysisScrapeCoolingDown) {
      return;
    }

    setIsAnalysisScrapeRefreshing(true);
    setAnalysisScrapeNoticeTone("info");
    setAnalysisScrapeNotice("running a fresh scrape...");

    try {
      const result = await runProfileScrapeRefresh("manual");
      if (!result.ok) {
        if (result.data?.code === "COOLDOWN") {
          const retryLabel = result.data.retryAfterSeconds
            ? formatDurationCompact(result.data.retryAfterSeconds * 1000)
            : analysisScrapeCooldownLabel;
          setAnalysisScrapeNoticeTone("info");
          setAnalysisScrapeNotice(
            retryLabel
              ? `scrape cooldown active. try again in ${retryLabel}.`
              : "scrape cooldown active. try again shortly.",
          );
          return;
        }

        const message = result.data?.errors[0]?.message ?? "failed to rerun scrape.";
        setAnalysisScrapeNoticeTone("error");
        setAnalysisScrapeNotice(message.toLowerCase());
        return;
      }

      if (result.data.refreshed) {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice("fresh scrape completed. profile analysis updated.");
        return;
      }

      if (result.data.reason === "missing_onboarding_run") {
        setAnalysisScrapeNoticeTone("error");
        setAnalysisScrapeNotice("this account still needs setup. run onboarding once, then try again.");
        return;
      }

      setAnalysisScrapeNoticeTone("info");
      setAnalysisScrapeNotice("scrape check completed. no profile changes detected.");
    } finally {
      setIsAnalysisScrapeRefreshing(false);
    }
  }, [
    analysisScrapeCooldownLabel,
    isAnalysisScrapeCoolingDown,
    isAnalysisScrapeRefreshing,
    runProfileScrapeRefresh,
  ]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!analysisScrapeCooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => {
      setAnalysisScrapeClockMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [analysisScrapeCooldownUntil]);

  useEffect(() => {
    if (!analysisScrapeCooldownUntil) {
      return;
    }

    if (analysisScrapeCooldownRemainingMs <= 0) {
      setAnalysisScrapeCooldownUntil(null);
    }
  }, [analysisScrapeCooldownRemainingMs, analysisScrapeCooldownUntil]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    const normalized = normalizeAccountHandle(accountName);
    if (!normalized || dailyScrapeTriggerRef.current === normalized) {
      return;
    }

    dailyScrapeTriggerRef.current = normalized;
    void (async () => {
      const result = await runProfileScrapeRefresh("daily_login");
      if (!result.ok) {
        return;
      }

      if (result.data.refreshed) {
        setAnalysisScrapeNoticeTone("success");
        setAnalysisScrapeNotice("new posts detected and synced in the background.");
        return;
      }

      if (result.data.reason === "probe_failed") {
        setAnalysisScrapeNoticeTone("info");
        setAnalysisScrapeNotice("background freshness check was skipped for this login.");
      }
    })();
  }, [accountName, runProfileScrapeRefresh]);

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
    return buildRecommendedPlaybooks(context, 3);
  }, [context]);
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
  const analysisPositioningIsTentative = useMemo(() => {
    if (!context) {
      return false;
    }

    return (
      context.growthStrategySnapshot.confidence.positioning < 65 ||
      context.growthStrategySnapshot.ambiguities.length > 0
    );
  }, [context]);
  const analysisLearningStrengths = useMemo(() => {
    if (!context) {
      return [] as string[];
    }

    return Array.from(
      new Set([
        ...(context.replyInsights?.bestSignals || []),
        ...(context.contentInsights?.bestSignals || []),
        ...(context.strategyAdjustments?.reinforce || []),
        ...(context.contentAdjustments?.reinforce || []),
      ]),
    ).slice(0, 5);
  }, [context]);
  const analysisLearningCautions = useMemo(() => {
    if (!context) {
      return [] as string[];
    }

    return Array.from(
      new Set([
        ...(context.replyInsights?.cautionSignals || []),
        ...(context.contentInsights?.cautionSignals || []),
        ...(context.strategyAdjustments?.deprioritize || []),
        ...(context.contentAdjustments?.deprioritize || []),
      ]),
    ).slice(0, 6);
  }, [context]);
  const analysisLearningExperiments = useMemo(() => {
    if (!context) {
      return [] as string[];
    }

    return Array.from(
      new Set([
        ...(context.strategyAdjustments?.experiments || []),
        ...(context.contentAdjustments?.experiments || []),
      ]),
    ).slice(0, 5);
  }, [context]);
  const analysisReplyConversionHighlights = useMemo(() => {
    if (!context?.replyInsights) {
      return [] as Array<{ label: string; value: string }>;
    }

    const topAnchor = context.replyInsights.topIntentAnchors?.[0];
    const topIntent = context.replyInsights.topIntentLabels?.[0];
    const fullyAttributed =
      context.replyInsights.intentAttribution?.fullyAttributedOutcomeCount || 0;

    const raw = [
      topAnchor?.label ? { label: "Top anchor", value: topAnchor.label } : null,
      topIntent?.label ? { label: "Top intent", value: topIntent.label } : null,
      topAnchor && (topAnchor.totalProfileClicks || 0) > 0
        ? {
            label: "Profile clicks",
            value: `${topAnchor.totalProfileClicks} via ${topAnchor.label}`,
          }
        : null,
      topIntent && (topIntent.totalFollowerDelta || 0) > 0
        ? {
            label: "Follower delta",
            value: `${topIntent.totalFollowerDelta} via ${topIntent.label}`,
          }
        : null,
      fullyAttributed > 0
        ? { label: "Attributed outcomes", value: `${fullyAttributed} end to end` }
        : null,
    ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

    return Array.from(
      new Map(raw.map((entry) => [`${entry.label}:${entry.value}`, entry])).values(),
    ).slice(0, 4);
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
  const selectedDraftReplyPlan = selectedDraftArtifact?.replyPlan ?? [];
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
        window.requestAnimationFrame(() => {
          messageRefs.current[navigation.scrollToMessageId!]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
        window.setTimeout(() => {
          setActiveDraftEditor(navigation.targetSelection);
        }, DRAFT_TIMELINE_FOCUS_DELAY_MS);
        return;
      }

      setActiveDraftEditor(navigation.targetSelection);
    },
    [activeDraftEditor, selectedDraftTimeline, selectedDraftTimelineIndex],
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
      startTransition(() => {
        setShowScrollToLatest(distanceFromBottom > 140);
      });
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
        setSourceMaterials((current) =>
          sortSourceMaterials([
            ...data.data.promotedSourceMaterials!.assets,
            ...current.filter(
              (asset) =>
                !data.data.promotedSourceMaterials!.assets.some(
                  (promoted) => promoted.id === asset.id,
                ),
            ),
          ]),
        );
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
    fetchWorkspace,
    isSending,
    messages.length,
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
  const threadCanvasTransitionClassName = `transition-[filter,opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[filter,opacity,transform] ${threadTransitionPhase === "out"
    ? "opacity-25 blur-[10px] scale-[0.995]"
    : "opacity-100 blur-0 scale-100"
    }`;
  const threadContentTransitionClassName = `transition-[opacity,filter,transform] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,filter,transform] ${isThreadHydrating ? "opacity-0 blur-[7px] translate-y-1" : "opacity-100 blur-0 translate-y-0"
    }`;
  const draftEditorIdentity = {
    avatarUrl: context?.avatarUrl ?? null,
    displayName:
      context?.creatorProfile.identity.displayName ??
      context?.creatorProfile.identity.username ??
      accountName ??
      "You",
    username: context?.creatorProfile.identity.username ?? accountName ?? "x",
    profilePhotoLabel: `${heroIdentityLabel} profile photo`,
    initials: heroInitials,
  };
  const renderDraftQueueModal = () => (
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
  );

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
          className={`fixed inset-y-0 left-0 z-30 flex min-h-0 shrink-0 flex-col overflow-hidden bg-zinc-950 md:sticky md:top-0 md:bg-white/[0.02] [&_button:not(:disabled)]:cursor-pointer [&_[role=button]]:cursor-pointer transition-[width,transform] duration-300 ${sidebarOpen
            ? "w-[18.5rem] border-r border-white/10"
            : "w-[18.5rem] -translate-x-full border-r border-white/10 md:w-0 md:translate-x-0 md:border-r-0 md:bg-transparent"
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
                                    className={`ml-auto flex h-6 w-6 items-center justify-center rounded p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white ${hoveredThreadId === item.id || menuOpenThreadId === item.id
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
                className={`flex w-full items-center justify-between rounded-xl p-2 transition ${accountMenuOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
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
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-all duration-300 ${accountMenuOpen ? "rotate-0 text-zinc-300" : "rotate-180"
                    }`}
                />
              </button>

              <AccountMenuPanel
                className="absolute bottom-full left-2 right-2 z-20 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
                accountMenuVisible={accountMenuVisible}
                accountMenuOpen={accountMenuOpen}
                availableHandles={availableHandles}
                accountName={accountName}
                canAddAccount={canAddAccount}
                onSwitchActiveHandle={switchActiveHandle}
                onOpenAddAccount={() => {
                  setAccountMenuOpen(false);
                  setIsAddAccountModalOpen(true);
                  setAddAccountError(null);
                  setReadyAccountHandle(null);
                }}
                onOpenSettings={() => {
                  setAccountMenuOpen(false);
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
                  setAccountMenuOpen(false);
                }}
              />
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
                className={`flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white text-sm font-bold text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition-all duration-300 hover:opacity-85 ${accountMenuOpen ? "scale-[1.04] ring-2 ring-white/30" : "scale-100 ring-0"
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
              <AccountMenuPanel
                className="absolute bottom-full left-0 z-20 w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
                accountMenuVisible={accountMenuVisible}
                accountMenuOpen={accountMenuOpen}
                availableHandles={availableHandles}
                accountName={accountName}
                canAddAccount={canAddAccount}
                onSwitchActiveHandle={switchActiveHandle}
                onOpenAddAccount={() => {
                  setAccountMenuOpen(false);
                  setIsAddAccountModalOpen(true);
                  setAddAccountError(null);
                  setReadyAccountHandle(null);
                }}
                onOpenSettings={() => {
                  setAccountMenuOpen(false);
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
                  setAccountMenuOpen(false);
                }}
              />
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
                <div ref={toolsMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setToolsMenuOpen((current) => !current)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                      toolsMenuOpen
                        ? "border-white/20 bg-white/[0.06] text-white"
                        : "border-white/10 text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Tools</span>
                  </button>
                  {toolsMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.65rem)] z-30 w-56 rounded-3xl border border-white/10 bg-[#101010] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                      {[
                        {
                          label: "Saved context",
                          onClick: () => {
                            resetSourceMaterialDraft();
                            setSourceMaterialsNotice(null);
                            setSourceMaterialsOpen(true);
                          },
                        },
                        {
                          label: "Draft review",
                          onClick: () => {
                            setDraftQueueError(null);
                            setDraftQueueOpen(true);
                          },
                        },
                        {
                          label: "Profile breakdown",
                          onClick: () => setAnalysisOpen(true),
                        },
                        {
                          label: "Growth guide",
                          onClick: () => {
                            setPlaybookStage(inferCurrentPlaybookStage(context));
                            setPendingGrowthGuidePlaybookId(null);
                            setPlaybookModalOpen(true);
                          },
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            item.onClick();
                          }}
                          className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                        >
                          <span>{item.label}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
              {(isLoading || isWorkspaceInitializing) && !context && !contract ? (
                <div className="flex min-h-[34vh] flex-col items-center justify-center gap-4 text-center">
                  <div className="relative h-11 w-11">
                    <span className="absolute inset-0 rounded-full border border-white/10" />
                    <span className="absolute inset-1 rounded-full border border-white/20 border-t-white animate-spin" />
                    <span className="absolute inset-3 rounded-full bg-white/20 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium tracking-[0.08em] text-zinc-200">
                      Setting things up...
                    </p>
                    <p className="text-xs text-zinc-500">
                      We&apos;re preparing your workspace.
                    </p>
                  </div>
                </div>
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
                            className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${billingWarningLevel === "critical"
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
                            onRegisterRef={(messageId, node) => {
                              messageRefs.current[messageId] = node;
                            }}
                          >
                          {message.role === "assistant" && message.isStreaming ? (
                            <AssistantTypingBubble label={message.content || null} />
                          ) : (
                            message.role === "assistant" &&
                            message.id === latestAssistantMessageId &&
                            (typedAssistantLengths[message.id] ?? 0) < message.content.length ? (
                              getChatRenderMode("assistant_streaming_preview") === "markdown" ? (
                                <div className={assistantMarkdownClassName}>
                                  <div
                                    dangerouslySetInnerHTML={{
                                      __html: renderStreamingMarkdownToHtml(
                                        message.content,
                                        typedAssistantLengths[message.id] ?? 0,
                                      ),
                                    }}
                                  />
                                  <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-zinc-400 align-[-0.2em]" />
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap">
                                  {message.content.slice(
                                    0,
                                    typedAssistantLengths[message.id] ?? 0,
                                  )}
                                  <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-zinc-400 align-[-0.2em]" />
                                </p>
                              )
                            ) : message.role === "assistant" ? (
                              getChatRenderMode("assistant_message") === "markdown" ? (
                                <div
                                  className={assistantMarkdownClassName}
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdownToHtml(message.content),
                                  }}
                                />
                              ) : (
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              )
                            ) : (
                              <p className="whitespace-pre-wrap">{message.content}</p>
                            )
                          )}

                          {message.role === "assistant" &&
                            message.autoSavedSourceMaterials?.count ? (
                            <div
                              className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
                                dismissedAutoSavedSourceByMessageId[message.id]
                                  ? "border-zinc-700 bg-zinc-900/70 text-zinc-400"
                                  : "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200/90"
                              }`}
                            >
                              <Lightbulb className="h-3.5 w-3.5" />
                              <span>
                                {dismissedAutoSavedSourceByMessageId[message.id]
                                  ? "Won't reuse that source."
                                  : `Saved to memory${
                                      message.autoSavedSourceMaterials.assets[0]?.title
                                        ? `: ${message.autoSavedSourceMaterials.assets[0].title}`
                                        : "."
                                    }`}
                              </span>
                              {!dismissedAutoSavedSourceByMessageId[message.id] &&
                              message.autoSavedSourceMaterials.assets[0] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void openSourceMaterialEditor({
                                      assetId: message.autoSavedSourceMaterials!.assets[0].id,
                                      title: message.autoSavedSourceMaterials!.assets[0].title,
                                    });
                                  }}
                                  className="inline-flex items-center rounded-full border border-emerald-400/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-100 transition hover:border-emerald-300/40 hover:text-white"
                                >
                                  Review
                                </button>
                              ) : null}
                              {!dismissedAutoSavedSourceByMessageId[message.id] &&
                              message.autoSavedSourceMaterials.assets.some(
                                (asset) => asset.deletable,
                              ) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void undoAutoSavedSourceMaterials(
                                      message.id,
                                      message.autoSavedSourceMaterials!,
                                    );
                                  }}
                                  disabled={Boolean(
                                    autoSavedSourceUndoPendingByMessageId[message.id],
                                  )}
                                  className="inline-flex items-center rounded-full border border-emerald-400/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-100 transition hover:border-emerald-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {autoSavedSourceUndoPendingByMessageId[message.id]
                                    ? "Removing..."
                                    : "Undo"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            message.promotedSourceMaterials?.count ? (
                            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/[0.06] px-3 py-1 text-[11px] text-sky-200/90">
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>
                                Added to saved context
                                {message.promotedSourceMaterials.assets[0]?.title
                                  ? `: ${message.promotedSourceMaterials.assets[0].title}`
                                  : "."}
                              </span>
                              {message.promotedSourceMaterials.assets[0] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void openSourceMaterialEditor({
                                      assetId: message.promotedSourceMaterials!.assets[0].id,
                                      title: message.promotedSourceMaterials!.assets[0].title,
                                    });
                                  }}
                                  className="inline-flex items-center rounded-full border border-sky-400/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-sky-100 transition hover:border-sky-300/40 hover:text-white"
                                >
                                  Review
                                </button>
                              ) : null}
                            </div>
                          ) : null}

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
                                className={`inline-flex items-center rounded-full p-1.5 transition ${message.feedbackValue === "up"
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
                                className={`inline-flex items-center rounded-full p-1.5 transition ${message.feedbackValue === "down"
                                  ? "bg-rose-300/10 text-rose-300"
                                  : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                                  } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            shouldShowQuickRepliesForMessage(message) &&
                            index === messages.length - 1 &&
                            !(
                              message.outputShape === "ideation_angles" &&
                              message.angles?.length
                            ) ? (
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                              {message.quickReplies?.map((quickReply) => (
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
                            shouldShowOptionArtifactsForMessage(message) &&
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

                                const selectedAngleFormatHint: SelectedAngleFormatHint =
                                  /\bthread directions\b/i.test(message.content) ? "thread" : "post";

                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleAngleSelect(title, selectedAngleFormatHint);
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
                            shouldShowQuickRepliesForMessage(message) &&
                            index === messages.length - 1 ? (
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                              {message.quickReplies?.map((quickReply) => (
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
                            message.replyArtifacts?.kind === "reply_options" ? (
                            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                  Source Post
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                                  {message.replyArtifacts.sourceText}
                                </p>
                                {message.replyArtifacts.authorHandle || message.replyArtifacts.sourceUrl ? (
                                  <p className="mt-2 text-xs text-zinc-400">
                                    {message.replyArtifacts.authorHandle
                                      ? `@${message.replyArtifacts.authorHandle}`
                                      : message.replyArtifacts.sourceUrl}
                                  </p>
                                ) : null}
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                {message.replyArtifacts.options.map((option, optionIndex) => (
                                  <button
                                    key={`${message.id}-reply-option-${option.id}`}
                                    type="button"
                                    onClick={() => {
                                      void handleReplyOptionSelect(optionIndex);
                                    }}
                                    disabled={isMainChatLocked || !activeStrategyInputs || !activeToneInputs}
                                    className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                      Option {optionIndex + 1}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-white">
                                      {option.label.replace(/_/g, " ")}
                                    </p>
                                    {option.intent?.anchor ? (
                                      <p className="mt-2 text-xs leading-5 text-emerald-200/80">
                                        {option.intent.anchor}
                                      </p>
                                    ) : null}
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                                      {option.text}
                                    </p>
                                  </button>
                                ))}
                              </div>
                              {message.replyArtifacts.groundingNotes?.length ? (
                                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    Grounding Notes
                                  </p>
                                  <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
                                    {message.replyArtifacts.groundingNotes.map((note, noteIndex) => (
                                      <li key={`${message.id}-reply-grounding-${noteIndex}`}>{note}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            message.replyArtifacts?.kind === "reply_draft" ? (
                            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                  Reply Drafts
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                                  {message.replyArtifacts.sourceText}
                                </p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                {message.replyArtifacts.options.map((option) => (
                                  <div
                                    key={`${message.id}-reply-draft-${option.id}`}
                                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                          Variant
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-white">
                                          {option.label}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void navigator.clipboard.writeText(option.text);
                                        }}
                                        className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                    {option.intent?.anchor ? (
                                      <p className="mt-2 text-xs leading-5 text-emerald-200/80">
                                        {option.intent.anchor}
                                      </p>
                                    ) : null}
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                                      {option.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {message.replyArtifacts.notes?.length ? (
                                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    Notes
                                  </p>
                                  <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-300">
                                    {message.replyArtifacts.notes.map((note, noteIndex) => (
                                      <li key={`${message.id}-reply-note-${noteIndex}`}>{note}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            shouldShowDraftOutputForMessage(message) &&
                            message.outputShape !== "coach_question" &&
                            message.draftBundle?.options?.length &&
                            message.draftBundle.options.length < 4 ? (
                            <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2">
                              {message.draftBundle.options.map((option, optionIndex) => {
                                const isSelected =
                                  option.id === message.draftBundle?.selectedOptionId ||
                                  option.versionId === message.activeDraftVersionId;
                                const preview =
                                  option.content.length > 220
                                    ? `${option.content.slice(0, 217).trimEnd()}...`
                                    : option.content;
                                const draftRevealKey = buildDraftBundleRevealKey(option.id);

                                return (
                                  <button
                                    key={`${message.id}-bundle-${option.id}`}
                                    type="button"
                                    onClick={() => {
                                      setMessages((current) =>
                                        current.map((entry) =>
                                          entry.id === message.id
                                            ? {
                                                ...entry,
                                                activeDraftVersionId: option.versionId,
                                                draftBundle: entry.draftBundle
                                                  ? {
                                                      ...entry.draftBundle,
                                                      selectedOptionId: option.id,
                                                    }
                                                  : entry.draftBundle,
                                              }
                                            : entry,
                                        ),
                                      );
                                      openDraftEditor(message.id, option.versionId);
                                    }}
                                    className={`rounded-3xl border p-4 text-left transition ${
                                      isSelected
                                        ? "border-white/20 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                                        : "border-white/10 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]"
                                    } ${buildDraftRevealClasses(draftRevealKey)}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                          Option {optionIndex + 1}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-white">
                                          {option.label}
                                        </p>
                                      </div>
                                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                                        {option.artifact.weightedCharacterCount}/
                                        {option.artifact.maxCharacterLimit}
                                      </span>
                                    </div>
                                    <AnimatedDraftText
                                      text={preview}
                                      className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300"
                                      animate={shouldAnimateDraftLines(draftRevealKey)}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            shouldShowDraftOutputForMessage(message) &&
                            message.outputShape !== "coach_question" &&
                            message.outputShape !== "short_form_post" &&
                            message.outputShape !== "long_form_post" &&
                            message.outputShape !== "thread_seed" &&
                            message.draftArtifacts?.length ? (
                            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                              {message.draftArtifacts.map((artifact, index) => {
                                const artifactVersionId =
                                  normalizeDraftVersionBundle(
                                    message,
                                    composerCharacterLimit,
                                  )?.versions[index]?.id;
                                const draftRevealKey = buildDraftArtifactRevealKey(
                                  artifact.id,
                                );

                                return (
                                  <div
                                    key={`${message.id}-draft-artifact-${artifact.id}`}
                                    className={`rounded-2xl border border-white/10 bg-black/20 px-3 py-3 ${buildDraftRevealClasses(
                                      draftRevealKey,
                                    )}`}
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
                                    <AnimatedDraftText
                                      text={artifact.content}
                                      className="mt-3 whitespace-pre-wrap leading-7 text-zinc-100"
                                      animate={shouldAnimateDraftLines(draftRevealKey)}
                                    />
                                    {artifact.groundingExplanation ||
                                    artifact.groundingSources?.length ? (() => {
                                      const groundingTone = getDraftGroundingToneClasses(artifact);
                                      const groundingLabel =
                                        getDraftGroundingLabel(artifact) || "Grounding";

                                      return (
                                        <div className={`mt-3 rounded-2xl border px-3 py-3 ${groundingTone.container}`}>
                                          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${groundingTone.label}`}>
                                            {groundingLabel}
                                          </p>
                                          {artifact.groundingExplanation ? (
                                            <p className="mt-2 text-xs leading-6 text-zinc-200">
                                              {artifact.groundingExplanation}
                                            </p>
                                          ) : null}
                                          {artifact.groundingSources?.length ? (
                                            <ul className="mt-2 space-y-1.5 text-xs leading-6 text-zinc-200">
                                              {artifact.groundingSources.slice(0, 2).map((source, sourceIndex) => (
                                                <li key={`${artifact.id}-grounding-${sourceIndex}`}>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      void openSourceMaterialEditor({
                                                        title: source.title,
                                                      });
                                                    }}
                                                    className="font-semibold text-emerald-200 transition hover:text-white"
                                                  >
                                                    {source.title}
                                                  </button>
                                                  {summarizeGroundingSource(source)
                                                    ? ` · ${summarizeGroundingSource(source)}`
                                                    : ""}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : null}
                                        </div>
                                      );
                                    })() : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            shouldShowDraftOutputForMessage(message) &&
                            message.outputShape !== "coach_question" &&
                            message.draftBundle?.options?.length &&
                            message.draftBundle.options.length >= 4 ? (
                            <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                              {message.draftBundle.options.map((option) => {
                                const username =
                                  context?.creatorProfile?.identity?.username || "user";
                                const displayName =
                                  context?.creatorProfile?.identity?.displayName || username;
                                const avatarUrl = context?.avatarUrl || null;
                                const draftCounter = buildDraftCharacterCounterMeta(
                                  option.content,
                                  resolveDisplayedDraftCharacterLimit(
                                    option.artifact.maxCharacterLimit,
                                    composerCharacterLimit,
                                  ),
                                );
                                const isFocusedDraftPreview =
                                  selectedDraftMessageId === message.id &&
                                  selectedDraftVersionId === option.versionId;
                                const draftRevealKey = buildDraftBundleRevealKey(option.id);

                                return (
                                  <div
                                    key={`${message.id}-inline-draft-${option.id}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openDraftEditor(message.id, option.versionId)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        openDraftEditor(message.id, option.versionId);
                                      }
                                    }}
                                    className={`cursor-pointer rounded-2xl bg-[#000000] p-4 transition-[border-color,box-shadow,background-color] duration-300 ${
                                      isFocusedDraftPreview
                                        ? "border border-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_34px_rgba(255,255,255,0.16)]"
                                        : "border border-white/[0.08] hover:border-white/15 hover:bg-[#0F0F0F]"
                                    } ${buildDraftRevealClasses(draftRevealKey)}`}
                                    aria-current={isFocusedDraftPreview ? "true" : undefined}
                                  >
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
                                            <span className="truncate text-sm font-bold text-white">
                                              {displayName}
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
                                          <span className="text-xs text-zinc-500">@{username}</span>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDraftEditor(message.id, option.versionId);
                                        }}
                                        className="rounded-full p-2 text-zinc-500"
                                        aria-label="Edit draft"
                                      >
                                        <Edit3 className="h-4 w-4" />
                                      </button>
                                    </div>

                                    <div className="mt-3">
                                      <AnimatedDraftText
                                        text={option.content}
                                        className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100"
                                        animate={shouldAnimateDraftLines(draftRevealKey)}
                                      />
                                    </div>

                                    <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
                                      <span>Just now</span>
                                      <span>·</span>
                                      <span className={draftCounter.toneClassName}>
                                        {draftCounter.label}
                                      </span>
                                    </div>

                                    <div className="mt-3 border-t border-white/[0.06]" />

                                    <div className="mt-2 flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void copyPreviewDraft(option.versionId, option.content);
                                        }}
                                        className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                                        aria-label="Copy draft"
                                      >
                                        {copiedPreviewDraftMessageId === option.versionId ? (
                                          <Check className="h-4 w-4" />
                                        ) : (
                                          <Copy className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                            shouldShowDraftOutputForMessage(message) &&
                            message.outputShape !== "coach_question" &&
                            !(message.draftBundle?.options?.length && message.draftBundle.options.length >= 4) &&
                            (message.draft ||
                              message.draftArtifacts?.length ||
                              message.draftVersions?.length) ? (() => {
                              const username = context?.creatorProfile?.identity?.username || "user";
                              const displayName = context?.creatorProfile?.identity?.displayName || username;
                              const avatarUrl = context?.avatarUrl || null;
                              const previewState = resolveInlineDraftPreviewState({
                                message,
                                composerCharacterLimit,
                                isVerifiedAccount,
                                selectedThreadPreviewPostIndex:
                                  selectedThreadPostByMessageId[message.id],
                                expandedInlineThreadPreviewId,
                                selectedDraftMessageId,
                              });
                              const previewRevealKey = previewState.previewRevealKey;
                              return (
                                <InlineDraftPreviewCard
                                  identity={{
                                    username,
                                    displayName,
                                    avatarUrl,
                                  }}
                                  previewState={previewState}
                                  isVerifiedAccount={isVerifiedAccount}
                                  isMainChatLocked={isMainChatLocked}
                                  hasCopiedDraft={copiedPreviewDraftMessageId === message.id}
                                  revealClassName={buildDraftRevealClasses(previewRevealKey)}
                                  shouldAnimateLines={shouldAnimateDraftLines(
                                    previewRevealKey,
                                  )}
                                  onOpenDraftEditor={(threadPostIndex) =>
                                    openDraftEditor(
                                      message.id,
                                      undefined,
                                      threadPostIndex,
                                    )}
                                  onRequestRevision={(
                                    prompt,
                                    threadFramingStyleOverride,
                                  ) => {
                                    void requestDraftCardRevision(
                                      message.id,
                                      prompt,
                                      threadFramingStyleOverride,
                                    );
                                  }}
                                  onToggleExpanded={() =>
                                    setExpandedInlineThreadPreviewId((current) =>
                                      current === message.id ? null : message.id,
                                    )}
                                  onCopy={() => {
                                    void copyPreviewDraft(
                                      message.id,
                                      previewState.previewDraft,
                                    );
                                  }}
                                  onShare={() => {
                                    shareDraftEditorToX();
                                  }}
                                />
                              );
                            })() : null}

                          {message.role === "assistant" &&
                            shouldShowDraftOutputForMessage(message) &&
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

      {renderDraftQueueModal()}
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
                    Coming soon!
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">
                    Companion App is in progress and will be available soon.
                  </p>
                </div>

                <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-zinc-300">
                  Coming soon!
                </span>
              </div>
            </div>
          </div>
        ) : null
      }

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
          setSourceMaterialsNotice(null);
        }}
        onApplyClaimExample={(example) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            claimsInput: example,
          }));
        }}
        onDraftTitleChange={(value) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            title: value,
          }));
        }}
        onDraftTypeChange={(type) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            type,
          }));
        }}
        onToggleDraftVerified={() => {
          setSourceMaterialDraft((current) => ({
            ...current,
            verified: !current.verified,
          }));
        }}
        onDraftClaimsChange={(value) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            claimsInput: value,
          }));
        }}
        sourceMaterialAdvancedOpen={sourceMaterialAdvancedOpen}
        onToggleSourceMaterialAdvancedOpen={() => {
          setSourceMaterialAdvancedOpen((current) => !current);
        }}
        onDraftTagsChange={(value) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            tagsInput: value,
          }));
        }}
        onDraftSnippetsChange={(value) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            snippetsInput: value,
          }));
        }}
        onDraftDoNotClaimChange={(value) => {
          setSourceMaterialDraft((current) => ({
            ...current,
            doNotClaimInput: value,
          }));
        }}
        onDeleteSourceMaterial={() => {
          void deleteSourceMaterial();
        }}
        onSaveSourceMaterial={() => {
          void saveSourceMaterial();
        }}
        sourceMaterialsLibraryOpen={sourceMaterialsLibraryOpen}
        onToggleSourceMaterialsLibraryOpen={() => {
          setSourceMaterialsLibraryOpen((current) => !current);
        }}
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
          onTogglePreferenceUseEmojis={() => {
            setPreferenceUseEmojis((current) => !current);
          }}
          preferenceAllowProfanity={preferenceAllowProfanity}
          onTogglePreferenceAllowProfanity={() => {
            setPreferenceAllowProfanity((current) => !current);
          }}
          preferenceBlacklistInput={preferenceBlacklistInput}
          onPreferenceBlacklistInputChange={handlePreferenceBlacklistInputChange}
          onPreferenceBlacklistInputKeyDown={handlePreferenceBlacklistInputKeyDown}
          preferenceBlacklistedTerms={preferenceBlacklistedTerms}
          onRemovePreferenceBlacklistedTerm={removePreferenceBlacklistedTerm}
          isVerifiedAccount={isVerifiedAccount}
          effectivePreferenceMaxCharacters={effectivePreferenceMaxCharacters}
          onPreferenceMaxCharactersChange={setPreferenceMaxCharacters}
          previewDisplayName={
            context.creatorProfile.identity.displayName ||
            context.creatorProfile.identity.username ||
            "X"
          }
          previewUsername={context.creatorProfile.identity.username || accountName || "user"}
          previewAvatarUrl={context.avatarUrl ?? null}
          preferencesPreviewDraft={preferencesPreviewDraft}
          preferencesPreviewCounter={preferencesPreviewCounter}
        />
      ) : null}

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
                          className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${isSelected
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
                              className={`rounded-xl border px-4 py-3 text-left transition-all ${isSelected
                                ? "border-white/25 bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                                : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                                }`}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate text-sm font-semibold">{playbook.name}</p>
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isSelected ? "text-zinc-300" : "text-zinc-600"
                                    }`}
                                >
                                  {isSelected ? "selected" : "view"}
                                </span>
                              </div>
                              <p
                                className={`mt-1 truncate text-xs ${isSelected ? "text-zinc-300" : "text-zinc-500"
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
                                className={`rounded-full px-3 py-2 text-xs font-medium transition ${playbookTemplateTab === tab.key
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
                                      className={`rounded-2xl border p-4 transition ${isTemplateSelected
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
                              {context.growthStrategySnapshot.profileConversionCues.slice(0, 3).map((cue) => (
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
                                context.growthStrategySnapshot.offBrandThemes.slice(0, 3).map((item) => (
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
                            style={{ width: `${Math.max(0, Math.min(100, context.profileConversionAudit?.score || 0))}%` }}
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
                            className={`rounded-2xl border p-4 ${index === 0
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
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">
                    work in progress: profile analysis is still improving. share feedback so we can improve result quality :)
                  </p>
                  {analysisScrapeNotice ? (
                    <p
                      className={`text-xs ${analysisScrapeNoticeTone === "success"
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
                    onClick={handleManualProfileScrapeRefresh}
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
            setThreadToDelete(null);
          }
        }}
        onConfirmDelete={() => {
          void confirmDeleteThread();
        }}
      />
    </main >
  );
}
