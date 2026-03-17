"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type RefObject,
} from "react";

import type {
  ChatComposerMode,
  ComposerImageAttachment,
  HeroQuickAction,
  SlashCommandDefinition,
} from "../composer/composerTypes";

interface ChatCanvasState {
  threadCanvasClassName: string;
  threadCanvasTransitionClassName: string;
  threadContentTransitionClassName: string;
  isLoading: boolean;
  isWorkspaceInitializing: boolean;
  hasContext: boolean;
  hasContract: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  showBillingWarningBanner: boolean;
  billingWarningLevel: "low" | "critical" | null;
  billingCreditsLabel: string;
  isHeroVisible: boolean;
  avatarUrl: string | null;
  heroIdentityLabel: string;
  heroInitials: string;
  heroGreeting: string;
  isVerifiedAccount: boolean;
  isLeavingHero: boolean;
  composerMode: ChatComposerMode;
  draftInput: string;
  activePlaceholder: string;
  placeholderAnimationKey: string;
  shouldAnimatePlaceholder: boolean;
  slashCommands: SlashCommandDefinition[];
  slashCommandQuery: string | null;
  isSlashCommandPickerOpen: boolean;
  composerInlineNotice: string | null;
  composerImageAttachment: ComposerImageAttachment | null;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
  heroQuickActions: HeroQuickAction[];
  isNewChatHero: boolean;
  showScrollToLatest: boolean;
  shouldCenterHero: boolean;
}

interface ChatCanvasActions {
  cancelComposerMode: () => void;
  interruptReply: () => void;
  openPricing: () => void;
  dismissBillingWarning: () => void;
  setDraftInput: (value: string) => void;
  dismissSlashCommandPicker: () => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQuickAction: (action: HeroQuickAction) => void;
  openComposerImagePicker: () => void;
  removeComposerImageAttachment: () => void;
  selectSlashCommand: (commandId: SlashCommandDefinition["id"]) => void;
  scrollToBottom: () => void;
}

interface ChatCanvasMeta {
  threadScrollRef: RefObject<HTMLElement | null>;
  composerFileInputRef: RefObject<HTMLInputElement | null>;
}

interface ChatCanvasContextValue {
  state: ChatCanvasState;
  actions: ChatCanvasActions;
  meta: ChatCanvasMeta;
}

export interface ChatCanvasProviderProps {
  threadScrollRef: RefObject<HTMLElement | null>;
  threadCanvasClassName: string;
  threadCanvasTransitionClassName: string;
  threadContentTransitionClassName: string;
  isLoading: boolean;
  isWorkspaceInitializing: boolean;
  hasContext: boolean;
  hasContract: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  showBillingWarningBanner: boolean;
  billingWarningLevel: "low" | "critical" | null;
  billingCreditsLabel: string;
  onOpenPricing: () => void;
  onDismissBillingWarning: () => void;
  isHeroVisible: boolean;
  avatarUrl: string | null;
  heroIdentityLabel: string;
  heroInitials: string;
  heroGreeting: string;
  isVerifiedAccount: boolean;
  isLeavingHero: boolean;
  composerMode: ChatComposerMode;
  draftInput: string;
  activePlaceholder: string;
  placeholderAnimationKey: string;
  shouldAnimatePlaceholder: boolean;
  slashCommands: SlashCommandDefinition[];
  slashCommandQuery: string | null;
  isSlashCommandPickerOpen: boolean;
  composerInlineNotice: string | null;
  composerImageAttachment: ComposerImageAttachment | null;
  composerFileInputRef: RefObject<HTMLInputElement | null>;
  onDraftInputChange: (value: string) => void;
  onCancelComposerMode: () => void;
  onDismissSlashCommandPicker: () => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onInterruptReply: () => void;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
  heroQuickActions: HeroQuickAction[];
  onQuickAction: (action: HeroQuickAction) => void;
  onOpenComposerImagePicker: () => void;
  onRemoveComposerImageAttachment: () => void;
  onSelectSlashCommand: (commandId: SlashCommandDefinition["id"]) => void;
  isNewChatHero: boolean;
  showScrollToLatest: boolean;
  shouldCenterHero: boolean;
  onScrollToBottom: () => void;
}

const ChatCanvasContext = createContext<ChatCanvasContextValue | null>(null);

function useChatCanvasContext() {
  const context = useContext(ChatCanvasContext);

  if (!context) {
    throw new Error(
      "Chat canvas components must be rendered inside ChatCanvasProvider.",
    );
  }

  return context;
}

export function ChatCanvasProvider(
  props: PropsWithChildren<ChatCanvasProviderProps>,
) {
  const {
    children,
    threadScrollRef,
    threadCanvasClassName,
    threadCanvasTransitionClassName,
    threadContentTransitionClassName,
    isLoading,
    isWorkspaceInitializing,
    hasContext,
    hasContract,
    errorMessage,
    statusMessage,
    showBillingWarningBanner,
    billingWarningLevel,
    billingCreditsLabel,
    onOpenPricing,
    onDismissBillingWarning,
    isHeroVisible,
    avatarUrl,
    heroIdentityLabel,
    heroInitials,
    heroGreeting,
    isVerifiedAccount,
    isLeavingHero,
    composerMode,
    draftInput,
    activePlaceholder,
    placeholderAnimationKey,
    shouldAnimatePlaceholder,
    slashCommands,
    slashCommandQuery,
    isSlashCommandPickerOpen,
    composerInlineNotice,
    composerImageAttachment,
    composerFileInputRef,
    onDraftInputChange,
    onCancelComposerMode,
    onDismissSlashCommandPicker,
    onComposerKeyDown,
    onComposerSubmit,
    onComposerFileChange,
    onInterruptReply,
    isComposerDisabled,
    isSubmitDisabled,
    isSending,
    heroQuickActions,
    onQuickAction,
    onOpenComposerImagePicker,
    onRemoveComposerImageAttachment,
    onSelectSlashCommand,
    isNewChatHero,
    showScrollToLatest,
    shouldCenterHero,
    onScrollToBottom,
  } = props;

  const state = useMemo<ChatCanvasState>(
    () => ({
      threadCanvasClassName,
      threadCanvasTransitionClassName,
      threadContentTransitionClassName,
      isLoading,
      isWorkspaceInitializing,
      hasContext,
      hasContract,
      errorMessage,
      statusMessage,
      showBillingWarningBanner,
      billingWarningLevel,
      billingCreditsLabel,
      isHeroVisible,
      avatarUrl,
      heroIdentityLabel,
      heroInitials,
      heroGreeting,
      isVerifiedAccount,
      isLeavingHero,
      composerMode,
      draftInput,
      activePlaceholder,
      placeholderAnimationKey,
      shouldAnimatePlaceholder,
      slashCommands,
      slashCommandQuery,
      isSlashCommandPickerOpen,
      composerInlineNotice,
      composerImageAttachment,
      isComposerDisabled,
      isSubmitDisabled,
      isSending,
      heroQuickActions,
      isNewChatHero,
      showScrollToLatest,
      shouldCenterHero,
    }),
    [
      avatarUrl,
      billingCreditsLabel,
      billingWarningLevel,
      draftInput,
      errorMessage,
      statusMessage,
      hasContext,
      hasContract,
      heroGreeting,
      heroIdentityLabel,
      heroInitials,
      heroQuickActions,
      composerImageAttachment,
      composerInlineNotice,
      composerMode,
      activePlaceholder,
      placeholderAnimationKey,
      shouldAnimatePlaceholder,
      slashCommands,
      slashCommandQuery,
      isSlashCommandPickerOpen,
      isComposerDisabled,
      isHeroVisible,
      isLeavingHero,
      isLoading,
      isNewChatHero,
      isSending,
      isSubmitDisabled,
      isVerifiedAccount,
      isWorkspaceInitializing,
      shouldCenterHero,
      showBillingWarningBanner,
      showScrollToLatest,
      slashCommands,
      slashCommandQuery,
      threadCanvasClassName,
      threadCanvasTransitionClassName,
      threadContentTransitionClassName,
    ],
  );

  const actions = useMemo<ChatCanvasActions>(
    () => ({
      cancelComposerMode: onCancelComposerMode,
      interruptReply: onInterruptReply,
      openPricing: onOpenPricing,
      dismissBillingWarning: onDismissBillingWarning,
      setDraftInput: onDraftInputChange,
      dismissSlashCommandPicker: onDismissSlashCommandPicker,
      onComposerKeyDown,
      onComposerSubmit,
      onComposerFileChange,
      onQuickAction,
      openComposerImagePicker: onOpenComposerImagePicker,
      removeComposerImageAttachment: onRemoveComposerImageAttachment,
      selectSlashCommand: onSelectSlashCommand,
      scrollToBottom: onScrollToBottom,
    }),
    [
      onCancelComposerMode,
      onComposerFileChange,
      onComposerKeyDown,
      onComposerSubmit,
      onDraftInputChange,
      onDismissSlashCommandPicker,
      onDismissBillingWarning,
      onInterruptReply,
      onOpenPricing,
      onOpenComposerImagePicker,
      onQuickAction,
      onRemoveComposerImageAttachment,
      onSelectSlashCommand,
      onScrollToBottom,
    ],
  );

  const meta = useMemo<ChatCanvasMeta>(
    () => ({
      threadScrollRef,
      composerFileInputRef,
    }),
    [composerFileInputRef, threadScrollRef],
  );

  const value = useMemo<ChatCanvasContextValue>(
    () => ({
      state,
      actions,
      meta,
    }),
    [actions, meta, state],
  );

  return (
    <ChatCanvasContext.Provider value={value}>
      {children}
    </ChatCanvasContext.Provider>
  );
}

export function useChatThreadViewCanvas() {
  const { state, actions, meta } = useChatCanvasContext();

  return {
    threadScrollRef: meta.threadScrollRef,
    chatCanvasClassName: state.threadCanvasClassName,
    threadCanvasTransitionClassName: state.threadCanvasTransitionClassName,
    threadContentTransitionClassName: state.threadContentTransitionClassName,
    isLoading: state.isLoading,
    isWorkspaceInitializing: state.isWorkspaceInitializing,
    hasContext: state.hasContext,
    hasContract: state.hasContract,
    errorMessage: state.errorMessage,
    statusMessage: state.statusMessage,
    showBillingWarningBanner: state.showBillingWarningBanner,
    billingWarningLevel: state.billingWarningLevel,
    billingCreditsLabel: state.billingCreditsLabel,
    onOpenPricing: actions.openPricing,
    onDismissBillingWarning: actions.dismissBillingWarning,
  };
}

export function useChatHeroCanvas() {
  const { state, actions, meta } = useChatCanvasContext();

  return {
    isVisible: state.isHeroVisible,
    avatarUrl: state.avatarUrl,
    heroIdentityLabel: state.heroIdentityLabel,
    heroInitials: state.heroInitials,
    heroGreeting: state.heroGreeting,
    isVerifiedAccount: state.isVerifiedAccount,
    isLeavingHero: state.isLeavingHero,
    draftInput: state.draftInput,
    composerMode: state.composerMode,
    activePlaceholder: state.activePlaceholder,
    placeholderAnimationKey: state.placeholderAnimationKey,
    shouldAnimatePlaceholder: state.shouldAnimatePlaceholder,
    slashCommands: state.slashCommands,
    slashCommandQuery: state.slashCommandQuery,
    isSlashCommandPickerOpen: state.isSlashCommandPickerOpen,
    composerInlineNotice: state.composerInlineNotice,
    composerImageAttachment: state.composerImageAttachment,
    composerFileInputRef: meta.composerFileInputRef,
    onCancelComposerMode: actions.cancelComposerMode,
    onDraftInputChange: actions.setDraftInput,
    onDismissSlashCommandPicker: actions.dismissSlashCommandPicker,
    onComposerKeyDown: actions.onComposerKeyDown,
    onComposerFileChange: actions.onComposerFileChange,
    onSubmit: actions.onComposerSubmit,
    onInterruptReply: actions.interruptReply,
    onOpenComposerImagePicker: actions.openComposerImagePicker,
    onRemoveComposerImageAttachment: actions.removeComposerImageAttachment,
    onSelectSlashCommand: actions.selectSlashCommand,
    isComposerDisabled: state.isComposerDisabled,
    isSubmitDisabled: state.isSubmitDisabled,
    isSending: state.isSending,
    heroQuickActions: state.heroQuickActions,
    onQuickAction: actions.onQuickAction,
  };
}

export function useChatComposerDockCanvas() {
  const { state, actions, meta } = useChatCanvasContext();

  return {
    isNewChatHero: state.isNewChatHero,
    isLeavingHero: state.isLeavingHero,
    showScrollToLatest: state.showScrollToLatest,
    shouldCenterHero: state.shouldCenterHero,
    onScrollToBottom: actions.scrollToBottom,
    draftInput: state.draftInput,
    composerMode: state.composerMode,
    activePlaceholder: state.activePlaceholder,
    placeholderAnimationKey: state.placeholderAnimationKey,
    shouldAnimatePlaceholder: state.shouldAnimatePlaceholder,
    slashCommands: state.slashCommands,
    slashCommandQuery: state.slashCommandQuery,
    isSlashCommandPickerOpen: state.isSlashCommandPickerOpen,
    composerInlineNotice: state.composerInlineNotice,
    composerImageAttachment: state.composerImageAttachment,
    composerFileInputRef: meta.composerFileInputRef,
    onCancelComposerMode: actions.cancelComposerMode,
    onDraftInputChange: actions.setDraftInput,
    onDismissSlashCommandPicker: actions.dismissSlashCommandPicker,
    onComposerKeyDown: actions.onComposerKeyDown,
    onComposerFileChange: actions.onComposerFileChange,
    onSubmit: actions.onComposerSubmit,
    onInterruptReply: actions.interruptReply,
    onOpenComposerImagePicker: actions.openComposerImagePicker,
    onRemoveComposerImageAttachment: actions.removeComposerImageAttachment,
    onSelectSlashCommand: actions.selectSlashCommand,
    isComposerDisabled: state.isComposerDisabled,
    isSubmitDisabled: state.isSubmitDisabled,
    isSending: state.isSending,
  };
}
