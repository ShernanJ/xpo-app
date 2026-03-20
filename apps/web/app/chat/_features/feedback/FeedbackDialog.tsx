"use client";

import type {
  ChangeEventHandler,
  DragEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import { useId, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Bug,
  ImagePlus,
  Lightbulb,
  MessageSquareText,
  Trash2,
  X,
} from "lucide-react";

import { SplitDialog } from "@/components/ui/split-dialog";
import { mutedMarkdownClassName, renderMarkdownToHtml } from "@/lib/ui/markdown";
import { getChatRenderMode } from "@/lib/ui/chatRenderMode";

import { formatFileSize } from "../source-materials/sourceMaterialsState";
import {
  FEEDBACK_CATEGORY_CONFIG,
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_HISTORY_FILTER_OPTIONS,
  getFeedbackHistoryActivityTimestamp,
  getFeedbackStatusPillClassName,
  normalizeFeedbackStatus,
  formatFeedbackStatusLabel,
  type FeedbackCategory,
  type FeedbackHistoryItem,
  type FeedbackImageDraft,
  type FeedbackReportFilter,
  type FeedbackReportStatus,
  type FeedbackScopeContext,
  type FeedbackSource,
} from "./feedbackState";

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  feedbackCategory: FeedbackCategory;
  onFeedbackCategoryChange: (category: FeedbackCategory) => void;
  feedbackSource: FeedbackSource;
  feedbackScope: FeedbackScopeContext;
  activeFeedbackTitle: string;
  onActiveFeedbackTitleChange: (value: string) => void;
  activeFeedbackDraft: string;
  onActiveFeedbackDraftChange: (value: string) => void;
  onDiscardDraft: () => void;
  feedbackEditorRef: RefObject<HTMLTextAreaElement | null>;
  onFeedbackEditorKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onInsertMarkdownToken: (token: "bold" | "italic" | "bullet" | "link") => void;
  feedbackImages: FeedbackImageDraft[];
  feedbackFileInputRef: RefObject<HTMLInputElement | null>;
  isFeedbackDropActive: boolean;
  onFeedbackImageSelection: ChangeEventHandler<HTMLInputElement>;
  onFeedbackDropZoneDragOver: DragEventHandler<HTMLDivElement>;
  onFeedbackDropZoneDragLeave: DragEventHandler<HTMLDivElement>;
  onFeedbackDropZoneDrop: DragEventHandler<HTMLDivElement>;
  onRemoveFeedbackImage: (imageId: string) => void;
  profileHandle: string;
  avatarUrl: string | null;
  submittingEmail: string;
  activeThreadId: string | null;
  feedbackHistory: FeedbackHistoryItem[];
  feedbackHistoryFilter: FeedbackReportFilter;
  onFeedbackHistoryFilterChange: (filter: FeedbackReportFilter) => void;
  feedbackHistoryQuery: string;
  onFeedbackHistoryQueryChange: (value: string) => void;
  isFeedbackHistoryLoading: boolean;
  feedbackStatusUpdatingIds: Record<string, boolean>;
  onUpdateFeedbackSubmissionStatus: (
    submissionId: string,
    status: FeedbackReportStatus,
  ) => void;
  currentUserId: string | null;
  feedbackSubmitNotice: string | null;
  isFeedbackSubmitting: boolean;
}

export function FeedbackDialog(props: FeedbackDialogProps) {
  const {
    open,
    onOpenChange,
    onSubmit,
    feedbackCategory,
    onFeedbackCategoryChange,
    feedbackSource,
    feedbackScope,
    activeFeedbackTitle,
    onActiveFeedbackTitleChange,
    activeFeedbackDraft,
    onActiveFeedbackDraftChange,
    onDiscardDraft,
    feedbackEditorRef,
    onFeedbackEditorKeyDown,
    onInsertMarkdownToken,
    feedbackImages,
    feedbackFileInputRef,
    isFeedbackDropActive,
    onFeedbackImageSelection,
    onFeedbackDropZoneDragOver,
    onFeedbackDropZoneDragLeave,
    onFeedbackDropZoneDrop,
    onRemoveFeedbackImage,
    profileHandle,
    avatarUrl,
    submittingEmail,
    activeThreadId,
    feedbackHistory,
    feedbackHistoryFilter,
    onFeedbackHistoryFilterChange,
    feedbackHistoryQuery,
    onFeedbackHistoryQueryChange,
    isFeedbackHistoryLoading,
    feedbackStatusUpdatingIds,
    onUpdateFeedbackSubmissionStatus,
    currentUserId,
    feedbackSubmitNotice,
    isFeedbackSubmitting,
  } = props;

  const activeFeedbackConfig = FEEDBACK_CATEGORY_CONFIG[feedbackCategory];
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackFormId = useId();
  const feedbackPreviewHtml = useMemo(
    () =>
      activeFeedbackDraft.trim()
        ? renderMarkdownToHtml(activeFeedbackDraft)
        : "<p>Start typing your feedback…</p>",
    [activeFeedbackDraft],
  );
  const feedbackTrackedContextRows = useMemo(
    () => [
      `profile: @${profileHandle || "unknown"}`,
      `thread: ${activeThreadId ?? "new chat"}`,
      `source: ${feedbackSource === "message_report" ? "message report" : "global feedback"}`,
      "surface: chat",
      `route: ${activeThreadId ? `/chat/${activeThreadId}` : "/chat"}`,
    ],
    [activeThreadId, feedbackSource, profileHandle],
  );
  const sortedFeedbackHistory = useMemo(
    () =>
      [...feedbackHistory].sort(
        (left, right) =>
          getFeedbackHistoryActivityTimestamp(right) -
          getFeedbackHistoryActivityTimestamp(left),
      ),
    [feedbackHistory],
  );
  const feedbackHistoryCounts = useMemo(
    () =>
      sortedFeedbackHistory.reduce(
        (acc, entry) => {
          const normalizedStatus = normalizeFeedbackStatus(entry.status);
          acc.all += 1;
          acc[normalizedStatus] += 1;
          return acc;
        },
        {
          all: 0,
          open: 0,
          resolved: 0,
          cancelled: 0,
        } as Record<FeedbackReportFilter, number>,
      ),
    [sortedFeedbackHistory],
  );
  const filteredFeedbackHistory = useMemo(() => {
    const normalizedQuery = feedbackHistoryQuery.trim().toLowerCase();
    return sortedFeedbackHistory.filter((entry) => {
      const statusMatches =
        feedbackHistoryFilter === "all" ||
        normalizeFeedbackStatus(entry.status) === feedbackHistoryFilter;
      if (!statusMatches) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const title = entry.title?.toLowerCase() ?? "";
      const message = entry.message.toLowerCase();
      const attachmentNames = entry.attachments
        .map((attachment) => attachment.name.toLowerCase())
        .join(" ");
      return (
        title.includes(normalizedQuery) ||
        message.includes(normalizedQuery) ||
        attachmentNames.includes(normalizedQuery)
      );
    });
  }, [feedbackHistoryFilter, feedbackHistoryQuery, sortedFeedbackHistory]);
  const feedbackOpenWithMediaCount = useMemo(
    () =>
      feedbackHistory.filter(
        (entry) =>
          normalizeFeedbackStatus(entry.status) === "open" &&
          entry.attachments.length > 0,
      ).length,
    [feedbackHistory],
  );
  const feedbackDescription =
    feedbackSource === "message_report"
      ? "We prefilled the surrounding thread context for this response. Your draft stays intact if you close the modal and come back."
      : "Choose a category, keep your message in the template, and submit. Switching tabs keeps your draft intact.";

  if (!open) {
    return null;
  }

  const headerSlot = (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Feedback
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Help us improve Xpo</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
            {feedbackDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDiscardDraft}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
          >
            Discard draft
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Close feedback"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const leftPane = (
    <form
      id={feedbackFormId}
      onSubmit={onSubmit}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="space-y-5 pb-6">
          {feedbackSource === "message_report" ? (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/80">
                Reporting this response
              </p>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Your prompt
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    {feedbackScope.precedingUserExcerpt || "No earlier user prompt was captured."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Assistant response
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    {feedbackScope.assistantExcerpt || "No assistant excerpt was captured."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Message type
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FEEDBACK_CATEGORY_ORDER.map((category) => {
                const Icon =
                  category === "feature_request"
                    ? Lightbulb
                    : category === "bug_report"
                      ? Bug
                      : MessageSquareText;
                const isActive = feedbackCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => onFeedbackCategoryChange(category)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? "bg-white text-black"
                        : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{FEEDBACK_CATEGORY_CONFIG[category].label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-zinc-500">{activeFeedbackConfig.helper}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Submit your message</p>
                <p className="mt-1 text-xs text-zinc-500">Markdown compatible.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onInsertMarkdownToken("bold")}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  aria-label="Insert bold markdown"
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => onInsertMarkdownToken("italic")}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] italic text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  aria-label="Insert italic markdown"
                  title="Italic"
                >
                  i
                </button>
                <button
                  type="button"
                  onClick={() => onInsertMarkdownToken("bullet")}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  aria-label="Insert bullet markdown"
                  title="Bullet list"
                >
                  •
                </button>
                <button
                  type="button"
                  onClick={() => onInsertMarkdownToken("link")}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
                  aria-label="Insert link markdown"
                  title="Link"
                >
                  🔗
                </button>
              </div>
            </div>
            <input
              type="text"
              value={activeFeedbackTitle}
              onChange={(event) => onActiveFeedbackTitleChange(event.target.value)}
              placeholder={`${activeFeedbackConfig.label} title`}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/20"
            />
            <textarea
              ref={feedbackEditorRef}
              value={activeFeedbackDraft}
              onKeyDown={onFeedbackEditorKeyDown}
              onChange={(event) => onActiveFeedbackDraftChange(event.target.value)}
              placeholder={activeFeedbackConfig.template}
              className="mt-3 min-h-[14rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-white/20"
            />
            <p className="mt-2 text-[11px] text-zinc-500">
              {activeFeedbackDraft.trim().length} chars
            </p>

            <div
              className={`mt-3 rounded-2xl border border-dashed p-4 transition ${
                isFeedbackDropActive
                  ? "border-white/25 bg-white/[0.06]"
                  : "border-white/10 bg-black/30"
              }`}
              onClick={() => feedbackFileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  feedbackFileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              onDragOver={onFeedbackDropZoneDragOver}
              onDragLeave={onFeedbackDropZoneDragLeave}
              onDrop={onFeedbackDropZoneDrop}
            >
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <ImagePlus className="h-4 w-4 text-zinc-400" />
                <p className="text-xs text-zinc-300">
                  Drag and drop files here, or click to upload
                </p>
                <p className="text-xs text-zinc-500">Supported files: PNG / JPG / MP4</p>
                <input
                  id="feedback-image-upload"
                  ref={feedbackFileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.mp4,image/png,image/jpeg,video/mp4"
                  multiple
                  onChange={onFeedbackImageSelection}
                  className="hidden"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Draft text auto-saves. After a full page refresh, you&apos;ll need to reattach files.
            </p>

            {feedbackImages.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {feedbackImages.map((image) => (
                  <div
                    key={image.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {image.file.type.toLowerCase() === "video/mp4" ? (
                        <video
                          src={image.previewUrl}
                          className="h-14 w-14 rounded-xl object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <Image
                          src={image.previewUrl}
                          alt={image.file.name}
                          width={56}
                          height={56}
                          unoptimized
                          className="h-14 w-14 rounded-xl object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveFeedbackImage(image.id)}
                        className="rounded-full border border-white/10 p-1 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                        aria-label={`Remove ${image.file.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-zinc-300">{image.file.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {formatFileSize(image.file.size)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="space-y-5 pb-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Live preview
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="text-zinc-300">
                Submitting as <span className="font-semibold text-white">{submittingEmail}</span>
              </span>
              <span>•</span>
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[10px] font-bold uppercase text-white">
                {avatarUrl ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatarUrl})` }}
                    role="img"
                    aria-label={`${profileHandle} profile photo`}
                  />
                ) : (
                  profileHandle.charAt(0)
                )}
              </div>
              <span>@{profileHandle}</span>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              {activeFeedbackTitle.trim() ? (
                <p className="text-xl font-semibold leading-8 text-white">
                  {activeFeedbackTitle.trim()}
                </p>
              ) : null}
              {getChatRenderMode("feedback_preview") === "markdown" ? (
                <div
                  className={`mt-3 h-[20rem] overflow-y-auto pr-1 ${mutedMarkdownClassName} md:h-[24rem]`}
                  dangerouslySetInnerHTML={{ __html: feedbackPreviewHtml }}
                />
              ) : (
                <p className="mt-3 h-[20rem] overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-6 text-zinc-200 md:h-[24rem]">
                  {activeFeedbackDraft}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              {activeFeedbackConfig.exampleTitle}
            </p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="whitespace-pre-line text-sm leading-6 text-zinc-200">
                {activeFeedbackConfig.exampleBody}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Auto-tracked context
            </p>
            <ul className="mt-3 space-y-2 text-xs text-zinc-400">
              {feedbackTrackedContextRows.map((row) => (
                <li key={row}>• {row}</li>
              ))}
              {feedbackScope.reportedMessageId ? (
                <li>• reported message: {feedbackScope.reportedMessageId}</li>
              ) : null}
              <li>• timestamp: captured server-side on submit</li>
              <li>• account + user identity: attached server-side</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Submitted reports
              </p>
              {isFeedbackHistoryLoading ? (
                <span className="text-xs text-zinc-500">Loading…</span>
              ) : null}
            </div>
            {feedbackHistory.length > 0 ? (
              <div className="mt-3">
                <input
                  type="text"
                  value={feedbackHistoryQuery}
                  onChange={(event) => onFeedbackHistoryQueryChange(event.target.value)}
                  placeholder="Search reports by title, message, or attachment"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/25"
                />
              </div>
            ) : null}
            {feedbackHistory.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {FEEDBACK_HISTORY_FILTER_OPTIONS.map((option) => {
                  const isActive = feedbackHistoryFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onFeedbackHistoryFilterChange(option.value)}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                        isActive
                          ? "border-white/40 bg-white/[0.12] text-white"
                          : "border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      {option.label} ({feedbackHistoryCounts[option.value]})
                    </button>
                  );
                })}
              </div>
            ) : null}

            {filteredFeedbackHistory.length > 0 ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {filteredFeedbackHistory.map((entry) => (
                  <article
                    key={entry.id}
                    className="h-full rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                        {FEEDBACK_CATEGORY_CONFIG[entry.category].label}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getFeedbackStatusPillClassName(
                          normalizeFeedbackStatus(entry.status),
                        )}`}
                      >
                        {formatFeedbackStatusLabel(normalizeFeedbackStatus(entry.status))}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-white">
                      {entry.title?.trim() || "Untitled report"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                      {entry.message}
                    </p>
                    {entry.attachments.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-[11px] text-zinc-500">
                          {entry.attachments.length} file
                          {entry.attachments.length === 1 ? "" : "s"} attached
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {entry.attachments.slice(0, 3).map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2"
                              title={`${attachment.name} • ${formatFileSize(attachment.sizeBytes)}`}
                            >
                              {attachment.thumbnailDataUrl &&
                              attachment.mimeType.startsWith("image/") ? (
                                <Image
                                  src={attachment.thumbnailDataUrl}
                                  alt={attachment.name}
                                  width={36}
                                  height={36}
                                  unoptimized
                                  className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-[10px] text-zinc-400">
                                  {attachment.mimeType === "video/mp4" ? "MP4" : "FILE"}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-[11px] text-zinc-300">
                                  {attachment.name}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                  {formatFileSize(attachment.sizeBytes)}
                                </p>
                              </div>
                            </div>
                          ))}
                          {entry.attachments.length > 3 ? (
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500">
                              +{entry.attachments.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {entry.statusUpdatedAt ? (
                      <p className="mt-2 text-[11px] text-zinc-500">
                        status updated{" "}
                        {entry.statusUpdatedByUserId && entry.statusUpdatedByUserId === currentUserId
                          ? "by you"
                          : "by account owner"}{" "}
                        on {new Date(entry.statusUpdatedAt).toLocaleString()}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {normalizeFeedbackStatus(entry.status) === "open" ? (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                            onClick={() =>
                              onUpdateFeedbackSubmissionStatus(entry.id, "resolved")
                            }
                            className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {feedbackStatusUpdatingIds[entry.id]
                              ? "Updating"
                              : "Mark resolved"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                            onClick={() =>
                              onUpdateFeedbackSubmissionStatus(entry.id, "cancelled")
                            }
                            className="rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {feedbackStatusUpdatingIds[entry.id]
                              ? "Updating"
                              : "Mark cancelled"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(feedbackStatusUpdatingIds[entry.id])}
                          onClick={() => onUpdateFeedbackSubmissionStatus(entry.id, "open")}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {feedbackStatusUpdatingIds[entry.id] ? "Updating" : "Reopen"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : feedbackHistory.length > 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No reports match this filter.</p>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                No feedback submitted yet for this profile.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const footerSlot = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2 sm:px-3">
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">
          {feedbackSubmitNotice ??
            "submissions are tracked per profile to improve product quality."}
        </p>
        <p className="text-[11px] text-zinc-500">
          Open reports: {feedbackHistoryCounts.open} • Open with media: {feedbackOpenWithMediaCount}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onDiscardDraft}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
        >
          Discard draft
        </button>
        <button
          type="submit"
          form={feedbackFormId}
          disabled={isFeedbackSubmitting || activeFeedbackDraft.trim().length === 0}
          className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {isFeedbackSubmitting ? "Submitting" : "Submit feedback"}
        </button>
      </div>
    </div>
  );

  return (
    <SplitDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Help us improve Xpo"
      description={feedbackDescription}
      headerSlot={headerSlot}
      footerSlot={footerSlot}
      mobilePane="left"
      stackOnMobile
      initialFocusRef={closeButtonRef}
      panelClassName="fixed inset-x-2 bottom-2 top-2 flex flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0B0B0B] shadow-[0_32px_120px_rgba(0,0,0,0.58)] focus:outline-none sm:inset-x-4 sm:bottom-4 sm:top-4 sm:rounded-[1.75rem] md:inset-x-auto md:bottom-4 md:left-1/2 md:top-4 md:w-[calc(100dvw-32px)] md:max-w-[1480px] md:-translate-x-1/2 md:translate-y-0 lg:w-5/6"
      leftPane={leftPane}
      rightPane={rightPane}
    />
  );
}
