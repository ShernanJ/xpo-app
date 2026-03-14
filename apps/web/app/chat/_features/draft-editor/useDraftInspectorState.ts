"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  buildDraftReviewFailureLabel,
  buildDraftReviewLoadingLabel,
  buildDraftReviewPrompt,
} from "@/lib/agent-v2/responses/assistantReplyStyle";

import type {
  BillingSnapshotPayload,
  BillingStatePayload,
} from "../billing/billingViewState";

interface ValidationError {
  message: string;
}

interface DraftInspectorSuccess {
  ok: true;
  data: {
    summary: string;
    prompt: string;
    userMessageId: string;
    assistantMessageId: string;
    billing?: BillingStatePayload;
  };
}

interface DraftInspectorFailure {
  ok: false;
  code?: "INSUFFICIENT_CREDITS" | "PLAN_REQUIRED" | "RATE_LIMITED";
  errors: ValidationError[];
  data?: {
    billing?: BillingSnapshotPayload;
  };
}

type DraftInspectorResponse = DraftInspectorSuccess | DraftInspectorFailure;
type DraftInspectorMode = "analyze" | "compare";

interface DraftInspectorVersionLike {
  content: string;
}

interface DraftInspectorTimelineEntryLike {
  messageId: string;
  versionId: string;
  content: string;
}

interface DraftInspectorMessageLike {
  id: string;
  threadId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
}

interface CreateDraftInspectorMessageArgs {
  id: string;
  threadId?: string;
  content: string;
  createdAt: string;
}

interface UseDraftInspectorStateOptions<TMessage extends DraftInspectorMessageLike> {
  activeThreadId: string | null;
  activeDraftEditorMessageId?: string | null;
  activeDraftEditorVersionId?: string | null;
  draftEditorSerializedContent: string;
  selectedDraftVersion: DraftInspectorVersionLike | null;
  isViewingHistoricalDraftVersion: boolean;
  latestDraftTimelineEntry: DraftInspectorTimelineEntryLike | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  setMessages: Dispatch<SetStateAction<TMessage[]>>;
  scrollThreadToBottom: () => void;
  onApplyBillingState: (billing: BillingStatePayload) => void;
  onApplyBillingSnapshot: (billing: BillingSnapshotPayload | null | undefined) => void;
  onRequirePricingModal: () => void;
  onErrorMessage: (message: string | null) => void;
  createUserMessage: (args: CreateDraftInspectorMessageArgs) => TMessage;
  createAssistantMessage: (args: CreateDraftInspectorMessageArgs) => TMessage;
}

function resolveDraftInspectorMode(params: {
  isViewingHistoricalDraftVersion: boolean;
  latestDraftTimelineEntry: DraftInspectorTimelineEntryLike | null;
  activeDraftEditorMessageId?: string | null;
  activeDraftEditorVersionId?: string | null;
}): DraftInspectorMode {
  const { isViewingHistoricalDraftVersion, latestDraftTimelineEntry } = params;
  if (
    isViewingHistoricalDraftVersion &&
    latestDraftTimelineEntry &&
    (latestDraftTimelineEntry.messageId !== params.activeDraftEditorMessageId ||
      latestDraftTimelineEntry.versionId !== params.activeDraftEditorVersionId)
  ) {
    return "compare";
  }

  return "analyze";
}

export function useDraftInspectorState<TMessage extends DraftInspectorMessageLike>(
  options: UseDraftInspectorStateOptions<TMessage>,
) {
  const {
    activeThreadId,
    activeDraftEditorMessageId,
    activeDraftEditorVersionId,
    draftEditorSerializedContent,
    selectedDraftVersion,
    isViewingHistoricalDraftVersion,
    latestDraftTimelineEntry,
    fetchWorkspace,
    setMessages,
    scrollThreadToBottom,
    onApplyBillingState,
    onApplyBillingSnapshot,
    onRequirePricingModal,
    onErrorMessage,
    createUserMessage,
    createAssistantMessage,
  } = options;

  const [isDraftInspectorLoading, setIsDraftInspectorLoading] = useState(false);

  const runDraftInspector = useCallback(async () => {
    if (!selectedDraftVersion || !activeThreadId) {
      return;
    }

    const inspectedDraft =
      draftEditorSerializedContent.trim() || selectedDraftVersion.content.trim();
    if (!inspectedDraft) {
      return;
    }

    const mode = resolveDraftInspectorMode({
      isViewingHistoricalDraftVersion,
      latestDraftTimelineEntry,
      activeDraftEditorMessageId,
      activeDraftEditorVersionId,
    });
    const currentDraft = mode === "compare" ? latestDraftTimelineEntry?.content.trim() ?? "" : "";

    if (mode === "compare" && !currentDraft) {
      onErrorMessage("There isn't a current draft version to compare against yet.");
      return;
    }

    const prompt = buildDraftReviewPrompt(mode);
    const nowIso = new Date().toISOString();
    const temporaryUserMessageId = `draft-inspector-user-${Date.now()}`;
    const temporaryAssistantMessageId = `draft-inspector-assistant-${Date.now() + 1}`;

    setMessages((current) => [
      ...current,
      createUserMessage({
        id: temporaryUserMessageId,
        threadId: activeThreadId ?? undefined,
        content: prompt,
        createdAt: nowIso,
      }),
      createAssistantMessage({
        id: temporaryAssistantMessageId,
        threadId: activeThreadId ?? undefined,
        content: buildDraftReviewLoadingLabel(mode),
        createdAt: nowIso,
      }),
    ]);
    scrollThreadToBottom();
    setIsDraftInspectorLoading(true);
    onErrorMessage(null);

    try {
      const response = await fetchWorkspace("/api/creator/v2/draft-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          draft: inspectedDraft,
          threadId: activeThreadId,
          ...(mode === "compare" ? { currentDraft } : {}),
        }),
      });

      const data = (await response.json()) as DraftInspectorResponse;

      if (!response.ok || !data.ok) {
        const failure = data as DraftInspectorFailure;
        onApplyBillingSnapshot(failure.data?.billing);
        if (response.status === 402 || response.status === 403) {
          onRequirePricingModal();
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === temporaryAssistantMessageId
              ? ({
                  ...message,
                  content: buildDraftReviewFailureLabel(),
                  isStreaming: false,
                } as TMessage)
              : message,
          ),
        );
        onErrorMessage(failure.errors[0]?.message ?? "The draft analysis failed.");
        return;
      }

      if (data.data.billing) {
        onApplyBillingState(data.data.billing);
      }

      setMessages((current) =>
        current.map((message) => {
          if (message.id === temporaryUserMessageId) {
            return {
              ...message,
              id: data.data.userMessageId,
              content: data.data.prompt,
            } as TMessage;
          }

          if (message.id === temporaryAssistantMessageId) {
            return {
              ...message,
              id: data.data.assistantMessageId,
              content: data.data.summary.trim(),
              isStreaming: false,
            } as TMessage;
          }

          return message;
        }),
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === temporaryAssistantMessageId
            ? ({
                ...message,
                content: buildDraftReviewFailureLabel(),
                isStreaming: false,
              } as TMessage)
            : message,
        ),
      );
      onErrorMessage("The draft analysis failed.");
    } finally {
      setIsDraftInspectorLoading(false);
    }
  }, [
    activeDraftEditorMessageId,
    activeDraftEditorVersionId,
    activeThreadId,
    createAssistantMessage,
    createUserMessage,
    draftEditorSerializedContent,
    fetchWorkspace,
    isViewingHistoricalDraftVersion,
    latestDraftTimelineEntry,
    onApplyBillingSnapshot,
    onApplyBillingState,
    onErrorMessage,
    onRequirePricingModal,
    scrollThreadToBottom,
    selectedDraftVersion,
    setMessages,
  ]);

  return {
    isDraftInspectorLoading,
    runDraftInspector,
  };
}
