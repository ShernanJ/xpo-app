"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  FEEDBACK_MAX_FILE_SIZE_BYTES,
  FEEDBACK_MAX_FILES,
  buildDefaultFeedbackDrafts,
  buildDefaultFeedbackTitles,
  buildFeedbackImageThumbnailDataUrl,
  extractFeedbackTemplateFields,
  formatFeedbackStatusLabel,
  isSupportedFeedbackFile,
  readFeedbackFileSignatureHex,
  type FeedbackAttachmentPayload,
  type FeedbackCategory,
  type FeedbackHistoryItem,
  type FeedbackImageDraft,
  type FeedbackReportFilter,
  type FeedbackReportStatus,
} from "./feedbackState";

interface ValidationError {
  message: string;
}

interface FeedbackSubmitSuccess {
  ok: true;
  data: {
    id: string;
    createdAt: string;
    profileId: string;
  };
}

interface FeedbackSubmitFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackSubmitResponse = FeedbackSubmitSuccess | FeedbackSubmitFailure;

interface FeedbackHistorySuccess {
  ok: true;
  data: {
    submissions: FeedbackHistoryItem[];
  };
}

interface FeedbackHistoryFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackHistoryResponse = FeedbackHistorySuccess | FeedbackHistoryFailure;

interface FeedbackStatusUpdateSuccess {
  ok: true;
  data: {
    submission: FeedbackHistoryItem;
  };
}

interface FeedbackStatusUpdateFailure {
  ok: false;
  errors: ValidationError[];
}

type FeedbackStatusUpdateResponse =
  | FeedbackStatusUpdateSuccess
  | FeedbackStatusUpdateFailure;

interface UseFeedbackStateOptions {
  activeThreadId: string | null;
  activeDraftMessageId: string | null;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export function useFeedbackState(options: UseFeedbackStateOptions) {
  const { activeThreadId, activeDraftMessageId, fetchWorkspace } = options;

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>("feedback");
  const [feedbackTitlesByCategory, setFeedbackTitlesByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackTitles());
  const [feedbackDraftsByCategory, setFeedbackDraftsByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildDefaultFeedbackDrafts());
  const [feedbackImages, setFeedbackImages] = useState<FeedbackImageDraft[]>([]);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackSubmitNotice, setFeedbackSubmitNotice] = useState<string | null>(null);
  const [isFeedbackDropActive, setIsFeedbackDropActive] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryItem[]>([]);
  const [feedbackHistoryFilter, setFeedbackHistoryFilter] =
    useState<FeedbackReportFilter>("open");
  const [feedbackHistoryQuery, setFeedbackHistoryQuery] = useState("");
  const [isFeedbackHistoryLoading, setIsFeedbackHistoryLoading] = useState(false);
  const [feedbackStatusUpdatingIds, setFeedbackStatusUpdatingIds] = useState<
    Record<string, boolean>
  >({});

  const feedbackEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackImagesRef = useRef(feedbackImages);

  const activeFeedbackTitle = feedbackTitlesByCategory[feedbackCategory] ?? "";
  const activeFeedbackDraft = feedbackDraftsByCategory[feedbackCategory] ?? "";

  const openFeedbackDialog = useCallback(() => {
    setFeedbackSubmitNotice(null);
    setFeedbackModalOpen(true);
  }, []);

  const updateFeedbackModalOpen = useCallback((open: boolean) => {
    setFeedbackModalOpen(open);
  }, []);

  const updateFeedbackCategory = useCallback((category: FeedbackCategory) => {
    setFeedbackCategory(category);
  }, []);

  const updateActiveFeedbackTitle = useCallback(
    (value: string) => {
      setFeedbackTitlesByCategory((current) => ({
        ...current,
        [feedbackCategory]: value,
      }));
      setFeedbackSubmitNotice(null);
    },
    [feedbackCategory],
  );

  const updateActiveFeedbackDraft = useCallback(
    (value: string) => {
      setFeedbackDraftsByCategory((current) => ({
        ...current,
        [feedbackCategory]: value,
      }));
      setFeedbackSubmitNotice(null);
    },
    [feedbackCategory],
  );

  const applyFeedbackMarkdownToken = useCallback(
    (token: "bold" | "italic" | "bullet" | "link") => {
      const textarea = feedbackEditorRef.current;
      if (!textarea) {
        return;
      }

      const currentText = feedbackDraftsByCategory[feedbackCategory] ?? "";
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? currentText.length;
      const selected = currentText.slice(start, end);

      let insertion = "";
      let nextCursorStart = start;
      let nextCursorEnd = start;

      if (token === "bold") {
        const content = selected || "bold text";
        insertion = `**${content}**`;
        nextCursorStart = start + 2;
        nextCursorEnd = nextCursorStart + content.length;
      } else if (token === "italic") {
        const content = selected || "italic text";
        insertion = `*${content}*`;
        nextCursorStart = start + 1;
        nextCursorEnd = nextCursorStart + content.length;
      } else if (token === "bullet") {
        const content = selected
          ? selected
              .split(/\r?\n/)
              .map((line) => (line.trim() ? `- ${line.trim()}` : "- "))
              .join("\n")
          : "- list item";
        insertion = content;
        nextCursorStart = start + insertion.length;
        nextCursorEnd = nextCursorStart;
      } else {
        const label = selected || "link text";
        insertion = `[${label}](https://example.com)`;
        const urlStart = insertion.indexOf("https://");
        nextCursorStart = start + urlStart;
        nextCursorEnd = nextCursorStart + "https://example.com".length;
      }

      const nextText = currentText.slice(0, start) + insertion + currentText.slice(end);
      setFeedbackDraftsByCategory((current) => ({
        ...current,
        [feedbackCategory]: nextText,
      }));
      setFeedbackSubmitNotice(null);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
    },
    [feedbackCategory, feedbackDraftsByCategory],
  );

  const handleFeedbackEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        applyFeedbackMarkdownToken("bold");
        return;
      }

      if (key === "i") {
        event.preventDefault();
        applyFeedbackMarkdownToken("italic");
        return;
      }

      if (key === "k") {
        event.preventDefault();
        applyFeedbackMarkdownToken("link");
      }
    },
    [applyFeedbackMarkdownToken],
  );

  const clearFeedbackImages = useCallback(() => {
    setFeedbackImages((current) => {
      for (const image of current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return [];
    });
  }, []);

  const resetFeedbackDrafts = useCallback(() => {
    clearFeedbackImages();
    setFeedbackCategory("feedback");
    setFeedbackTitlesByCategory(buildDefaultFeedbackTitles());
    setFeedbackDraftsByCategory(buildDefaultFeedbackDrafts());
    setIsFeedbackDropActive(false);
    setFeedbackSubmitNotice(null);
  }, [clearFeedbackImages]);

  const loadFeedbackHistory = useCallback(async () => {
    setIsFeedbackHistoryLoading(true);

    try {
      const response = await fetchWorkspace("/api/creator/v2/feedback", {
        method: "GET",
      });
      const result: FeedbackHistoryResponse = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(
          !result.ok
            ? result.errors[0]?.message || "Failed to load feedback history."
            : "Failed to load feedback history.",
        );
      }

      setFeedbackHistory(result.data.submissions);
      setFeedbackStatusUpdatingIds({});
    } catch (error) {
      console.error("Failed to load feedback history", error);
      setFeedbackHistory([]);
    } finally {
      setIsFeedbackHistoryLoading(false);
    }
  }, [fetchWorkspace]);

  const updateFeedbackSubmissionStatus = useCallback(
    async (submissionId: string, status: FeedbackReportStatus) => {
      setFeedbackStatusUpdatingIds((current) => ({
        ...current,
        [submissionId]: true,
      }));
      setFeedbackSubmitNotice(null);

      try {
        const response = await fetchWorkspace("/api/creator/v2/feedback", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            submissionId,
            status,
          }),
        });
        const result: FeedbackStatusUpdateResponse = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(
            !result.ok
              ? result.errors[0]?.message || "Failed to update report status."
              : "Failed to update report status.",
          );
        }

        setFeedbackHistory((current) =>
          current.map((entry) =>
            entry.id === submissionId
              ? {
                  ...entry,
                  status: result.data.submission.status,
                  statusUpdatedAt: result.data.submission.statusUpdatedAt,
                }
              : entry,
          ),
        );
        setFeedbackSubmitNotice(
          `Report marked ${formatFeedbackStatusLabel(status).toLowerCase()}.`,
        );
      } catch (error) {
        const fallbackMessage =
          error instanceof Error
            ? error.message
            : "Something went wrong while updating the report status.";
        setFeedbackSubmitNotice(fallbackMessage);
      } finally {
        setFeedbackStatusUpdatingIds((current) => {
          const next = { ...current };
          delete next[submissionId];
          return next;
        });
      }
    },
    [fetchWorkspace],
  );

  const appendFeedbackImageFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter((file) => isSupportedFeedbackFile(file));
    if (supportedFiles.length === 0) {
      setFeedbackSubmitNotice("Only PNG, JPG, or MP4 files are supported.");
      return;
    }

    const withinSizeLimitFiles = supportedFiles.filter(
      (file) => file.size <= FEEDBACK_MAX_FILE_SIZE_BYTES,
    );
    if (withinSizeLimitFiles.length === 0) {
      setFeedbackSubmitNotice(
        `Files must be ${Math.round(FEEDBACK_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB or smaller.`,
      );
      return;
    }

    const oversizedCount = supportedFiles.length - withinSizeLimitFiles.length;

    let acceptedCount = 0;
    setFeedbackImages((current) => {
      const availableSlots = Math.max(0, FEEDBACK_MAX_FILES - current.length);
      const nextItems = withinSizeLimitFiles.slice(0, availableSlots).map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      acceptedCount = nextItems.length;
      return [...current, ...nextItems];
    });
    if (acceptedCount === 0) {
      setFeedbackSubmitNotice(`You can upload up to ${FEEDBACK_MAX_FILES} files.`);
      return;
    }

    if (oversizedCount > 0) {
      setFeedbackSubmitNotice(
        `${oversizedCount} file${oversizedCount === 1 ? "" : "s"} skipped for exceeding ${Math.round(
          FEEDBACK_MAX_FILE_SIZE_BYTES / (1024 * 1024),
        )} MB.`,
      );
      return;
    }

    setFeedbackSubmitNotice(null);
  }, []);

  const handleFeedbackImageSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      appendFeedbackImageFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [appendFeedbackImageFiles],
  );

  const handleFeedbackDropZoneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isFeedbackDropActive) {
        setIsFeedbackDropActive(true);
      }
    },
    [isFeedbackDropActive],
  );

  const handleFeedbackDropZoneDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsFeedbackDropActive(false);
    },
    [],
  );

  const handleFeedbackDropZoneDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsFeedbackDropActive(false);
      appendFeedbackImageFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [appendFeedbackImageFiles],
  );

  const removeFeedbackImage = useCallback((imageId: string) => {
    setFeedbackImages((current) => {
      const next = current.filter((image) => image.id !== imageId);
      const removed = current.find((image) => image.id === imageId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
  }, []);

  const submitFeedback = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const message = activeFeedbackDraft.trim();
      if (!message) {
        setFeedbackSubmitNotice("Add details before sending.");
        return;
      }

      setIsFeedbackSubmitting(true);
      setFeedbackSubmitNotice(null);

      try {
        const attachmentPayloads: FeedbackAttachmentPayload[] = await Promise.all(
          feedbackImages.map(async (image) => ({
            id: image.id,
            name: image.file.name,
            mimeType: image.file.type || "application/octet-stream",
            sizeBytes: image.file.size,
            status: "pending_upload",
            signatureHex: await readFeedbackFileSignatureHex(image.file),
            thumbnailDataUrl: await buildFeedbackImageThumbnailDataUrl(image.file),
          })),
        );

        const payload = {
          category: feedbackCategory,
          title: activeFeedbackTitle.trim() || null,
          message,
          fields: extractFeedbackTemplateFields(activeFeedbackDraft),
          context: {
            pagePath: activeThreadId ? `/chat/${activeThreadId}` : "/chat",
            threadId: activeThreadId,
            activeModal: "feedback",
            draftMessageId: activeDraftMessageId,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            userAgent: navigator.userAgent,
            appSurface: "chat",
          },
          attachments: attachmentPayloads,
        };

        const response = await fetchWorkspace("/api/creator/v2/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result: FeedbackSubmitResponse = await response.json();
        if (!response.ok || !result.ok) {
          const fallbackMessage = !result.ok
            ? result.errors[0]?.message
            : "Failed to submit feedback.";
          throw new Error(fallbackMessage || "Failed to submit feedback.");
        }

        setFeedbackSubmitNotice("Feedback submitted. Thanks for helping improve Xpo.");
        resetFeedbackDrafts();
        await loadFeedbackHistory();
      } catch (error) {
        const fallbackMessage =
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting feedback.";
        setFeedbackSubmitNotice(fallbackMessage);
      } finally {
        setIsFeedbackSubmitting(false);
      }
    },
    [
      activeDraftMessageId,
      activeFeedbackDraft,
      activeFeedbackTitle,
      activeThreadId,
      feedbackCategory,
      feedbackImages,
      fetchWorkspace,
      loadFeedbackHistory,
      resetFeedbackDrafts,
    ],
  );

  useEffect(() => {
    feedbackImagesRef.current = feedbackImages;
  }, [feedbackImages]);

  useEffect(() => {
    return () => {
      for (const image of feedbackImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!feedbackModalOpen) {
      return;
    }

    void loadFeedbackHistory();
  }, [feedbackModalOpen, loadFeedbackHistory]);

  return {
    feedbackModalOpen,
    setFeedbackModalOpen: updateFeedbackModalOpen,
    openFeedbackDialog,
    feedbackCategory,
    setFeedbackCategory: updateFeedbackCategory,
    activeFeedbackTitle,
    updateActiveFeedbackTitle,
    activeFeedbackDraft,
    updateActiveFeedbackDraft,
    feedbackEditorRef,
    handleFeedbackEditorKeyDown,
    applyFeedbackMarkdownToken,
    feedbackImages,
    feedbackFileInputRef,
    isFeedbackDropActive,
    handleFeedbackImageSelection,
    handleFeedbackDropZoneDragOver,
    handleFeedbackDropZoneDragLeave,
    handleFeedbackDropZoneDrop,
    removeFeedbackImage,
    feedbackHistory,
    feedbackHistoryFilter,
    setFeedbackHistoryFilter,
    feedbackHistoryQuery,
    setFeedbackHistoryQuery,
    isFeedbackHistoryLoading,
    feedbackStatusUpdatingIds,
    updateFeedbackSubmissionStatus,
    feedbackSubmitNotice,
    isFeedbackSubmitting,
    submitFeedback,
  };
}
