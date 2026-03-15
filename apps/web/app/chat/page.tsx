"use client";

import {
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
import { DraftEditorSurface } from "./_features/draft-editor/DraftEditorSurface";
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
import {
  buildDefaultExampleQuickReplies,
  resolveComposerViewState,
} from "./_features/composer/composerViewState";
import { useComposerInteractions } from "./_features/composer/useComposerInteractions";
import {
  resolveDraftCardRevisionAction,
  resolveSelectedThreadFramingChangeAction,
} from "./_features/draft-editor/chatDraftActionState";
import { useDraftEditorState } from "./_features/draft-editor/useDraftEditorState";
import { useDraftInspectorState } from "./_features/draft-editor/useDraftInspectorState";
import {
  useSelectedDraftState,
  useSelectedDraftTimelineState,
} from "./_features/draft-editor/useSelectedDraftState";
import { DraftQueueModals } from "./_features/draft-queue/DraftQueueModals";
import { type DraftQueueCandidate } from "./_features/draft-queue/draftQueueViewState";
import { useDraftQueueState } from "./_features/draft-queue/useDraftQueueState";
import { FeedbackDialog } from "./_features/feedback/FeedbackDialog";
import { useFeedbackState } from "./_features/feedback/useFeedbackState";
import {
  useAssistantReplyOrchestrator,
  type UseAssistantReplyOrchestratorResult,
} from "./_features/reply/useAssistantReplyOrchestrator";
import {
  resolveWorkspaceHandle,
} from "./_features/workspace/chatWorkspaceState";
import { useChatWorkspaceBootstrap } from "./_features/workspace/useChatWorkspaceBootstrap";
import { useChatWorkspaceReset } from "./_features/workspace/useChatWorkspaceReset";
import { usePendingStatusLabel } from "./_features/composer/usePendingStatusLabel";
import { ChatMessageStream } from "./_features/thread-history/ChatMessageStream";
import { ChatThreadView } from "./_features/thread-history/ChatThreadView";
import { resolveThreadViewState } from "./_features/thread-history/threadViewState";
import { useChatThreadState } from "./_features/thread-history/useChatThreadState";
import { useThreadHistoryHydration } from "./_features/thread-history/useThreadHistoryHydration";
import { useMessageArtifactActions } from "./_features/thread-history/useMessageArtifactActions";
import { useThreadMessageEffects } from "./_features/thread-history/useThreadMessageEffects";
import { useThreadViewState } from "./_features/thread-history/useThreadViewState";
import { ChatHeader } from "./_features/workspace-chrome/ChatHeader";
import { ChatOverlays } from "./_features/workspace-chrome/ChatOverlays";
import { ChatSidebar } from "./_features/workspace-chrome/ChatSidebar";
import { useWorkspaceAccountState } from "./_features/workspace-chrome/useWorkspaceAccountState";
import { useWorkspaceChromeState } from "./_features/workspace-chrome/useWorkspaceChromeState";
import {
  resolveAccountAvatarFallback,
  resolveAccountProfileAriaLabel,
  resolveSidebarThreadSections,
  WORKSPACE_CHROME_TOOLS,
} from "./_features/workspace-chrome/workspaceChromeViewState";
import { useSourceMaterialsState } from "./_features/source-materials/useSourceMaterialsState";
import { usePreferencesState } from "./_features/preferences/usePreferencesState";
import { useGrowthGuideState } from "./_features/growth-guide/useGrowthGuideState";
import { useAnalysisState } from "./_features/analysis/useAnalysisState";
import { resolveDraftEditorIdentity } from "./_features/draft-editor/draftEditorViewState";
import {
  type SourceMaterialAsset,
} from "./_features/source-materials/sourceMaterialsState";

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

function isDraftPendingWorkflow(
  workflow: PendingStatusWorkflow | null | undefined,
): workflow is "plan_then_draft" | "revise_draft" {
  return workflow === "plan_then_draft" || workflow === "revise_draft";
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

const HERO_EXIT_TRANSITION_MS = 720;
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
// See: lib/agent-v2/runtime/turnPlanner.ts

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
  const searchParamsKey = searchParams.toString();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    activeThreadId,
    setActiveThreadId,
    chatThreads,
    threadCreatedInSessionRef,
    threadStateResetVersion,
    handleRenameSubmit,
    confirmDeleteThread,
    syncThreadTitle,
    applyCreatedThreadWorkspaceUpdate,
  } = useChatThreadState({
    accountName,
    initialThreadId: threadIdParam,
    editingTitle,
    threadToDelete,
    setEditingThreadId,
    clearThreadToDelete,
    fetchWorkspace,
    buildWorkspaceChatHref,
    onErrorMessage: setErrorMessage,
  });

  // Guard against initializeThread re-fetching when we just created a thread in-session
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
  const {
    messageFeedbackPendingById,
    autoSavedSourceUndoPendingByMessageId,
    dismissedAutoSavedSourceByMessageId,
    undoAutoSavedSourceMaterials,
    submitAssistantMessageFeedback,
  } = useMessageArtifactActions<ChatMessage>({
    activeThreadId,
    fetchWorkspace,
    setMessages,
    messages,
    removeSourceMaterialsByIds,
    onErrorMessage: setErrorMessage,
  });
  const [draftInput, setDraftInput] = useState("");
  const [isLeavingHero, setIsLeavingHero] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkspaceInitializing, setIsWorkspaceInitializing] = useState(false);
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

  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [pendingStatusPlan, setPendingStatusPlan] = useState<PendingStatusPlan | null>(null);
  const [providerPreference] = useState<ChatProviderPreference>(() => {
    if (typeof window === "undefined" || !showDevTools) {
      return "groq";
    }

    const storedValue = window.localStorage.getItem(chatProviderStorageKey);
    return storedValue === "openai" || storedValue === "groq" ? storedValue : "groq";
  });
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
  const [, setConversationMemory] = useState<
    CreatorChatSuccess["data"]["memory"] | null
  >(null);
  const {
    typedAssistantLengths,
    setTypedAssistantLengths,
    activeDraftRevealByMessageId,
    setActiveDraftRevealByMessageId,
    setRevealedDraftMessageIds,
  } = useThreadMessageEffects(messages);

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

    window.localStorage.setItem(chatProviderStorageKey, providerPreference);
  }, [providerPreference]);

  useEffect(() => {
    if (!context || !contract) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
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
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    loadWorkspace,
    strategyInputs,
    toneInputs,
  ]);

  const {
    selectedDraftMessage,
    selectedDraftBundle,
    selectedDraftVersion,
    selectedDraftArtifact,
    isSelectedDraftThread,
    selectedDraftThreadFramingStyle,
  } = useSelectedDraftState<ChatMessage>({
    activeDraftEditor,
    messages,
    composerCharacterLimit,
  });
  const {
    editorDraftText,
    setEditorDraftText,
    editorDraftPosts,
    setEditorDraftPosts,
    selectedDraftThreadPostCount,
    draftEditorSerializedContent,
    hasCopiedDraftEditorText,
    copiedPreviewDraftMessageId,
    selectDraftBundleOption,
    openDraftEditor,
    updateThreadDraftPost,
    moveThreadDraftPost,
    splitThreadDraftPost,
    mergeThreadDraftPostDown,
    addThreadDraftPost,
    removeThreadDraftPost,
    saveDraftEditor,
    revertToSelectedDraftVersion,
    copyDraftEditor,
    shareDraftEditorToX,
    copyPreviewDraft,
  } = useDraftEditorState<ChatMessage>({
    activeDraftEditor,
    composerCharacterLimit,
    messages,
    selectedDraftVersionId: selectedDraftVersion?.id ?? null,
    selectedDraftVersionContent: selectedDraftVersion?.content ?? "",
    selectedDraftVersion,
    selectedDraftMessage,
    selectedDraftArtifact,
    selectedDraftBundle,
    isSelectedDraftThread,
    isVerifiedAccount,
    activeThreadId,
    fetchWorkspace,
    mergeSourceMaterials,
    scrollThreadToBottom,
    setMessages,
    setActiveDraftEditor,
    setExpandedInlineThreadPreviewId,
    setSelectedThreadPostByMessageId,
    onErrorMessage: setErrorMessage,
    createPromotionUserMessage: ({ id, threadId, content, createdAt }) => ({
      id,
      threadId,
      role: "user",
      content,
      createdAt,
    }),
    createPromotionAssistantMessage: ({
      id,
      threadId,
      content,
      createdAt,
      draft,
      drafts,
      draftArtifacts,
      draftVersions,
      activeDraftVersionId,
      previousVersionSnapshot,
      revisionChainId,
      supportAsset,
      promotedSourceMaterials,
      outputShape,
      replyArtifacts,
    }) => ({
      id,
      threadId,
      role: "assistant",
      content,
      createdAt,
      draft,
      drafts,
      draftArtifacts,
      draftVersions,
      activeDraftVersionId,
      previousVersionSnapshot,
      revisionChainId,
      supportAsset,
      promotedSourceMaterials,
      outputShape: outputShape as CreatorChatSuccess["data"]["outputShape"],
      replyArtifacts: replyArtifacts as ReplyArtifacts | null,
      feedbackValue: null,
    }),
  });
  const { handleNewChat } = useChatWorkspaceReset<
    CreatorAgentContext,
    CreatorGenerationContract,
    CreatorChatSuccess["data"]["memory"],
    ChatToneInputs,
    ChatStrategyInputs,
    ChatContentFocus,
    DraftQueueCandidate,
    ChatMessage,
    DraftDrawerSelection,
    string
  >({
    accountName,
    buildWorkspaceChatHref,
    threadStateResetVersion,
    loadWorkspace,
    clearMissingOnboardingAttempts,
    defaultToneInputs: DEFAULT_CHAT_TONE_INPUTS,
    defaultStrategyInputs: DEFAULT_CHAT_STRATEGY_INPUTS,
    threadCreatedInSessionRef,
    setActiveThreadId,
    setContext,
    setContract,
    setConversationMemory,
    setStreamStatus,
    setIsWorkspaceInitializing,
    setAnalysisOpen,
    setBackfillNotice,
    setIsAnalysisScrapeRefreshing,
    setAnalysisScrapeNotice,
    setAnalysisScrapeCooldownUntil,
    setActiveContentFocus,
    setToneInputs,
    setActiveToneInputs,
    setActiveStrategyInputs,
    setDraftQueueItems,
    setDraftQueueError,
    setEditingDraftCandidateId,
    setEditingDraftCandidateText,
    setMessages,
    setDraftInput,
    setErrorMessage,
    setActiveDraftEditor,
    setEditorDraftText,
    setEditorDraftPosts,
    setTypedAssistantLengths,
    setActiveDraftRevealByMessageId,
    setRevealedDraftMessageIds,
    setIsLeavingHero,
  });
  const pendingStatusLabel = usePendingStatusLabel({
    isActive: isSending,
    plan: pendingStatusPlan,
    backendStatus: streamStatus,
  });
  const pendingDraftWorkflow = isDraftPendingWorkflow(pendingStatusPlan?.workflow)
    ? pendingStatusPlan.workflow
    : null;
  const shouldShowPendingDraftShell = isSending && pendingDraftWorkflow !== null;
  const {
    selectedDraftThreadPostIndex,
    selectedDraftContext,
    selectedDraftTimeline,
    selectedDraftVersionId,
    selectedDraftMessageId,
    selectedDraftTimelinePosition,
    latestDraftTimelineEntry,
    canNavigateDraftBack,
    canNavigateDraftForward,
    isViewingHistoricalDraftVersion,
    hasDraftEditorChanges,
    shouldShowRevertDraftCta,
    navigateDraftTimeline,
  } = useSelectedDraftTimelineState<ChatMessage>({
    activeDraftEditor,
    messages,
    composerCharacterLimit,
    selectedThreadPostByMessageId,
    selectedDraftThreadPostCount,
    draftEditorSerializedContent,
    selectedDraftMessage,
    selectedDraftVersion,
    isSelectedDraftThread,
    setActiveDraftEditor,
    scrollMessageIntoView,
  });
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
  const defaultQuickReplies = useMemo(
    () => buildDefaultExampleQuickReplies(context) as ChatQuickReply[],
    [context],
  );

  const assistantReplyOrchestrator: UseAssistantReplyOrchestratorResult<
    ChatMessage,
    ChatStrategyInputs,
    ChatToneInputs,
    CreatorAgentContext,
    CreatorGenerationContract,
    DraftVersionSnapshot
  > = useAssistantReplyOrchestrator<
    ChatMessage,
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
    BillingStatePayload,
    BillingSnapshotPayload,
    ChatStrategyInputs,
    ChatToneInputs,
    CreatorAgentContext,
    CreatorGenerationContract,
    DraftVersionSnapshot
  >({
    context,
    contract,
    activeStrategyInputs,
    activeToneInputs,
    activeContentFocus,
    isMainChatLocked,
    messages,
    activeThreadId,
    accountName,
    providerPreference,
    selectedDraftContext,
    currentPreferencePayload,
    preferenceConstraintRules,
    defaultQuickReplies,
    fetchWorkspace,
    applyBillingSnapshot,
    setPricingModalOpen,
    setIsSending,
    setStreamStatus,
    setPendingStatusPlan,
    setErrorMessage,
    setBillingState,
    setMessages,
    setActiveDraftEditor,
    setConversationMemory,
    syncThreadTitle,
    applyCreatedThreadWorkspaceUpdate,
    scrollThreadToBottom,
    createUserMessage: ({ id, threadId, content, excludeFromHistory }) => ({
      id,
      threadId,
      role: "user",
      content,
      excludeFromHistory,
    }),
  });
  const { requestAssistantReply } = assistantReplyOrchestrator;
  const {
    latestAssistantMessageId,
    handleAngleSelect,
    handleReplyOptionSelect,
    handleQuickReplySelect,
    handleComposerSubmit,
    submitQuickStarter,
    handleComposerKeyDown,
  } = useComposerInteractions<
    ChatMessage,
    ChatQuickReply,
    ChatStrategyInputs,
    ChatToneInputs,
    ChatContentFocus
  >({
    context,
    contract,
    activeThreadId,
    draftInput,
    messages,
    activeStrategyInputs,
    activeToneInputs,
    activeContentFocus,
    isMainChatLocked,
    requestAssistantReply,
    setActiveContentFocus,
    setDraftInput,
    setErrorMessage,
    setIsLeavingHero,
  });

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

  useThreadHistoryHydration<ChatMessage>({
    accountName,
    activeThreadId,
    activeContentFocus,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    messagesLength: messages.length,
    searchParamsKey,
    setIsThreadHydrating,
    setMessages,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  });

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

      <DraftEditorSurface
        open={Boolean(selectedDraftVersion && selectedDraftBundle)}
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
        selectedDraftMaxCharacterLimit={selectedDraftVersion?.maxCharacterLimit ?? composerCharacterLimit}
        editorDraftText={editorDraftText}
        onChangeEditorDraftText={setEditorDraftText}
        draftInspectorActionLabel={draftInspectorActionLabel}
        isDraftInspectorLoading={isDraftInspectorLoading}
        onRunDraftInspector={() => {
          void runDraftInspector();
        }}
        hasCopiedDraftEditorText={hasCopiedDraftEditorText}
        onCopyDraftEditor={() => {
          void copyDraftEditor(draftEditorSerializedContent);
        }}
        onShareDraftEditor={shareDraftEditorToX}
      />

      <ChatOverlays
        draftQueueModalsProps={{
          draftQueueDialogProps: {
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
          },
          observedMetricsOpen: Boolean(observedMetricsCandidate),
          observedMetricsCandidateTitle: observedMetricsCandidate?.title ?? null,
          observedMetricsValue: observedMetricsForm,
          observedMetricsSubmitting:
            draftQueueActionById[observedMetricsCandidateId || ""] === "observed",
          observedMetricsErrorMessage: draftQueueError,
          onObservedMetricsChange: updateObservedMetricsField,
          onObservedMetricsOpenChange: (open) => {
            if (!open) {
              closeObservedMetricsModal();
            }
          },
          onSubmitObservedMetrics: () => {
            void submitObservedMetrics();
          },
        }}
        billingDialogsProps={{
          monetizationEnabled,
          supportEmail,
          onOpenPricingPage: () => {
            setPricingModalOpen(false);
            void acknowledgePricingModal();
            window.location.href = "/pricing";
          },
          onSignOut: () => {
            void signOut({ callbackUrl: "/" });
          },
          settingsDialogProps: {
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
          },
          pricingDialogProps: {
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
          },
        }}
        feedbackDialogProps={{
          open: feedbackModalOpen,
          onOpenChange: setFeedbackModalOpen,
          onSubmit: submitFeedback,
          feedbackCategory,
          onFeedbackCategoryChange: setFeedbackCategory,
          activeFeedbackTitle,
          onActiveFeedbackTitleChange: updateActiveFeedbackTitle,
          activeFeedbackDraft,
          onActiveFeedbackDraftChange: updateActiveFeedbackDraft,
          feedbackEditorRef,
          onFeedbackEditorKeyDown: handleFeedbackEditorKeyDown,
          onInsertMarkdownToken: applyFeedbackMarkdownToken,
          feedbackImages,
          feedbackFileInputRef,
          isFeedbackDropActive,
          onFeedbackImageSelection: handleFeedbackImageSelection,
          onFeedbackDropZoneDragOver: handleFeedbackDropZoneDragOver,
          onFeedbackDropZoneDragLeave: handleFeedbackDropZoneDragLeave,
          onFeedbackDropZoneDrop: handleFeedbackDropZoneDrop,
          onRemoveFeedbackImage: removeFeedbackImage,
          profileHandle: context?.account ?? accountName ?? "unknown",
          avatarUrl: context?.avatarUrl ?? null,
          submittingEmail: session?.user?.email ?? "email unavailable",
          activeThreadId,
          feedbackHistory,
          feedbackHistoryFilter,
          onFeedbackHistoryFilterChange: setFeedbackHistoryFilter,
          feedbackHistoryQuery,
          onFeedbackHistoryQueryChange: setFeedbackHistoryQuery,
          isFeedbackHistoryLoading,
          feedbackStatusUpdatingIds,
          onUpdateFeedbackSubmissionStatus: (submissionId, status) => {
            void updateFeedbackSubmissionStatus(submissionId, status);
          },
          currentUserId: session?.user?.id ?? null,
          feedbackSubmitNotice,
          isFeedbackSubmitting,
        }}
        extensionDialogProps={{
          open: extensionModalOpen,
          onOpenChange: setExtensionModalOpen,
        }}
        sourceMaterialsDialogProps={{
          open: sourceMaterialsOpen,
          onOpenChange: setSourceMaterialsOpen,
          onSeedSourceMaterials: () => {
            void seedSourceMaterials();
          },
          isSourceMaterialsLoading,
          isSourceMaterialsSaving,
          sourceMaterialsNotice,
          sourceMaterialDraft,
          onClearDraft: () => {
            resetSourceMaterialDraft();
            clearSourceMaterialsNotice();
          },
          onApplyClaimExample: applyClaimExample,
          onDraftTitleChange: updateSourceMaterialTitle,
          onDraftTypeChange: updateSourceMaterialType,
          onToggleDraftVerified: toggleSourceMaterialVerified,
          onDraftClaimsChange: updateSourceMaterialClaims,
          sourceMaterialAdvancedOpen,
          onToggleSourceMaterialAdvancedOpen: toggleSourceMaterialAdvancedOpen,
          onDraftTagsChange: updateSourceMaterialTags,
          onDraftSnippetsChange: updateSourceMaterialSnippets,
          onDraftDoNotClaimChange: updateSourceMaterialDoNotClaim,
          onDeleteSourceMaterial: () => {
            void deleteSourceMaterial();
          },
          onSaveSourceMaterial: () => {
            void saveSourceMaterial();
          },
          sourceMaterialsLibraryOpen,
          onToggleSourceMaterialsLibraryOpen: toggleSourceMaterialsLibraryOpen,
          sourceMaterials,
          onSelectSourceMaterial: selectSourceMaterial,
        }}
        preferencesDialogProps={
          context
            ? {
                open: preferencesOpen,
                onOpenChange: setPreferencesOpen,
                onSave: () => {
                  void savePreferences();
                },
                isPreferencesLoading,
                isPreferencesSaving,
                preferenceCasing,
                onPreferenceCasingChange: setPreferenceCasing,
                preferenceBulletStyle,
                onPreferenceBulletStyleChange: setPreferenceBulletStyle,
                preferenceWritingMode,
                onPreferenceWritingModeChange: setPreferenceWritingMode,
                preferenceUseEmojis,
                onTogglePreferenceUseEmojis: togglePreferenceUseEmojis,
                preferenceAllowProfanity,
                onTogglePreferenceAllowProfanity: togglePreferenceAllowProfanity,
                preferenceBlacklistInput,
                onPreferenceBlacklistInputChange: handlePreferenceBlacklistInputChange,
                onPreferenceBlacklistInputKeyDown: handlePreferenceBlacklistInputKeyDown,
                preferenceBlacklistedTerms,
                onRemovePreferenceBlacklistedTerm: removePreferenceBlacklistedTerm,
                isVerifiedAccount,
                effectivePreferenceMaxCharacters,
                onPreferenceMaxCharactersChange: setPreferenceMaxCharacters,
                previewDisplayName,
                previewUsername,
                previewAvatarUrl,
                preferencesPreviewDraft,
                preferencesPreviewCounter,
              }
            : null
        }
        growthGuideDialogProps={
          context
            ? {
                open: playbookModalOpen,
                onOpenChange: handleGrowthGuideOpenChange,
                playbookStage,
                onPlaybookStageChange: setPlaybookStage,
                filteredStagePlaybooks,
                selectedPlaybook,
                onSelectPlaybook: handleApplyPlaybook,
                selectedPlaybookRef: growthGuideSelectedPlaybookRef,
                playbookTemplateTab,
                onPlaybookTemplateTabChange: setPlaybookTemplateTab,
                personalizedPlaybookTemplates,
                activePlaybookTemplateId: activePlaybookTemplate?.id ?? null,
                onActivePlaybookTemplateChange: setActivePlaybookTemplateId,
                activePlaybookTemplateText: activePlaybookTemplate?.text ?? null,
                playbookTemplatePreviewCounter,
                copiedPlaybookTemplateId,
                onCopyPlaybookTemplate: (template) => {
                  void handleCopyPlaybookTemplate(template);
                },
                templateWhyItWorksPoints: buildTemplateWhyItWorksPoints(playbookTemplateTab),
                previewDisplayName: growthGuidePreviewDisplayName,
                previewUsername: growthGuidePreviewUsername,
                previewAvatarUrl: growthGuidePreviewAvatarUrl,
                isVerifiedAccount,
                onOpenFeedback: () => {
                  handleGrowthGuideOpenChange(false);
                  openFeedbackDialog();
                },
                onOpenProfileAnalysis: () => {
                  handleGrowthGuideOpenChange(false);
                  openAnalysis();
                },
              }
            : null
        }
        profileAnalysisDialogProps={
          context
            ? {
                open: analysisOpen,
                onOpenChange: setAnalysisOpen,
                context,
                accountName,
                isVerifiedAccount,
                currentPlaybookStage,
                analysisFollowerProgress,
                analysisDiagnosisSummary,
                analysisSnapshotCards,
                analysisPositioningIsTentative,
                analysisPriorityItems,
                analysisRecommendedPlaybooks,
                analysisLearningStrengths,
                analysisLearningCautions,
                analysisLearningExperiments,
                analysisReplyConversionHighlights,
                analysisVoiceSignalChips,
                analysisKeepList,
                analysisAvoidList,
                analysisEvidencePosts,
                analysisScrapeNotice,
                analysisScrapeNoticeTone,
                isAnalysisScrapeCoolingDown,
                analysisScrapeCooldownLabel,
                isAnalysisScrapeRefreshing,
                onRefreshScrape: () => {
                  void handleManualProfileScrapeRefresh();
                },
                onOpenFeedback: () => {
                  closeAnalysis();
                  openFeedbackDialog();
                },
                onOpenGrowthGuide: () => {
                  closeAnalysis();
                  openGrowthGuide();
                },
                onOpenGrowthGuideForRecommendation: (stage, playbookId) => {
                  closeAnalysis();
                  openGrowthGuideForRecommendation(stage, playbookId);
                },
              }
            : null
        }
        profileAnalysisDialogKey={
          context ? `${context.account}-${analysisOpen ? "open" : "closed"}` : undefined
        }
        addAccountDialogProps={{
          open: isAddAccountModalOpen,
          requiresXAccountGate,
          isSubmitting: isAddAccountSubmitting,
          preview: addAccountPreview,
          normalizedHandle: normalizedAddAccount,
          loadingStepIndex: addAccountLoadingStepIndex,
          loadingSteps: addAccountLoadingSteps,
          onOpenChange: (open) => {
            if (!open) {
              closeAddAccountModal();
            }
          },
          onSubmit: handleAddAccountSubmit,
          inputValue: addAccountInput,
          onInputValueChange: updateAddAccountInput,
          readyAccountHandle,
          hasValidPreview: hasValidAddAccountPreview,
          isPreviewLoading: isAddAccountPreviewLoading,
          errorMessage: addAccountError,
        }}
        threadDeleteDialogProps={{
          open: Boolean(threadToDelete),
          threadTitle: threadToDelete?.title ?? null,
          onOpenChange: (open) => {
            if (!open) {
              clearThreadToDelete();
            }
          },
          onConfirmDelete: () => {
            void confirmDeleteThread();
          },
        }}
      />
    </main >
  );
}
