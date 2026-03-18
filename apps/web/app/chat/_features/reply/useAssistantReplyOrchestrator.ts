"use client";

import {
  startTransition,
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  capturePostHogEvent,
  capturePostHogException,
} from "@/lib/posthog/client";

import type {
  ChatArtifactContext,
  ChatTurnSource,
} from "../../../../lib/agent-v2/contracts/turnContract";
import type { ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts";
import type { ChatActiveTurn } from "../chat-page/chatPageTypes";
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

interface AssistantReplyAcceptedEnvelope {
  ok: true;
  data: {
    accepted: true;
    executionMode: "queued";
    activeTurn: ChatActiveTurn | null;
  };
}

type AssistantReplyResponse<TResult, TBillingSnapshot> =
  | AssistantReplySuccessEnvelope<TResult>
  | AssistantReplyAcceptedEnvelope
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
  setActiveThreadTurn?: Dispatch<SetStateAction<ChatActiveTurn | null>>;
  setConversationMemory: (value: TMemory | null) => void;
  setStatusMessage?: (value: string | null) => void;
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
  activeClientTurnId: string | null;
  interruptAssistantReply: () => Promise<void>;
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
    setActiveThreadTurn,
    setConversationMemory,
    setStatusMessage,
    syncThreadTitle,
    applyCreatedThreadWorkspaceUpdate,
    scrollThreadToBottom,
    createUserMessage,
  } = options;
  const activeAgentProgressRef = useRef<AgentProgressRun | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeTurnRequestRef = useRef<{
    runId: string | null;
    clientTurnId: string | null;
    threadId: string | null;
  } | null>(null);
  const [activeClientTurnId, setActiveClientTurnId] = useState<string | null>(null);

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

      capturePostHogEvent("xpo_chat_prompt_submitted", {
        append_user_message: requestOptions.appendUserMessage,
        artifact_kind: requestOptions.artifactContext?.kind ?? null,
        content_focus: resolvedContentFocus,
        has_existing_thread: Boolean(activeThreadId),
        has_selected_draft_context: Boolean(effectiveSelectedDraftContext),
        intent: requestOptions.intent ?? null,
        prompt_length: trimmedPrompt.length,
        source: "chat_workspace",
        turn_source: requestOptions.turnSource ?? null,
        workspace_handle: accountName,
      });

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
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;
      activeTurnRequestRef.current = {
        runId: resolvedContext.runId,
        clientTurnId: preparedRequest.clientTurnId ?? null,
        threadId: activeThreadId,
      };
      setActiveClientTurnId(preparedRequest.clientTurnId ?? null);
      setActiveAgentProgressState(
        preparedRequest.pendingStatusPlan
          ? createAgentProgressRun({
              plan: preparedRequest.pendingStatusPlan,
            })
          : null,
      );
      setErrorMessage(null);
      setStatusMessage?.(null);
      setActiveThreadTurn?.(null);

      try {
        const response = await fetchWorkspace("/api/creator/v2/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: abortController.signal,
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
          const responseCode =
            data && typeof data === "object" && "code" in data
              ? (data as { code?: string }).code ?? null
              : null;
          const activeTurn =
            data &&
            typeof data === "object" &&
            "data" in data &&
            (data as { data?: { activeTurn?: ChatActiveTurn | null } }).data?.activeTurn
              ? (data as { data?: { activeTurn?: ChatActiveTurn | null } }).data?.activeTurn ?? null
              : null;
          const acceptedQueuedTurn =
            response.ok &&
            data &&
            typeof data === "object" &&
            "data" in data &&
            (data as { data?: { accepted?: boolean; executionMode?: string } }).data
              ?.accepted === true &&
            (data as { data?: { accepted?: boolean; executionMode?: string } }).data
              ?.executionMode === "queued";

          if (
            !response.ok &&
            activeTurn &&
            (responseCode === "TURN_IN_PROGRESS" ||
              responseCode === "ACTIVE_TURN_IN_PROGRESS")
          ) {
            setActiveThreadTurn?.(activeTurn);
            setStatusMessage?.(
              activeTurn.progressLabel ||
                "A previous reply is still running in this chat.",
            );
            setActiveAgentProgressState(null);
            return;
          }

          if (acceptedQueuedTurn && activeTurn) {
            if (activeTurn.threadId && activeTurn.threadId !== activeThreadId) {
              applyCreatedThreadWorkspaceUpdate(activeTurn.threadId, null);
            }
            setActiveThreadTurn?.(activeTurn);
            setStatusMessage?.(
              activeTurn.progressLabel || "The reply is queued and running in the background.",
            );
            setActiveAgentProgressState((current) =>
              applyAgentProgressBackendStatus(
                current,
                activeTurn.progressLabel || "Queued for background execution.",
              ),
            );
            return;
          }

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
          setStatusMessage?.(null);
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
        setStatusMessage?.(null);
        setActiveAgentProgressState(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        capturePostHogException(error, {
          intent: requestOptions.intent ?? null,
          source: "chat_workspace",
          turn_source: requestOptions.turnSource ?? null,
          workspace_handle: accountName,
        });
        setActiveAgentProgressState((current) =>
          completeAgentProgressRun(current, "failed"),
        );
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The live model failed before the backend could return a response.",
        );
      } finally {
        if (activeAbortControllerRef.current === abortController) {
          activeAbortControllerRef.current = null;
          activeTurnRequestRef.current = null;
          setActiveClientTurnId(null);
          setIsSending(false);
        }
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
      setActiveThreadTurn,
      setMessages,
      setErrorMessage,
      setIsSending,
      setPricingModalOpen,
      setStatusMessage,
    ],
  );

  const interruptAssistantReply = useCallback(async () => {
    const activeTurn = activeTurnRequestRef.current;
    const abortController = activeAbortControllerRef.current;
    if (!activeTurn?.runId || !activeTurn.clientTurnId) {
      return;
    }

    activeAbortControllerRef.current = null;
    activeTurnRequestRef.current = null;
    setActiveClientTurnId(null);
    setActiveAgentProgressState(null);
    setIsSending(false);
    setErrorMessage(null);
    abortController?.abort();

    try {
      await fetchWorkspace("/api/creator/v2/chat/interrupt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId: activeTurn.runId,
          clientTurnId: activeTurn.clientTurnId,
          ...(activeTurn.threadId ? { threadId: activeTurn.threadId } : {}),
        }),
      });
    } catch (error) {
      console.error("Failed to interrupt chat turn:", error);
    }
  }, [fetchWorkspace, setActiveAgentProgressState, setErrorMessage, setIsSending]);

  return {
    activeClientTurnId,
    interruptAssistantReply,
    requestAssistantReply,
  };
}
