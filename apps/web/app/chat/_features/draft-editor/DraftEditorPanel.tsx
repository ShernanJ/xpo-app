"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";

import {
  computeXWeightedCharacterCount,
  getXCharacterLimitForAccount,
  type DraftArtifactDetails,
  type ThreadFramingStyle,
} from "@/lib/onboarding/draftArtifacts";

import {
  ensureEditableThreadPosts,
} from "./chatDraftEditorState";
import {
  getThreadPostCharacterLimit,
} from "./chatDraftPersistenceState";
import {
  resolveDisplayedDraftCharacterLimit,
} from "./chatDraftPreviewState";
import { ChatMediaAttachments } from "../shared/ChatMediaAttachments";

export interface DraftEditorPanelProps {
  layout: "desktop" | "mobile";
  editorMode?: "default" | "reply";
  identity: {
    avatarUrl: string | null;
    displayName: string;
    username: string;
    profilePhotoLabel: string;
    initials: string;
  };
  isVerifiedAccount: boolean;
  timelinePosition: number;
  timelineLength: number;
  canNavigateDraftBack: boolean;
  canNavigateDraftForward: boolean;
  onNavigateTimeline: (direction: "back" | "forward") => void;
  onClose: () => void;
  primaryActionLabel: string;
  isPrimaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  isSelectedDraftThread: boolean;
  selectedDraftArtifact: DraftArtifactDetails | null;
  selectedDraftThreadFramingStyle: ThreadFramingStyle | null;
  onChangeThreadFraming: (style: ThreadFramingStyle) => void;
  isMainChatLocked: boolean;
  isViewingHistoricalDraftVersion: boolean;
  editorDraftPosts: string[];
  selectedDraftThreadPostIndex: number;
  selectedDraftMessageId: string | null;
  onSelectThreadPost: (index: number) => void;
  onUpdateThreadDraftPost: (index: number, content: string) => void;
  onMoveThreadDraftPost: (index: number, direction: "up" | "down") => void;
  onSplitThreadDraftPost: (index: number) => void;
  onMergeThreadDraftPostDown: (index: number) => void;
  onAddThreadDraftPost: (index?: number) => void;
  onRemoveThreadDraftPost: (index: number) => void;
  draftEditorSerializedContent: string;
  composerCharacterLimit: number;
  selectedDraftMaxCharacterLimit: number;
  editorDraftText: string;
  onChangeEditorDraftText: (value: string) => void;
  draftInspectorActionLabel: string;
  isDraftInspectorLoading: boolean;
  onRunDraftInspector: () => void;
  hasCopiedDraftEditorText: boolean;
  onCopyDraftEditor: () => void;
  shareActionLabel?: string;
  onShareDraftEditor: () => void;
}

export function DraftEditorPanel(props: DraftEditorPanelProps) {
  const {
    layout,
    editorMode = "default",
    identity,
    isVerifiedAccount,
    timelinePosition,
    timelineLength,
    canNavigateDraftBack,
    canNavigateDraftForward,
    onNavigateTimeline,
    onClose,
    primaryActionLabel,
    isPrimaryActionDisabled,
    onPrimaryAction,
    isSelectedDraftThread,
    selectedDraftArtifact,
    isMainChatLocked,
    isViewingHistoricalDraftVersion,
    editorDraftPosts,
    selectedDraftThreadPostIndex,
    selectedDraftMessageId,
    onSelectThreadPost,
    onUpdateThreadDraftPost,
    onAddThreadDraftPost,
    onRemoveThreadDraftPost,
    draftEditorSerializedContent,
    composerCharacterLimit,
    selectedDraftMaxCharacterLimit,
    editorDraftText,
    onChangeEditorDraftText,
    draftInspectorActionLabel,
    isDraftInspectorLoading,
    onRunDraftInspector,
    hasCopiedDraftEditorText,
    onCopyDraftEditor,
    shareActionLabel = "Share",
    onShareDraftEditor,
  } = props;

  const isMobile = layout === "mobile";
  const panelPaddingClassName = isMobile ? "px-4 pb-4" : "px-5 pb-5";
  const panelHeaderPaddingClassName = isMobile ? "px-4 pb-3 pt-4" : "px-5 pb-3 pt-5";
  const panelFooterPaddingClassName = isMobile ? "px-4 py-4" : "px-5 py-4";
  const avatarSizeClassName = isMobile ? "h-10 w-10 text-sm" : "h-11 w-11 text-sm";
  const displayNameClassName = isMobile ? "text-sm" : "text-[15px]";
  const usernameClassName = isMobile ? "text-[11px]" : "text-xs";
  const bodyTextClassName = isMobile ? "text-[15px] leading-7" : "text-[16px] leading-8";
  const threadPosts = isSelectedDraftThread ? ensureEditableThreadPosts(editorDraftPosts) : [];
  const selectedThreadPost = isSelectedDraftThread
    ? threadPosts[selectedDraftThreadPostIndex] ?? ""
    : "";
  const threadPostCharacterLimit = getThreadPostCharacterLimit(
    selectedDraftArtifact,
    getXCharacterLimitForAccount(isVerifiedAccount),
  );
  const selectedThreadPostWeightedCount = computeXWeightedCharacterCount(selectedThreadPost);
  const isSelectedThreadPostOverLimit =
    selectedThreadPostWeightedCount > threadPostCharacterLimit;
  const serializedThreadContent = isSelectedDraftThread
    ? draftEditorSerializedContent
    : editorDraftText;
  const footerCounterLabel = isSelectedDraftThread
    ? `${threadPosts.filter((post) => post.trim().length > 0).length || threadPosts.length} posts • ${computeXWeightedCharacterCount(serializedThreadContent)}/${resolveDisplayedDraftCharacterLimit(
        selectedDraftMaxCharacterLimit,
        composerCharacterLimit,
      )} chars`
    : `${computeXWeightedCharacterCount(serializedThreadContent)}/${resolveDisplayedDraftCharacterLimit(
        selectedDraftMaxCharacterLimit,
        composerCharacterLimit,
      )} chars`;
  const threadPostContainerRef = useRef<HTMLDivElement | null>(null);
  const threadPostTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historicalThreadPostRef = useRef<HTMLDivElement | null>(null);
  const activeThreadPostKey = selectedDraftMessageId
    ? `${selectedDraftMessageId}:${selectedDraftThreadPostIndex}:${isViewingHistoricalDraftVersion ? "history" : "edit"}`
    : `thread-post:${selectedDraftThreadPostIndex}:${isViewingHistoricalDraftVersion ? "history" : "edit"}`;
  const selectedDraftMediaAttachments =
    selectedDraftArtifact?.mediaAttachments?.length &&
    (!isSelectedDraftThread || selectedDraftThreadPostIndex === 0)
      ? selectedDraftArtifact.mediaAttachments
      : [];
  const isReplyDraft = editorMode === "reply";
  const replySourcePreview = selectedDraftArtifact?.replySourcePreview ?? null;

  useEffect(() => {
    if (!isSelectedDraftThread) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      threadPostContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      if (isViewingHistoricalDraftVersion) {
        if (historicalThreadPostRef.current) {
          historicalThreadPostRef.current.scrollTop = 0;
        }
        return;
      }

      if (threadPostTextareaRef.current) {
        threadPostTextareaRef.current.scrollTop = 0;
        threadPostTextareaRef.current.setSelectionRange(0, 0);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    activeThreadPostKey,
    isSelectedDraftThread,
    isViewingHistoricalDraftVersion,
  ]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-[2rem] border bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl ${
        isReplyDraft ? "border-white/[0.18]" : "border-white/[0.1]"
      }`}
    >
      <div className={panelHeaderPaddingClassName}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 font-bold uppercase text-white ${avatarSizeClassName}`}
            >
              {identity.avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${identity.avatarUrl})` }}
                  role="img"
                  aria-label={identity.profilePhotoLabel}
                />
              ) : (
                identity.initials.charAt(0)
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`truncate font-semibold text-white ${displayNameClassName}`}>
                  {identity.displayName}
                </p>
                {isVerifiedAccount ? (
                  <Image
                    src="/x-verified.svg"
                    alt="Verified account"
                    width={isMobile ? 14 : 16}
                    height={isMobile ? 14 : 16}
                    className={isMobile ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
                  />
                ) : null}
              </div>
              <p className={`mt-0.5 line-clamp-1 text-zinc-400 ${usernameClassName}`}>
                @{identity.username}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {isReplyDraft ? (
                  <p className={`text-zinc-400 ${isMobile ? "text-[12px]" : "text-[13px]"}`}>
                    Replying to{" "}
                    {replySourcePreview?.sourceUrl && replySourcePreview.author.username ? (
                      <a
                        href={replySourcePreview.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#1d9bf0] transition hover:text-[#63b3ff]"
                      >
                        @{replySourcePreview.author.username}
                      </a>
                    ) : (
                      <span className="font-medium text-[#1d9bf0]">
                        @{replySourcePreview?.author.username || "source"}
                      </span>
                    )}
                  </p>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Draft
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
            aria-label="Close draft editor"
          >
            ×
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigateTimeline("back")}
                disabled={!canNavigateDraftBack}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous draft version"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigateTimeline("forward")}
                disabled={!canNavigateDraftForward}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next draft version"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <p className="truncate text-[11px] font-medium text-zinc-500">
              Version {timelinePosition} of {timelineLength}
            </p>
          </div>

          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isPrimaryActionDisabled}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 ${panelPaddingClassName}`}>
        <div className="flex h-full min-h-0 flex-col gap-4">
          {isSelectedDraftThread ? (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <div
              ref={threadPostContainerRef}
              className="flex min-h-[320px] flex-1 scroll-mt-4 flex-col"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                    Post {selectedDraftThreadPostIndex + 1} of {threadPosts.length}
                  </span>
                  <span
                    className={`text-[11px] ${
                      isSelectedThreadPostOverLimit ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {selectedThreadPostWeightedCount}/{threadPostCharacterLimit.toLocaleString()}
                  </span>
                </div>
                {!isViewingHistoricalDraftVersion ? (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectThreadPost(selectedDraftThreadPostIndex - 1)}
                      disabled={
                        !selectedDraftMessageId || selectedDraftThreadPostIndex === 0
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="View previous post"
                      title="View previous post"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectThreadPost(selectedDraftThreadPostIndex + 1)}
                      disabled={
                        !selectedDraftMessageId ||
                        selectedDraftThreadPostIndex === threadPosts.length - 1
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="View next post"
                      title="View next post"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddThreadDraftPost(selectedDraftThreadPostIndex + 1)}
                      disabled={isMainChatLocked}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Add post below"
                      title="Add post below"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveThreadDraftPost(selectedDraftThreadPostIndex)}
                      disabled={isMainChatLocked}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Remove post"
                      title="Remove post"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>

              {isViewingHistoricalDraftVersion ? (
                <div
                  key={activeThreadPostKey}
                  ref={historicalThreadPostRef}
                  className={`mt-4 flex-1 overflow-y-auto text-white ${bodyTextClassName}`}
                >
                  <div className="whitespace-pre-wrap">{selectedThreadPost}</div>
                  <ChatMediaAttachments
                    attachments={selectedDraftMediaAttachments}
                    variant="draft"
                    onlyFirst
                  />
                </div>
              ) : (
                <div key={activeThreadPostKey} className="mt-4 flex min-h-[220px] flex-1 flex-col">
                  <textarea
                    ref={threadPostTextareaRef}
                    value={selectedThreadPost}
                    onChange={(event) =>
                      onUpdateThreadDraftPost(
                        selectedDraftThreadPostIndex,
                        event.target.value,
                      )
                    }
                    className={`min-h-[220px] flex-1 w-full resize-none overflow-y-auto bg-transparent px-0 py-0 text-white outline-none placeholder:text-zinc-600 ${bodyTextClassName}`}
                    placeholder={`Thread post ${selectedDraftThreadPostIndex + 1}`}
                  />
                  <ChatMediaAttachments
                    attachments={selectedDraftMediaAttachments}
                    variant="draft"
                    onlyFirst
                  />
                </div>
              )}
            </div>
          </div>
          ) : isViewingHistoricalDraftVersion ? (
            <div
              className={`h-full min-h-full overflow-y-auto text-white ${bodyTextClassName}`}
            >
              <div className="whitespace-pre-wrap">{editorDraftText}</div>
              <ChatMediaAttachments
                attachments={selectedDraftMediaAttachments}
                variant="draft"
                onlyFirst
              />
            </div>
          ) : (
            <div className="flex h-full min-h-full flex-col">
              <textarea
                value={editorDraftText}
                onChange={(event) => onChangeEditorDraftText(event.target.value)}
                className={`h-full min-h-[240px] w-full resize-none overflow-y-auto bg-transparent pr-1 text-white outline-none placeholder:text-zinc-600 ${bodyTextClassName}`}
                placeholder={isReplyDraft ? "Reply draft" : "Draft content"}
              />
              <ChatMediaAttachments
                attachments={selectedDraftMediaAttachments}
                variant="draft"
                onlyFirst
              />
            </div>
          )}
        </div>
      </div>

      <div className={`border-t border-white/10 ${panelFooterPaddingClassName}`}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onRunDraftInspector}
            disabled={isDraftInspectorLoading}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {draftInspectorActionLabel}
          </button>
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500">{footerCounterLabel}</p>
            <button
              type="button"
              onClick={onCopyDraftEditor}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:bg-white/[0.04] hover:text-white"
              aria-label="Copy current draft"
            >
              {hasCopiedDraftEditorText ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onShareDraftEditor}
              className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-200"
            >
              {shareActionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
