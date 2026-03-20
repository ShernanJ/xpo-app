"use client";

import {
  Suspense,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth/client";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";
import type { CreatorGenerationContract } from "@/lib/onboarding/contracts/generationContract";
import {
  type BillingSnapshotPayload,
  type BillingStatePayload,
} from "./_features/billing/billingViewState";
import { isMonetizationEnabled } from "@/lib/billing/monetization";
import type { AgentProgressRun } from "@/lib/chat/agentProgress";
import { useBillingState } from "./_features/billing/useBillingState";
import { buildChatWorkspaceUrl } from "@/lib/workspaceHandle";
import {
  buildDefaultExampleQuickReplies,
  resolveComposerViewState,
} from "./_features/composer/composerViewState";
import { useComposerInteractions } from "./_features/composer/useComposerInteractions";
import {
  resolveComposerCommandImageNotice,
  resolveComposerCommandSubmitResult,
} from "./_features/composer/composerCommands";
import {
  consumeExactLeadingSlashCommand,
  dismissSlashCommandInput,
  resolveSlashCommandQuery,
} from "./_features/composer/chatComposerState";
import { useComposerPlaceholderState } from "./_features/composer/composerPlaceholderState";
import {
  createComposerImageAttachment,
  readComposerImagePreviewPayload,
  revokeComposerImageAttachment,
  validateComposerImageFile,
} from "./_features/composer/composerImageState";
import type {
  ChatComposerMode,
  ComposerCommandId,
  ComposerImageAttachment,
  HeroQuickAction,
} from "./_features/composer/composerTypes";
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
import { useQueuedInitialPrompt } from "./_features/workspace/useQueuedInitialPrompt";
import { useChatWorkspaceReset } from "./_features/workspace/useChatWorkspaceReset";
import { resolveThreadViewState } from "./_features/thread-history/threadViewState";
import { useChatThreadState } from "./_features/thread-history/useChatThreadState";
import { useThreadHistoryHydration } from "./_features/thread-history/useThreadHistoryHydration";
import { useMessageArtifactActions } from "./_features/thread-history/useMessageArtifactActions";
import { useThreadMessageEffects } from "./_features/thread-history/useThreadMessageEffects";
import { useThreadViewState } from "./_features/thread-history/useThreadViewState";
import { useWorkspaceAccountState } from "./_features/workspace-chrome/useWorkspaceAccountState";
import { useWorkspaceChromeState } from "./_features/workspace-chrome/useWorkspaceChromeState";
import {
  type ChatActiveTurn,
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
  HERO_EXIT_TRANSITION_MS,
  inferInitialToneInputs,
  normalizeAccountHandle,
  personalizePlaybookTemplateText,
  shouldShowDraftOutputForMessage,
  shouldShowOptionArtifactsForMessage,
  shouldShowQuickRepliesForMessage,
  showDevTools,
  type ChatStrategyInputs,
  type ChatToneInputs,
} from "./_features/chat-page/chatPageViewState";
import { DraftEditorSurfaceController } from "./_features/chat-page/DraftEditorSurfaceController";
import { ChatMessageStreamSurface } from "./_features/chat-page/ChatMessageStreamSurface";
import { ChatWorkspaceCanvas } from "./_features/chat-page/ChatWorkspaceCanvas";
import { useChatRuntimeState } from "./_features/chat-page/useChatRuntimeState";
import { useSourceMaterialsState } from "./_features/source-materials/useSourceMaterialsState";
import { usePreferencesState } from "./_features/preferences/usePreferencesState";
import { useGrowthGuideState } from "./_features/growth-guide/useGrowthGuideState";
import { useAnalysisState } from "./_features/analysis/useAnalysisState";
import { resolveDraftEditorIdentity } from "./_features/draft-editor/draftEditorViewState";
import { ChatOverlaysController } from "./_features/workspace-chrome/ChatOverlaysController";
import { parseImagePostConfirmationDecision } from "@/lib/chat/imageTurnText";
import { resolveChatDocumentTitle } from "./_features/workspace/chatWorkspaceState";

const monetizationEnabled = isMonetizationEnabled();

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#050505] text-white">
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
    messageIdParam,
    requiresXAccountGate,
    requestedModal,
    searchParamsKey,
    sourceMaterialsBootstrapKey,
    threadIdParam,
  } = useChatRouteWorkspaceState({
    sessionHandle: session?.user?.activeXHandle ?? null,
    sessionUserId: session?.user?.id,
    status,
  });

  useEffect(() => {
    document.title = resolveChatDocumentTitle(accountName);
  }, [accountName]);

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
    earlierThreadsVisibleCount,
    expandEarlierThreads,
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
  } = useWorkspaceChromeState({
    accountName,
    sessionUserId: session?.user?.id ?? null,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeThreadTurn, setActiveThreadTurn] = useState<ChatActiveTurn | null>(null);
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
    pruneMessageArtifactState,
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
  const [activeComposerCommand, setActiveComposerCommand] =
    useState<ComposerCommandId | null>(null);
  const [composerInlineNotice, setComposerInlineNotice] = useState<string | null>(null);
  const [composerImageAttachment, setComposerImageAttachment] =
    useState<ComposerImageAttachment | null>(null);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedUserMessageId, setCopiedUserMessageId] = useState<string | null>(null);
  const copiedUserMessageResetTimeoutRef = useRef<number | null>(null);
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [editingUserMessageOriginalText, setEditingUserMessageOriginalText] =
    useState<string | null>(null);
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
  const [, setStreamStatus] = useState<string | null>(null);
  const [activeAgentProgress, setActiveAgentProgress] = useState<AgentProgressRun | null>(
    null,
  );
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [contentHubOpen, setContentHubOpen] = useState(false);
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
  const applyWorkspaceBillingSnapshot = useCallback((billing: unknown) => {
    applyBillingSnapshot(billing as BillingSnapshotPayload | null | undefined);
  }, [applyBillingSnapshot]);
  const openContentHub = useCallback(() => {
    setContentHubOpen(true);
  }, []);
  const handleContentHubOpenChange = useCallback((open: boolean) => {
    setContentHubOpen(open);
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (requestedModal !== "posts-threads" && requestedModal !== "content-hub") {
      return;
    }

    setContentHubOpen(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("modal");
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, requestedModal, router, searchParams]);

  useEffect(() => {
    if (!messageIdParam || !messages.some((message) => message.id === messageIdParam)) {
      return;
    }

    scrollMessageIntoView(messageIdParam);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("messageId");
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [
    messageIdParam,
    messages,
    pathname,
    router,
    scrollMessageIntoView,
    searchParams,
  ]);

  const handleWorkspacePlanRequired = useCallback(() => {
    setPricingModalOpen(true);
  }, [setPricingModalOpen]);
  const {
    loadWorkspace,
    clearMissingOnboardingAttempts,
    retryWorkspaceStartup,
    startupState,
  } = useChatWorkspaceBootstrap<
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
    applyBillingSnapshot: applyWorkspaceBillingSnapshot,
    onPlanRequired: handleWorkspacePlanRequired,
    normalizeAccountHandle,
  });
  useEffect(() => {
    return () => {
      if (copiedUserMessageResetTimeoutRef.current) {
        window.clearTimeout(copiedUserMessageResetTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    return () => {
      revokeComposerImageAttachment(composerImageAttachment);
    };
  }, [composerImageAttachment]);
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

  const clearEditingUserMessage = useCallback(
    (options?: { clearComposer?: boolean }) => {
      setEditingUserMessageId(null);
      setEditingUserMessageOriginalText(null);
      if (options?.clearComposer) {
        setDraftInput("");
      }
    },
    [setDraftInput],
  );

  useEffect(() => {
    setCopiedUserMessageId(null);
    clearEditingUserMessage();
    setActiveComposerCommand(null);
    setComposerInlineNotice(null);
    setComposerImageAttachment((current) => {
      revokeComposerImageAttachment(current);
      return null;
    });
    setActiveThreadTurn(null);
    setStatusMessage(null);
  }, [activeThreadId, clearEditingUserMessage, threadStateResetVersion]);

  const handleCopyUserMessage = useCallback(
    async (messageId: string, content: string) => {
      const nextContent = content.trim();
      if (!nextContent) {
        return;
      }

      try {
        await navigator.clipboard.writeText(nextContent);
        setCopiedUserMessageId(messageId);
        if (copiedUserMessageResetTimeoutRef.current) {
          window.clearTimeout(copiedUserMessageResetTimeoutRef.current);
        }
        copiedUserMessageResetTimeoutRef.current = window.setTimeout(() => {
          setCopiedUserMessageId((current) =>
            current === messageId ? null : current,
          );
          copiedUserMessageResetTimeoutRef.current = null;
        }, 1800);
      } catch {
        setErrorMessage("Copy failed. Try selecting the text manually.");
      }
    },
    [],
  );

  const clearComposerImageAttachment = useCallback(() => {
    setComposerImageAttachment((current) => {
      revokeComposerImageAttachment(current);
      return null;
    });
  }, []);

  const handleEditUserMessage = useCallback(
    (messageId: string, content: string) => {
      setActiveComposerCommand(null);
      setComposerInlineNotice(null);
      clearComposerImageAttachment();
      setEditingUserMessageId(messageId);
      setEditingUserMessageOriginalText(content);
      setDraftInput(content);
      setErrorMessage(null);
    },
    [clearComposerImageAttachment],
  );

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
    openScopedFeedbackDialog,
    feedbackCategory,
    setFeedbackCategory,
    feedbackSource,
    feedbackScope,
    activeFeedbackTitle,
    updateActiveFeedbackTitle,
    activeFeedbackDraft,
    updateActiveFeedbackDraft,
    discardFeedbackDraft,
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
    profileHandle: accountName,
    messages,
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
    handleHeaderClaritySelection,
    handleBioAlternativeCopied,
    handleBioAlternativeRefine,
    handlePinnedPromptStart,
  } = useAnalysisState({
    accountName,
    activeThreadId,
    context,
    currentPlaybookStage,
    fetchWorkspace,
    loadWorkspace,
    submitQuickStarter: async (prompt: string) => {
      await submitQuickStarter(prompt);
    },
    dedupePreserveOrder,
    formatEnumLabel,
    formatNicheSummary,
  });
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

    if (
      toneInputs.toneCasing !== inferredToneInputs.toneCasing ||
      toneInputs.toneRisk !== inferredToneInputs.toneRisk
    ) {
      setToneInputs(inferredToneInputs);
    }
    setActiveToneInputs(inferredToneInputs);
  }, [
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
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
    clearCopiedPreviewDraftMessageId,
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

  useEffect(() => {
    setActiveAgentProgress(null);
  }, [activeThreadId, threadStateResetVersion]);

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
  const isWorkspaceReadyForPrompts = Boolean(
    context && contract && activeStrategyInputs && activeToneInputs,
  );
  const canQueueInitialPrompt =
    Boolean(accountName) &&
    !isWorkspaceReadyForPrompts &&
    (startupState.status === "shell_loading" ||
      startupState.status === "setup_pending" ||
      startupState.status === "setup_timeout");
  const canUseComposerCommands = isWorkspaceReadyForPrompts;
  const composerViewState = useMemo(
    () =>
      resolveComposerViewState({
        context,
        accountName,
        activeThreadId,
        messagesLength: messages.length,
        isLeavingHero,
      }),
    [accountName, activeThreadId, context, isLeavingHero, messages.length],
  );
  const composerMode = useMemo<ChatComposerMode>(
    () =>
      editingUserMessageId
        ? { kind: "edit" }
        : activeComposerCommand
          ? { kind: "command", commandId: activeComposerCommand }
          : null,
    [activeComposerCommand, editingUserMessageId],
  );
  const slashCommandQuery =
    composerMode || composerImageAttachment
      ? null
      : resolveSlashCommandQuery(draftInput);
  const {
    activePlaceholder,
    placeholderAnimationKey,
    shouldAnimatePlaceholder,
  } = useComposerPlaceholderState({
    prompts:
      composerMode?.kind === "command"
        ? composerViewState.commandPlaceholderPrompts[composerMode.commandId]
        : activeThreadId
          ? [composerViewState.activeThreadPlaceholder]
          : composerViewState.defaultPlaceholderPrompts,
    isPaused: draftInput.trim().length > 0 || Boolean(editingUserMessageId),
  });
  const defaultQuickReplies = useMemo(
    () => buildDefaultExampleQuickReplies(context, accountName) as ChatQuickReply[],
    [accountName, context],
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
    setActiveAgentProgress,
    setErrorMessage,
    setBillingState,
    setMessages,
    setActiveDraftEditor,
    setConversationMemory,
    setActiveThreadTurn,
    setStatusMessage,
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
  const {
    interruptAssistantReply,
    requestAssistantReply,
  } = assistantReplyOrchestrator;
  const {
    latestAssistantMessageId,
    handleAngleSelect,
    handleReplyOptionSelect,
    handleQuickReplySelect,
    submitQuickStarter,
    submitComposerPrompt,
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
  const { hasQueuedInitialPrompt, queueInitialPrompt } = useQueuedInitialPrompt({
    accountName,
    canAutoSend:
      Boolean(context && contract && activeStrategyInputs && activeToneInputs) && !isMainChatLocked,
    onInlineNotice: setComposerInlineNotice,
    submitPrompt: async (prompt: string) => {
      await submitComposerPrompt(prompt);
    },
  });

  const enterComposerCommandMode = useCallback((commandId: ComposerCommandId) => {
    setActiveComposerCommand(commandId);
    setComposerInlineNotice(null);
    setErrorMessage(null);
  }, [setErrorMessage]);

  const handleSelectSlashCommand = useCallback(
    (commandId: ComposerCommandId) => {
      enterComposerCommandMode(commandId);
      setDraftInput("");
    },
    [enterComposerCommandMode],
  );

  const handleDismissSlashCommandPicker = useCallback(() => {
    setDraftInput((current) => dismissSlashCommandInput(current));
  }, []);

  const handleDraftInputChange = useCallback(
    (value: string) => {
      setComposerInlineNotice(null);

      if (composerMode?.kind === "edit" || composerMode?.kind === "command") {
        setDraftInput(value);
        return;
      }

      const consumedCommand = consumeExactLeadingSlashCommand({
        input: value,
        commands: composerViewState.slashCommands,
      });
      if (consumedCommand) {
        if (!canUseComposerCommands) {
          setComposerInlineNotice("Slash commands unlock once setup finishes.");
          setDraftInput(value);
          return;
        }

        enterComposerCommandMode(consumedCommand.command.id);
        setDraftInput(consumedCommand.remainder);
        return;
      }

      setDraftInput(value);
    },
    [canUseComposerCommands, composerMode, composerViewState.slashCommands, enterComposerCommandMode],
  );

  const queueShellFirstPrompt = useCallback(
    (prompt: string, source: "composer" | "quick_action") => {
      if (!canQueueInitialPrompt || isMainChatLocked) {
        return false;
      }

      setErrorMessage(null);
      const result = queueInitialPrompt(prompt, source);
      if (result.status === "queued" && source === "composer") {
        setDraftInput("");
      }
      return result.status !== "ignored";
    },
    [canQueueInitialPrompt, isMainChatLocked, queueInitialPrompt, setErrorMessage],
  );

  const openComposerImagePicker = useCallback(() => {
    if (
      isSending ||
      !context ||
      !contract ||
      !activeStrategyInputs ||
      !activeToneInputs
    ) {
      return;
    }

    if (composerMode?.kind === "command") {
      setComposerInlineNotice(
        resolveComposerCommandImageNotice(composerMode.commandId),
      );
      return;
    }

    setComposerInlineNotice(null);
    composerFileInputRef.current?.click();
  }, [
    activeStrategyInputs,
    activeToneInputs,
    composerMode,
    context,
    contract,
    isSending,
  ]);

  const handleComposerFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0] ?? null;
      event.target.value = "";

      if (!selectedFile) {
        return;
      }

      const validation = validateComposerImageFile(selectedFile);
      if (!validation.ok) {
        setComposerInlineNotice(validation.error);
        return;
      }

      setComposerInlineNotice(null);
      setComposerImageAttachment((current) => {
        revokeComposerImageAttachment(current);
        return createComposerImageAttachment(selectedFile);
      });
    },
    [],
  );

  const handleCancelComposerMode = useCallback(() => {
    if (composerMode?.kind === "edit") {
      clearEditingUserMessage({ clearComposer: true });
      return;
    }

    if (composerMode?.kind === "command") {
      setActiveComposerCommand(null);
      setComposerInlineNotice(null);
    }
  }, [clearEditingUserMessage, composerMode]);

  const rewindAndResendEditedMessage = useCallback(async () => {
    const trimmedPrompt = draftInput.trim();
    if (!editingUserMessageId || !trimmedPrompt) {
      return;
    }

    const editIndex = messages.findIndex((message) => message.id === editingUserMessageId);
    if (editIndex < 0) {
      clearEditingUserMessage();
      return;
    }

    if (!activeThreadId) {
      setErrorMessage("Open a thread before editing a previous message.");
      return;
    }

    const retainedMessages = messages.slice(0, editIndex);
    const retainedMessageIds = retainedMessages.map((message) => message.id);
    const retainedMessageIdSet = new Set(retainedMessageIds);

    try {
      setErrorMessage(null);
      const response = await fetchWorkspace(
        `/api/creator/v2/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(editingUserMessageId)}`,
        {
          method: "DELETE",
        },
      );
      const result = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            errors?: Array<{ message?: string }>;
          }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.errors?.[0]?.message || "Failed to rewind the thread.");
      }

      setMessages(retainedMessages);
      setActiveDraftEditor((current) =>
        current && retainedMessageIdSet.has(current.messageId) ? current : null,
      );
      setExpandedInlineThreadPreviewId((current) =>
        current && retainedMessageIdSet.has(current) ? current : null,
      );
      setSelectedThreadPostByMessageId((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([messageId]) => retainedMessageIdSet.has(messageId)),
        ),
      );
      setTypedAssistantLengths((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([messageId]) => retainedMessageIdSet.has(messageId)),
        ),
      );
      setActiveDraftRevealByMessageId((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([messageId]) => retainedMessageIdSet.has(messageId)),
        ),
      );
      setRevealedDraftMessageIds((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([messageId]) => retainedMessageIdSet.has(messageId)),
        ),
      );
      clearCopiedPreviewDraftMessageId(retainedMessageIds);
      pruneMessageArtifactState(retainedMessageIds);
      setActiveAgentProgress(null);
      setCopiedUserMessageId((current) =>
        current && retainedMessageIdSet.has(current) ? current : null,
      );
      clearEditingUserMessage({ clearComposer: true });

      await requestAssistantReply({
        prompt: trimmedPrompt,
        appendUserMessage: true,
        historySeed: retainedMessages,
        turnSource: "free_text",
        strategyInputOverride: activeStrategyInputs as ChatStrategyInputs,
        toneInputOverride: activeToneInputs as ChatToneInputs,
        contentFocusOverride: activeContentFocus,
      });
    } catch (error) {
      setDraftInput(trimmedPrompt || editingUserMessageOriginalText || "");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to resend the edited message.",
      );
    }
  }, [
    activeContentFocus,
    activeStrategyInputs,
    activeThreadId,
    activeToneInputs,
    clearCopiedPreviewDraftMessageId,
    clearEditingUserMessage,
    draftInput,
    editingUserMessageId,
    editingUserMessageOriginalText,
    fetchWorkspace,
    messages,
    pruneMessageArtifactState,
    requestAssistantReply,
    setActiveDraftRevealByMessageId,
    setDraftInput,
    setRevealedDraftMessageIds,
    setTypedAssistantLengths,
  ]);

  const maybeAnimateComposerHeroExit = useCallback(async () => {
    if (activeThreadId || messages.length > 0) {
      return;
    }

    setIsLeavingHero(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, HERO_EXIT_TRANSITION_MS);
    });
  }, [activeThreadId, messages.length, setIsLeavingHero]);

  const ensureActiveComposerThreadId = useCallback(async () => {
    if (activeThreadId) {
      return activeThreadId;
    }

    const response = await fetchWorkspace("/api/creator/v2/threads", {
      method: "POST",
    });
    const data = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          data?: {
            thread?: {
              id?: string;
              title?: string | null;
            };
          };
          errors?: Array<{ message?: string }>;
        }
      | null;

    const createdThreadId = data?.data?.thread?.id?.trim();
    if (!response.ok || !data?.ok || !createdThreadId) {
      throw new Error(data?.errors?.[0]?.message || "Failed to create a chat thread.");
    }

    applyCreatedThreadWorkspaceUpdate(
      createdThreadId,
      data?.data?.thread?.title?.trim() || "New Chat",
    );

    return createdThreadId;
  }, [activeThreadId, applyCreatedThreadWorkspaceUpdate, fetchWorkspace]);

  const latestPendingImageTurnMessage = useMemo(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    return latestAssistantMessage?.imageTurnContext?.awaitingConfirmation
      ? latestAssistantMessage
      : null;
  }, [messages]);

  const submitImageAttachmentTurn = useCallback(async () => {
    if (!composerImageAttachment) {
      return;
    }

    if (composerMode?.kind === "command") {
      setComposerInlineNotice(
        resolveComposerCommandImageNotice(composerMode.commandId),
      );
      return;
    }

    const idea = draftInput.trim() || null;

    try {
      setComposerInlineNotice(null);
      setErrorMessage(null);
      await maybeAnimateComposerHeroExit();

      setIsSending(true);
      const threadId = await ensureActiveComposerThreadId();
      const previewPayload = await readComposerImagePreviewPayload(
        composerImageAttachment.file,
      );
      const formData = new FormData();
      formData.append("threadId", threadId);
      formData.append("image", composerImageAttachment.file);
      if (idea) {
        formData.append("idea", idea);
      }
      if (previewPayload.previewDataUrl) {
        formData.append("previewDataUrl", previewPayload.previewDataUrl);
      }
      if (typeof previewPayload.width === "number") {
        formData.append("width", String(previewPayload.width));
      }
      if (typeof previewPayload.height === "number") {
        formData.append("height", String(previewPayload.height));
      }

      const response = await fetchWorkspace("/api/creator/v2/chat/image-turns", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: {
              threadId?: string;
              userMessage?: ChatMessage;
              assistantMessage?: ChatMessage;
            };
            errors?: Array<{ message?: string }>;
          }
        | null;

      if (
        !response.ok ||
        !data?.ok ||
        !data.data?.userMessage ||
        !data.data?.assistantMessage
      ) {
        throw new Error(data?.errors?.[0]?.message || "Image analysis failed.");
      }

      setMessages((current) => [
        ...current,
        data.data!.userMessage!,
        data.data!.assistantMessage!,
      ]);
      scrollThreadToBottom();
      clearComposerImageAttachment();
      setActiveComposerCommand(null);
      setDraftInput("");
    } catch (error) {
      setComposerInlineNotice(
        error instanceof Error ? error.message : "Image analysis failed.",
      );
    } finally {
      setIsSending(false);
    }
  }, [
    clearComposerImageAttachment,
    composerImageAttachment,
    composerMode,
    draftInput,
    ensureActiveComposerThreadId,
    fetchWorkspace,
    maybeAnimateComposerHeroExit,
    scrollThreadToBottom,
  ]);

  const submitImageConfirmationTurn = useCallback(
    async (args: {
      assistantMessageId: string;
      decision: "confirm" | "decline";
      displayUserMessage: string;
    }) => {
      try {
        setComposerInlineNotice(null);
        setErrorMessage(null);
        setIsSending(true);
        const threadId =
          latestPendingImageTurnMessage?.threadId || activeThreadId || "";
        if (!threadId) {
          throw new Error("Open the thread before continuing this image flow.");
        }

        const response = await fetchWorkspace("/api/creator/v2/chat/image-turns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            threadId,
            assistantMessageId: args.assistantMessageId,
            decision: args.decision,
            displayUserMessage: args.displayUserMessage,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              data?: {
                userMessage?: ChatMessage;
                assistantMessage?: ChatMessage;
              };
              errors?: Array<{ message?: string }>;
            }
          | null;

        if (
          !response.ok ||
          !data?.ok ||
          !data.data?.userMessage ||
          !data.data?.assistantMessage
        ) {
          throw new Error(data?.errors?.[0]?.message || "Image confirmation failed.");
        }

        setMessages((current) => [
          ...current,
          data.data!.userMessage!,
          data.data!.assistantMessage!,
        ]);
        scrollThreadToBottom();
        setDraftInput("");
      } catch (error) {
        setComposerInlineNotice(
          error instanceof Error ? error.message : "Image confirmation failed.",
        );
      } finally {
        setIsSending(false);
      }
    },
    [
      activeThreadId,
      fetchWorkspace,
      latestPendingImageTurnMessage?.threadId,
      scrollThreadToBottom,
    ],
  );

  const submitMainComposer = useCallback(async () => {
    if (editingUserMessageId) {
      await rewindAndResendEditedMessage();
      return;
    }

    if (composerImageAttachment) {
      await submitImageAttachmentTurn();
      return;
    }

    const trimmedPrompt = draftInput.trim();
    const imageDecision =
      latestPendingImageTurnMessage && trimmedPrompt
        ? parseImagePostConfirmationDecision(trimmedPrompt)
        : null;
    if (latestPendingImageTurnMessage && imageDecision) {
      await submitImageConfirmationTurn({
        assistantMessageId: latestPendingImageTurnMessage.id,
        decision: imageDecision,
        displayUserMessage: trimmedPrompt,
      });
      return;
    }

    if (!isWorkspaceReadyForPrompts) {
      if (!trimmedPrompt) {
        return;
      }

      if (trimmedPrompt.trimStart().startsWith("/")) {
        setComposerInlineNotice("Slash commands unlock once setup finishes.");
        return;
      }

      if (queueShellFirstPrompt(trimmedPrompt, "composer")) {
        return;
      }
    }

    if (composerMode?.kind === "command") {
      setComposerInlineNotice(null);
      const commandResult = resolveComposerCommandSubmitResult({
        commandId: composerMode.commandId,
        input: draftInput,
      });
      if (commandResult.status === "blocked") {
        setComposerInlineNotice(commandResult.inlineNotice);
        return;
      }

      await submitComposerPrompt(commandResult.request.prompt, {
        intentOverride: commandResult.request.intentOverride,
        formatPreferenceOverride:
          commandResult.request.formatPreferenceOverride ?? null,
        artifactContextOverride: commandResult.request.artifactContext ?? null,
      });
      setActiveComposerCommand(null);
      return;
    }

    await submitComposerPrompt(draftInput);
  }, [
    composerImageAttachment,
    composerMode,
    draftInput,
    editingUserMessageId,
    isWorkspaceReadyForPrompts,
    latestPendingImageTurnMessage,
    queueShellFirstPrompt,
    rewindAndResendEditedMessage,
    setComposerInlineNotice,
    submitComposerPrompt,
    submitImageAttachmentTurn,
    submitImageConfirmationTurn,
  ]);

  const handleComposerSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitMainComposer();
    },
    [submitMainComposer],
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (editingUserMessageId && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void rewindAndResendEditedMessage();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submitMainComposer();
      }
    },
    [editingUserMessageId, rewindAndResendEditedMessage, submitMainComposer],
  );

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
    activeTurn: activeThreadTurn,
    activeThreadId,
    activeStrategyInputs,
    activeToneInputs,
    context,
    contract,
    fetchWorkspace,
    isSending,
    jumpThreadToBottomImmediately,
    searchParamsKey,
    setActiveTurn: setActiveThreadTurn,
    setIsThreadHydrating,
    setMessages,
    setStatusMessage,
    shouldJumpToBottomAfterThreadSwitchRef,
    threadCreatedInSessionRef,
  });

  const {
    heroGreeting,
    heroHandle,
    heroInitials,
    heroIdentityLabel,
    heroQuickActions,
    isNewChatHero,
    shouldCenterHero,
  } = composerViewState;
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
  const isComposerDisabled =
    isMainChatLocked || (!isWorkspaceReadyForPrompts && !canQueueInitialPrompt);
  const isAttachmentDisabled = isMainChatLocked || !isWorkspaceReadyForPrompts;
  const isSubmitDisabled =
    isMainChatLocked ||
    (!draftInput.trim() &&
      !composerImageAttachment &&
      composerMode?.kind !== "command");
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
  const handleMessageQuickReplySelect = useCallback(
    async (quickReply: ChatQuickReply) => {
      if (quickReply.kind === "image_post_confirmation") {
        const decision =
          quickReply.decision ?? parseImagePostConfirmationDecision(quickReply.value);
        if (!latestPendingImageTurnMessage || !decision) {
          return;
        }

        await submitImageConfirmationTurn({
          assistantMessageId: latestPendingImageTurnMessage.id,
          decision,
          displayUserMessage: quickReply.label,
        });
        return;
      }

      await handleQuickReplySelect(quickReply);
    },
    [
      handleQuickReplySelect,
      latestPendingImageTurnMessage,
      submitImageConfirmationTurn,
    ],
  );

  return (
    <main className="relative h-screen overflow-hidden bg-[#050505] text-white">
      <ChatWorkspaceCanvas
        workspaceChromeProps={{
          toolsMenuRef,
          toolsMenuOpen,
          setToolsMenuOpen,
          setSidebarOpen,
          setExtensionModalOpen,
          resetSourceMaterialDraft,
          openSourceMaterials,
          openDraftQueue,
          openContentHub,
          openAnalysis,
          openGrowthGuide,
          sidebarOpen,
          sidebarSearchQuery,
          setSidebarSearchQuery,
          earlierThreadsVisibleCount,
          expandEarlierThreads,
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
          startupState,
          hasQueuedInitialPrompt,
          hasContext: Boolean(context),
          hasContract: Boolean(contract),
          errorMessage,
          statusMessage,
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
          heroHandle,
          isVerifiedAccount,
          isLeavingHero,
          composerMode,
          draftInput,
          activePlaceholder,
          placeholderAnimationKey,
          shouldAnimatePlaceholder,
          slashCommands: composerViewState.slashCommands,
          slashCommandQuery,
          isSlashCommandPickerOpen: slashCommandQuery !== null,
          composerInlineNotice,
          composerImageAttachment,
          composerFileInputRef,
          onDraftInputChange: handleDraftInputChange,
          onCancelComposerMode: handleCancelComposerMode,
          onDismissSlashCommandPicker: handleDismissSlashCommandPicker,
          onComposerKeyDown: handleComposerKeyDown,
          onComposerSubmit: handleComposerSubmit,
          onComposerFileChange: handleComposerFileChange,
          onInterruptReply: () => {
            void interruptAssistantReply();
          },
          isComposerDisabled,
          isAttachmentDisabled,
          isSubmitDisabled,
          isSending,
          heroQuickActions,
          onQuickAction: (action: HeroQuickAction) => {
            if (action.kind === "prompt") {
              if (!isWorkspaceReadyForPrompts && queueShellFirstPrompt(action.prompt, "quick_action")) {
                return;
              }

              void submitQuickStarter(action.prompt);
              return;
            }

            if (action.kind === "command") {
              if (!canUseComposerCommands) {
                setComposerInlineNotice("This action unlocks once setup finishes.");
                return;
              }

              enterComposerCommandMode(action.commandId);
              setDraftInput("");
              return;
            }

            if (!isWorkspaceReadyForPrompts) {
              setComposerInlineNotice("This action unlocks once setup finishes.");
              return;
            }

            openComposerImagePicker();
          },
          onRetryWorkspaceStartup: retryWorkspaceStartup,
          onOpenComposerImagePicker: openComposerImagePicker,
          onRemoveComposerImageAttachment: clearComposerImageAttachment,
          onSelectSlashCommand: handleSelectSlashCommand,
          isNewChatHero,
          showScrollToLatest,
          shouldCenterHero,
          onScrollToBottom: scrollThreadToBottom,
        }}
        threadContent={
          <ChatMessageStreamSurface<ChatMessage>
            isVisible={!isNewChatHero && !isLeavingHero}
            messages={messages}
            latestAssistantMessageId={latestAssistantMessageId}
            typedAssistantLengths={typedAssistantLengths}
            copiedUserMessageId={copiedUserMessageId}
            editingUserMessageId={editingUserMessageId}
            registerMessageRef={registerMessageRef}
            activeDraftRevealByMessageId={activeDraftRevealByMessageId}
            activeAgentProgress={activeAgentProgress}
            composerCharacterLimit={composerCharacterLimit}
            isVerifiedAccount={isVerifiedAccount}
            isMainChatLocked={isMainChatLocked}
            showDevTools={showDevTools}
            selectedDraftMessageId={selectedDraftMessageId}
            selectedDraftVersionId={selectedDraftVersionId}
            selectedThreadPostByMessageId={selectedThreadPostByMessageId}
            expandedInlineThreadPreviewId={expandedInlineThreadPreviewId}
            copiedPreviewDraftMessageId={copiedPreviewDraftMessageId}
            dismissedAutoSavedSourceByMessageId={dismissedAutoSavedSourceByMessageId}
            autoSavedSourceUndoPendingByMessageId={autoSavedSourceUndoPendingByMessageId}
            messageFeedbackPendingById={messageFeedbackPendingById}
            canRunReplyActions={canRunReplyActions}
            contextIdentity={contextIdentity}
            onCopyUserMessage={(messageId, content) => {
              void handleCopyUserMessage(messageId, content);
            }}
            onEditUserMessage={(messageId, content) => {
              handleEditUserMessage(messageId, content);
            }}
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
            onUndoAutoSavedSourceMaterials={(messageId, autoSavedSourceMaterials) => {
              void undoAutoSavedSourceMaterials(messageId, autoSavedSourceMaterials);
            }}
            onSubmitAssistantMessageFeedback={(messageId, value) => {
              void submitAssistantMessageFeedback(messageId, value);
            }}
            onOpenScopedFeedback={(messageId) => {
              openScopedFeedbackDialog(messageId);
            }}
            onQuickReplySelect={(quickReply) => {
              void handleMessageQuickReplySelect(quickReply as ChatQuickReply);
            }}
            onAngleSelect={(title, selectedAngleFormatHint) => {
              void handleAngleSelect(title, selectedAngleFormatHint);
            }}
            onReplyOptionSelect={(optionIndex) => {
              void handleReplyOptionSelect(optionIndex);
            }}
            onSelectDraftBundleOption={(messageId, optionId, versionId) => {
              selectDraftBundleOption(messageId, optionId, versionId);
            }}
            onOpenDraftEditor={(messageId, versionId, threadPostIndex) => {
              openDraftEditor(messageId, versionId, threadPostIndex);
            }}
            onRequestDraftCardRevision={(
              messageId,
              prompt,
              revisionOptions,
            ) => {
              void requestDraftCardRevision(
                messageId,
                prompt,
                revisionOptions,
              );
            }}
            onToggleExpandedInlineThreadPreview={(messageId) => {
              setExpandedInlineThreadPreviewId((current) =>
                current === messageId ? null : messageId,
              );
            }}
            onCopyPreviewDraft={(messageId, content) => {
              void copyPreviewDraft(messageId, content);
            }}
            onShareDraftEditor={shareDraftEditorToX}
          />
        }
      />

      <DraftEditorSurfaceController
        open={Boolean(selectedDraftVersion && selectedDraftBundle)}
        identity={draftEditorIdentity}
        isVerifiedAccount={isVerifiedAccount}
        timelinePosition={selectedDraftTimelinePosition}
        timelineLength={selectedDraftTimeline.length}
        canNavigateDraftBack={canNavigateDraftBack}
        canNavigateDraftForward={canNavigateDraftForward}
        onNavigateTimeline={navigateDraftTimeline}
        onClose={() => setActiveDraftEditor(null)}
        shouldShowRevertDraftCta={shouldShowRevertDraftCta}
        revertToSelectedDraftVersion={revertToSelectedDraftVersion}
        saveDraftEditor={saveDraftEditor}
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
        setSelectedThreadPostByMessageId={setSelectedThreadPostByMessageId}
        onUpdateThreadDraftPost={updateThreadDraftPost}
        onMoveThreadDraftPost={moveThreadDraftPost}
        onSplitThreadDraftPost={splitThreadDraftPost}
        onMergeThreadDraftPostDown={mergeThreadDraftPostDown}
        onAddThreadDraftPost={addThreadDraftPost}
        onRemoveThreadDraftPost={removeThreadDraftPost}
        draftEditorSerializedContent={draftEditorSerializedContent}
        composerCharacterLimit={composerCharacterLimit}
        selectedDraftMaxCharacterLimit={
          selectedDraftVersion?.maxCharacterLimit ?? composerCharacterLimit
        }
        editorDraftText={editorDraftText}
        onChangeEditorDraftText={setEditorDraftText}
        isDraftInspectorLoading={isDraftInspectorLoading}
        runDraftInspector={runDraftInspector}
        hasCopiedDraftEditorText={hasCopiedDraftEditorText}
        copyDraftEditor={copyDraftEditor}
        onShareDraftEditor={shareDraftEditorToX}
        hasDraftEditorChanges={hasDraftEditorChanges}
      />

      <ChatOverlaysController
        contentHubDialogProps={{
          open: contentHubOpen,
          onOpenChange: handleContentHubOpenChange,
          fetchWorkspace,
          initialHandle: accountName,
          identity: {
            displayName: previewDisplayName,
            username: previewUsername,
            avatarUrl: previewAvatarUrl,
          },
          isVerifiedAccount,
        }}
        draftQueueOpen={draftQueueOpen}
        isDraftQueueLoading={isDraftQueueLoading}
        draftQueueError={draftQueueError}
        draftQueueItems={draftQueueItems}
        editingDraftCandidateId={editingDraftCandidateId}
        editingDraftCandidateText={editingDraftCandidateText}
        draftQueueActionById={draftQueueActionById}
        copiedPreviewDraftMessageId={copiedPreviewDraftMessageId}
        context={context}
        isVerifiedAccount={isVerifiedAccount}
        handleDraftQueueOpenChange={handleDraftQueueOpenChange}
        submitQuickStarter={submitQuickStarter}
        startEditingDraftCandidate={startEditingDraftCandidate}
        cancelEditingDraftCandidate={cancelEditingDraftCandidate}
        setEditingDraftCandidateText={setEditingDraftCandidateText}
        mutateDraftQueueCandidate={mutateDraftQueueCandidate}
        openObservedMetricsModal={openObservedMetricsModal}
        openSourceMaterialEditor={openSourceMaterialEditor}
        copyPreviewDraft={copyPreviewDraft}
        shareDraftEditorToX={shareDraftEditorToX}
        observedMetricsCandidate={observedMetricsCandidate}
        observedMetricsCandidateId={observedMetricsCandidateId}
        observedMetricsForm={observedMetricsForm}
        updateObservedMetricsField={updateObservedMetricsField}
        closeObservedMetricsModal={closeObservedMetricsModal}
        submitObservedMetrics={submitObservedMetrics}
        monetizationEnabled={monetizationEnabled}
        supportEmail={supportEmail}
        setPricingModalOpen={setPricingModalOpen}
        acknowledgePricingModal={acknowledgePricingModal}
        onSignOut={() => {
          void signOut({ callbackUrl: "/" });
        }}
        settingsModalOpen={settingsModalOpen}
        setSettingsModalOpen={setSettingsModalOpen}
        planStatusLabel={planStatusLabel}
        settingsPlanLabel={settingsPlanLabel}
        rateLimitResetLabel={rateLimitResetLabel}
        isOpeningBillingPortal={isOpeningBillingPortal}
        openBillingPortal={openBillingPortal}
        showRateLimitUpgradeCta={showRateLimitUpgradeCta}
        rateLimitUpgradeLabel={rateLimitUpgradeLabel}
        settingsCreditsRemaining={settingsCreditsRemaining}
        settingsCreditsUsed={settingsCreditsUsed}
        settingsCreditLimit={settingsCreditLimit}
        settingsCreditsRemainingPercent={settingsCreditsRemainingPercent}
        pricingModalOpen={pricingModalOpen}
        handlePricingModalOpenChange={handlePricingModalOpenChange}
        pricingModalDismissLabel={pricingModalDismissLabel}
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
        openCheckoutForOffer={openCheckoutForOffer}
        selectedModalProOffer={selectedModalProOffer}
        lifetimeAmountCents={lifetimeOffer?.amountCents ?? 0}
        lifetimeSlotSummary={lifetimeSlotSummary}
        lifetimeOfferEnabled={lifetimeOffer?.enabled !== false}
        feedbackModalOpen={feedbackModalOpen}
        setFeedbackModalOpen={setFeedbackModalOpen}
        submitFeedback={submitFeedback}
        feedbackCategory={feedbackCategory}
        setFeedbackCategory={setFeedbackCategory}
        feedbackSource={feedbackSource}
        feedbackScope={feedbackScope}
        activeFeedbackTitle={activeFeedbackTitle}
        updateActiveFeedbackTitle={updateActiveFeedbackTitle}
        activeFeedbackDraft={activeFeedbackDraft}
        updateActiveFeedbackDraft={updateActiveFeedbackDraft}
        discardFeedbackDraft={discardFeedbackDraft}
        feedbackEditorRef={feedbackEditorRef}
        handleFeedbackEditorKeyDown={handleFeedbackEditorKeyDown}
        applyFeedbackMarkdownToken={applyFeedbackMarkdownToken}
        feedbackImages={feedbackImages}
        feedbackFileInputRef={feedbackFileInputRef}
        isFeedbackDropActive={isFeedbackDropActive}
        handleFeedbackImageSelection={handleFeedbackImageSelection}
        handleFeedbackDropZoneDragOver={handleFeedbackDropZoneDragOver}
        handleFeedbackDropZoneDragLeave={handleFeedbackDropZoneDragLeave}
        handleFeedbackDropZoneDrop={handleFeedbackDropZoneDrop}
        removeFeedbackImage={removeFeedbackImage}
        accountName={accountName}
        activeThreadId={activeThreadId}
        feedbackHistory={feedbackHistory}
        feedbackHistoryFilter={feedbackHistoryFilter}
        setFeedbackHistoryFilter={setFeedbackHistoryFilter}
        feedbackHistoryQuery={feedbackHistoryQuery}
        setFeedbackHistoryQuery={setFeedbackHistoryQuery}
        isFeedbackHistoryLoading={isFeedbackHistoryLoading}
        feedbackStatusUpdatingIds={feedbackStatusUpdatingIds}
        updateFeedbackSubmissionStatus={updateFeedbackSubmissionStatus}
        sessionUserId={session?.user?.id ?? null}
        sessionEmail={session?.user?.email ?? null}
        feedbackSubmitNotice={feedbackSubmitNotice}
        isFeedbackSubmitting={isFeedbackSubmitting}
        extensionModalOpen={extensionModalOpen}
        setExtensionModalOpen={setExtensionModalOpen}
        sourceMaterialsOpen={sourceMaterialsOpen}
        setSourceMaterialsOpen={setSourceMaterialsOpen}
        seedSourceMaterials={seedSourceMaterials}
        isSourceMaterialsLoading={isSourceMaterialsLoading}
        isSourceMaterialsSaving={isSourceMaterialsSaving}
        sourceMaterialsNotice={sourceMaterialsNotice}
        sourceMaterialDraft={sourceMaterialDraft}
        resetSourceMaterialDraft={resetSourceMaterialDraft}
        clearSourceMaterialsNotice={clearSourceMaterialsNotice}
        applyClaimExample={applyClaimExample}
        updateSourceMaterialTitle={updateSourceMaterialTitle}
        updateSourceMaterialType={updateSourceMaterialType}
        toggleSourceMaterialVerified={toggleSourceMaterialVerified}
        updateSourceMaterialClaims={updateSourceMaterialClaims}
        sourceMaterialAdvancedOpen={sourceMaterialAdvancedOpen}
        toggleSourceMaterialAdvancedOpen={toggleSourceMaterialAdvancedOpen}
        updateSourceMaterialTags={updateSourceMaterialTags}
        updateSourceMaterialSnippets={updateSourceMaterialSnippets}
        updateSourceMaterialDoNotClaim={updateSourceMaterialDoNotClaim}
        deleteSourceMaterial={deleteSourceMaterial}
        saveSourceMaterial={saveSourceMaterial}
        sourceMaterialsLibraryOpen={sourceMaterialsLibraryOpen}
        toggleSourceMaterialsLibraryOpen={toggleSourceMaterialsLibraryOpen}
        sourceMaterials={sourceMaterials}
        selectSourceMaterial={selectSourceMaterial}
        preferencesOpen={preferencesOpen}
        setPreferencesOpen={setPreferencesOpen}
        savePreferences={savePreferences}
        isPreferencesLoading={isPreferencesLoading}
        isPreferencesSaving={isPreferencesSaving}
        preferenceCasing={preferenceCasing}
        setPreferenceCasing={setPreferenceCasing}
        preferenceBulletStyle={preferenceBulletStyle}
        setPreferenceBulletStyle={setPreferenceBulletStyle}
        preferenceWritingMode={preferenceWritingMode}
        setPreferenceWritingMode={setPreferenceWritingMode}
        preferenceUseEmojis={preferenceUseEmojis}
        togglePreferenceUseEmojis={togglePreferenceUseEmojis}
        preferenceAllowProfanity={preferenceAllowProfanity}
        togglePreferenceAllowProfanity={togglePreferenceAllowProfanity}
        preferenceBlacklistInput={preferenceBlacklistInput}
        handlePreferenceBlacklistInputChange={handlePreferenceBlacklistInputChange}
        handlePreferenceBlacklistInputKeyDown={handlePreferenceBlacklistInputKeyDown}
        preferenceBlacklistedTerms={preferenceBlacklistedTerms}
        removePreferenceBlacklistedTerm={removePreferenceBlacklistedTerm}
        effectivePreferenceMaxCharacters={effectivePreferenceMaxCharacters}
        setPreferenceMaxCharacters={setPreferenceMaxCharacters}
        previewDisplayName={previewDisplayName}
        previewUsername={previewUsername}
        previewAvatarUrl={previewAvatarUrl}
        preferencesPreviewDraft={preferencesPreviewDraft}
        preferencesPreviewCounter={preferencesPreviewCounter}
        playbookModalOpen={playbookModalOpen}
        handleGrowthGuideOpenChange={handleGrowthGuideOpenChange}
        playbookStage={playbookStage}
        setPlaybookStage={setPlaybookStage}
        filteredStagePlaybooks={filteredStagePlaybooks}
        selectedPlaybook={selectedPlaybook}
        handleApplyPlaybook={handleApplyPlaybook}
        growthGuideSelectedPlaybookRef={growthGuideSelectedPlaybookRef}
        playbookTemplateTab={playbookTemplateTab}
        setPlaybookTemplateTab={setPlaybookTemplateTab}
        personalizedPlaybookTemplates={personalizedPlaybookTemplates}
        activePlaybookTemplateId={activePlaybookTemplate?.id ?? null}
        setActivePlaybookTemplateId={setActivePlaybookTemplateId}
        activePlaybookTemplateText={activePlaybookTemplate?.text ?? null}
        playbookTemplatePreviewCounter={playbookTemplatePreviewCounter}
        copiedPlaybookTemplateId={copiedPlaybookTemplateId}
        handleCopyPlaybookTemplate={handleCopyPlaybookTemplate}
        buildTemplateWhyItWorksPoints={buildTemplateWhyItWorksPoints}
        growthGuidePreviewDisplayName={growthGuidePreviewDisplayName}
        growthGuidePreviewUsername={growthGuidePreviewUsername}
        growthGuidePreviewAvatarUrl={growthGuidePreviewAvatarUrl}
        openFeedbackDialog={openFeedbackDialog}
        openAnalysis={openAnalysis}
        analysisOpen={analysisOpen}
        setAnalysisOpen={setAnalysisOpen}
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
        handleManualProfileScrapeRefresh={handleManualProfileScrapeRefresh}
        closeAnalysis={closeAnalysis}
        handleHeaderClaritySelection={handleHeaderClaritySelection}
        handleBioAlternativeCopied={handleBioAlternativeCopied}
        handleBioAlternativeRefine={handleBioAlternativeRefine}
        handlePinnedPromptStart={handlePinnedPromptStart}
        openGrowthGuide={openGrowthGuide}
        openGrowthGuideForRecommendation={openGrowthGuideForRecommendation}
        isAddAccountModalOpen={isAddAccountModalOpen}
        requiresXAccountGate={requiresXAccountGate}
        isAddAccountSubmitting={isAddAccountSubmitting}
        addAccountPreview={addAccountPreview}
        normalizedAddAccount={normalizedAddAccount}
        addAccountLoadingStepIndex={addAccountLoadingStepIndex}
        addAccountLoadingSteps={addAccountLoadingSteps}
        closeAddAccountModal={closeAddAccountModal}
        handleAddAccountSubmit={handleAddAccountSubmit}
        addAccountInput={addAccountInput}
        updateAddAccountInput={updateAddAccountInput}
        readyAccountHandle={readyAccountHandle}
        hasValidAddAccountPreview={hasValidAddAccountPreview}
        isAddAccountPreviewLoading={isAddAccountPreviewLoading}
        addAccountError={addAccountError}
        threadToDelete={threadToDelete}
        clearThreadToDelete={clearThreadToDelete}
        confirmDeleteThread={confirmDeleteThread}
      />
    </main >
  );
}
