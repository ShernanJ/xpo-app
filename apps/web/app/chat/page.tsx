"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut, useSession } from "@/lib/auth/client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
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
import {
  buildDefaultExampleQuickReplies,
  resolveComposerViewState,
} from "./_features/composer/composerViewState";
import { useComposerInteractions } from "./_features/composer/useComposerInteractions";
import { useDraftEditorState } from "./_features/draft-editor/useDraftEditorState";
import { useDraftInspectorState } from "./_features/draft-editor/useDraftInspectorState";
import { useDraftRevisionActions } from "./_features/draft-editor/useDraftRevisionActions";
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
import {
} from "./_features/thread-history/ChatMessageStream";
import { resolveThreadViewState } from "./_features/thread-history/threadViewState";
import { useChatThreadState } from "./_features/thread-history/useChatThreadState";
import { useThreadHistoryHydration } from "./_features/thread-history/useThreadHistoryHydration";
import { useMessageArtifactActions } from "./_features/thread-history/useMessageArtifactActions";
import { useThreadMessageEffects } from "./_features/thread-history/useThreadMessageEffects";
import { useThreadViewState } from "./_features/thread-history/useThreadViewState";
import { ChatOverlays } from "./_features/workspace-chrome/ChatOverlays";
import { useChatOverlayProps } from "./_features/workspace-chrome/useChatOverlayProps";
import { useWorkspaceAccountState } from "./_features/workspace-chrome/useWorkspaceAccountState";
import { useWorkspaceChromeState } from "./_features/workspace-chrome/useWorkspaceChromeState";
import {
  type ChatContentFocus,
  type ChatMessage,
  type ChatQuickReply,
  type CreatorChatSuccess,
  type DraftArtifact,
  type DraftBundlePayload,
  type DraftDrawerSelection,
  type DraftVersionEntry,
  type DraftVersionSnapshot,
  type ReplyArtifacts,
  type ReplyParseEnvelope,
} from "./_features/chat-page/chatPageTypes";
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
import { ChatWorkspaceCanvas } from "./_features/chat-page/ChatWorkspaceCanvas";
import { useDraftEditorSurfaceProps } from "./_features/chat-page/useDraftEditorSurfaceProps";
import { useChatMessageStreamProps } from "./_features/chat-page/useChatMessageStreamProps";
import { useChatRuntimeState } from "./_features/chat-page/useChatRuntimeState";
import { useSourceMaterialsState } from "./_features/source-materials/useSourceMaterialsState";
import { usePreferencesState } from "./_features/preferences/usePreferencesState";
import { useGrowthGuideState } from "./_features/growth-guide/useGrowthGuideState";
import { useAnalysisState } from "./_features/analysis/useAnalysisState";
import { resolveDraftEditorIdentity } from "./_features/draft-editor/draftEditorViewState";

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

  const { requestDraftCardRevision, requestSelectedThreadFramingChange } =
    useDraftRevisionActions<ChatMessage>({
      messages,
      composerCharacterLimit,
      selectedDraftMessage,
      selectedDraftVersion,
      selectedDraftThreadFramingStyle,
      requestAssistantReply,
      setActiveDraftEditor,
    });

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
  const isComposerDisabled =
    isMainChatLocked ||
    !context ||
    !contract ||
    !activeStrategyInputs ||
    !activeToneInputs;
  const isSubmitDisabled = isComposerDisabled || !draftInput.trim();
  const canRunReplyActions =
    !isMainChatLocked && Boolean(activeStrategyInputs && activeToneInputs);
  const contextIdentity = {
    username: context?.creatorProfile?.identity?.username || "user",
    displayName:
      context?.creatorProfile?.identity?.displayName ||
      context?.creatorProfile?.identity?.username ||
      "user",
    avatarUrl: context?.avatarUrl || null,
  };
  const messageStreamProps = useChatMessageStreamProps<ChatMessage>({
    isVisible: !isNewChatHero && !isLeavingHero,
    messages,
    latestAssistantMessageId,
    typedAssistantLengths,
    registerMessageRef,
    activeDraftRevealByMessageId,
    shouldShowPendingDraftShell,
    pendingDraftWorkflow,
    pendingStatusLabel,
    isSending,
    composerCharacterLimit,
    isVerifiedAccount,
    isMainChatLocked,
    showDevTools,
    selectedDraftMessageId,
    selectedDraftVersionId,
    selectedThreadPostByMessageId,
    expandedInlineThreadPreviewId,
    copiedPreviewDraftMessageId,
    dismissedAutoSavedSourceByMessageId,
    autoSavedSourceUndoPendingByMessageId,
    messageFeedbackPendingById,
    canRunReplyActions,
    contextIdentity,
    shouldShowQuickReplies: (candidate) =>
      shouldShowQuickRepliesForMessage(candidate as ChatMessage),
    shouldShowOptionArtifacts: (candidate) =>
      shouldShowOptionArtifactsForMessage(candidate as ChatMessage),
    shouldShowDraftOutput: (candidate) =>
      shouldShowDraftOutputForMessage(candidate as ChatMessage),
    onOpenSourceMaterialEditor: (params) => {
      void openSourceMaterialEditor(params);
    },
    onUndoAutoSavedSourceMaterials: (messageId, autoSavedSourceMaterials) => {
      void undoAutoSavedSourceMaterials(messageId, autoSavedSourceMaterials);
    },
    onSubmitAssistantMessageFeedback: (messageId, value) => {
      void submitAssistantMessageFeedback(messageId, value);
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
    onSelectDraftBundleOption: (messageId, optionId, versionId) => {
      selectDraftBundleOption(messageId, optionId, versionId);
    },
    onOpenDraftEditor: (messageId, versionId, threadPostIndex) => {
      openDraftEditor(messageId, versionId, threadPostIndex);
    },
    onRequestDraftCardRevision: (messageId, prompt, threadFramingStyleOverride) => {
      void requestDraftCardRevision(
        messageId,
        prompt,
        threadFramingStyleOverride ?? undefined,
      );
    },
    onToggleExpandedInlineThreadPreview: (messageId) => {
      setExpandedInlineThreadPreviewId((current) =>
        current === messageId ? null : messageId,
      );
    },
    onCopyPreviewDraft: (messageId, content) => {
      void copyPreviewDraft(messageId, content);
    },
    onShareDraftEditor: shareDraftEditorToX,
  });
  const draftEditorSurfaceProps = useDraftEditorSurfaceProps({
    open: Boolean(selectedDraftVersion && selectedDraftBundle),
    identity: draftEditorIdentity,
    isVerifiedAccount,
    timelinePosition: selectedDraftTimelinePosition,
    timelineLength: selectedDraftTimeline.length,
    canNavigateDraftBack,
    canNavigateDraftForward,
    onNavigateTimeline: navigateDraftTimeline,
    onClose: () => setActiveDraftEditor(null),
    shouldShowRevertDraftCta,
    revertToSelectedDraftVersion,
    saveDraftEditor,
    isSelectedDraftThread,
    selectedDraftArtifact,
    selectedDraftThreadFramingStyle,
    onChangeThreadFraming: (style) => {
      void requestSelectedThreadFramingChange(style);
    },
    isMainChatLocked,
    isViewingHistoricalDraftVersion,
    editorDraftPosts,
    selectedDraftThreadPostIndex,
    selectedDraftMessageId,
    setSelectedThreadPostByMessageId,
    onUpdateThreadDraftPost: updateThreadDraftPost,
    onMoveThreadDraftPost: moveThreadDraftPost,
    onSplitThreadDraftPost: splitThreadDraftPost,
    onMergeThreadDraftPostDown: mergeThreadDraftPostDown,
    onAddThreadDraftPost: addThreadDraftPost,
    onRemoveThreadDraftPost: removeThreadDraftPost,
    draftEditorSerializedContent,
    composerCharacterLimit,
    selectedDraftMaxCharacterLimit:
      selectedDraftVersion?.maxCharacterLimit ?? composerCharacterLimit,
    editorDraftText,
    onChangeEditorDraftText: setEditorDraftText,
    isDraftInspectorLoading,
    runDraftInspector,
    hasCopiedDraftEditorText,
    copyDraftEditor,
    onShareDraftEditor: shareDraftEditorToX,
    hasDraftEditorChanges,
  });

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <ChatWorkspaceCanvas<ChatMessage>
        workspaceChromeProps={{
          toolsMenuRef,
          toolsMenuOpen,
          setToolsMenuOpen,
          setSidebarOpen,
          setExtensionModalOpen,
          resetSourceMaterialDraft,
          openSourceMaterials,
          openDraftQueue,
          openAnalysis,
          openGrowthGuide,
          sidebarOpen,
          sidebarSearchQuery,
          setSidebarSearchQuery,
          closeSidebar,
          openSidebar,
          handleNewChat,
          chatThreads,
          hasWorkspace: Boolean(context && contract),
          activeThreadId,
          hoveredThreadId,
          setHoveredThreadId,
          menuOpenThreadId,
          setMenuOpenThreadId,
          editingThreadId,
          editingTitle,
          setEditingTitle,
          setEditingThreadId,
          handleRenameSubmit,
          switchToThreadWithTransition,
          requestDeleteThread,
          openPreferences,
          openFeedbackDialog,
          threadMenuRef,
          accountMenuRef,
          accountMenuOpen,
          toggleAccountMenu,
          accountMenuVisible,
          monetizationEnabled,
          availableHandles,
          accountName,
          switchActiveHandle,
          openAddAccountModal,
          closeAccountMenu,
          setSettingsModalOpen,
          rateLimitsMenuOpen,
          setRateLimitsMenuOpen,
          rateLimitWindowLabel,
          rateLimitsRemainingPercent,
          rateLimitResetLabel,
          showRateLimitUpgradeCta,
          rateLimitUpgradeLabel,
          setPricingModalOpen,
          avatarUrl: context?.avatarUrl ?? null,
          isVerifiedAccount,
          sessionEmail: session?.user?.email ?? null,
        }}
        canvasProps={{
          threadScrollRef,
          threadCanvasClassName: chatCanvasClassName,
          threadCanvasTransitionClassName,
          threadContentTransitionClassName,
          isLoading,
          isWorkspaceInitializing,
          hasContext: Boolean(context),
          hasContract: Boolean(contract),
          errorMessage,
          showBillingWarningBanner:
            showBillingWarningBanner && Boolean(activeBillingSnapshot),
          billingWarningLevel:
            billingWarningLevel === "none" ? null : billingWarningLevel,
          billingCreditsLabel,
          onOpenPricing: () => setPricingModalOpen(true),
          onDismissBillingWarning: () =>
            setDismissedBillingWarningLevel(billingWarningLevel as "low" | "critical"),
          isHeroVisible: isNewChatHero || isLeavingHero,
          avatarUrl: context?.avatarUrl ?? null,
          heroIdentityLabel,
          heroInitials,
          heroGreeting,
          isVerifiedAccount,
          isLeavingHero,
          draftInput,
          onDraftInputChange: setDraftInput,
          onComposerKeyDown: handleComposerKeyDown,
          onComposerSubmit: handleComposerSubmit,
          isComposerDisabled,
          isSubmitDisabled,
          isSending,
          heroQuickActions,
          onQuickAction: (prompt: string) => {
            void submitQuickStarter(prompt);
          },
          isNewChatHero,
          showScrollToLatest,
          shouldCenterHero,
          onScrollToBottom: scrollThreadToBottom,
        }}
        messageStreamProps={messageStreamProps}
      />

      <DraftEditorSurface {...draftEditorSurfaceProps} />

      <ChatOverlays {...chatOverlayProps} />
    </main >
  );
}
