"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { buildChatWorkspaceReset, type ChatWorkspaceReset } from "./chatWorkspaceState";

interface UseChatWorkspaceResetOptions<
  TContextData,
  TContractData,
  TConversationMemory,
  TToneInputs,
  TStrategyInputs,
  TContentFocus extends string,
  TDraftQueueItem,
  TMessage,
  TDraftSelection,
  TEditorDraftPost,
> {
  accountName: string | null;
  buildWorkspaceChatHref: (threadId: string | null) => string;
  threadStateResetVersion: number;
  loadWorkspace: () => Promise<unknown>;
  clearMissingOnboardingAttempts: () => void;
  defaultToneInputs: TToneInputs;
  defaultStrategyInputs: TStrategyInputs;
  threadCreatedInSessionRef: MutableRefObject<boolean>;
  setActiveThreadId: (value: string | null) => void;
  setContext: (value: TContextData | null) => void;
  setContract: (value: TContractData | null) => void;
  setConversationMemory: (value: TConversationMemory | null) => void;
  setStreamStatus: (value: string | null) => void;
  setIsWorkspaceInitializing: (value: boolean) => void;
  setAnalysisOpen: (value: boolean) => void;
  setBackfillNotice: (value: string | null) => void;
  setIsAnalysisScrapeRefreshing: (value: boolean) => void;
  setAnalysisScrapeNotice: (value: string | null) => void;
  setAnalysisScrapeCooldownUntil: (value: string | null) => void;
  setActiveContentFocus: (value: TContentFocus | null) => void;
  setToneInputs: (value: TToneInputs) => void;
  setActiveToneInputs: (value: TToneInputs | null) => void;
  setActiveStrategyInputs: (value: TStrategyInputs) => void;
  setDraftQueueItems: (value: TDraftQueueItem[]) => void;
  setDraftQueueError: (value: string | null) => void;
  setEditingDraftCandidateId: (value: string | null) => void;
  setEditingDraftCandidateText: (value: string) => void;
  setMessages: Dispatch<SetStateAction<TMessage[]>>;
  setDraftInput: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setActiveDraftEditor: (value: TDraftSelection | null) => void;
  setEditorDraftText: (value: string) => void;
  setEditorDraftPosts: Dispatch<SetStateAction<TEditorDraftPost[]>>;
  setTypedAssistantLengths: (value: Record<string, number>) => void;
  setActiveDraftRevealByMessageId: (value: Record<string, string>) => void;
  setRevealedDraftMessageIds: (value: Record<string, boolean>) => void;
  setIsLeavingHero: (value: boolean) => void;
}

export function useChatWorkspaceReset<
  TContextData,
  TContractData,
  TConversationMemory,
  TToneInputs,
  TStrategyInputs,
  TContentFocus extends string,
  TDraftQueueItem,
  TMessage,
  TDraftSelection,
  TEditorDraftPost,
>(
  options: UseChatWorkspaceResetOptions<
    TContextData,
    TContractData,
    TConversationMemory,
    TToneInputs,
    TStrategyInputs,
    TContentFocus,
    TDraftQueueItem,
    TMessage,
    TDraftSelection,
    TEditorDraftPost
  >,
) {
  const {
    accountName,
    buildWorkspaceChatHref,
    threadStateResetVersion,
    loadWorkspace,
    clearMissingOnboardingAttempts,
    defaultToneInputs,
    defaultStrategyInputs,
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
  } = options;
  const loadWorkspaceRef = useRef(loadWorkspace);
  const bootstrappedWorkspaceKeyRef = useRef<string | null>(null);
  const resetWorkspaceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    loadWorkspaceRef.current = loadWorkspace;
  }, [loadWorkspace]);

  const applyChatWorkspaceReset = useCallback((
    reset: ChatWorkspaceReset<TToneInputs, TStrategyInputs>,
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
      setDraftQueueItems(reset.draftQueueItems as TDraftQueueItem[]);
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

    setMessages(reset.messages as TMessage[]);
    setDraftInput(reset.draftInput);
    setErrorMessage(reset.errorMessage);
    setActiveDraftEditor(reset.activeDraftEditor as TDraftSelection | null);
    setEditorDraftText(reset.editorDraftText);
    setEditorDraftPosts(reset.editorDraftPosts as TEditorDraftPost[]);
    setTypedAssistantLengths(reset.typedAssistantLengths);
    setActiveDraftRevealByMessageId(reset.activeDraftRevealByMessageId);
    setRevealedDraftMessageIds(reset.revealedDraftMessageIds);
    setIsLeavingHero(reset.isLeavingHero);
  }, [
    setActiveThreadId,
    threadCreatedInSessionRef,
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
  ]);

  const handleNewChat = useCallback(() => {
    if (!accountName) {
      return;
    }

    applyChatWorkspaceReset(buildChatWorkspaceReset("thread"));
    window.history.pushState({}, "", buildWorkspaceChatHref(null));
  }, [accountName, applyChatWorkspaceReset, buildWorkspaceChatHref]);

  useEffect(() => {
    if (threadStateResetVersion === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      applyChatWorkspaceReset(buildChatWorkspaceReset("thread"));
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [applyChatWorkspaceReset, threadStateResetVersion]);

  useEffect(() => {
    const workspaceBootstrapKey = accountName ?? "__default__";
    if (bootstrappedWorkspaceKeyRef.current === workspaceBootstrapKey) {
      return;
    }

    bootstrappedWorkspaceKeyRef.current = workspaceBootstrapKey;
    void loadWorkspaceRef.current();
  }, [accountName]);

  useEffect(() => {
    if (!accountName) {
      return;
    }

    const workspaceResetKey = accountName;
    if (resetWorkspaceKeyRef.current === workspaceResetKey) {
      return;
    }

    resetWorkspaceKeyRef.current = workspaceResetKey;
    clearMissingOnboardingAttempts();
    const timeoutId = window.setTimeout(() => {
      applyChatWorkspaceReset(
        buildChatWorkspaceReset("workspace", {
          defaultToneInputs,
          defaultStrategyInputs,
        }),
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    accountName,
    applyChatWorkspaceReset,
    clearMissingOnboardingAttempts,
    defaultStrategyInputs,
    defaultToneInputs,
  ]);

  return {
    applyChatWorkspaceReset,
    handleNewChat,
  };
}
