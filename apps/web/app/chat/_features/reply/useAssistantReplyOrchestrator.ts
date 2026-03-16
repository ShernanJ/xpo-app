"use client";

import {
  startTransition,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../../../../lib/agent-v2/contracts/turnContract";
import type { ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts";
import type {
  DraftVersionSnapshotLike,
  ChatHistoryMessage,
  ChatStrategyInputsLike,
  ChatToneInputsLike,
} from "../transport/chatTransport";
import { prepareAssistantReplyTransport } from "../transport/chatTransport";
import {
  readChatResponseStream,
  resolveAssistantReplyJsonOutcome,
  resolveAssistantReplyPlan,
  type AssistantReplyPlan,
  type ChatReplyResultLike,
  type DraftDrawerSelectionLike,
  type DraftVersionEntryLike,
} from "./chatReplyState";
import {
  applyAgentProgressBackendStatus,
  applyAgentProgressStep,
  completeAgentProgressRun,
  createAgentProgressRun,
  type AgentProgressRun,
} from "../composer/pendingStatus";

type ChatIntent =
  | "coach"
  | "ideate"
  | "plan"
  | "planner_feedback"
  | "draft"
  | "review"
  | "edit";

interface ValidationErrorLike {
  message: string;
}

interface AssistantReplyContextLike {
  runId?: string | null;
}

interface AssistantReplyFailureLike<TBillingSnapshot> {
  ok: false;
  errors: ValidationErrorLike[];
  data?: {
    billing?: TBillingSnapshot;
  } | null;
}

interface AssistantReplySuccessEnvelope<TResult> {
  ok: true;
  data: TResult;
}

type AssistantReplyResponse<TResult, TBillingSnapshot> =
  | AssistantReplySuccessEnvelope<TResult>
  | AssistantReplyFailureLike<TBillingSnapshot>;

export interface RequestAssistantReplyOptions<
  TMessage extends ChatHistoryMessage,
  TStrategyInputs extends ChatStrategyInputsLike,
  TToneInputs extends ChatToneInputsLike,
  TContext,
  TContract,
  TSelectedDraftContext extends DraftVersionSnapshotLike,
> {
  prompt?: string;
  appendUserMessage: boolean;
  displayUserMessage?: string;
  includeUserMessageInHistory?: boolean;
  turnSource?: ChatTurnSource;
  artifactContext?: ChatArtifactContext | null;
  intent?: ChatIntent;
  formatPreferenceOverride?: "shortform" | "longform" | "thread" | null;
  threadFramingStyleOverride?: ThreadFramingStyle | null;
  selectedDraftContextOverride?: TSelectedDraftContext | null;
  historySeed?: TMessage[];
  strategyInputOverride?: TStrategyInputs;
  toneInputOverride?: TToneInputs;
  contentFocusOverride?: string | null;
  fallbackContext?: TContext;
  fallbackContract?: TContract;
}

export type RequestAssistantReplyFn<
  TMessage extends ChatHistoryMessage,
  TStrategyInputs extends ChatStrategyInputsLike,
  TToneInputs extends ChatToneInputsLike,
  TContext,
  TContract,
  TSelectedDraftContext extends DraftVersionSnapshotLike,
> = (
  requestOptions: RequestAssistantReplyOptions<
    TMessage,
    TStrategyInputs,
    TToneInputs,
    TContext,
    TContract,
    TSelectedDraftContext
  >,
) => Promise<void>;

interface UseAssistantReplyOrchestratorOptions<
  TMessage extends ChatHistoryMessage,
  TQuickReply,
  TMemory,
  TBilling,
  TFailureBillingSnapshot,
  TStrategyInputs extends ChatStrategyInputsLike,
  TToneInputs extends ChatToneInputsLike,
  TContext extends AssistantReplyContextLike,
  TContract,
  TSelectedDraftContext extends DraftVersionSnapshotLike,
> {
  context: TContext | null;
  contract: TContract | null;
  activeStrategyInputs: TStrategyInputs | null;
  activeToneInputs: TToneInputs | null;
  activeContentFocus: string | null;
  isMainChatLocked: boolean;
  messages: TMessage[];
  activeThreadId: string | null;
  accountName: string | null;
  providerPreference: string | null;
  selectedDraftContext: TSelectedDraftContext | null;
  currentPreferencePayload: unknown;
  preferenceConstraintRules: string[];
  defaultQuickReplies: TQuickReply[];
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  applyBillingSnapshot: (billing: TFailureBillingSnapshot | null) => void;
  setPricingModalOpen: (open: boolean) => void;
  setIsSending: (value: boolean) => void;
  setActiveAgentProgress: Dispatch<SetStateAction<AgentProgressRun | null>>;
  setErrorMessage: (value: string | null) => void;
  setBillingState: (value: TBilling) => void;
  setMessages: Dispatch<SetStateAction<TMessage[]>>;
  setActiveDraftEditor: (value: DraftDrawerSelectionLike | null) => void;
  setConversationMemory: (value: TMemory | null) => void;
  syncThreadTitle: (threadId: string, title: string) => void;
  applyCreatedThreadWorkspaceUpdate: (
    newThreadId?: string | null,
    threadTitle?: string | null,
  ) => void;
  scrollThreadToBottom: () => void;
  createUserMessage: (args: {
    id: string;
    threadId?: string;
    content: string;
    excludeFromHistory: boolean;
  }) => TMessage;
}

export interface UseAssistantReplyOrchestratorResult<
  TMessage extends ChatHistoryMessage,
  TStrategyInputs extends ChatStrategyInputsLike,
  TToneInputs extends ChatToneInputsLike,
  TContext,
  TContract,
  TSelectedDraftContext extends DraftVersionSnapshotLike,
> {
  requestAssistantReply: RequestAssistantReplyFn<
    TMessage,
    TStrategyInputs,
    TToneInputs,
    TContext,
    TContract,
    TSelectedDraftContext
  >;
}

export function useAssistantReplyOrchestrator<
  TMessage extends ChatHistoryMessage,
  TQuickReply,
  TPlan,
  TDraftArtifact,
  TDraftVersion extends DraftVersionEntryLike,
  TDraftBundle,
  TPreviousVersion,
  TReplyArtifacts,
  TReplyParse,
  TContextPacket,
  TMemory,
  TBilling,
  TFailureBillingSnapshot,
  TStrategyInputs extends ChatStrategyInputsLike,
  TToneInputs extends ChatToneInputsLike,
  TContext extends AssistantReplyContextLike,
  TContract,
  TSelectedDraftContext extends DraftVersionSnapshotLike,
>(
  options: UseAssistantReplyOrchestratorOptions<
    TMessage,
    TQuickReply,
    TMemory,
    TBilling,
    TFailureBillingSnapshot,
    TStrategyInputs,
    TToneInputs,
    TContext,
    TContract,
    TSelectedDraftContext
  >,
): UseAssistantReplyOrchestratorResult<
  TMessage,
  TStrategyInputs,
  TToneInputs,
  TContext,
  TContract,
  TSelectedDraftContext
> {
  const {
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
    syncThreadTitle,
    applyCreatedThreadWorkspaceUpdate,
    scrollThreadToBottom,
    createUserMessage,
  } = options;
  const activeAgentProgressRef = useRef<AgentProgressRun | null>(null);

  const setActiveAgentProgressState = useCallback(
    (
      value:
        | AgentProgressRun
        | null
        | ((current: AgentProgressRun | null) => AgentProgressRun | null),
    ) => {
      setActiveAgentProgress((current) => {
        const next = typeof value === "function" ? value(current) : value;
        activeAgentProgressRef.current = next;
        return next;
      });
    },
    [setActiveAgentProgress],
  );

  const applyAssistantReplyPlan = useCallback(
    (
      replyPlan: AssistantReplyPlan<
        TQuickReply,
        TPlan,
        TDraftArtifact,
        TDraftVersion,
        TDraftBundle,
        TPreviousVersion,
        TReplyArtifacts,
        TReplyParse,
        TContextPacket,
        TMemory,
        TBilling
      >,
      completedProgress?: AgentProgressRun | null,
    ) => {
      startTransition(() => {
        if (replyPlan.nextBilling) {
          setBillingState(replyPlan.nextBilling);
        }

        setMessages((current) => {
          const assistantMessage = replyPlan.buildAssistantMessage(
            current.length,
          ) as unknown as TMessage & { agentProgress?: AgentProgressRun | null };

          return [
            ...current,
            (completedProgress
              ? {
                  ...assistantMessage,
                  agentProgress: completedProgress,
                }
              : assistantMessage) as TMessage,
          ];
        });

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
      setActiveDraftEditor,
      setBillingState,
      setConversationMemory,
      setMessages,
      syncThreadTitle,
    ],
  );

  const requestAssistantReply: RequestAssistantReplyFn<
    TMessage,
    TStrategyInputs,
    TToneInputs,
    TContext,
    TContract,
    TSelectedDraftContext
  > = useCallback(
    async (
      requestOptions: RequestAssistantReplyOptions<
        TMessage,
        TStrategyInputs,
        TToneInputs,
        TContext,
        TContract,
        TSelectedDraftContext
      >,
    ) => {
      const resolvedContext = requestOptions.fallbackContext ?? context;
      const resolvedContract = requestOptions.fallbackContract ?? contract;
      const resolvedStrategyInputs =
        requestOptions.strategyInputOverride ?? activeStrategyInputs;
      const resolvedToneInputs =
        requestOptions.toneInputOverride ?? activeToneInputs;
      const resolvedContentFocus =
        requestOptions.contentFocusOverride ?? activeContentFocus;

      if (
        !resolvedContext?.runId ||
        !resolvedContract ||
        !resolvedStrategyInputs ||
        !resolvedToneInputs ||
        isMainChatLocked
      ) {
        return;
      }

      const historySeed = (requestOptions.historySeed ?? messages)
        .filter((message) => !message.excludeFromHistory)
        .slice();
      const preparedRequest = prepareAssistantReplyTransport({
        prompt: requestOptions.prompt,
        history: historySeed,
        runId: resolvedContext.runId,
        threadId: activeThreadId,
        workspaceHandle: accountName,
        provider: providerPreference,
        turnSource: requestOptions.turnSource,
        artifactContext: requestOptions.artifactContext ?? null,
        intent: requestOptions.intent,
        formatPreferenceOverride: requestOptions.formatPreferenceOverride ?? null,
        threadFramingStyleOverride:
          requestOptions.threadFramingStyleOverride ?? null,
        selectedDraftContext,
        selectedDraftContextOverride:
          requestOptions.selectedDraftContextOverride !== undefined
            ? requestOptions.selectedDraftContextOverride
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

      const { trimmedPrompt, effectiveSelectedDraftContext } = preparedRequest;
      let history = historySeed;

      if (requestOptions.appendUserMessage) {
        const userMessage = createUserMessage({
          id: `user-${Date.now()}`,
          threadId: activeThreadId ?? undefined,
          content: requestOptions.displayUserMessage?.trim() || trimmedPrompt,
          excludeFromHistory: requestOptions.includeUserMessageInHistory === false,
        });

        setMessages((current) => [...current, userMessage]);
        scrollThreadToBottom();
        if (requestOptions.includeUserMessageInHistory !== false) {
          history = [...history, userMessage];
        }
      }

      setIsSending(true);
      setActiveAgentProgressState(
        preparedRequest.pendingStatusPlan
          ? createAgentProgressRun({
              plan: preparedRequest.pendingStatusPlan,
            })
          : null,
      );
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
        const replyPlanArgs = {
          activeThreadId,
          trimmedPrompt,
          artifactKind: requestOptions.artifactContext?.kind ?? null,
          defaultQuickReplies,
          selectedDraftContext: effectiveSelectedDraftContext,
          accountName,
        } as const;

        if (contentType.includes("application/json")) {
          const data = (await response.json()) as AssistantReplyResponse<
            ChatReplyResultLike<
              TQuickReply,
              TPlan,
              TDraftArtifact,
              TDraftVersion,
              TDraftBundle,
              TPreviousVersion,
              TReplyArtifacts,
              TReplyParse,
              TContextPacket,
              TMemory,
              TBilling
            >,
            TFailureBillingSnapshot
          >;
          const outcome = resolveAssistantReplyJsonOutcome<
            TQuickReply,
            TPlan,
            TDraftArtifact,
            TDraftVersion,
            TDraftBundle,
            TPreviousVersion,
            TReplyArtifacts,
            TReplyParse,
            TContextPacket,
            TMemory,
            TBilling,
            TFailureBillingSnapshot
          >({
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
            setActiveAgentProgressState((current) =>
              completeAgentProgressRun(current, "failed"),
            );
            if (outcome.nextBillingSnapshot) {
              applyBillingSnapshot(outcome.nextBillingSnapshot);
            }
            if (outcome.shouldOpenPricingModal) {
              setPricingModalOpen(true);
            }
            setErrorMessage(outcome.errorMessage);
            return;
          }

          const completedProgress = completeAgentProgressRun(
            activeAgentProgressRef.current,
            "completed",
          );
          applyAssistantReplyPlan(outcome.replyPlan, completedProgress);
          setActiveAgentProgressState(null);
          return;
        }

        if (!response.body) {
          throw new Error("The chat stream did not return a readable body.");
        }

        const streamedResult = await readChatResponseStream<
          ChatReplyResultLike<
            TQuickReply,
            TPlan,
            TDraftArtifact,
            TDraftVersion,
            TDraftBundle,
            TPreviousVersion,
            TReplyArtifacts,
            TReplyParse,
            TContextPacket,
            TMemory,
            TBilling
          >
        >({
          body: response.body,
          onProgress: (progress) => {
            setActiveAgentProgressState((current) =>
              applyAgentProgressStep(current, progress),
            );
          },
          onStatus: (message) => {
            setActiveAgentProgressState((current) =>
              applyAgentProgressBackendStatus(current, message),
            );
          },
        });
        const completedProgress = completeAgentProgressRun(
          activeAgentProgressRef.current,
          "completed",
        );
        applyAssistantReplyPlan(
          resolveAssistantReplyPlan({
            ...replyPlanArgs,
            result: streamedResult,
            mode: "stream",
          }),
          completedProgress,
        );
        setActiveAgentProgressState(null);
      } catch (error) {
        setActiveAgentProgressState((current) =>
          completeAgentProgressRun(current, "failed"),
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The live model failed before the backend could return a response.",
        );
      } finally {
        setIsSending(false);
      }
    },
    [
      accountName,
      activeContentFocus,
      activeStrategyInputs,
      activeThreadId,
      activeToneInputs,
      applyAssistantReplyPlan,
      applyBillingSnapshot,
      context,
      contract,
      createUserMessage,
      currentPreferencePayload,
      defaultQuickReplies,
      fetchWorkspace,
      isMainChatLocked,
      messages,
      preferenceConstraintRules,
      providerPreference,
      scrollThreadToBottom,
      selectedDraftContext,
      setActiveAgentProgressState,
      setMessages,
      setErrorMessage,
      setIsSending,
      setPricingModalOpen,
    ],
  );

  return {
    requestAssistantReply,
  };
}
