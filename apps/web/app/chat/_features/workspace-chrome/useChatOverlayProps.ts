"use client";

import type {
  DragEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

import type { DraftQueueCandidate } from "../draft-queue/draftQueueViewState";
import type { ChatOverlaysProps } from "./ChatOverlays";

interface UseChatOverlayPropsOptions {
  draftQueueOpen: boolean;
  isDraftQueueLoading: boolean;
  draftQueueError: string | null;
  draftQueueItems: DraftQueueCandidate[];
  editingDraftCandidateId: string | null;
  editingDraftCandidateText: string;
  draftQueueActionById: Record<string, string>;
  copiedPreviewDraftMessageId: string | null;
  context: CreatorAgentContext | null;
  isVerifiedAccount: boolean;
  handleDraftQueueOpenChange: (open: boolean) => void;
  submitQuickStarter: (prompt: string) => Promise<void>;
  startEditingDraftCandidate: (candidateId: string) => void;
  cancelEditingDraftCandidate: () => void;
  setEditingDraftCandidateText: (value: string) => void;
  mutateDraftQueueCandidate: (candidateId: string, payload: {
    action: "approve" | "reject" | "edit" | "posted" | "observed" | "regenerate";
    content?: string;
    rejectionReason?: string;
    observedMetrics?: Record<string, unknown>;
  }) => Promise<void>;
  openObservedMetricsModal: (candidate: DraftQueueCandidate) => void;
  openSourceMaterialEditor: (params: { assetId?: string; title?: string | null }) => Promise<void>;
  copyPreviewDraft: (messageId: string, content: string) => Promise<void>;
  shareDraftEditorToX: () => void;
  observedMetricsCandidate: DraftQueueCandidate | null;
  observedMetricsCandidateId: string | null;
  observedMetricsForm: {
    likeCount: string;
    replyCount: string;
    profileClicks: string;
    followerDelta: string;
  };
  updateObservedMetricsField: (
    field: "likeCount" | "replyCount" | "profileClicks" | "followerDelta",
    value: string,
  ) => void;
  closeObservedMetricsModal: () => void;
  submitObservedMetrics: () => Promise<void>;
  monetizationEnabled: boolean;
  supportEmail: string;
  setPricingModalOpen: (open: boolean) => void;
  acknowledgePricingModal: () => Promise<void>;
  onSignOut: () => void;
  settingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  planStatusLabel: string;
  settingsPlanLabel: string;
  rateLimitResetLabel: string | null;
  isOpeningBillingPortal: boolean;
  openBillingPortal: () => Promise<void>;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string | null;
  settingsCreditsRemaining: number;
  settingsCreditsUsed: number;
  settingsCreditLimit: number;
  settingsCreditsRemainingPercent: number;
  pricingModalOpen: boolean;
  handlePricingModalOpenChange: (open: boolean) => void;
  pricingModalDismissLabel: string;
  selectedModalProIsAnnual: boolean;
  selectedModalProCents: number;
  selectedModalProPriceSuffix: string;
  setSelectedModalProCadence: (annual: boolean) => void;
  isProActive: boolean;
  isFounderCurrent: boolean;
  selectedModalProIsCurrent: boolean;
  selectedModalProNeedsPortalSwitch: boolean;
  selectedModalProOfferEnabled: boolean;
  selectedModalProButtonLabel: string;
  isSelectedModalProCheckoutLoading: boolean;
  openCheckoutForOffer: (offer: "pro_monthly" | "pro_annual" | "lifetime") => Promise<void>;
  selectedModalProOffer: "pro_monthly" | "pro_annual" | null;
  lifetimeAmountCents: number;
  lifetimeSlotSummary: string | null;
  lifetimeOfferEnabled: boolean;
  feedbackModalOpen: boolean;
  setFeedbackModalOpen: (open: boolean) => void;
  submitFeedback: () => Promise<void>;
  feedbackCategory: "bug" | "feature" | "general";
  setFeedbackCategory: (value: "bug" | "feature" | "general") => void;
  activeFeedbackTitle: string;
  updateActiveFeedbackTitle: (value: string) => void;
  activeFeedbackDraft: string;
  updateActiveFeedbackDraft: (value: string) => void;
  feedbackEditorRef: RefObject<HTMLTextAreaElement | null>;
  handleFeedbackEditorKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  applyFeedbackMarkdownToken: (token: "bold" | "italic" | "code" | "bullet") => void;
  feedbackImages: Array<{
    id: string;
    url: string;
    fileName: string;
    mimeType: string;
  }>;
  feedbackFileInputRef: RefObject<HTMLInputElement | null>;
  isFeedbackDropActive: boolean;
  handleFeedbackImageSelection: (files: FileList | File[]) => void;
  handleFeedbackDropZoneDragOver: DragEventHandler<HTMLDivElement>;
  handleFeedbackDropZoneDragLeave: DragEventHandler<HTMLDivElement>;
  handleFeedbackDropZoneDrop: DragEventHandler<HTMLDivElement>;
  removeFeedbackImage: (imageId: string) => void;
  accountName: string | null;
  activeThreadId: string | null;
  feedbackHistory: Array<{
    id: string;
    title: string | null;
    category: string;
    status: string;
    createdAt: string;
  }>;
  feedbackHistoryFilter: "all" | "open" | "closed";
  setFeedbackHistoryFilter: (value: "all" | "open" | "closed") => void;
  feedbackHistoryQuery: string;
  setFeedbackHistoryQuery: (value: string) => void;
  isFeedbackHistoryLoading: boolean;
  feedbackStatusUpdatingIds: Record<string, boolean>;
  updateFeedbackSubmissionStatus: (
    submissionId: string,
    status: "open" | "closed",
  ) => Promise<void>;
  sessionUserId: string | null;
  sessionEmail: string | null;
  feedbackSubmitNotice: string | null;
  isFeedbackSubmitting: boolean;
  extensionModalOpen: boolean;
  setExtensionModalOpen: (open: boolean) => void;
  sourceMaterialsOpen: boolean;
  setSourceMaterialsOpen: (open: boolean) => void;
  seedSourceMaterials: () => Promise<void>;
  isSourceMaterialsLoading: boolean;
  isSourceMaterialsSaving: boolean;
  sourceMaterialsNotice: string | null;
  sourceMaterialDraft: {
    id: string | null;
    title: string;
    type: string;
    verified: boolean;
    claims: string[];
    tags: string[];
    snippets: string[];
    doNotClaim: string[];
  };
  resetSourceMaterialDraft: () => void;
  clearSourceMaterialsNotice: () => void;
  applyClaimExample: (claim: string) => void;
  updateSourceMaterialTitle: (value: string) => void;
  updateSourceMaterialType: (value: string) => void;
  toggleSourceMaterialVerified: () => void;
  updateSourceMaterialClaims: (value: string) => void;
  sourceMaterialAdvancedOpen: boolean;
  toggleSourceMaterialAdvancedOpen: () => void;
  updateSourceMaterialTags: (value: string) => void;
  updateSourceMaterialSnippets: (value: string) => void;
  updateSourceMaterialDoNotClaim: (value: string) => void;
  deleteSourceMaterial: () => Promise<void>;
  saveSourceMaterial: () => Promise<void>;
  sourceMaterialsLibraryOpen: boolean;
  toggleSourceMaterialsLibraryOpen: () => void;
  sourceMaterials: Array<{
    id: string;
    title: string;
    type: string;
    verified: boolean;
  }>;
  selectSourceMaterial: (materialId: string) => void;
  preferencesOpen: boolean;
  setPreferencesOpen: (open: boolean) => void;
  savePreferences: () => Promise<void>;
  isPreferencesLoading: boolean;
  isPreferencesSaving: boolean;
  preferenceCasing: "normal" | "lowercase";
  setPreferenceCasing: (value: "normal" | "lowercase") => void;
  preferenceBulletStyle: "dash" | "bullet" | "numbered";
  setPreferenceBulletStyle: (value: "dash" | "bullet" | "numbered") => void;
  preferenceWritingMode: "direct" | "polished" | "punchy";
  setPreferenceWritingMode: (value: "direct" | "polished" | "punchy") => void;
  preferenceUseEmojis: boolean;
  togglePreferenceUseEmojis: () => void;
  preferenceAllowProfanity: boolean;
  togglePreferenceAllowProfanity: () => void;
  preferenceBlacklistInput: string;
  handlePreferenceBlacklistInputChange: (value: string) => void;
  handlePreferenceBlacklistInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  preferenceBlacklistedTerms: string[];
  removePreferenceBlacklistedTerm: (term: string) => void;
  effectivePreferenceMaxCharacters: number;
  setPreferenceMaxCharacters: (value: number) => void;
  previewDisplayName: string;
  previewUsername: string;
  previewAvatarUrl: string | null;
  preferencesPreviewDraft: string;
  preferencesPreviewCounter: string;
  playbookModalOpen: boolean;
  handleGrowthGuideOpenChange: (open: boolean) => void;
  playbookStage: string;
  setPlaybookStage: (value: string) => void;
  filteredStagePlaybooks: unknown[];
  selectedPlaybook: unknown;
  handleApplyPlaybook: (playbook: unknown) => void;
  growthGuideSelectedPlaybookRef: RefObject<HTMLElement | null>;
  playbookTemplateTab: string;
  setPlaybookTemplateTab: (value: string) => void;
  personalizedPlaybookTemplates: unknown[];
  activePlaybookTemplateId: string | null;
  setActivePlaybookTemplateId: (value: string | null) => void;
  activePlaybookTemplateText: string | null;
  playbookTemplatePreviewCounter: string;
  copiedPlaybookTemplateId: string | null;
  handleCopyPlaybookTemplate: (template: unknown) => Promise<void>;
  buildTemplateWhyItWorksPoints: (tab: string) => string[];
  growthGuidePreviewDisplayName: string;
  growthGuidePreviewUsername: string;
  growthGuidePreviewAvatarUrl: string | null;
  openFeedbackDialog: () => void;
  openAnalysis: () => void;
  analysisOpen: boolean;
  setAnalysisOpen: (open: boolean) => void;
  currentPlaybookStage: string | null;
  analysisFollowerProgress: unknown;
  analysisDiagnosisSummary: string | null;
  analysisSnapshotCards: unknown[];
  analysisPositioningIsTentative: boolean;
  analysisPriorityItems: string[];
  analysisRecommendedPlaybooks: unknown[];
  analysisLearningStrengths: string[];
  analysisLearningCautions: string[];
  analysisLearningExperiments: string[];
  analysisReplyConversionHighlights: string[];
  analysisVoiceSignalChips: string[];
  analysisKeepList: string[];
  analysisAvoidList: string[];
  analysisEvidencePosts: unknown[];
  analysisScrapeNotice: string | null;
  analysisScrapeNoticeTone: "default" | "warning" | "success";
  isAnalysisScrapeCoolingDown: boolean;
  analysisScrapeCooldownLabel: string | null;
  isAnalysisScrapeRefreshing: boolean;
  handleManualProfileScrapeRefresh: () => Promise<void>;
  closeAnalysis: () => void;
  openGrowthGuide: () => void;
  openGrowthGuideForRecommendation: (stage: string, playbookId: string) => void;
  isAddAccountModalOpen: boolean;
  requiresXAccountGate: boolean;
  isAddAccountSubmitting: boolean;
  addAccountPreview: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  normalizedAddAccount: string;
  addAccountLoadingStepIndex: number;
  addAccountLoadingSteps: string[];
  closeAddAccountModal: () => void;
  handleAddAccountSubmit: () => Promise<void>;
  addAccountInput: string;
  updateAddAccountInput: (value: string) => void;
  readyAccountHandle: string | null;
  hasValidAddAccountPreview: boolean;
  isAddAccountPreviewLoading: boolean;
  addAccountError: string | null;
  threadToDelete: { title?: string | null } | null;
  clearThreadToDelete: () => void;
  confirmDeleteThread: () => Promise<void>;
}

export function useChatOverlayProps(
  options: UseChatOverlayPropsOptions,
): ChatOverlaysProps {
  return {
      draftQueueModalsProps: {
        draftQueueDialogProps: {
          open: options.draftQueueOpen,
          isLoading: options.isDraftQueueLoading,
          errorMessage: options.draftQueueError,
          items: options.draftQueueItems,
          editingCandidateId: options.editingDraftCandidateId,
          editingCandidateText: options.editingDraftCandidateText,
          actionById: options.draftQueueActionById,
          copiedPreviewDraftMessageId: options.copiedPreviewDraftMessageId,
          canGenerateInChat: Boolean(options.context?.runId),
          isVerifiedAccount: options.isVerifiedAccount,
          onOpenChange: options.handleDraftQueueOpenChange,
          onGenerateInChat: () => {
            options.handleDraftQueueOpenChange(false);
            void options.submitQuickStarter("draft 4 posts from what you know about me");
          },
          onStartEditingCandidate: options.startEditingDraftCandidate,
          onCancelEditingCandidate: options.cancelEditingDraftCandidate,
          onEditCandidateTextChange: options.setEditingDraftCandidateText,
          onMutateCandidate: (candidateId, payload) => {
            void options.mutateDraftQueueCandidate(candidateId, payload);
          },
          onOpenObservedMetrics: options.openObservedMetricsModal,
          onOpenSourceMaterial: (params) => {
            void options.openSourceMaterialEditor(params);
          },
          onCopyCandidateDraft: (candidateId, content) => {
            void options.copyPreviewDraft(candidateId, content);
          },
          onOpenX: options.shareDraftEditorToX,
        },
        observedMetricsOpen: Boolean(options.observedMetricsCandidate),
        observedMetricsCandidateTitle: options.observedMetricsCandidate?.title ?? null,
        observedMetricsValue: options.observedMetricsForm,
        observedMetricsSubmitting:
          options.draftQueueActionById[options.observedMetricsCandidateId || ""] ===
          "observed",
        observedMetricsErrorMessage: options.draftQueueError,
        onObservedMetricsChange: options.updateObservedMetricsField,
        onObservedMetricsOpenChange: (open) => {
          if (!open) {
            options.closeObservedMetricsModal();
          }
        },
        onSubmitObservedMetrics: () => {
          void options.submitObservedMetrics();
        },
      },
      billingDialogsProps: {
        monetizationEnabled: options.monetizationEnabled,
        supportEmail: options.supportEmail,
        onOpenPricingPage: () => {
          options.setPricingModalOpen(false);
          void options.acknowledgePricingModal();
          window.location.href = "/pricing";
        },
        onSignOut: options.onSignOut,
        settingsDialogProps: {
          open: options.settingsModalOpen,
          onOpenChange: options.setSettingsModalOpen,
          planStatusLabel: options.planStatusLabel,
          settingsPlanLabel: options.settingsPlanLabel,
          rateLimitResetLabel: options.rateLimitResetLabel,
          isOpeningBillingPortal: options.isOpeningBillingPortal,
          onOpenBillingPortal: () => {
            void options.openBillingPortal();
          },
          showRateLimitUpgradeCta: options.showRateLimitUpgradeCta,
          rateLimitUpgradeLabel: options.rateLimitUpgradeLabel,
          onOpenPricing: () => {
            options.setSettingsModalOpen(false);
            if (options.monetizationEnabled) {
              options.setPricingModalOpen(true);
            }
          },
          settingsCreditsRemaining: options.settingsCreditsRemaining,
          settingsCreditsUsed: options.settingsCreditsUsed,
          settingsCreditLimit: options.settingsCreditLimit,
          settingsCreditsRemainingPercent: options.settingsCreditsRemainingPercent,
        },
        pricingDialogProps: {
          open: options.pricingModalOpen,
          onOpenChange: options.handlePricingModalOpenChange,
          dismissLabel: options.pricingModalDismissLabel,
          selectedModalProIsAnnual: options.selectedModalProIsAnnual,
          selectedModalProCents: options.selectedModalProCents,
          selectedModalProPriceSuffix: options.selectedModalProPriceSuffix,
          setSelectedModalProCadence: options.setSelectedModalProCadence,
          isProActive: options.isProActive,
          isFounderCurrent: options.isFounderCurrent,
          selectedModalProIsCurrent: options.selectedModalProIsCurrent,
          selectedModalProNeedsPortalSwitch: options.selectedModalProNeedsPortalSwitch,
          selectedModalProOfferEnabled: options.selectedModalProOfferEnabled,
          selectedModalProButtonLabel: options.selectedModalProButtonLabel,
          isSelectedModalProCheckoutLoading: options.isSelectedModalProCheckoutLoading,
          isOpeningBillingPortal: options.isOpeningBillingPortal,
          onOpenBillingPortal: () => {
            void options.openBillingPortal();
          },
          onOpenCheckout: (offer) => {
            void options.openCheckoutForOffer(offer);
          },
          selectedModalProOffer: options.selectedModalProOffer,
          lifetimeAmountCents: options.lifetimeAmountCents,
          lifetimeSlotSummary: options.lifetimeSlotSummary,
          lifetimeOfferEnabled: options.lifetimeOfferEnabled,
        },
      },
      feedbackDialogProps: {
        open: options.feedbackModalOpen,
        onOpenChange: options.setFeedbackModalOpen,
        onSubmit: options.submitFeedback,
        feedbackCategory: options.feedbackCategory,
        onFeedbackCategoryChange: options.setFeedbackCategory,
        activeFeedbackTitle: options.activeFeedbackTitle,
        onActiveFeedbackTitleChange: options.updateActiveFeedbackTitle,
        activeFeedbackDraft: options.activeFeedbackDraft,
        onActiveFeedbackDraftChange: options.updateActiveFeedbackDraft,
        feedbackEditorRef: options.feedbackEditorRef,
        onFeedbackEditorKeyDown: options.handleFeedbackEditorKeyDown,
        onInsertMarkdownToken: options.applyFeedbackMarkdownToken,
        feedbackImages: options.feedbackImages,
        feedbackFileInputRef: options.feedbackFileInputRef,
        isFeedbackDropActive: options.isFeedbackDropActive,
        onFeedbackImageSelection: options.handleFeedbackImageSelection,
        onFeedbackDropZoneDragOver: options.handleFeedbackDropZoneDragOver,
        onFeedbackDropZoneDragLeave: options.handleFeedbackDropZoneDragLeave,
        onFeedbackDropZoneDrop: options.handleFeedbackDropZoneDrop,
        onRemoveFeedbackImage: options.removeFeedbackImage,
        profileHandle: options.context?.account ?? options.accountName ?? "unknown",
        avatarUrl: options.context?.avatarUrl ?? null,
        submittingEmail: options.sessionEmail ?? "email unavailable",
        activeThreadId: options.activeThreadId,
        feedbackHistory: options.feedbackHistory,
        feedbackHistoryFilter: options.feedbackHistoryFilter,
        onFeedbackHistoryFilterChange: options.setFeedbackHistoryFilter,
        feedbackHistoryQuery: options.feedbackHistoryQuery,
        onFeedbackHistoryQueryChange: options.setFeedbackHistoryQuery,
        isFeedbackHistoryLoading: options.isFeedbackHistoryLoading,
        feedbackStatusUpdatingIds: options.feedbackStatusUpdatingIds,
        onUpdateFeedbackSubmissionStatus: (submissionId, status) => {
          void options.updateFeedbackSubmissionStatus(submissionId, status);
        },
        currentUserId: options.sessionUserId,
        feedbackSubmitNotice: options.feedbackSubmitNotice,
        isFeedbackSubmitting: options.isFeedbackSubmitting,
      },
      extensionDialogProps: {
        open: options.extensionModalOpen,
        onOpenChange: options.setExtensionModalOpen,
      },
      sourceMaterialsDialogProps: {
        open: options.sourceMaterialsOpen,
        onOpenChange: options.setSourceMaterialsOpen,
        onSeedSourceMaterials: () => {
          void options.seedSourceMaterials();
        },
        isSourceMaterialsLoading: options.isSourceMaterialsLoading,
        isSourceMaterialsSaving: options.isSourceMaterialsSaving,
        sourceMaterialsNotice: options.sourceMaterialsNotice,
        sourceMaterialDraft: options.sourceMaterialDraft,
        onClearDraft: () => {
          options.resetSourceMaterialDraft();
          options.clearSourceMaterialsNotice();
        },
        onApplyClaimExample: options.applyClaimExample,
        onDraftTitleChange: options.updateSourceMaterialTitle,
        onDraftTypeChange: options.updateSourceMaterialType,
        onToggleDraftVerified: options.toggleSourceMaterialVerified,
        onDraftClaimsChange: options.updateSourceMaterialClaims,
        sourceMaterialAdvancedOpen: options.sourceMaterialAdvancedOpen,
        onToggleSourceMaterialAdvancedOpen: options.toggleSourceMaterialAdvancedOpen,
        onDraftTagsChange: options.updateSourceMaterialTags,
        onDraftSnippetsChange: options.updateSourceMaterialSnippets,
        onDraftDoNotClaimChange: options.updateSourceMaterialDoNotClaim,
        onDeleteSourceMaterial: () => {
          void options.deleteSourceMaterial();
        },
        onSaveSourceMaterial: () => {
          void options.saveSourceMaterial();
        },
        sourceMaterialsLibraryOpen: options.sourceMaterialsLibraryOpen,
        onToggleSourceMaterialsLibraryOpen: options.toggleSourceMaterialsLibraryOpen,
        sourceMaterials: options.sourceMaterials,
        onSelectSourceMaterial: options.selectSourceMaterial,
      },
      preferencesDialogProps: options.context
        ? {
            open: options.preferencesOpen,
            onOpenChange: options.setPreferencesOpen,
            onSave: () => {
              void options.savePreferences();
            },
            isPreferencesLoading: options.isPreferencesLoading,
            isPreferencesSaving: options.isPreferencesSaving,
            preferenceCasing: options.preferenceCasing,
            onPreferenceCasingChange: options.setPreferenceCasing,
            preferenceBulletStyle: options.preferenceBulletStyle,
            onPreferenceBulletStyleChange: options.setPreferenceBulletStyle,
            preferenceWritingMode: options.preferenceWritingMode,
            onPreferenceWritingModeChange: options.setPreferenceWritingMode,
            preferenceUseEmojis: options.preferenceUseEmojis,
            onTogglePreferenceUseEmojis: options.togglePreferenceUseEmojis,
            preferenceAllowProfanity: options.preferenceAllowProfanity,
            onTogglePreferenceAllowProfanity: options.togglePreferenceAllowProfanity,
            preferenceBlacklistInput: options.preferenceBlacklistInput,
            onPreferenceBlacklistInputChange: options.handlePreferenceBlacklistInputChange,
            onPreferenceBlacklistInputKeyDown: options.handlePreferenceBlacklistInputKeyDown,
            preferenceBlacklistedTerms: options.preferenceBlacklistedTerms,
            onRemovePreferenceBlacklistedTerm: options.removePreferenceBlacklistedTerm,
            isVerifiedAccount: options.isVerifiedAccount,
            effectivePreferenceMaxCharacters: options.effectivePreferenceMaxCharacters,
            onPreferenceMaxCharactersChange: options.setPreferenceMaxCharacters,
            previewDisplayName: options.previewDisplayName,
            previewUsername: options.previewUsername,
            previewAvatarUrl: options.previewAvatarUrl,
            preferencesPreviewDraft: options.preferencesPreviewDraft,
            preferencesPreviewCounter: options.preferencesPreviewCounter,
          }
        : null,
      growthGuideDialogProps: options.context
        ? {
            open: options.playbookModalOpen,
            onOpenChange: options.handleGrowthGuideOpenChange,
            playbookStage: options.playbookStage,
            onPlaybookStageChange: options.setPlaybookStage,
            filteredStagePlaybooks: options.filteredStagePlaybooks,
            selectedPlaybook: options.selectedPlaybook,
            onSelectPlaybook: options.handleApplyPlaybook,
            selectedPlaybookRef: options.growthGuideSelectedPlaybookRef,
            playbookTemplateTab: options.playbookTemplateTab,
            onPlaybookTemplateTabChange: options.setPlaybookTemplateTab,
            personalizedPlaybookTemplates: options.personalizedPlaybookTemplates,
            activePlaybookTemplateId: options.activePlaybookTemplateId,
            onActivePlaybookTemplateChange: options.setActivePlaybookTemplateId,
            activePlaybookTemplateText: options.activePlaybookTemplateText,
            playbookTemplatePreviewCounter: options.playbookTemplatePreviewCounter,
            copiedPlaybookTemplateId: options.copiedPlaybookTemplateId,
            onCopyPlaybookTemplate: (template) => {
              void options.handleCopyPlaybookTemplate(template);
            },
            templateWhyItWorksPoints: options.buildTemplateWhyItWorksPoints(
              options.playbookTemplateTab,
            ),
            previewDisplayName: options.growthGuidePreviewDisplayName,
            previewUsername: options.growthGuidePreviewUsername,
            previewAvatarUrl: options.growthGuidePreviewAvatarUrl,
            isVerifiedAccount: options.isVerifiedAccount,
            onOpenFeedback: () => {
              options.handleGrowthGuideOpenChange(false);
              options.openFeedbackDialog();
            },
            onOpenProfileAnalysis: () => {
              options.handleGrowthGuideOpenChange(false);
              options.openAnalysis();
            },
          }
        : null,
      profileAnalysisDialogKey: options.context
        ? `${options.context.account}-${options.analysisOpen ? "open" : "closed"}`
        : undefined,
      profileAnalysisDialogProps: options.context
        ? {
            open: options.analysisOpen,
            onOpenChange: options.setAnalysisOpen,
            context: options.context,
            accountName: options.accountName,
            isVerifiedAccount: options.isVerifiedAccount,
            currentPlaybookStage: options.currentPlaybookStage,
            analysisFollowerProgress: options.analysisFollowerProgress,
            analysisDiagnosisSummary: options.analysisDiagnosisSummary,
            analysisSnapshotCards: options.analysisSnapshotCards,
            analysisPositioningIsTentative: options.analysisPositioningIsTentative,
            analysisPriorityItems: options.analysisPriorityItems,
            analysisRecommendedPlaybooks: options.analysisRecommendedPlaybooks,
            analysisLearningStrengths: options.analysisLearningStrengths,
            analysisLearningCautions: options.analysisLearningCautions,
            analysisLearningExperiments: options.analysisLearningExperiments,
            analysisReplyConversionHighlights: options.analysisReplyConversionHighlights,
            analysisVoiceSignalChips: options.analysisVoiceSignalChips,
            analysisKeepList: options.analysisKeepList,
            analysisAvoidList: options.analysisAvoidList,
            analysisEvidencePosts: options.analysisEvidencePosts,
            analysisScrapeNotice: options.analysisScrapeNotice,
            analysisScrapeNoticeTone: options.analysisScrapeNoticeTone,
            isAnalysisScrapeCoolingDown: options.isAnalysisScrapeCoolingDown,
            analysisScrapeCooldownLabel: options.analysisScrapeCooldownLabel,
            isAnalysisScrapeRefreshing: options.isAnalysisScrapeRefreshing,
            onRefreshScrape: () => {
              void options.handleManualProfileScrapeRefresh();
            },
            onOpenFeedback: () => {
              options.closeAnalysis();
              options.openFeedbackDialog();
            },
            onOpenGrowthGuide: () => {
              options.closeAnalysis();
              options.openGrowthGuide();
            },
            onOpenGrowthGuideForRecommendation: (stage, playbookId) => {
              options.closeAnalysis();
              options.openGrowthGuideForRecommendation(stage, playbookId);
            },
          }
        : null,
      addAccountDialogProps: {
        open: options.isAddAccountModalOpen,
        requiresXAccountGate: options.requiresXAccountGate,
        isSubmitting: options.isAddAccountSubmitting,
        preview: options.addAccountPreview,
        normalizedHandle: options.normalizedAddAccount,
        loadingStepIndex: options.addAccountLoadingStepIndex,
        loadingSteps: options.addAccountLoadingSteps,
        onOpenChange: (open) => {
          if (!open) {
            options.closeAddAccountModal();
          }
        },
        onSubmit: options.handleAddAccountSubmit,
        inputValue: options.addAccountInput,
        onInputValueChange: options.updateAddAccountInput,
        readyAccountHandle: options.readyAccountHandle,
        hasValidPreview: options.hasValidAddAccountPreview,
        isPreviewLoading: options.isAddAccountPreviewLoading,
        errorMessage: options.addAccountError,
      },
      threadDeleteDialogProps: {
        open: Boolean(options.threadToDelete),
        threadTitle: options.threadToDelete?.title ?? null,
        onOpenChange: (open) => {
          if (!open) {
            options.clearThreadToDelete();
          }
        },
        onConfirmDelete: () => {
          void options.confirmDeleteThread();
        },
      },
    };
}
