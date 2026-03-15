"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

interface ValidationError {
  message: string;
}

interface SourceMaterialsSuccess {
  ok: true;
  data: {
    deletedId?: string;
  };
}

interface SourceMaterialsFailure {
  ok: false;
  errors: ValidationError[];
}

type SourceMaterialsResponse = SourceMaterialsSuccess | SourceMaterialsFailure;

interface MessageFeedbackMutationSuccess {
  ok: true;
  data: {
    feedback: {
      value: "up" | "down" | null;
    };
  };
}

interface MessageFeedbackMutationFailure {
  ok: false;
  errors: ValidationError[];
}

interface MessageFeedbackClearSuccess {
  ok: true;
  data: {
    messageId: string;
    cleared: boolean;
  };
}

type MessageFeedbackMutationResponse =
  | MessageFeedbackMutationSuccess
  | MessageFeedbackMutationFailure
  | MessageFeedbackClearSuccess;

interface AutoSavedSourceAssetLike {
  id: string;
  title: string;
  deletable: boolean;
}

interface MessageArtifactActionMessageLike {
  id: string;
  threadId?: string;
  role: "assistant" | "user";
  isStreaming?: boolean;
  feedbackValue?: "up" | "down" | null;
}

interface UseMessageArtifactActionsOptions<TMessage extends MessageArtifactActionMessageLike> {
  activeThreadId: string | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  setMessages: Dispatch<SetStateAction<TMessage[]>>;
  messages: TMessage[];
  removeSourceMaterialsByIds: (ids: string[]) => void;
  onErrorMessage: (message: string | null) => void;
}

export function useMessageArtifactActions<TMessage extends MessageArtifactActionMessageLike>(
  options: UseMessageArtifactActionsOptions<TMessage>,
) {
  const {
    activeThreadId,
    fetchWorkspace,
    setMessages,
    messages,
    removeSourceMaterialsByIds,
    onErrorMessage,
  } = options;

  const [messageFeedbackPendingById, setMessageFeedbackPendingById] = useState<
    Record<string, boolean>
  >({});
  const [autoSavedSourceUndoPendingByMessageId, setAutoSavedSourceUndoPendingByMessageId] =
    useState<Record<string, boolean>>({});
  const [dismissedAutoSavedSourceByMessageId, setDismissedAutoSavedSourceByMessageId] =
    useState<Record<string, boolean>>({});

  const trackProductEvent = useCallback(
    async (params: {
      eventType: string;
      messageId?: string;
      candidateId?: string;
      properties?: Record<string, unknown>;
    }) => {
      try {
        await fetchWorkspace("/api/creator/v2/product-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          keepalive: true,
          body: JSON.stringify({
            eventType: params.eventType,
            threadId: activeThreadId ?? null,
            ...(params.messageId ? { messageId: params.messageId } : {}),
            ...(params.candidateId ? { candidateId: params.candidateId } : {}),
            properties: params.properties || {},
          }),
        });
      } catch (error) {
        console.error("Failed to record product event:", error);
      }
    },
    [activeThreadId, fetchWorkspace],
  );

  const undoAutoSavedSourceMaterials = useCallback(
    async (
      messageId: string,
      autoSavedSourceMaterials: {
        count: number;
        assets: AutoSavedSourceAssetLike[];
      },
    ) => {
      const deletableAssets = autoSavedSourceMaterials.assets.filter((asset) => asset.deletable);
      if (deletableAssets.length === 0) {
        return;
      }

      setAutoSavedSourceUndoPendingByMessageId((current) => ({
        ...current,
        [messageId]: true,
      }));
      onErrorMessage(null);

      try {
        const deletedIds: string[] = [];

        for (const asset of deletableAssets) {
          const response = await fetchWorkspace(`/api/creator/v2/source-materials/${asset.id}`, {
            method: "DELETE",
          });
          const result = (await response.json()) as SourceMaterialsResponse;
          if (!response.ok || !result.ok) {
            const fallbackMessage = result.ok
              ? "Failed to remove saved source material."
              : result.errors[0]?.message;
            throw new Error(fallbackMessage || "Failed to remove saved source material.");
          }
          if (!("deletedId" in result.data) || !result.data.deletedId) {
            throw new Error("Failed to remove saved source material.");
          }

          deletedIds.push(result.data.deletedId);
        }

        removeSourceMaterialsByIds(deletedIds);
        setDismissedAutoSavedSourceByMessageId((current) => ({
          ...current,
          [messageId]: true,
        }));
        await trackProductEvent({
          eventType: "source_auto_save_undone",
          messageId,
          properties: {
            deletedCount: deletedIds.length,
            deletedTitles: deletableAssets.map((asset) => asset.title).slice(0, 3),
          },
        });
      } catch (error) {
        onErrorMessage(
          error instanceof Error ? error.message : "Failed to remove saved source material.",
        );
      } finally {
        setAutoSavedSourceUndoPendingByMessageId((current) => ({
          ...current,
          [messageId]: false,
        }));
      }
    },
    [fetchWorkspace, onErrorMessage, removeSourceMaterialsByIds, trackProductEvent],
  );

  const submitAssistantMessageFeedback = useCallback(
    async (messageId: string, value: "up" | "down") => {
      if (
        messageId.startsWith("assistant-") ||
        messageId.startsWith("draft-inspector-assistant-")
      ) {
        return;
      }

      const targetMessage = messages.find((message) => message.id === messageId);
      if (!targetMessage || targetMessage.role !== "assistant" || targetMessage.isStreaming) {
        return;
      }
      const resolvedThreadId = targetMessage.threadId || activeThreadId;
      if (!resolvedThreadId || resolvedThreadId === "current-workspace") {
        return;
      }

      const previousValue = targetMessage.feedbackValue ?? null;
      const nextValue = previousValue === value ? null : value;

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? ({
                ...message,
                feedbackValue: nextValue,
              } as TMessage)
            : message,
        ),
      );
      setMessageFeedbackPendingById((current) => ({
        ...current,
        [messageId]: true,
      }));

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/threads/${encodeURIComponent(resolvedThreadId)}/messages/${encodeURIComponent(messageId)}/feedback`,
          {
            method: nextValue ? "POST" : "DELETE",
            ...(nextValue
              ? {
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ value: nextValue }),
                }
              : {}),
          },
        );
        const responseBodyText = await response.text();
        let result: MessageFeedbackMutationResponse | null = null;
        if (responseBodyText) {
          try {
            result = JSON.parse(responseBodyText) as MessageFeedbackMutationResponse;
          } catch {
            result = null;
          }
        }

        if (!response.ok || !result?.ok) {
          const failureMessage =
            result && "errors" in result ? result.errors?.[0]?.message : null;
          throw new Error(
            failureMessage || `Failed to save message feedback (${response.status}).`,
          );
        }

        const savedValue =
          result && result.ok && "feedback" in result.data
            ? result.data.feedback?.value
            : null;
        if (savedValue === "up" || savedValue === "down") {
          setMessages((current) =>
            current.map((message) =>
              message.id === messageId
                ? ({
                    ...message,
                    feedbackValue: savedValue,
                  } as TMessage)
                : message,
            ),
          );
        }
      } catch (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? ({
                  ...message,
                  feedbackValue: previousValue,
                } as TMessage)
              : message,
          ),
        );
        console.error("Failed to save assistant message feedback", error);
      } finally {
        setMessageFeedbackPendingById((current) => {
          const next = { ...current };
          delete next[messageId];
          return next;
        });
      }
    },
    [activeThreadId, fetchWorkspace, messages, setMessages],
  );

  return {
    messageFeedbackPendingById,
    autoSavedSourceUndoPendingByMessageId,
    dismissedAutoSavedSourceByMessageId,
    undoAutoSavedSourceMaterials,
    submitAssistantMessageFeedback,
  };
}
