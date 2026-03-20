"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Check, Copy, Edit3 } from "lucide-react";

import type { ReplySourcePreview } from "@/lib/reply-engine/replySourcePreview";

import { AnimatedDraftText, type DraftPreviewIdentity } from "../draft-editor/chatDraftPreviewCard";
import { ReplySourcePreviewCard } from "./ReplySourcePreviewCard";

const INLINE_REPLY_REVISION_ACTIONS = [
  { label: "Make it bolder", prompt: "make it bolder" },
  { label: "Less harsh", prompt: "make it less harsh" },
  { label: "Shorter", prompt: "make it shorter" },
] as const;

interface InlineReplyDraftPreviewCardProps {
  identity: DraftPreviewIdentity;
  isVerifiedAccount: boolean;
  isMainChatLocked: boolean;
  draftText: string;
  sourcePreview: ReplySourcePreview;
  isFocused: boolean;
  hasCopiedDraft: boolean;
  revealClassName: string;
  shouldAnimateLines: boolean;
  defaultSourceExpanded?: boolean;
  onOpenDraftEditor: () => void;
  onRequestRevision: (prompt: string) => void;
  onCopy: () => void;
}

export function InlineReplyDraftPreviewCard(
  props: InlineReplyDraftPreviewCardProps,
) {
  const {
    identity,
    isVerifiedAccount,
    isMainChatLocked,
    draftText,
    sourcePreview,
    isFocused,
    hasCopiedDraft,
    revealClassName,
    shouldAnimateLines,
    defaultSourceExpanded = true,
    onOpenDraftEditor,
    onRequestRevision,
    onCopy,
  } = props;
  const [isSourceExpanded, setIsSourceExpanded] = useState(defaultSourceExpanded);

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <article
        className={`w-full max-w-[600px] rounded-[1.7rem] border bg-[#070707] p-4 transition-[border-color,box-shadow,background-color] duration-300 ${
          isFocused
            ? "border-white/45 shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_34px_rgba(255,255,255,0.12)]"
            : "border-white/10 hover:border-white/20 hover:bg-[#0C0C0C]"
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
              <div className="flex min-w-0 items-center gap-1.5">
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
                <span className="truncate text-xs text-zinc-500">@{identity.username}</span>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                Replying to{" "}
                {sourcePreview.sourceUrl && sourcePreview.author.username ? (
                  <a
                    href={sourcePreview.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#1d9bf0] transition hover:text-[#63b3ff]"
                  >
                    @{sourcePreview.author.username}
                  </a>
                ) : (
                  <span className="font-medium text-[#1d9bf0]">
                    @{sourcePreview.author.username || "source"}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDraftEditor}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Edit reply draft"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenDraftEditor}
          className="mt-3 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          aria-pressed={isFocused}
        >
          <AnimatedDraftText
            text={draftText}
            className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-100"
            animate={shouldAnimateLines}
          />
        </button>

        <div className="mt-3 flex items-center text-xs text-zinc-500">
          <span>Just now</span>
        </div>

        <div className="mt-4">
          <ReplySourcePreviewCard
            preview={sourcePreview}
            tone="reply"
            size="compact"
            collapsed={!isSourceExpanded}
            onToggleCollapse={() => setIsSourceExpanded((current) => !current)}
          />
        </div>

        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {INLINE_REPLY_REVISION_ACTIONS.map((action) => (
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
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                  hasCopiedDraft
                    ? "border-white/20 bg-white/[0.1] text-white"
                    : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                }`}
                aria-label={hasCopiedDraft ? "Copied reply draft" : "Copy reply draft"}
              >
                {hasCopiedDraft ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{hasCopiedDraft ? "Copied" : "Copy"}</span>
              </button>
              {sourcePreview.sourceUrl ? (
                <a
                  href={sourcePreview.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
                >
                  Go to Tweet
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
