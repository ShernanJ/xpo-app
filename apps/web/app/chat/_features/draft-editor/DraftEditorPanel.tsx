"use client";

import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";

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

interface DraftEditorPanelProps {
  layout: "desktop" | "mobile";
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
  onShareDraftEditor: () => void;
}

export function DraftEditorPanel(props: DraftEditorPanelProps) {
  const {
    layout,
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
    selectedDraftThreadFramingStyle,
    onChangeThreadFraming,
    isMainChatLocked,
    isViewingHistoricalDraftVersion,
    editorDraftPosts,
    selectedDraftThreadPostIndex,
    selectedDraftMessageId,
    onSelectThreadPost,
    onUpdateThreadDraftPost,
    onMoveThreadDraftPost,
    onSplitThreadDraftPost,
    onMergeThreadDraftPostDown,
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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[#0F0F0F]/95 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
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
        {isSelectedDraftThread ? (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Thread Framing
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Control how the thread announces itself.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { value: "none", label: "Natural" },
                  { value: "soft_signal", label: "Soft Intro" },
                  { value: "numbered", label: "Numbered" },
                ].map((option) => {
                  const isActive = selectedDraftThreadFramingStyle === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        onChangeThreadFraming(option.value as ThreadFramingStyle)
                      }
                      disabled={isActive || isMainChatLocked || isViewingHistoricalDraftVersion}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        isActive
                          ? "bg-white text-black"
                          : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {threadPosts.map((_, index) => {
                const isActive = selectedDraftThreadPostIndex === index;

                return (
                  <button
                    key={`thread-post-chip-${index}`}
                    type="button"
                    onClick={() => {
                      if (!selectedDraftMessageId) {
                        return;
                      }
                      onSelectThreadPost(index);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                      isActive
                        ? "bg-white text-black"
                        : "border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    Post {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                    Post {selectedDraftThreadPostIndex + 1}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onMoveThreadDraftPost(selectedDraftThreadPostIndex, "up")
                      }
                      disabled={selectedDraftThreadPostIndex === 0}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onMoveThreadDraftPost(selectedDraftThreadPostIndex, "down")
                      }
                      disabled={selectedDraftThreadPostIndex === threadPosts.length - 1}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => onSplitThreadDraftPost(selectedDraftThreadPostIndex)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      Split
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onMergeThreadDraftPostDown(selectedDraftThreadPostIndex)
                      }
                      disabled={selectedDraftThreadPostIndex === threadPosts.length - 1}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddThreadDraftPost(selectedDraftThreadPostIndex + 1)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      Add Below
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveThreadDraftPost(selectedDraftThreadPostIndex)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>

              {isViewingHistoricalDraftVersion ? (
                <div className={`mt-3 whitespace-pre-wrap text-white ${bodyTextClassName}`}>
                  {selectedThreadPost}
                </div>
              ) : (
                <textarea
                  value={selectedThreadPost}
                  onChange={(event) =>
                    onUpdateThreadDraftPost(
                      selectedDraftThreadPostIndex,
                      event.target.value,
                    )
                  }
                  className={`mt-3 min-h-[220px] w-full resize-none overflow-y-auto rounded-2xl border ${
                    isSelectedThreadPostOverLimit ? "border-red-500/30" : "border-white/10"
                  } bg-transparent px-3 py-3 text-white outline-none placeholder:text-zinc-600 ${bodyTextClassName}`}
                  placeholder={`Thread post ${selectedDraftThreadPostIndex + 1}`}
                />
              )}
            </div>

            {!isViewingHistoricalDraftVersion ? (
              <button
                type="button"
                onClick={() => onAddThreadDraftPost()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white"
              >
                <Plus className="h-4 w-4" />
                Add another post
              </button>
            ) : null}
          </div>
        ) : isViewingHistoricalDraftVersion ? (
          <div
            className={`h-full min-h-full overflow-y-auto whitespace-pre-wrap text-white ${bodyTextClassName}`}
          >
            {editorDraftText}
          </div>
        ) : (
          <textarea
            value={editorDraftText}
            onChange={(event) => onChangeEditorDraftText(event.target.value)}
            className={`h-full min-h-full w-full resize-none overflow-y-auto bg-transparent pr-1 text-white outline-none placeholder:text-zinc-600 ${bodyTextClassName}`}
            placeholder="Draft content"
          />
        )}
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
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
