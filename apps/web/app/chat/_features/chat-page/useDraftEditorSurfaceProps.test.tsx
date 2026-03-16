import { expect, test, vi } from "vitest";

import { useDraftEditorSurfaceProps } from "./useDraftEditorSurfaceProps";

test("historical draft views keep save-as-new-version enabled and do not revert in place", () => {
  const saveDraftEditor = vi.fn();
  const revertToSelectedDraftVersion = vi.fn();

  const props = useDraftEditorSurfaceProps({
    identity: {
      avatarUrl: null,
      displayName: "Stan",
      username: "stan",
      profilePhotoLabel: "Stan profile photo",
      initials: "S",
    },
    isVerifiedAccount: false,
    timelinePosition: 1,
    timelineLength: 2,
    canNavigateDraftBack: false,
    canNavigateDraftForward: true,
    onNavigateTimeline: vi.fn(),
    onClose: vi.fn(),
    shouldShowRevertDraftCta: true,
    revertToSelectedDraftVersion,
    saveDraftEditor,
    isSelectedDraftThread: false,
    selectedDraftArtifact: null,
    selectedDraftThreadFramingStyle: null,
    onChangeThreadFraming: vi.fn(),
    isMainChatLocked: false,
    isViewingHistoricalDraftVersion: true,
    editorDraftPosts: [],
    selectedDraftThreadPostIndex: 0,
    selectedDraftMessageId: "message-1",
    setSelectedThreadPostByMessageId: vi.fn(),
    onUpdateThreadDraftPost: vi.fn(),
    onMoveThreadDraftPost: vi.fn(),
    onSplitThreadDraftPost: vi.fn(),
    onMergeThreadDraftPostDown: vi.fn(),
    onAddThreadDraftPost: vi.fn(),
    onRemoveThreadDraftPost: vi.fn(),
    draftEditorSerializedContent: "older snapshot",
    composerCharacterLimit: 280,
    selectedDraftMaxCharacterLimit: 280,
    editorDraftText: "older snapshot",
    onChangeEditorDraftText: vi.fn(),
    isDraftInspectorLoading: false,
    runDraftInspector: vi.fn(async () => {}),
    hasCopiedDraftEditorText: false,
    copyDraftEditor: vi.fn(async () => {}),
    onShareDraftEditor: vi.fn(),
    open: true,
    hasDraftEditorChanges: false,
  });

  expect(props.primaryActionLabel).toBe("Save As New Version");
  expect(props.isPrimaryActionDisabled).toBe(false);

  props.onPrimaryAction();
  expect(saveDraftEditor).toHaveBeenCalledTimes(1);
  expect(revertToSelectedDraftVersion).not.toHaveBeenCalled();
});
