"use client";

import {
  createContext,
  useContext,
  useMemo,
  type FormEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type RefObject,
} from "react";

import type { HeroQuickAction } from "../composer/composerViewState";

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
  composerModeLabel: string | null;
  draftInput: string;
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
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuickAction: (prompt: string) => void;
  scrollToBottom: () => void;
}

interface ChatCanvasMeta {
  threadScrollRef: RefObject<HTMLElement | null>;
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
  composerModeLabel: string | null;
  draftInput: string;
  onDraftInputChange: (value: string) => void;
  onCancelComposerMode: () => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInterruptReply: () => void;
  isComposerDisabled: boolean;
  isSubmitDisabled: boolean;
  isSending: boolean;
  heroQuickActions: HeroQuickAction[];
  onQuickAction: (prompt: string) => void;
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
    composerModeLabel,
    draftInput,
    onDraftInputChange,
    onCancelComposerMode,
    onComposerKeyDown,
    onComposerSubmit,
    onInterruptReply,
    isComposerDisabled,
    isSubmitDisabled,
    isSending,
    heroQuickActions,
    onQuickAction,
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
      composerModeLabel,
      draftInput,
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
      composerModeLabel,
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
      onComposerKeyDown,
      onComposerSubmit,
      onQuickAction,
      scrollToBottom: onScrollToBottom,
    }),
    [
      onCancelComposerMode,
      onComposerKeyDown,
      onComposerSubmit,
      onDraftInputChange,
      onDismissBillingWarning,
      onInterruptReply,
      onOpenPricing,
      onQuickAction,
      onScrollToBottom,
    ],
  );

  const meta = useMemo<ChatCanvasMeta>(
    () => ({
      threadScrollRef,
    }),
    [threadScrollRef],
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
  const { state, actions } = useChatCanvasContext();

  return {
    isVisible: state.isHeroVisible,
    avatarUrl: state.avatarUrl,
    heroIdentityLabel: state.heroIdentityLabel,
    heroInitials: state.heroInitials,
    heroGreeting: state.heroGreeting,
    isVerifiedAccount: state.isVerifiedAccount,
    isLeavingHero: state.isLeavingHero,
    draftInput: state.draftInput,
    composerModeLabel: state.composerModeLabel,
    onCancelComposerMode: actions.cancelComposerMode,
    onDraftInputChange: actions.setDraftInput,
    onComposerKeyDown: actions.onComposerKeyDown,
    onSubmit: actions.onComposerSubmit,
    onInterruptReply: actions.interruptReply,
    isComposerDisabled: state.isComposerDisabled,
    isSubmitDisabled: state.isSubmitDisabled,
    isSending: state.isSending,
    heroQuickActions: state.heroQuickActions,
    onQuickAction: actions.onQuickAction,
  };
}

export function useChatComposerDockCanvas() {
  const { state, actions } = useChatCanvasContext();

  return {
    isNewChatHero: state.isNewChatHero,
    isLeavingHero: state.isLeavingHero,
    showScrollToLatest: state.showScrollToLatest,
    shouldCenterHero: state.shouldCenterHero,
    onScrollToBottom: actions.scrollToBottom,
    draftInput: state.draftInput,
    composerModeLabel: state.composerModeLabel,
    onCancelComposerMode: actions.cancelComposerMode,
    onDraftInputChange: actions.setDraftInput,
    onComposerKeyDown: actions.onComposerKeyDown,
    onSubmit: actions.onComposerSubmit,
    onInterruptReply: actions.interruptReply,
    isComposerDisabled: state.isComposerDisabled,
    isSubmitDisabled: state.isSubmitDisabled,
    isSending: state.isSending,
  };
}
