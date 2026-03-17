"use client";

import type {
  ChangeEventHandler,
  DragEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";

import type { CreatorAgentContext } from "@/lib/onboarding/strategy/agentContext";

import type { DraftCounterMeta } from "../draft-editor/chatDraftPreviewState";
import type {
  DraftQueueCandidate,
  DraftQueueObservedMetricsCandidate,
} from "../draft-queue/draftQueueViewState";
import type {
  FeedbackCategory,
  FeedbackHistoryItem,
  FeedbackImageDraft,
  FeedbackReportFilter,
  FeedbackReportStatus,
  FeedbackScopeContext,
  FeedbackSource,
} from "../feedback/feedbackState";
import type {
  SourceMaterialAsset,
  SourceMaterialDraftState,
  SourceMaterialType,
} from "../source-materials/sourceMaterialsState";
import type { ChatOverlaysProps } from "./ChatOverlays";

type GrowthGuideDialogProps = NonNullable<ChatOverlaysProps["growthGuideDialogProps"]>;
type ProfileAnalysisDialogProps = NonNullable<
  ChatOverlaysProps["profileAnalysisDialogProps"]
>;
type AddAccountDialogProps = ChatOverlaysProps["addAccountDialogProps"];

export interface UseChatOverlayPropsOptions {
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
  startEditingDraftCandidate: (candidateId: string, content: string) => void;
  cancelEditingDraftCandidate: () => void;
  setEditingDraftCandidateText: (value: string) => void;
  mutateDraftQueueCandidate: (candidateId: string, payload: {
    action: "approve" | "reject" | "edit" | "posted" | "observed" | "regenerate";
    content?: string;
    rejectionReason?: string;
    observedMetrics?: Record<string, unknown>;
  }) => Promise<boolean>;
  openObservedMetricsModal: (candidate: DraftQueueObservedMetricsCandidate) => void;
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
  rateLimitResetLabel: string;
  isOpeningBillingPortal: boolean;
  openBillingPortal: () => Promise<void>;
  showRateLimitUpgradeCta: boolean;
  rateLimitUpgradeLabel: string;
  settingsCreditsRemaining: number;
  settingsCreditsUsed: number;
  settingsCreditLimit: number;
  settingsCreditsRemainingPercent: number | null;
  pricingModalOpen: boolean;
  handlePricingModalOpenChange: (open: boolean) => void;
  pricingModalDismissLabel: string;
  selectedModalProIsAnnual: boolean;
  selectedModalProCents: number;
  selectedModalProPriceSuffix: string;
  setSelectedModalProCadence: (cadence: "monthly" | "annual") => void;
  isProActive: boolean;
  isFounderCurrent: boolean;
  selectedModalProIsCurrent: boolean;
  selectedModalProNeedsPortalSwitch: boolean;
  selectedModalProOfferEnabled: boolean;
  selectedModalProButtonLabel: string;
  isSelectedModalProCheckoutLoading: boolean;
  openCheckoutForOffer: (offer: "pro_monthly" | "pro_annual" | "lifetime") => Promise<void>;
  selectedModalProOffer: "pro_monthly" | "pro_annual";
  lifetimeAmountCents: number;
  lifetimeSlotSummary:
    | {
        total: number;
        sold: number;
        reserved: number;
        remaining: number;
      }
    | null;
  lifetimeOfferEnabled: boolean;
  feedbackModalOpen: boolean;
  setFeedbackModalOpen: (open: boolean) => void;
  submitFeedback: FormEventHandler<HTMLFormElement>;
  feedbackCategory: FeedbackCategory;
  setFeedbackCategory: (value: FeedbackCategory) => void;
  feedbackSource: FeedbackSource;
  feedbackScope: FeedbackScopeContext;
  activeFeedbackTitle: string;
  updateActiveFeedbackTitle: (value: string) => void;
  activeFeedbackDraft: string;
  updateActiveFeedbackDraft: (value: string) => void;
  discardFeedbackDraft: () => void;
  feedbackEditorRef: RefObject<HTMLTextAreaElement | null>;
  handleFeedbackEditorKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  applyFeedbackMarkdownToken: (token: "bold" | "italic" | "bullet" | "link") => void;
  feedbackImages: FeedbackImageDraft[];
  feedbackFileInputRef: RefObject<HTMLInputElement | null>;
  isFeedbackDropActive: boolean;
  handleFeedbackImageSelection: ChangeEventHandler<HTMLInputElement>;
  handleFeedbackDropZoneDragOver: DragEventHandler<HTMLDivElement>;
  handleFeedbackDropZoneDragLeave: DragEventHandler<HTMLDivElement>;
  handleFeedbackDropZoneDrop: DragEventHandler<HTMLDivElement>;
  removeFeedbackImage: (imageId: string) => void;
  accountName: string | null;
  activeThreadId: string | null;
  feedbackHistory: FeedbackHistoryItem[];
  feedbackHistoryFilter: FeedbackReportFilter;
  setFeedbackHistoryFilter: (value: FeedbackReportFilter) => void;
  feedbackHistoryQuery: string;
  setFeedbackHistoryQuery: (value: string) => void;
  isFeedbackHistoryLoading: boolean;
  feedbackStatusUpdatingIds: Record<string, boolean>;
  updateFeedbackSubmissionStatus: (
    submissionId: string,
    status: FeedbackReportStatus,
  ) => Promise<void>;
  sessionUserId: string | null;
  sessionEmail: string | null;
  feedbackSubmitNotice: string | null;
  isFeedbackSubmitting: boolean;
  extensionModalOpen: boolean;
  setExtensionModalOpen: (open: boolean) => void;
  sourceMaterialsOpen: boolean;
  setSourceMaterialsOpen: (open: boolean) => void;
  seedSourceMaterials: () => Promise<unknown>;
  isSourceMaterialsLoading: boolean;
  isSourceMaterialsSaving: boolean;
  sourceMaterialsNotice: string | null;
  sourceMaterialDraft: SourceMaterialDraftState;
  resetSourceMaterialDraft: () => void;
  clearSourceMaterialsNotice: () => void;
  applyClaimExample: (claim: string) => void;
  updateSourceMaterialTitle: (value: string) => void;
  updateSourceMaterialType: (value: SourceMaterialType) => void;
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
  sourceMaterials: SourceMaterialAsset[];
  selectSourceMaterial: (asset: SourceMaterialAsset) => void;
  preferencesOpen: boolean;
  setPreferencesOpen: (open: boolean) => void;
  savePreferences: () => Promise<void>;
  isPreferencesLoading: boolean;
  isPreferencesSaving: boolean;
  preferenceCasing: "auto" | "normal" | "lowercase" | "uppercase";
  setPreferenceCasing: (value: "auto" | "normal" | "lowercase" | "uppercase") => void;
  preferenceBulletStyle: "auto" | "-" | ">";
  setPreferenceBulletStyle: (value: "auto" | "-" | ">") => void;
  preferenceWritingMode: "voice" | "balanced" | "growth";
  setPreferenceWritingMode: (value: "voice" | "balanced" | "growth") => void;
  preferenceUseEmojis: boolean;
  togglePreferenceUseEmojis: () => void;
  preferenceAllowProfanity: boolean;
  togglePreferenceAllowProfanity: () => void;
  preferenceBlacklistInput: string;
  handlePreferenceBlacklistInputChange: ChangeEventHandler<HTMLInputElement>;
  handlePreferenceBlacklistInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
  preferenceBlacklistedTerms: string[];
  removePreferenceBlacklistedTerm: (index: number) => void;
  effectivePreferenceMaxCharacters: number;
  setPreferenceMaxCharacters: (value: number) => void;
  previewDisplayName: string;
  previewUsername: string;
  previewAvatarUrl: string | null;
  preferencesPreviewDraft: string;
  preferencesPreviewCounter: DraftCounterMeta;
  playbookModalOpen: boolean;
  handleGrowthGuideOpenChange: (open: boolean) => void;
  playbookStage: GrowthGuideDialogProps["playbookStage"];
  setPlaybookStage: GrowthGuideDialogProps["onPlaybookStageChange"];
  filteredStagePlaybooks: GrowthGuideDialogProps["filteredStagePlaybooks"];
  selectedPlaybook: GrowthGuideDialogProps["selectedPlaybook"];
  handleApplyPlaybook: GrowthGuideDialogProps["onSelectPlaybook"];
  growthGuideSelectedPlaybookRef: RefObject<HTMLElement | null>;
  playbookTemplateTab: GrowthGuideDialogProps["playbookTemplateTab"];
  setPlaybookTemplateTab: GrowthGuideDialogProps["onPlaybookTemplateTabChange"];
  personalizedPlaybookTemplates: GrowthGuideDialogProps["personalizedPlaybookTemplates"];
  activePlaybookTemplateId: string | null;
  setActivePlaybookTemplateId: (value: string) => void;
  activePlaybookTemplateText: string | null;
  playbookTemplatePreviewCounter: string;
  copiedPlaybookTemplateId: string | null;
  handleCopyPlaybookTemplate: (
    template: Parameters<GrowthGuideDialogProps["onCopyPlaybookTemplate"]>[0],
  ) => Promise<void>;
  buildTemplateWhyItWorksPoints: (
    tab: GrowthGuideDialogProps["playbookTemplateTab"],
  ) => string[];
  growthGuidePreviewDisplayName: string;
  growthGuidePreviewUsername: string;
  growthGuidePreviewAvatarUrl: string | null;
  openFeedbackDialog: () => void;
  openAnalysis: () => void;
  analysisOpen: boolean;
  setAnalysisOpen: (open: boolean) => void;
  currentPlaybookStage: ProfileAnalysisDialogProps["currentPlaybookStage"];
  analysisFollowerProgress: ProfileAnalysisDialogProps["analysisFollowerProgress"];
  analysisDiagnosisSummary: ProfileAnalysisDialogProps["analysisDiagnosisSummary"];
  analysisSnapshotCards: ProfileAnalysisDialogProps["analysisSnapshotCards"];
  analysisPositioningIsTentative: boolean;
  analysisPriorityItems: ProfileAnalysisDialogProps["analysisPriorityItems"];
  analysisRecommendedPlaybooks: ProfileAnalysisDialogProps["analysisRecommendedPlaybooks"];
  analysisLearningStrengths: string[];
  analysisLearningCautions: string[];
  analysisLearningExperiments: string[];
  analysisReplyConversionHighlights:
    ProfileAnalysisDialogProps["analysisReplyConversionHighlights"];
  analysisVoiceSignalChips: ProfileAnalysisDialogProps["analysisVoiceSignalChips"];
  analysisKeepList: string[];
  analysisAvoidList: string[];
  analysisEvidencePosts: ProfileAnalysisDialogProps["analysisEvidencePosts"];
  analysisScrapeNotice: string | null;
  analysisScrapeNoticeTone: ProfileAnalysisDialogProps["analysisScrapeNoticeTone"];
  isAnalysisScrapeCoolingDown: boolean;
  analysisScrapeCooldownLabel: ProfileAnalysisDialogProps["analysisScrapeCooldownLabel"];
  isAnalysisScrapeRefreshing: boolean;
  handleManualProfileScrapeRefresh: () => Promise<void>;
  closeAnalysis: () => void;
  handleHeaderClaritySelection: (value: "clear" | "unclear" | "unsure") => Promise<boolean>;
  handleBioAlternativeCopied: (text: string) => Promise<void>;
  handleBioAlternativeRefine: (text: string) => Promise<void>;
  handlePinnedPromptStart: (kind: "origin_story" | "core_thesis") => Promise<void>;
  openGrowthGuide: () => void;
  openGrowthGuideForRecommendation: ProfileAnalysisDialogProps["onOpenGrowthGuideForRecommendation"];
  isAddAccountModalOpen: boolean;
  requiresXAccountGate: boolean;
  isAddAccountSubmitting: boolean;
  addAccountPreview: AddAccountDialogProps["preview"];
  normalizedAddAccount: string;
  addAccountLoadingStepIndex: number;
  addAccountLoadingSteps: AddAccountDialogProps["loadingSteps"];
  closeAddAccountModal: () => void;
  handleAddAccountSubmit: AddAccountDialogProps["onSubmit"];
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
        feedbackSource: options.feedbackSource,
        feedbackScope: options.feedbackScope,
        activeFeedbackTitle: options.activeFeedbackTitle,
        onActiveFeedbackTitleChange: options.updateActiveFeedbackTitle,
        activeFeedbackDraft: options.activeFeedbackDraft,
        onActiveFeedbackDraftChange: options.updateActiveFeedbackDraft,
        onDiscardDraft: options.discardFeedbackDraft,
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
            onOpenChange: (open) => {
              if (open) {
                options.setAnalysisOpen(true);
                return;
              }

              options.closeAnalysis();
            },
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
            onHeaderClaritySelect: options.handleHeaderClaritySelection,
            onBioAlternativeCopied: (text) => {
              void options.handleBioAlternativeCopied(text);
            },
            onBioAlternativeRefine: (text) => {
              void options.handleBioAlternativeRefine(text);
            },
            onPinnedPromptStart: (kind) => {
              options.closeAnalysis();
              void options.handlePinnedPromptStart(kind);
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
