"use client";

import { useCallback } from "react";

import type { ThreadFramingStyle } from "@/lib/onboarding/draftArtifacts";

import {
  resolveDraftCardRevisionAction,
  resolveSelectedThreadFramingChangeAction,
} from "./chatDraftActionState";
import type {
  ChatMessageLike,
  DraftDrawerSelectionLike,
  DraftVersionEntryLike,
} from "./chatDraftSessionState";

interface UseDraftRevisionActionsOptions<TMessage extends ChatMessageLike> {
  messages: TMessage[];
  composerCharacterLimit: number;
  selectedDraftMessage: TMessage | null;
  selectedDraftVersion: DraftVersionEntryLike | null;
  selectedDraftThreadFramingStyle: ThreadFramingStyle | null;
  requestAssistantReply: (
    request: NonNullable<ReturnType<typeof resolveDraftCardRevisionAction>>["request"],
  ) => Promise<void>;
  setActiveDraftEditor: (value: DraftDrawerSelectionLike | null) => void;
}

export function useDraftRevisionActions<TMessage extends ChatMessageLike>(
  options: UseDraftRevisionActionsOptions<TMessage>,
) {
  const {
    messages,
    composerCharacterLimit,
    selectedDraftMessage,
    selectedDraftVersion,
    selectedDraftThreadFramingStyle,
    requestAssistantReply,
    setActiveDraftEditor,
  } = options;

  const requestDraftCardRevision = useCallback(
    async (
      messageId: string,
      prompt: string,
      threadFramingStyleOverride?: ThreadFramingStyle | null,
    ) => {
      const draftAction = resolveDraftCardRevisionAction({
        messageId,
        prompt,
        messages,
        composerCharacterLimit,
        threadFramingStyleOverride,
      });
      if (!draftAction) {
        return;
      }

      setActiveDraftEditor(draftAction.activeDraftEditor);
      await requestAssistantReply(draftAction.request);
    },
    [composerCharacterLimit, messages, requestAssistantReply, setActiveDraftEditor],
  );

  const requestSelectedThreadFramingChange = useCallback(
    async (style: ThreadFramingStyle) => {
      const draftAction = resolveSelectedThreadFramingChangeAction({
        selectedDraftMessage,
        selectedDraftVersion,
        selectedDraftThreadFramingStyle,
        nextStyle: style,
      });
      if (!draftAction) {
        return;
      }

      setActiveDraftEditor(draftAction.activeDraftEditor);
      await requestAssistantReply(draftAction.request);
    },
    [
      requestAssistantReply,
      selectedDraftMessage,
      selectedDraftThreadFramingStyle,
      selectedDraftVersion,
      setActiveDraftEditor,
    ],
  );

  return {
    requestDraftCardRevision,
    requestSelectedThreadFramingChange,
  };
}
