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

import type { ChatMessage } from "../chat-page/chatPageTypes";
import {
  DEFAULT_SCOPED_FEEDBACK_CATEGORY,
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_MAX_FILE_SIZE_BYTES,
  FEEDBACK_MAX_FILES,
  buildFeedbackDraftsForSource,
  buildFeedbackImageThumbnailDataUrl,
  buildFeedbackTitlesForSource,
  createDefaultFeedbackScopeContext,
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
  type FeedbackScopeContext,
  type FeedbackSource,
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

interface StoredFeedbackCategoryDraft {
  title: string;
  draft: string;
}

interface StoredFeedbackDraftUiState {
  selectedCategory: FeedbackCategory;
}

const FEEDBACK_DRAFT_STORAGE_PREFIX = "xpo:feedback-draft:v1";
const FEEDBACK_TRANSCRIPT_WINDOW_SIZE = 6;
const FEEDBACK_TRANSCRIPT_EXCERPT_CHAR_LIMIT = 1200;

interface UseFeedbackStateOptions {
  activeThreadId: string | null;
  activeDraftMessageId: string | null;
  profileHandle: string | null;
  messages: ChatMessage[];
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function sanitizeStorageKeyPart(value: string | null | undefined): string {
  return encodeURIComponent((value?.trim().toLowerCase() || "unknown").slice(0, 120));
}

function buildFeedbackDraftStorageBaseKey(args: {
  profileHandle: string | null;
  threadId: string | null;
  source: FeedbackSource;
  reportedMessageId: string | null;
}): string {
  return [
    FEEDBACK_DRAFT_STORAGE_PREFIX,
    sanitizeStorageKeyPart(args.profileHandle),
    sanitizeStorageKeyPart(args.threadId ?? "new-chat"),
    sanitizeStorageKeyPart(args.source),
    sanitizeStorageKeyPart(args.reportedMessageId ?? "global"),
  ].join(":");
}

function buildFeedbackCategoryStorageKey(baseKey: string, category: FeedbackCategory): string {
  return `${baseKey}:category:${category}`;
}

function buildFeedbackUiStorageKey(baseKey: string): string {
  return `${baseKey}:ui`;
}

function buildFeedbackScopeStorageKey(baseKey: string): string {
  return `${baseKey}:scope`;
}

function parseStoredFeedbackCategoryDraft(
  rawValue: string | null,
): StoredFeedbackCategoryDraft | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredFeedbackCategoryDraft>;
    if (typeof parsed.title !== "string" || typeof parsed.draft !== "string") {
      return null;
    }

    return {
      title: parsed.title,
      draft: parsed.draft,
    };
  } catch {
    return null;
  }
}

function parseStoredFeedbackUiState(rawValue: string | null): StoredFeedbackDraftUiState | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredFeedbackDraftUiState>;
    if (!parsed?.selectedCategory || !FEEDBACK_CATEGORY_ORDER.includes(parsed.selectedCategory)) {
      return null;
    }

    return {
      selectedCategory: parsed.selectedCategory,
    };
  } catch {
    return null;
  }
}

function parseStoredFeedbackScope(rawValue: string | null): FeedbackScopeContext | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<FeedbackScopeContext>;
    const transcriptExcerpt = Array.isArray(parsed.transcriptExcerpt)
      ? parsed.transcriptExcerpt.filter(
          (entry): entry is NonNullable<FeedbackScopeContext["transcriptExcerpt"]>[number] =>
            Boolean(
              entry &&
                typeof entry.messageId === "string" &&
                typeof entry.role === "string" &&
                (entry.role === "assistant" || entry.role === "user") &&
                typeof entry.excerpt === "string",
            ),
        )
      : [];
    if (
      parsed.source !== "global_feedback" &&
      parsed.source !== "message_report"
    ) {
      return null;
    }

    return {
      source: parsed.source,
      reportedMessageId:
        typeof parsed.reportedMessageId === "string" ? parsed.reportedMessageId : null,
      assistantExcerpt:
        typeof parsed.assistantExcerpt === "string" ? parsed.assistantExcerpt : null,
      precedingUserExcerpt:
        typeof parsed.precedingUserExcerpt === "string" ? parsed.precedingUserExcerpt : null,
      transcriptExcerpt,
    };
  } catch {
    return null;
  }
}

function buildFeedbackExcerpt(
  value: string,
  maxLength = FEEDBACK_TRANSCRIPT_EXCERPT_CHAR_LIMIT,
): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildScopedFeedbackContext(
  messages: ChatMessage[],
  messageId: string,
): FeedbackScopeContext | null {
  const targetIndex = messages.findIndex((message) => message.id === messageId);
  if (targetIndex < 0) {
    return null;
  }

  const targetMessage = messages[targetIndex];
  if (targetMessage.role !== "assistant" || !targetMessage.content.trim()) {
    return null;
  }

  const precedingUserMessage = [...messages.slice(0, targetIndex)]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim().length > 0);
  const transcriptExcerpt = messages
    .slice(0, targetIndex + 1)
    .filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        message.content.trim().length > 0,
    )
    .slice(-FEEDBACK_TRANSCRIPT_WINDOW_SIZE)
    .map((message) => ({
      messageId: message.id,
      role: message.role,
      excerpt: buildFeedbackExcerpt(message.content),
    }));

  return {
    source: "message_report",
    reportedMessageId: targetMessage.id,
    assistantExcerpt: buildFeedbackExcerpt(targetMessage.content),
    precedingUserExcerpt: precedingUserMessage
      ? buildFeedbackExcerpt(precedingUserMessage.content)
      : null,
    transcriptExcerpt,
  };
}

function loadDraftStateFromStorage(args: {
  baseKey: string;
  source: FeedbackSource;
  defaultCategory: FeedbackCategory;
  fallbackScope: FeedbackScopeContext;
}): {
  selectedCategory: FeedbackCategory;
  titlesByCategory: Record<FeedbackCategory, string>;
  draftsByCategory: Record<FeedbackCategory, string>;
  scope: FeedbackScopeContext;
} {
  const titlesByCategory = buildFeedbackTitlesForSource(args.source);
  const draftsByCategory = buildFeedbackDraftsForSource(args.source);

  if (typeof window === "undefined") {
    return {
      selectedCategory: args.defaultCategory,
      titlesByCategory,
      draftsByCategory,
      scope: args.fallbackScope,
    };
  }

  for (const category of FEEDBACK_CATEGORY_ORDER) {
    const stored = parseStoredFeedbackCategoryDraft(
      window.localStorage.getItem(buildFeedbackCategoryStorageKey(args.baseKey, category)),
    );
    if (!stored) {
      continue;
    }

    titlesByCategory[category] = stored.title;
    draftsByCategory[category] = stored.draft;
  }

  const storedUiState = parseStoredFeedbackUiState(
    window.localStorage.getItem(buildFeedbackUiStorageKey(args.baseKey)),
  );
  const storedScope = parseStoredFeedbackScope(
    window.localStorage.getItem(buildFeedbackScopeStorageKey(args.baseKey)),
  );

  return {
    selectedCategory: storedUiState?.selectedCategory ?? args.defaultCategory,
    titlesByCategory,
    draftsByCategory,
    scope:
      storedScope && storedScope.source === args.source ? storedScope : args.fallbackScope,
  };
}

function clearPersistedDraftState(baseKey: string | null) {
  if (!baseKey || typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(buildFeedbackUiStorageKey(baseKey));
  window.localStorage.removeItem(buildFeedbackScopeStorageKey(baseKey));
  for (const category of FEEDBACK_CATEGORY_ORDER) {
    window.localStorage.removeItem(buildFeedbackCategoryStorageKey(baseKey, category));
  }
}

function revokeFeedbackImageDrafts(images: FeedbackImageDraft[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export function useFeedbackState(options: UseFeedbackStateOptions) {
  const { activeThreadId, activeDraftMessageId, profileHandle, messages, fetchWorkspace } =
    options;

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>("feedback");
  const [feedbackSource, setFeedbackSource] =
    useState<FeedbackSource>("global_feedback");
  const [feedbackScope, setFeedbackScope] = useState<FeedbackScopeContext>(() =>
    createDefaultFeedbackScopeContext(),
  );
  const [feedbackTitlesByCategory, setFeedbackTitlesByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildFeedbackTitlesForSource("global_feedback"));
  const [feedbackDraftsByCategory, setFeedbackDraftsByCategory] = useState<
    Record<FeedbackCategory, string>
  >(() => buildFeedbackDraftsForSource("global_feedback"));
  const [feedbackImages, setFeedbackImages] = useState<FeedbackImageDraft[]>([]);
  const [activeFeedbackDraftStorageBaseKey, setActiveFeedbackDraftStorageBaseKey] =
    useState<string | null>(null);
  const [feedbackPersistenceEnabled, setFeedbackPersistenceEnabled] = useState(false);
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
  const feedbackScopeRef = useRef(feedbackScope);
  const activeFeedbackDraftStorageBaseKeyRef = useRef(activeFeedbackDraftStorageBaseKey);
  const feedbackImagesCacheRef = useRef<Record<string, FeedbackImageDraft[]>>({});
  const feedbackImageCleanupListRef = useRef<FeedbackImageDraft[]>([]);

  const activeFeedbackTitle = feedbackTitlesByCategory[feedbackCategory] ?? "";
  const activeFeedbackDraft = feedbackDraftsByCategory[feedbackCategory] ?? "";

  const persistCurrentFeedbackDraft = useCallback(
    (enabled: boolean) => {
      setFeedbackPersistenceEnabled(enabled);
    },
    [],
  );

  const syncFeedbackImageCleanupList = useCallback(() => {
    const uniqueImages = new Map<string, FeedbackImageDraft>();
    for (const draftImages of Object.values(feedbackImagesCacheRef.current)) {
      for (const image of draftImages) {
        uniqueImages.set(image.id, image);
      }
    }
    for (const image of feedbackImagesRef.current) {
      uniqueImages.set(image.id, image);
    }
    feedbackImageCleanupListRef.current = [...uniqueImages.values()];
  }, []);

  const stashCurrentFeedbackImages = useCallback(() => {
    const currentBaseKey = activeFeedbackDraftStorageBaseKeyRef.current;
    if (!currentBaseKey) {
      return;
    }

    feedbackImagesCacheRef.current[currentBaseKey] = feedbackImagesRef.current;
    syncFeedbackImageCleanupList();
  }, [syncFeedbackImageCleanupList]);

  const clearCachedFeedbackImagesForKey = useCallback((baseKey: string | null) => {
    if (!baseKey) {
      return;
    }

    const cachedImages = feedbackImagesCacheRef.current[baseKey];
    if (cachedImages?.length) {
      revokeFeedbackImageDrafts(cachedImages);
    }
    delete feedbackImagesCacheRef.current[baseKey];
    syncFeedbackImageCleanupList();
  }, [syncFeedbackImageCleanupList]);

  const hydrateFeedbackDraftSession = useCallback(
    (args: {
      source: FeedbackSource;
      defaultCategory: FeedbackCategory;
      scope: FeedbackScopeContext;
      baseKey: string;
    }) => {
      stashCurrentFeedbackImages();
      const hydrated = loadDraftStateFromStorage({
        baseKey: args.baseKey,
        source: args.source,
        defaultCategory: args.defaultCategory,
        fallbackScope: args.scope,
      });

      setFeedbackSource(args.source);
      setFeedbackScope(hydrated.scope);
      setFeedbackCategory(hydrated.selectedCategory);
      setFeedbackTitlesByCategory(hydrated.titlesByCategory);
      setFeedbackDraftsByCategory(hydrated.draftsByCategory);
      setActiveFeedbackDraftStorageBaseKey(args.baseKey);
      setFeedbackImages(feedbackImagesCacheRef.current[args.baseKey] ?? []);
      setFeedbackSubmitNotice(null);
      setFeedbackPersistenceEnabled(true);
      setFeedbackModalOpen(true);
    },
    [stashCurrentFeedbackImages],
  );

  const openFeedbackDialog = useCallback(() => {
    const scope = createDefaultFeedbackScopeContext();
    const baseKey = buildFeedbackDraftStorageBaseKey({
      profileHandle,
      threadId: activeThreadId,
      source: "global_feedback",
      reportedMessageId: null,
    });
    hydrateFeedbackDraftSession({
      source: "global_feedback",
      defaultCategory: "feedback",
      scope,
      baseKey,
    });
  }, [activeThreadId, hydrateFeedbackDraftSession, profileHandle]);

  const openScopedFeedbackDialog = useCallback(
    (messageId: string) => {
      const scope = buildScopedFeedbackContext(messages, messageId);
      if (!scope) {
        return;
      }

      const targetMessage = messages.find((message) => message.id === messageId) ?? null;
      const baseKey = buildFeedbackDraftStorageBaseKey({
        profileHandle,
        threadId: targetMessage?.threadId ?? activeThreadId,
        source: "message_report",
        reportedMessageId: messageId,
      });
      hydrateFeedbackDraftSession({
        source: "message_report",
        defaultCategory: DEFAULT_SCOPED_FEEDBACK_CATEGORY,
        scope,
        baseKey,
      });
    },
    [activeThreadId, hydrateFeedbackDraftSession, messages, profileHandle],
  );

  const updateFeedbackModalOpen = useCallback((open: boolean) => {
    if (!open) {
      stashCurrentFeedbackImages();
    }
    setFeedbackModalOpen(open);
  }, [stashCurrentFeedbackImages]);

  const updateFeedbackCategory = useCallback((category: FeedbackCategory) => {
    setFeedbackCategory(category);
    setFeedbackSubmitNotice(null);
    persistCurrentFeedbackDraft(true);
  }, [persistCurrentFeedbackDraft]);

  const updateActiveFeedbackTitle = useCallback(
    (value: string) => {
      persistCurrentFeedbackDraft(true);
      setFeedbackTitlesByCategory((current) => ({
        ...current,
        [feedbackCategory]: value,
      }));
      setFeedbackSubmitNotice(null);
    },
    [feedbackCategory, persistCurrentFeedbackDraft],
  );

  const updateActiveFeedbackDraft = useCallback(
    (value: string) => {
      persistCurrentFeedbackDraft(true);
      setFeedbackDraftsByCategory((current) => ({
        ...current,
        [feedbackCategory]: value,
      }));
      setFeedbackSubmitNotice(null);
    },
    [feedbackCategory, persistCurrentFeedbackDraft],
  );

  const discardFeedbackDraft = useCallback(() => {
    clearPersistedDraftState(activeFeedbackDraftStorageBaseKeyRef.current);
    clearCachedFeedbackImagesForKey(activeFeedbackDraftStorageBaseKeyRef.current);
    setFeedbackImages([]);
    setFeedbackTitlesByCategory(buildFeedbackTitlesForSource(feedbackSource));
    setFeedbackDraftsByCategory(buildFeedbackDraftsForSource(feedbackSource));
    setFeedbackCategory(
      feedbackSource === "message_report"
        ? DEFAULT_SCOPED_FEEDBACK_CATEGORY
        : "feedback",
    );
    if (feedbackSource === "global_feedback") {
      setFeedbackScope(createDefaultFeedbackScopeContext());
    }
    setFeedbackSubmitNotice("Draft cleared.");
    setFeedbackPersistenceEnabled(false);
    setIsFeedbackDropActive(false);
  }, [clearCachedFeedbackImagesForKey, feedbackSource]);

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

      persistCurrentFeedbackDraft(true);
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
    [feedbackCategory, feedbackDraftsByCategory, persistCurrentFeedbackDraft],
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
    persistCurrentFeedbackDraft(true);
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
  }, [persistCurrentFeedbackDraft]);

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
            source: feedbackScopeRef.current.source,
            reportedMessageId: feedbackScopeRef.current.reportedMessageId,
            assistantExcerpt: feedbackScopeRef.current.assistantExcerpt,
            precedingUserExcerpt: feedbackScopeRef.current.precedingUserExcerpt,
            transcriptExcerpt: feedbackScopeRef.current.transcriptExcerpt,
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

        clearPersistedDraftState(activeFeedbackDraftStorageBaseKeyRef.current);
        clearCachedFeedbackImagesForKey(activeFeedbackDraftStorageBaseKeyRef.current);
        setFeedbackImages([]);
        setFeedbackTitlesByCategory(buildFeedbackTitlesForSource(feedbackScopeRef.current.source));
        setFeedbackDraftsByCategory(buildFeedbackDraftsForSource(feedbackScopeRef.current.source));
        setFeedbackCategory(
          feedbackScopeRef.current.source === "message_report"
            ? DEFAULT_SCOPED_FEEDBACK_CATEGORY
            : "feedback",
        );
        setFeedbackSubmitNotice("Feedback submitted. Thanks for helping improve Xpo.");
        setFeedbackPersistenceEnabled(false);
        setIsFeedbackDropActive(false);
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
      clearCachedFeedbackImagesForKey,
      feedbackCategory,
      feedbackImages,
      fetchWorkspace,
      loadFeedbackHistory,
    ],
  );

  useEffect(() => {
    feedbackImagesRef.current = feedbackImages;
    syncFeedbackImageCleanupList();
  }, [feedbackImages, syncFeedbackImageCleanupList]);

  useEffect(() => {
    feedbackScopeRef.current = feedbackScope;
  }, [feedbackScope]);

  useEffect(() => {
    activeFeedbackDraftStorageBaseKeyRef.current = activeFeedbackDraftStorageBaseKey;
  }, [activeFeedbackDraftStorageBaseKey]);

  useEffect(() => {
    if (
      !feedbackPersistenceEnabled ||
      !activeFeedbackDraftStorageBaseKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    window.localStorage.setItem(
      buildFeedbackUiStorageKey(activeFeedbackDraftStorageBaseKey),
      JSON.stringify({
        selectedCategory: feedbackCategory,
      } satisfies StoredFeedbackDraftUiState),
    );
    window.localStorage.setItem(
      buildFeedbackScopeStorageKey(activeFeedbackDraftStorageBaseKey),
      JSON.stringify(feedbackScope),
    );
    for (const category of FEEDBACK_CATEGORY_ORDER) {
      window.localStorage.setItem(
        buildFeedbackCategoryStorageKey(activeFeedbackDraftStorageBaseKey, category),
        JSON.stringify({
          title: feedbackTitlesByCategory[category] ?? "",
          draft: feedbackDraftsByCategory[category] ?? "",
        } satisfies StoredFeedbackCategoryDraft),
      );
    }
  }, [
    activeFeedbackDraftStorageBaseKey,
    feedbackCategory,
    feedbackDraftsByCategory,
    feedbackPersistenceEnabled,
    feedbackScope,
    feedbackTitlesByCategory,
  ]);

  useEffect(() => {
    const getFeedbackImageCleanupList = () => feedbackImageCleanupListRef.current;
    return () => {
      revokeFeedbackImageDrafts(getFeedbackImageCleanupList());
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
    openScopedFeedbackDialog,
    feedbackCategory,
    setFeedbackCategory: updateFeedbackCategory,
    feedbackSource,
    feedbackScope,
    activeFeedbackTitle,
    updateActiveFeedbackTitle,
    activeFeedbackDraft,
    updateActiveFeedbackDraft,
    discardFeedbackDraft,
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
