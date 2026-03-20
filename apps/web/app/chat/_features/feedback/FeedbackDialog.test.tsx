import { createRef, type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { FeedbackDialog, type FeedbackDialogProps } from "./FeedbackDialog";

function buildProps(
  overrides: Partial<ComponentProps<typeof FeedbackDialog>> = {},
): FeedbackDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    }),
    feedbackCategory: "feedback",
    onFeedbackCategoryChange: vi.fn(),
    feedbackSource: "global_feedback",
    feedbackScope: {
      source: "global_feedback",
      reportedMessageId: null,
      assistantExcerpt: null,
      precedingUserExcerpt: null,
      transcriptExcerpt: [],
    },
    activeFeedbackTitle: "Feedback title",
    onActiveFeedbackTitleChange: vi.fn(),
    activeFeedbackDraft: "The preview should stay visible.",
    onActiveFeedbackDraftChange: vi.fn(),
    onDiscardDraft: vi.fn(),
    feedbackEditorRef: createRef<HTMLTextAreaElement>(),
    onFeedbackEditorKeyDown: vi.fn(),
    onInsertMarkdownToken: vi.fn(),
    feedbackImages: [],
    feedbackFileInputRef: createRef<HTMLInputElement>(),
    isFeedbackDropActive: false,
    onFeedbackImageSelection: vi.fn(),
    onFeedbackDropZoneDragOver: vi.fn(),
    onFeedbackDropZoneDragLeave: vi.fn(),
    onFeedbackDropZoneDrop: vi.fn(),
    onRemoveFeedbackImage: vi.fn(),
    profileHandle: "xpo_user",
    avatarUrl: null,
    submittingEmail: "support@example.com",
    activeThreadId: "thread_123",
    feedbackHistory: [],
    feedbackHistoryFilter: "all",
    onFeedbackHistoryFilterChange: vi.fn(),
    feedbackHistoryQuery: "",
    onFeedbackHistoryQueryChange: vi.fn(),
    isFeedbackHistoryLoading: false,
    feedbackStatusUpdatingIds: {},
    onUpdateFeedbackSubmissionStatus: vi.fn(),
    currentUserId: "user_123",
    feedbackSubmitNotice: null,
    isFeedbackSubmitting: false,
    ...overrides,
  };
}

test("submits feedback from the shared footer and closes through the split dialog header", () => {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
    event.preventDefault();
  });

  render(
    <FeedbackDialog
      {...buildProps({
        onOpenChange,
        onSubmit,
      })}
    />,
  );

  expect(screen.getByRole("dialog", { name: "Help us improve Xpo" })).toBeVisible();
  expect(screen.getByText("Message type")).toBeVisible();
  expect(screen.getByText("Live preview")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Close feedback" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
