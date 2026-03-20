"use client";

import type { ComponentProps } from "react";

import { DraftEditorSurface } from "../draft-editor/DraftEditorSurface";

type DraftEditorSurfaceProps = ComponentProps<typeof DraftEditorSurface>;

export interface UseDraftEditorSurfacePropsOptions {
  identity: DraftEditorSurfaceProps["identity"];
  isVerifiedAccount: boolean;
  timelinePosition: number;
  timelineLength: number;
  canNavigateDraftBack: boolean;
  canNavigateDraftForward: boolean;
  onNavigateTimeline: DraftEditorSurfaceProps["onNavigateTimeline"];
  onClose: DraftEditorSurfaceProps["onClose"];
  shouldShowRevertDraftCta: boolean;
  revertToSelectedDraftVersion: () => Promise<void>;
  saveDraftEditor: () => Promise<void>;
  isSelectedDraftThread: boolean;
  selectedDraftArtifact: DraftEditorSurfaceProps["selectedDraftArtifact"];
  selectedDraftThreadFramingStyle: DraftEditorSurfaceProps["selectedDraftThreadFramingStyle"];
  onChangeThreadFraming: DraftEditorSurfaceProps["onChangeThreadFraming"];
  isMainChatLocked: boolean;
  isViewingHistoricalDraftVersion: boolean;
  editorDraftPosts: string[];
  selectedDraftThreadPostIndex: number;
  selectedDraftMessageId: string | null;
  setSelectedThreadPostByMessageId: (
    value:
      | Record<string, number>
      | ((current: Record<string, number>) => Record<string, number>),
  ) => void;
  onUpdateThreadDraftPost: DraftEditorSurfaceProps["onUpdateThreadDraftPost"];
  onMoveThreadDraftPost: DraftEditorSurfaceProps["onMoveThreadDraftPost"];
  onSplitThreadDraftPost: DraftEditorSurfaceProps["onSplitThreadDraftPost"];
  onMergeThreadDraftPostDown: DraftEditorSurfaceProps["onMergeThreadDraftPostDown"];
  onAddThreadDraftPost: DraftEditorSurfaceProps["onAddThreadDraftPost"];
  onRemoveThreadDraftPost: DraftEditorSurfaceProps["onRemoveThreadDraftPost"];
  draftEditorSerializedContent: string;
  composerCharacterLimit: number;
  selectedDraftMaxCharacterLimit: number;
  editorDraftText: string;
  onChangeEditorDraftText: DraftEditorSurfaceProps["onChangeEditorDraftText"];
  isDraftInspectorLoading: boolean;
  runDraftInspector: () => Promise<void>;
  regenerateReplyDraft: () => Promise<void>;
  hasCopiedDraftEditorText: boolean;
  copyDraftEditor: (value: string) => Promise<void>;
  onShareDraftEditor: DraftEditorSurfaceProps["onShareDraftEditor"];
  open: boolean;
  hasDraftEditorChanges: boolean;
}

export function useDraftEditorSurfaceProps(
  options: UseDraftEditorSurfacePropsOptions,
): DraftEditorSurfaceProps {
  const isReplyDraft = options.selectedDraftArtifact?.kind === "reply_candidate";
  const primaryActionLabel = isReplyDraft
    ? "Save New Reply Version"
    : "Save As New Version";
  const isPrimaryActionDisabled = options.isViewingHistoricalDraftVersion
    ? !options.draftEditorSerializedContent.trim()
    : !options.draftEditorSerializedContent.trim() || !options.hasDraftEditorChanges;
  const draftInspectorActionLabel = options.isViewingHistoricalDraftVersion
    ? "Compare to Current"
    : isReplyDraft
      ? "Regenerate"
      : "Analyze this Draft";

  return {
    open: options.open,
    identity: options.identity,
    isVerifiedAccount: options.isVerifiedAccount,
    timelinePosition: options.timelinePosition,
    timelineLength: options.timelineLength,
    canNavigateDraftBack: options.canNavigateDraftBack,
    canNavigateDraftForward: options.canNavigateDraftForward,
    onNavigateTimeline: options.onNavigateTimeline,
    onClose: options.onClose,
    primaryActionLabel,
    isPrimaryActionDisabled,
    onPrimaryAction: () => {
      void options.saveDraftEditor();
    },
    editorMode: isReplyDraft ? "reply" : "default",
    isSelectedDraftThread: options.isSelectedDraftThread,
    selectedDraftArtifact: options.selectedDraftArtifact,
    selectedDraftThreadFramingStyle: options.selectedDraftThreadFramingStyle,
    onChangeThreadFraming: options.onChangeThreadFraming,
    isMainChatLocked: options.isMainChatLocked,
    isViewingHistoricalDraftVersion: options.isViewingHistoricalDraftVersion,
    editorDraftPosts: options.editorDraftPosts,
    selectedDraftThreadPostIndex: options.selectedDraftThreadPostIndex,
    selectedDraftMessageId: options.selectedDraftMessageId,
    onSelectThreadPost: (index) => {
      if (!options.selectedDraftMessageId) {
        return;
      }

      options.setSelectedThreadPostByMessageId((current) => ({
        ...current,
        [options.selectedDraftMessageId as string]: index,
      }));
    },
    onUpdateThreadDraftPost: options.onUpdateThreadDraftPost,
    onMoveThreadDraftPost: options.onMoveThreadDraftPost,
    onSplitThreadDraftPost: options.onSplitThreadDraftPost,
    onMergeThreadDraftPostDown: options.onMergeThreadDraftPostDown,
    onAddThreadDraftPost: options.onAddThreadDraftPost,
    onRemoveThreadDraftPost: options.onRemoveThreadDraftPost,
    draftEditorSerializedContent: options.draftEditorSerializedContent,
    composerCharacterLimit: options.composerCharacterLimit,
    selectedDraftMaxCharacterLimit: options.selectedDraftMaxCharacterLimit,
    editorDraftText: options.editorDraftText,
    onChangeEditorDraftText: options.onChangeEditorDraftText,
    draftInspectorActionLabel,
    isDraftInspectorLoading: options.isDraftInspectorLoading,
    onRunDraftInspector: () => {
      if (isReplyDraft) {
        void options.regenerateReplyDraft();
        return;
      }

      void options.runDraftInspector();
    },
    hasCopiedDraftEditorText: options.hasCopiedDraftEditorText,
    onCopyDraftEditor: () => {
      void options.copyDraftEditor(options.draftEditorSerializedContent);
    },
    shareActionLabel: isReplyDraft ? "Go to Tweet" : "Share",
    onShareDraftEditor: options.onShareDraftEditor,
  };
}
