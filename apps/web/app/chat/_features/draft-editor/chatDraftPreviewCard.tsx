"use client";

import { Fragment } from "react";
import Image from "next/image";
import { ArrowUpRight, Check, Copy, Edit3 } from "lucide-react";

import type { ThreadFramingStyle } from "@/lib/onboarding/draftArtifacts";

import {
  getThreadFramingStyleLabel,
  type InlineDraftPreviewState,
} from "./chatDraftPreviewState";

const DRAFT_REVEAL_LINE_STAGGER_MS = 70;

const INLINE_DRAFT_REVISION_ACTIONS = [
  { label: "Shorter", prompt: "make it shorter" },
  { label: "Longer", prompt: "make it longer and more detailed" },
  { label: "Softer", prompt: "make it softer" },
  { label: "Punchier", prompt: "make it punchier" },
  { label: "Less Negative", prompt: "make it less negative" },
  { label: "More Specific", prompt: "make it more specific" },
] as const;

export interface DraftPreviewIdentity {
  avatarUrl: string | null;
  displayName: string;
  username: string;
}

export function AnimatedDraftText(props: {
  text: string;
  className: string;
  animate: boolean;
  baseDelayMs?: number;
}) {
  if (!props.animate) {
    return <p className={props.className}>{props.text}</p>;
  }

  const lines = props.text.split("\n");

  return (
    <p className={props.className}>
      {lines.map((line, index) => (
        <Fragment key={`${index}-${line.length}`}>
          <span
            className="draft-reveal-line inline-block whitespace-pre-wrap"
            style={{
              animationDelay: `${(props.baseDelayMs ?? 0) + index * DRAFT_REVEAL_LINE_STAGGER_MS}ms`,
            }}
          >
            {line || "\u00A0"}
          </span>
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </p>
  );
}

interface InlineDraftPreviewCardProps {
  identity: DraftPreviewIdentity;
  previewState: InlineDraftPreviewState;
  isVerifiedAccount: boolean;
  isMainChatLocked: boolean;
  hasCopiedDraft: boolean;
  revealClassName: string;
  shouldAnimateLines: boolean;
  onOpenDraftEditor: (threadPostIndex?: number) => void;
  onRequestRevision: (
    prompt: string,
    threadFramingStyleOverride?: ThreadFramingStyle,
  ) => void;
  onToggleExpanded: () => void;
  onCopy: () => void;
  onShare: () => void;
}

export function InlineDraftPreviewCard(props: InlineDraftPreviewCardProps) {
  const {
    identity,
    previewState,
    isVerifiedAccount,
    isMainChatLocked,
    hasCopiedDraft,
    revealClassName,
    shouldAnimateLines,
    onOpenDraftEditor,
    onRequestRevision,
    onToggleExpanded,
    onCopy,
    onShare,
  } = props;
  const {
    threadPreviewPosts,
    previewDraft,
    isThreadPreview,
    threadFramingStyle,
    selectedThreadPreviewPostIndex,
    threadDeckPosts,
    hiddenThreadPostCount,
    threadDeckHeight,
    isExpandedThreadPreview,
    draftCounter,
    isLongformPreview,
    canToggleDraftFormat,
    transformDraftPrompt,
    convertToThreadPrompt,
    isFocusedDraftPreview,
  } = previewState;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <article
        className={`rounded-2xl bg-[#000000] p-4 transition-[border-color,box-shadow,background-color] duration-300 ${
          isFocusedDraftPreview
            ? "border border-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_34px_rgba(255,255,255,0.16)]"
            : "border border-white/[0.08] hover:border-white/15 hover:bg-[#0F0F0F]"
        } ${revealClassName}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold uppercase text-white">
              {identity.avatarUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${identity.avatarUrl})` }}
                  role="img"
                  aria-label={`${identity.displayName} profile photo`}
                />
              ) : (
                identity.displayName.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-bold text-white">
                  {identity.displayName}
                </span>
                {isVerifiedAccount ? (
                  <Image
                    src="/x-verified.svg"
                    alt="Verified account"
                    width={16}
                    height={16}
                    className="h-4 w-4 shrink-0"
                  />
                ) : null}
              </div>
              <span className="text-xs text-zinc-500">@{identity.username}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDraftEditor();
            }}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            aria-label="Edit draft"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          {isThreadPreview ? (
            <div className="space-y-3">
              {isExpandedThreadPreview ? (
                <div className="rounded-2xl border border-white/[0.08] bg-[#050505] px-4 py-3">
                  <div className="space-y-1">
                    {threadPreviewPosts.map((postEntry) => {
                      const post = postEntry.content;
                      const postIndex = postEntry.originalIndex;
                      const isLastPost = postIndex === threadPreviewPosts.length - 1;

                      return (
                        <div
                          key={`expanded-thread-post-${postIndex}`}
                          className={`relative pl-14 ${isLastPost ? "" : "pb-4"}`}
                        >
                          {!isLastPost ? (
                            <span className="absolute left-[19px] top-11 bottom-0 w-px bg-white/[0.14]" />
                          ) : null}
                          <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold uppercase text-white">
                            {identity.avatarUrl ? (
                              <div
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${identity.avatarUrl})` }}
                                role="img"
                                aria-label={`${identity.displayName} profile photo`}
                              />
                            ) : (
                              identity.displayName.charAt(0)
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenDraftEditor(postIndex);
                            }}
                            className={`w-full rounded-2xl border bg-[#000000] px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                              selectedThreadPreviewPostIndex === postIndex
                                ? "border-white/[0.18] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                                : "border-white/[0.06] hover:border-white/[0.12]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-[15px] font-bold text-white">
                                    {identity.displayName}
                                  </span>
                                  {isVerifiedAccount ? (
                                    <Image
                                      src="/x-verified.svg"
                                      alt="Verified account"
                                      width={16}
                                      height={16}
                                      className="h-4 w-4 shrink-0"
                                    />
                                  ) : null}
                                  <span className="text-[13px] text-zinc-500">
                                    @{identity.username}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                                  <span>Post {postIndex + 1}</span>
                                  <span>·</span>
                                  <span>Just now</span>
                                </div>
                              </div>
                              <span
                                className={`text-[11px] ${
                                  postEntry.weightedCharacterCount > postEntry.maxCharacterLimit
                                    ? "text-red-400"
                                    : "text-zinc-500"
                                }`}
                              >
                                {postEntry.weightedCharacterCount}/
                                {postEntry.maxCharacterLimit.toLocaleString()}
                              </span>
                            </div>
                            <AnimatedDraftText
                              text={post}
                              className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100"
                              animate={shouldAnimateLines}
                              baseDelayMs={postIndex * 60}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenDraftEditor()}
                  className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  aria-pressed={isFocusedDraftPreview}
                >
                  <div className="relative" style={{ height: `${threadDeckHeight}px` }}>
                    {[...threadDeckPosts].reverse().map((postEntry, reversedIndex) => {
                      const originalIndex = threadDeckPosts.length - reversedIndex - 1;
                      const depthOffset = originalIndex * 16;
                      const lateralOffset = originalIndex * 8;
                      const isFrontCard = originalIndex === 0;
                      const isBackCard = originalIndex === threadDeckPosts.length - 1;
                      const post = postEntry.content;
                      const postIndex = postEntry.originalIndex;

                      return (
                        <div
                          key={`preview-post-${postIndex}`}
                          className={`absolute overflow-hidden rounded-2xl border bg-[#000000] p-4 transition-all ${
                            isFrontCard
                              ? "border-white/[0.12] shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
                              : "border-white/[0.08] shadow-[0_18px_40px_rgba(0,0,0,0.32)]"
                          }`}
                          style={{
                            top: `${depthOffset}px`,
                            left: `${lateralOffset}px`,
                            right: `${Math.max(0, 12 - lateralOffset / 2)}px`,
                            zIndex: threadDeckPosts.length - originalIndex,
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold text-white uppercase">
                                {identity.avatarUrl ? (
                                  <div
                                    className="h-full w-full bg-cover bg-center"
                                    style={{ backgroundImage: `url(${identity.avatarUrl})` }}
                                    role="img"
                                    aria-label={`${identity.displayName} profile photo`}
                                  />
                                ) : (
                                  identity.displayName.charAt(0)
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-sm font-bold text-white">
                                    {identity.displayName}
                                  </span>
                                  {isVerifiedAccount ? (
                                    <Image
                                      src="/x-verified.svg"
                                      alt="Verified account"
                                      width={16}
                                      height={16}
                                      className="h-4 w-4 shrink-0"
                                    />
                                  ) : null}
                                </div>
                                <span className="text-xs text-zinc-500">@{identity.username}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                Post {postIndex + 1}
                              </span>
                              <span
                                className={`text-[11px] ${
                                  postEntry.weightedCharacterCount > postEntry.maxCharacterLimit
                                    ? "text-red-400"
                                    : "text-zinc-500"
                                }`}
                              >
                                {postEntry.weightedCharacterCount}/
                                {postEntry.maxCharacterLimit.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <AnimatedDraftText
                            text={post}
                            className={`mt-3 whitespace-pre-wrap text-zinc-100 ${
                              isFrontCard
                                ? "line-clamp-5 text-[15px] leading-6"
                                : "line-clamp-3 text-[14px] leading-5"
                            }`}
                            animate={shouldAnimateLines}
                            baseDelayMs={postIndex * 60}
                          />
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <span>Just now</span>
                            <span>·</span>
                            <span>Post {postIndex + 1}</span>
                            {hiddenThreadPostCount > 0 && isBackCard ? (
                              <>
                                <span>·</span>
                                <span>+{hiddenThreadPostCount} more</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenDraftEditor()}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              aria-pressed={isFocusedDraftPreview}
            >
              <AnimatedDraftText
                text={previewDraft}
                className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100"
                animate={shouldAnimateLines}
              />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Just now</span>
          <span>·</span>
          {isThreadPreview ? (
            <>
              <span>{threadPreviewPosts.length} posts</span>
              <span>·</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                {getThreadFramingStyleLabel(threadFramingStyle)}
              </span>
              <span>·</span>
            </>
          ) : null}
          <span className={draftCounter.toneClassName}>{draftCounter.label}</span>
        </div>

        <div className="mt-3 border-t border-white/[0.06]" />

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {INLINE_DRAFT_REVISION_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={isMainChatLocked}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestRevision(action.prompt);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {action.label}
              </button>
            ))}
            {canToggleDraftFormat ? (
              <button
                type="button"
                disabled={isMainChatLocked}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestRevision(transformDraftPrompt);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                {isLongformPreview ? "Turn into Shortform" : "Turn into Longform"}
              </button>
            ) : null}
            {isThreadPreview ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded();
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                {isExpandedThreadPreview ? "Collapse" : "Expand"}
              </button>
            ) : null}
            {!isThreadPreview ? (
              <button
                type="button"
                disabled={isMainChatLocked}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestRevision(convertToThreadPrompt, "soft_signal");
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                Turn into Thread
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCopy();
              }}
              className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              aria-label="Copy draft"
            >
              {hasCopiedDraft ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShare();
              }}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              Post
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
