"use client";

import {
  FormEvent,
  Fragment,
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
import type {
  ChatArtifactContext,
  ChatTurnSource,
  SelectedAngleFormatHint,
} from "@/lib/agent-v2/contracts/turnContract";
import type { CreatorGenerationContract } from "@/lib/onboarding/contracts/generationContract";
import type {
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
  type BillingSnapshotPayload,
  type BillingStatePayload,
} from "./_features/billing/billingViewState";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import { BillingDialogs } from "./_features/billing/BillingDialogs";
import { useBillingState } from "./_features/billing/useBillingState";
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
import { useDraftInspectorState } from "./_features/draft-editor/useDraftInspectorState";
import {
  getThreadFramingStyle,
  resolvePrimaryDraftRevealKey,
} from "./_features/draft-editor/chatDraftPreviewState";
import { DraftQueueModals } from "./_features/draft-queue/DraftQueueModals";
import { useDraftQueueState } from "./_features/draft-queue/useDraftQueueState";
import { FeedbackDialog } from "./_features/feedback/FeedbackDialog";
import { useFeedbackState } from "./_features/feedback/useFeedbackState";
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
import { useChatWorkspaceBootstrap } from "./_features/workspace/useChatWorkspaceBootstrap";
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
import { useWorkspaceAccountState } from "./_features/workspace-chrome/useWorkspaceAccountState";
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

const showDevTools = process.env.NEXT_PUBLIC_SHOW_ONBOARDING_DEV_TOOLS === "1";
const monetizationEnabled = isMonetizationEnabled();
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
  const chatThreadsRef = useRef(chatThreads);

  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);

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
  const {
    billingState,
    setBillingState,
    applyBillingSnapshot,
    billingViewState,
    lifetimeOffer,
    supportEmail,
    planStatusLabel,
    pricingModalOpen,
    setPricingModalOpen,
    handlePricingModalOpenChange,
    settingsModalOpen,
    setSettingsModalOpen,
    setSelectedModalProCadence,
    isOpeningBillingPortal,
    openBillingPortal,
    openCheckoutForOffer,
    isSelectedModalProCheckoutLoading,
    setDismissedBillingWarningLevel,
    acknowledgePricingModal,
  } = useBillingState({
    monetizationEnabled,
    sessionUserId: session?.user?.id,
    billingQueryStatus,
    billingQuerySessionId,
    onErrorMessage: setErrorMessage,
  });
  const {
    isAddAccountModalOpen,
    addAccountInput,
    addAccountPreview,
    isAddAccountPreviewLoading,
    isAddAccountSubmitting,
    addAccountLoadingStepIndex,
    addAccountError,
    readyAccountHandle,
    normalizedAddAccount,
    hasValidAddAccountPreview,
    loadingSteps: addAccountLoadingSteps,
    switchActiveHandle,
    openAddAccountModal,
    closeAddAccountModal,
    handleAddAccountSubmit,
    updateAddAccountInput,
  } = useWorkspaceAccountState({
    accountName,
    requiresXAccountGate,
    normalizeAccountHandle,
    refreshSession,
    closeAccountMenu,
    setAvailableHandles,
    buildChatWorkspaceUrl: ({ xHandle }) => buildChatWorkspaceUrl({ xHandle }),
    applyBillingSnapshot,
    onOpenPricing: () => {
      setPricingModalOpen(true);
    },
    onErrorMessage: setErrorMessage,
    onLoadingChange: setIsLoading,
  });
  const {
    draftQueueOpen,
    draftQueueItems,
    isDraftQueueLoading,
    draftQueueActionById,
    draftQueueError,
    editingDraftCandidateId,
    editingDraftCandidateText,
    observedMetricsCandidate,
    observedMetricsCandidateId,
    observedMetricsForm,
    setDraftQueueItems,
    setDraftQueueError,
    setEditingDraftCandidateId,
    setEditingDraftCandidateText,
    openDraftQueue,
    handleDraftQueueOpenChange,
    startEditingDraftCandidate,
    cancelEditingDraftCandidate,
    mutateDraftQueueCandidate,
    openObservedMetricsModal,
    closeObservedMetricsModal,
    submitObservedMetrics,
    updateObservedMetricsField,
  } = useDraftQueueState({
    activeThreadId,
    fetchWorkspace,
    monetizationEnabled,
    sessionUserId: session?.user?.id,
  });
  const [expandedInlineThreadPreviewId, setExpandedInlineThreadPreviewId] = useState<string | null>(null);
  const [selectedThreadPostByMessageId, setSelectedThreadPostByMessageId] = useState<
    Record<string, number>
  >({});

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

  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [pendingStatusPlan, setPendingStatusPlan] = useState<PendingStatusPlan | null>(null);
  const [providerPreference, setProviderPreference] =
    useState<ChatProviderPreference>("groq");
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
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
  const { loadWorkspace, clearMissingOnboardingAttempts } = useChatWorkspaceBootstrap<
    CreatorAgentContext,
    CreatorGenerationContract,
    ChatStrategyInputs,
    ChatToneInputs
  >({
    accountName,
    requiresXAccountGate,
    activeStrategyInputs,
    activeToneInputs,
    fetchWorkspace,
    setIsLoading,
    setIsWorkspaceInitializing,
    setErrorMessage,
    setContext,
    setContract,
    applyBillingSnapshot: (billing) => {
      applyBillingSnapshot(billing as BillingSnapshotPayload | null | undefined);
    },
    onPlanRequired: () => {
      setPricingModalOpen(true);
    },
    normalizeAccountHandle,
  });
  const [activeDraftEditor, setActiveDraftEditor] = useState<DraftDrawerSelection | null>(null);
  const [editorDraftText, setEditorDraftText] = useState("");
  const [editorDraftPosts, setEditorDraftPosts] = useState<string[]>([]);
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
  const {
    feedbackModalOpen,
    setFeedbackModalOpen,
    openFeedbackDialog,
    feedbackCategory,
    setFeedbackCategory,
    activeFeedbackTitle,
    updateActiveFeedbackTitle,
    activeFeedbackDraft,
    updateActiveFeedbackDraft,
    feedbackEditorRef,
    handleFeedbackEditorKeyDown,
    applyFeedbackMarkdownToken,
    feedbackImages,
    feedbackFileInputRef,
    isFeedbackDropActive,
    handleFeedbackImageSelection,
    handleFeedbackDropZoneDragOver,
    handleFeedbackDropZoneDragLeave,
    handleFeedbackDropZoneDrop,
    removeFeedbackImage,
    feedbackHistory,
    feedbackHistoryFilter,
    setFeedbackHistoryFilter,
    feedbackHistoryQuery,
    setFeedbackHistoryQuery,
    isFeedbackHistoryLoading,
    feedbackStatusUpdatingIds,
    updateFeedbackSubmissionStatus,
    feedbackSubmitNotice,
    isFeedbackSubmitting,
    submitFeedback,
  } = useFeedbackState({
    activeThreadId,
    activeDraftMessageId: activeDraftEditor?.messageId ?? null,
    fetchWorkspace,
  });
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
    setDraftQueueError,
    setDraftQueueItems,
    setEditingDraftCandidateId,
    setEditingDraftCandidateText,
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

    clearMissingOnboardingAttempts();
    applyChatWorkspaceReset(
      buildChatWorkspaceReset("workspace", {
        defaultToneInputs: DEFAULT_CHAT_TONE_INPUTS,
        defaultStrategyInputs: DEFAULT_CHAT_STRATEGY_INPUTS,
      }),
    );
  }, [accountName, applyChatWorkspaceReset, clearMissingOnboardingAttempts]);

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
  const { isDraftInspectorLoading, runDraftInspector } = useDraftInspectorState<ChatMessage>({
    activeThreadId,
    activeDraftEditorMessageId: activeDraftEditor?.messageId,
    activeDraftEditorVersionId: activeDraftEditor?.versionId,
    draftEditorSerializedContent,
    selectedDraftVersion,
    isViewingHistoricalDraftVersion,
    latestDraftTimelineEntry,
    fetchWorkspace,
    setMessages,
    scrollThreadToBottom,
    onApplyBillingState: setBillingState,
    onApplyBillingSnapshot: applyBillingSnapshot,
    onRequirePricingModal: () => {
      setPricingModalOpen(true);
    },
    onErrorMessage: setErrorMessage,
    createUserMessage: ({ id, threadId, content, createdAt }) => ({
      id,
      threadId,
      role: "user",
      content,
      createdAt,
    }),
    createAssistantMessage: ({ id, threadId, content, createdAt }) => ({
      id,
      threadId,
      role: "assistant",
      content,
      createdAt,
      isStreaming: true,
    }),
  });
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
      setBillingState,
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
              applyBillingSnapshot(nextBillingSnapshot);
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
      applyBillingSnapshot,
      applyAssistantReplyPlan,
      accountName,
      activeThreadId,
      setPricingModalOpen,
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
  const lifetimeSlotSummary = billingState?.lifetimeSlots ?? null;
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
        openDraftQueue();
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
          onOpenFeedback={openFeedbackDialog}
          threadMenuRef={threadMenuRef}
          accountMenuRef={accountMenuRef}
          accountMenuOpen={accountMenuOpen}
          onToggleAccountMenu={toggleAccountMenu}
          accountMenuVisible={accountMenuVisible}
          monetizationEnabled={monetizationEnabled}
          availableHandles={availableHandles}
          accountName={accountName}
          canAddAccount={canAddAccount}
          onSwitchActiveHandle={switchActiveHandle}
          onOpenAddAccount={openAddAccountModal}
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
            if (monetizationEnabled) {
              setPricingModalOpen(true);
            }
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
                  isComposerDisabled={
                    isMainChatLocked ||
                    !context ||
                    !contract ||
                    !activeStrategyInputs ||
                    !activeToneInputs
                  }
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
            isLeavingHero={isLeavingHero}
            showScrollToLatest={showScrollToLatest}
            shouldCenterHero={shouldCenterHero}
            onScrollToBottom={scrollThreadToBottom}
            draftInput={draftInput}
            onDraftInputChange={setDraftInput}
            onComposerKeyDown={handleComposerKeyDown}
            onSubmit={handleComposerSubmit}
            isComposerDisabled={
              isMainChatLocked ||
              !context ||
              !contract ||
              !activeStrategyInputs ||
              !activeToneInputs
            }
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

      <DraftQueueModals
        draftQueueDialogProps={{
          open: draftQueueOpen,
          isLoading: isDraftQueueLoading,
          errorMessage: draftQueueError,
          items: draftQueueItems,
          editingCandidateId: editingDraftCandidateId,
          editingCandidateText: editingDraftCandidateText,
          actionById: draftQueueActionById,
          copiedPreviewDraftMessageId,
          canGenerateInChat: Boolean(context?.runId),
          isVerifiedAccount,
          onOpenChange: handleDraftQueueOpenChange,
          onGenerateInChat: () => {
            handleDraftQueueOpenChange(false);
            void submitQuickStarter("draft 4 posts from what you know about me");
          },
          onStartEditingCandidate: startEditingDraftCandidate,
          onCancelEditingCandidate: cancelEditingDraftCandidate,
          onEditCandidateTextChange: setEditingDraftCandidateText,
          onMutateCandidate: (candidateId, payload) => {
            void mutateDraftQueueCandidate(candidateId, payload);
          },
          onOpenObservedMetrics: openObservedMetricsModal,
          onOpenSourceMaterial: (params) => {
            void openSourceMaterialEditor(params);
          },
          onCopyCandidateDraft: (candidateId, content) => {
            void copyPreviewDraft(candidateId, content);
          },
          onOpenX: shareDraftEditorToX,
        }}
        observedMetricsOpen={Boolean(observedMetricsCandidate)}
        observedMetricsCandidateTitle={observedMetricsCandidate?.title ?? null}
        observedMetricsValue={observedMetricsForm}
        observedMetricsSubmitting={draftQueueActionById[observedMetricsCandidateId || ""] === "observed"}
        observedMetricsErrorMessage={draftQueueError}
        onObservedMetricsChange={updateObservedMetricsField}
        onObservedMetricsOpenChange={(open) => {
          if (!open) {
            closeObservedMetricsModal();
          }
        }}
        onSubmitObservedMetrics={() => {
          void submitObservedMetrics();
        }}
      />

      <BillingDialogs
        monetizationEnabled={monetizationEnabled}
        supportEmail={supportEmail}
        onOpenPricingPage={() => {
          setPricingModalOpen(false);
          void acknowledgePricingModal();
          window.location.href = "/pricing";
        }}
        onSignOut={() => {
          void signOut({ callbackUrl: "/" });
        }}
        settingsDialogProps={{
          open: settingsModalOpen,
          onOpenChange: setSettingsModalOpen,
          planStatusLabel,
          settingsPlanLabel,
          rateLimitResetLabel,
          isOpeningBillingPortal,
          onOpenBillingPortal: () => {
            void openBillingPortal();
          },
          showRateLimitUpgradeCta,
          rateLimitUpgradeLabel,
          onOpenPricing: () => {
            setSettingsModalOpen(false);
            if (monetizationEnabled) {
              setPricingModalOpen(true);
            }
          },
          settingsCreditsRemaining,
          settingsCreditsUsed,
          settingsCreditLimit,
          settingsCreditsRemainingPercent,
        }}
        pricingDialogProps={{
          open: pricingModalOpen,
          onOpenChange: handlePricingModalOpenChange,
          dismissLabel: pricingModalDismissLabel,
          selectedModalProIsAnnual,
          selectedModalProCents,
          selectedModalProPriceSuffix,
          setSelectedModalProCadence,
          isProActive,
          isFounderCurrent,
          selectedModalProIsCurrent,
          selectedModalProNeedsPortalSwitch,
          selectedModalProOfferEnabled,
          selectedModalProButtonLabel,
          isSelectedModalProCheckoutLoading,
          isOpeningBillingPortal,
          onOpenBillingPortal: () => {
            void openBillingPortal();
          },
          onOpenCheckout: (offer) => {
            void openCheckoutForOffer(offer);
          },
          selectedModalProOffer,
          lifetimeAmountCents: lifetimeOffer?.amountCents ?? 0,
          lifetimeSlotSummary,
          lifetimeOfferEnabled: lifetimeOffer?.enabled !== false,
        }}
      />

      <FeedbackDialog
        open={feedbackModalOpen}
        onOpenChange={setFeedbackModalOpen}
        onSubmit={submitFeedback}
        feedbackCategory={feedbackCategory}
        onFeedbackCategoryChange={setFeedbackCategory}
        activeFeedbackTitle={activeFeedbackTitle}
        onActiveFeedbackTitleChange={updateActiveFeedbackTitle}
        activeFeedbackDraft={activeFeedbackDraft}
        onActiveFeedbackDraftChange={updateActiveFeedbackDraft}
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
            openFeedbackDialog();
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
            openFeedbackDialog();
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
        loadingSteps={addAccountLoadingSteps}
        onOpenChange={(open) => {
          if (!open) {
            closeAddAccountModal();
          }
        }}
        onSubmit={handleAddAccountSubmit}
        inputValue={addAccountInput}
        onInputValueChange={updateAddAccountInput}
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
