"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut, useSession } from "@/lib/auth/client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import {
  type ThreadFramingStyle,
  type DraftArtifactDetails,
} from "@/lib/onboarding/draftArtifacts";
import type { CreatorGenerationContract } from "@/lib/onboarding/contracts/generationContract";
import {
  type BillingSnapshotPayload,
  type BillingStatePayload,
} from "./_features/billing/billingViewState";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import { useBillingState } from "./_features/billing/useBillingState";
import { DraftEditorSurface } from "./_features/draft-editor/DraftEditorSurface";
import { buildChatWorkspaceUrl } from "@/lib/workspaceHandle";
import {
  type PendingStatusPlan,
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
import { type DraftQueueCandidate } from "./_features/draft-queue/draftQueueViewState";
import { useDraftQueueState } from "./_features/draft-queue/useDraftQueueState";
import { useFeedbackState } from "./_features/feedback/useFeedbackState";
import {
  useAssistantReplyOrchestrator,
  type UseAssistantReplyOrchestratorResult,
} from "./_features/reply/useAssistantReplyOrchestrator";
import { useChatRouteWorkspaceState } from "./_features/workspace/useChatRouteWorkspaceState";
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
import { useChatOverlayProps } from "./_features/workspace-chrome/useChatOverlayProps";
import { useWorkspaceAccountState } from "./_features/workspace-chrome/useWorkspaceAccountState";
import { useWorkspaceChromeState } from "./_features/workspace-chrome/useWorkspaceChromeState";
import {
  resolveAccountAvatarFallback,
  resolveAccountProfileAriaLabel,
  resolveSidebarThreadSections,
  WORKSPACE_CHROME_TOOLS,
} from "./_features/workspace-chrome/workspaceChromeViewState";
import {
  DEFAULT_CHAT_STRATEGY_INPUTS,
  DEFAULT_CHAT_TONE_INPUTS,
  buildTemplateWhyItWorksPoints,
  dedupePreserveOrder,
  formatEnumLabel,
  formatNicheSummary,
  getComposerCharacterLimit,
  inferInitialToneInputs,
  isDraftPendingWorkflow,
  normalizeAccountHandle,
  personalizePlaybookTemplateText,
  shouldShowDraftOutputForMessage,
  shouldShowOptionArtifactsForMessage,
  shouldShowQuickRepliesForMessage,
  showDevTools,
  type ChatStrategyInputs,
  type ChatToneInputs,
} from "./_features/chat-page/chatPageViewState";
import { useChatRuntimeState } from "./_features/chat-page/useChatRuntimeState";
import { useSourceMaterialsState } from "./_features/source-materials/useSourceMaterialsState";
import { usePreferencesState } from "./_features/preferences/usePreferencesState";
import { useGrowthGuideState } from "./_features/growth-guide/useGrowthGuideState";
import { useAnalysisState } from "./_features/analysis/useAnalysisState";
import { resolveDraftEditorIdentity } from "./_features/draft-editor/draftEditorViewState";
import {
  type SourceMaterialAsset,
} from "./_features/source-materials/sourceMaterialsState";

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

const monetizationEnabled = isMonetizationEnabled();

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
  const {
    accountName,
    backfillJobId,
    billingQuerySessionId,
    billingQueryStatus,
    buildWorkspaceChatHref,
    fetchWorkspace,
    requiresXAccountGate,
    searchParamsKey,
    sourceMaterialsBootstrapKey,
    threadIdParam,
  } = useChatRouteWorkspaceState({
    sessionHandle: session?.user?.activeXHandle ?? null,
    sessionUserId: session?.user?.id,
    status,
  });

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
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
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
    isLeavingHero,
    providerPreference,
    setBackfillNotice,
    setIsLeavingHero,
  } = useChatRuntimeState({
    backfillJobId,
    messagesLength: messages.length,
    loadWorkspace,
  });
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
  const chatOverlayProps = useChatOverlayProps({
    draftQueueOpen,
    isDraftQueueLoading,
    draftQueueError,
    draftQueueItems,
    editingDraftCandidateId,
    editingDraftCandidateText,
    draftQueueActionById,
    copiedPreviewDraftMessageId,
    context,
    isVerifiedAccount,
    handleDraftQueueOpenChange,
    submitQuickStarter,
    startEditingDraftCandidate,
    cancelEditingDraftCandidate,
    setEditingDraftCandidateText,
    mutateDraftQueueCandidate,
    openObservedMetricsModal,
    openSourceMaterialEditor,
    copyPreviewDraft,
    shareDraftEditorToX,
    observedMetricsCandidate,
    observedMetricsCandidateId,
    observedMetricsForm,
    updateObservedMetricsField,
    closeObservedMetricsModal,
    submitObservedMetrics,
    monetizationEnabled,
    supportEmail,
    setPricingModalOpen,
    acknowledgePricingModal,
    onSignOut: () => {
      void signOut({ callbackUrl: "/" });
    },
    settingsModalOpen,
    setSettingsModalOpen,
    planStatusLabel,
    settingsPlanLabel,
    rateLimitResetLabel,
    isOpeningBillingPortal,
    openBillingPortal,
    showRateLimitUpgradeCta,
    rateLimitUpgradeLabel,
    settingsCreditsRemaining,
    settingsCreditsUsed,
    settingsCreditLimit,
    settingsCreditsRemainingPercent,
    pricingModalOpen,
    handlePricingModalOpenChange,
    pricingModalDismissLabel,
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
    openCheckoutForOffer,
    selectedModalProOffer,
    lifetimeAmountCents: lifetimeOffer?.amountCents ?? 0,
    lifetimeSlotSummary,
    lifetimeOfferEnabled: lifetimeOffer?.enabled !== false,
    feedbackModalOpen,
    setFeedbackModalOpen,
    submitFeedback,
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
    accountName,
    activeThreadId,
    feedbackHistory,
    feedbackHistoryFilter,
    setFeedbackHistoryFilter,
    feedbackHistoryQuery,
    setFeedbackHistoryQuery,
    isFeedbackHistoryLoading,
    feedbackStatusUpdatingIds,
    updateFeedbackSubmissionStatus,
    sessionUserId: session?.user?.id ?? null,
    sessionEmail: session?.user?.email ?? null,
    feedbackSubmitNotice,
    isFeedbackSubmitting,
    extensionModalOpen,
    setExtensionModalOpen,
    sourceMaterialsOpen,
    setSourceMaterialsOpen,
    seedSourceMaterials,
    isSourceMaterialsLoading,
    isSourceMaterialsSaving,
    sourceMaterialsNotice,
    sourceMaterialDraft,
    resetSourceMaterialDraft,
    clearSourceMaterialsNotice,
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
    deleteSourceMaterial,
    saveSourceMaterial,
    sourceMaterialsLibraryOpen,
    toggleSourceMaterialsLibraryOpen,
    sourceMaterials,
    selectSourceMaterial,
    preferencesOpen,
    setPreferencesOpen,
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
    setPreferenceMaxCharacters: setPreferenceMaxCharacters,
    previewDisplayName,
    previewUsername,
    previewAvatarUrl,
    preferencesPreviewDraft,
    preferencesPreviewCounter,
    playbookModalOpen,
    handleGrowthGuideOpenChange,
    playbookStage,
    setPlaybookStage,
    filteredStagePlaybooks,
    selectedPlaybook,
    handleApplyPlaybook,
    growthGuideSelectedPlaybookRef,
    playbookTemplateTab,
    setPlaybookTemplateTab,
    personalizedPlaybookTemplates,
    activePlaybookTemplateId: activePlaybookTemplate?.id ?? null,
    setActivePlaybookTemplateId,
    activePlaybookTemplateText: activePlaybookTemplate?.text ?? null,
    playbookTemplatePreviewCounter,
    copiedPlaybookTemplateId,
    handleCopyPlaybookTemplate,
    buildTemplateWhyItWorksPoints,
    growthGuidePreviewDisplayName,
    growthGuidePreviewUsername,
    growthGuidePreviewAvatarUrl,
    openFeedbackDialog,
    openAnalysis,
    analysisOpen,
    setAnalysisOpen,
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
    handleManualProfileScrapeRefresh,
    closeAnalysis,
    openGrowthGuide,
    openGrowthGuideForRecommendation,
    isAddAccountModalOpen,
    requiresXAccountGate,
    isAddAccountSubmitting,
    addAccountPreview,
    normalizedAddAccount,
    addAccountLoadingStepIndex,
    addAccountLoadingSteps,
    closeAddAccountModal,
    handleAddAccountSubmit,
    addAccountInput,
    updateAddAccountInput,
    readyAccountHandle,
    hasValidAddAccountPreview,
    isAddAccountPreviewLoading,
    addAccountError,
    threadToDelete,
    clearThreadToDelete,
    confirmDeleteThread,
  });

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
                <ChatMessageStream<ChatMessage>
                  messages={messages}
                  latestAssistantMessageId={latestAssistantMessageId}
                  typedAssistantLengths={typedAssistantLengths}
                  registerMessageRef={registerMessageRef}
                  activeDraftRevealByMessageId={activeDraftRevealByMessageId}
                  shouldShowPendingDraftShell={shouldShowPendingDraftShell}
                  pendingDraftWorkflow={pendingDraftWorkflow}
                  pendingStatusLabel={pendingStatusLabel}
                  isSending={isSending}
                  resolveArtifactSectionProps={(message) => ({
                    composerCharacterLimit,
                    isVerifiedAccount,
                    isMainChatLocked,
                    showDevTools,
                    selectedDraftMessageId,
                    selectedDraftVersionId,
                    selectedThreadPreviewPostIndex:
                      selectedThreadPostByMessageId[message.id],
                    expandedInlineThreadPreviewId,
                    copiedPreviewDraftMessageId,
                    dismissedAutoSavedSource: Boolean(
                      dismissedAutoSavedSourceByMessageId[message.id],
                    ),
                    autoSavedSourceUndoPending: Boolean(
                      autoSavedSourceUndoPendingByMessageId[message.id],
                    ),
                    messageFeedbackPending: Boolean(
                      messageFeedbackPendingById[message.id],
                    ),
                    canRunReplyActions:
                      !isMainChatLocked &&
                      Boolean(activeStrategyInputs && activeToneInputs),
                    contextIdentity: {
                      username:
                        context?.creatorProfile?.identity?.username || "user",
                      displayName:
                        context?.creatorProfile?.identity?.displayName ||
                        context?.creatorProfile?.identity?.username ||
                        "user",
                      avatarUrl: context?.avatarUrl || null,
                    },
                    shouldShowQuickReplies: (candidate) =>
                      shouldShowQuickRepliesForMessage(candidate as ChatMessage),
                    shouldShowOptionArtifacts: (candidate) =>
                      shouldShowOptionArtifactsForMessage(candidate as ChatMessage),
                    shouldShowDraftOutput: (candidate) =>
                      shouldShowDraftOutputForMessage(candidate as ChatMessage),
                    onOpenSourceMaterialEditor: (params) => {
                      void openSourceMaterialEditor(params);
                    },
                    onUndoAutoSavedSourceMaterials: () => {
                      if (!message.autoSavedSourceMaterials) {
                        return;
                      }

                      void undoAutoSavedSourceMaterials(
                        message.id,
                        message.autoSavedSourceMaterials,
                      );
                    },
                    onSubmitAssistantMessageFeedback: (value) => {
                      void submitAssistantMessageFeedback(message.id, value);
                    },
                    onQuickReplySelect: (quickReply) => {
                      void handleQuickReplySelect(quickReply as ChatQuickReply);
                    },
                    onAngleSelect: (title, selectedAngleFormatHint) => {
                      void handleAngleSelect(title, selectedAngleFormatHint);
                    },
                    onReplyOptionSelect: (optionIndex) => {
                      void handleReplyOptionSelect(optionIndex);
                    },
                    onSelectDraftBundleOption: (optionId, versionId) => {
                      selectDraftBundleOption(message.id, optionId, versionId);
                    },
                    onOpenDraftEditor: (versionId, threadPostIndex) => {
                      openDraftEditor(message.id, versionId, threadPostIndex);
                    },
                    onRequestDraftCardRevision: (
                      prompt,
                      threadFramingStyleOverride,
                    ) => {
                      void requestDraftCardRevision(
                        message.id,
                        prompt,
                        threadFramingStyleOverride ?? undefined,
                      );
                    },
                    onToggleExpandedInlineThreadPreview: () => {
                      setExpandedInlineThreadPreviewId((current) =>
                        current === message.id ? null : message.id,
                      );
                    },
                    onCopyPreviewDraft: (messageId, content) => {
                      void copyPreviewDraft(messageId, content);
                    },
                    onShareDraftEditor: shareDraftEditorToX,
                  })}
                />
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

      <ChatOverlays {...chatOverlayProps} />
    </main >
  );
}
