"use client";

import { useCallback, useMemo } from "react";

import { type DraftArtifactDetails, type ThreadFramingStyle } from "../../../../lib/onboarding/draftArtifacts";

import { clampThreadPostIndex } from "./chatDraftEditorState";
import { getThreadFramingStyle } from "./chatDraftPreviewState";
import {
  buildDraftRevisionTimeline,
  normalizeDraftVersionBundle,
  resolveDraftTimelineNavigation,
  resolveDraftTimelineState,
  type ChatMessageLike,
  type DraftDrawerSelectionLike,
  type DraftVersionBundleLike,
  type DraftVersionEntryLike,
  type DraftVersionSnapshotLike,
} from "./chatDraftSessionState";

const DRAFT_TIMELINE_FOCUS_DELAY_MS = 0;

type DraftArtifact = DraftArtifactDetails;

interface UseSelectedDraftStateOptions<TMessage extends ChatMessageLike> {
  activeDraftEditor: DraftDrawerSelectionLike | null;
  messages: TMessage[];
  composerCharacterLimit: number;
}

export function useSelectedDraftState<TMessage extends ChatMessageLike>(
  options: UseSelectedDraftStateOptions<TMessage>,
) {
  const {
    activeDraftEditor,
    messages,
    composerCharacterLimit,
  } = options;

  const selectedDraftMessage = useMemo(
    () =>
      activeDraftEditor
        ? messages.find((item) => item.id === activeDraftEditor.messageId) ?? null
        : null,
    [activeDraftEditor, messages],
  );
  const selectedDraftBundle = useMemo<DraftVersionBundleLike | null>(
    () =>
      selectedDraftMessage
        ? normalizeDraftVersionBundle(selectedDraftMessage, composerCharacterLimit)
        : null,
    [composerCharacterLimit, selectedDraftMessage],
  );
  const selectedDraftVersion = useMemo<DraftVersionEntryLike | null>(() => {
    if (!activeDraftEditor || !selectedDraftBundle) {
      return null;
    }

    return (
      selectedDraftBundle.versions.find(
        (version) => version.id === activeDraftEditor.versionId,
      ) ?? selectedDraftBundle.activeVersion
    );
  }, [activeDraftEditor, selectedDraftBundle]);
  const selectedDraftArtifact = useMemo<DraftArtifact | null>(
    () => selectedDraftVersion?.artifact ?? selectedDraftMessage?.draftArtifacts?.[0] ?? null,
    [selectedDraftMessage?.draftArtifacts, selectedDraftVersion?.artifact],
  );
  const isSelectedDraftThread =
    selectedDraftArtifact?.kind === "thread_seed" ||
    selectedDraftMessage?.outputShape === "thread_seed";
  const selectedDraftThreadFramingStyle = useMemo<ThreadFramingStyle | null>(
    () =>
      isSelectedDraftThread
        ? getThreadFramingStyle(
            selectedDraftArtifact,
            selectedDraftVersion?.content ?? selectedDraftMessage?.draft ?? undefined,
          )
        : null,
    [
      isSelectedDraftThread,
      selectedDraftArtifact,
      selectedDraftMessage?.draft,
      selectedDraftVersion?.content,
    ],
  );

  return {
    selectedDraftMessage,
    selectedDraftBundle,
    selectedDraftVersion,
    selectedDraftArtifact,
    isSelectedDraftThread,
    selectedDraftThreadFramingStyle,
  };
}

interface UseSelectedDraftTimelineStateOptions<TMessage extends ChatMessageLike> {
  activeDraftEditor: DraftDrawerSelectionLike | null;
  messages: TMessage[];
  composerCharacterLimit: number;
  selectedThreadPostByMessageId: Record<string, number>;
  selectedDraftThreadPostCount: number;
  draftEditorSerializedContent: string;
  selectedDraftMessage: TMessage | null;
  selectedDraftVersion: DraftVersionEntryLike | null;
  isSelectedDraftThread: boolean;
  setActiveDraftEditor: (value: DraftDrawerSelectionLike | null) => void;
  scrollMessageIntoView: (messageId: string) => void;
}

export function useSelectedDraftTimelineState<TMessage extends ChatMessageLike>(
  options: UseSelectedDraftTimelineStateOptions<TMessage>,
) {
  const {
    activeDraftEditor,
    messages,
    composerCharacterLimit,
    selectedThreadPostByMessageId,
    selectedDraftThreadPostCount,
    draftEditorSerializedContent,
    selectedDraftMessage,
    selectedDraftVersion,
    isSelectedDraftThread,
    setActiveDraftEditor,
    scrollMessageIntoView,
  } = options;

  const selectedDraftThreadPostIndex = useMemo(() => {
    const activeMessageId = activeDraftEditor?.messageId;
    if (!activeMessageId || !isSelectedDraftThread || selectedDraftThreadPostCount === 0) {
      return 0;
    }

    const rawIndex = selectedThreadPostByMessageId[activeMessageId] ?? 0;
    return clampThreadPostIndex(rawIndex, selectedDraftThreadPostCount);
  }, [
    activeDraftEditor?.messageId,
    isSelectedDraftThread,
    selectedDraftThreadPostCount,
    selectedThreadPostByMessageId,
  ]);
  const selectedDraftTimeline = useMemo(
    () =>
      buildDraftRevisionTimeline({
        messages,
        activeDraftSelection: activeDraftEditor,
        fallbackCharacterLimit: composerCharacterLimit,
      }),
    [activeDraftEditor, composerCharacterLimit, messages],
  );
  const selectedDraftVersionId = selectedDraftVersion?.id ?? null;
  const selectedDraftVersionContent = selectedDraftVersion?.content ?? "";
  const selectedDraftMessageId = activeDraftEditor?.messageId ?? null;
  const timelineState = useMemo(
    () =>
      resolveDraftTimelineState({
        timeline: selectedDraftTimeline,
        activeDraftSelection: activeDraftEditor,
        serializedContent: draftEditorSerializedContent,
        selectedDraftVersionContent,
      }),
    [
      activeDraftEditor,
      draftEditorSerializedContent,
      selectedDraftTimeline,
      selectedDraftVersionContent,
    ],
  );
  const selectedDraftContext = useMemo<DraftVersionSnapshotLike | null>(() => {
    if (
      timelineState.isViewingHistoricalDraftVersion ||
      !activeDraftEditor ||
      !selectedDraftVersion ||
      !selectedDraftMessage
    ) {
      return null;
    }

    return {
      messageId: activeDraftEditor.messageId,
      versionId: selectedDraftVersion.id,
      content: draftEditorSerializedContent.trim() || selectedDraftVersion.content,
      source: selectedDraftVersion.source,
      createdAt: selectedDraftVersion.createdAt,
      maxCharacterLimit: selectedDraftVersion.maxCharacterLimit,
      revisionChainId:
        activeDraftEditor.revisionChainId ?? selectedDraftMessage.revisionChainId,
      ...(isSelectedDraftThread
        ? { focusedThreadPostIndex: selectedDraftThreadPostIndex }
        : {}),
    };
  }, [
    activeDraftEditor,
    draftEditorSerializedContent,
    isSelectedDraftThread,
    selectedDraftMessage,
    selectedDraftThreadPostIndex,
    selectedDraftVersion,
    timelineState.isViewingHistoricalDraftVersion,
  ]);

  const navigateDraftTimeline = useCallback(
    (direction: "back" | "forward") => {
      const navigation = resolveDraftTimelineNavigation({
        direction,
        timeline: selectedDraftTimeline,
        selectedDraftTimelineIndex: timelineState.selectedDraftTimelineIndex,
        activeDraftSelection: activeDraftEditor,
      });
      if (!navigation) {
        return;
      }

      if (navigation.scrollToMessageId) {
        scrollMessageIntoView(navigation.scrollToMessageId);
        window.setTimeout(() => {
          setActiveDraftEditor(navigation.targetSelection);
        }, DRAFT_TIMELINE_FOCUS_DELAY_MS);
        return;
      }

      setActiveDraftEditor(navigation.targetSelection);
    },
    [
      activeDraftEditor,
      scrollMessageIntoView,
      selectedDraftTimeline,
      setActiveDraftEditor,
      timelineState.selectedDraftTimelineIndex,
    ],
  );

  return {
    selectedDraftThreadPostIndex,
    selectedDraftContext,
    selectedDraftTimeline,
    selectedDraftVersionId,
    selectedDraftVersionContent,
    selectedDraftMessageId,
    navigateDraftTimeline,
    ...timelineState,
  };
}
