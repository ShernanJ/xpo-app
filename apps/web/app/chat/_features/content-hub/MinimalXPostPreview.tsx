"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Copy } from "lucide-react";

import { ChatMediaAttachments } from "../shared/ChatMediaAttachments";
import type {
  ContentHubAuthorIdentity,
  ContentItemRecord,
} from "./contentHubTypes";
import { NO_GROUP_LABEL, formatContentTimestamp } from "./contentHubViewState";

interface MinimalXPostPreviewProps {
  item: ContentItemRecord;
  identity: ContentHubAuthorIdentity;
  isVerifiedAccount: boolean;
  variant?: "compact" | "full";
}

const COMPACT_BODY_CLAMP_STYLE: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 7,
  overflow: "hidden",
};

function renderAvatar(identity: ContentHubAuthorIdentity) {
  if (identity.avatarUrl) {
    return (
      <div
        className="h-full w-full bg-cover bg-center"
        style={{ backgroundImage: `url(${identity.avatarUrl})` }}
        role="img"
        aria-label={`${identity.displayName} profile photo`}
      />
    );
  }

  return (identity.displayName || identity.username || "X").charAt(0).toUpperCase();
}

export function MinimalXPostPreview(props: MinimalXPostPreviewProps) {
  const { item, identity, isVerifiedAccount, variant = "full" } = props;
  const posts = item.artifact?.posts ?? [];
  const isThread = posts.length > 1;
  const previewPosts = variant === "compact" ? posts.slice(0, 1) : posts;
  const fallbackContent = item.artifact?.content?.trim() ?? "";
  const groupLabel = item.folder?.name ?? NO_GROUP_LABEL;
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopyPost(postId: string, content: string) {
    if (!content.trim() || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedPostId(postId);

      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = setTimeout(() => {
        setCopiedPostId((current) => (current === postId ? null : current));
      }, 2000);
    } catch {
      // Ignore clipboard failures and leave the preview unchanged.
    }
  }

  if (variant === "compact") {
    const compactContent = previewPosts[0]?.content ?? fallbackContent;
    const threadLabel =
      posts.length === 2 ? "2-post thread" : `${posts.length}-post thread`;

    return (
      <article
        className="aspect-square rounded-[1.35rem] border border-white/10 bg-black/40 p-3"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-[10px] font-bold uppercase text-white">
                {renderAvatar(identity)}
              </div>

              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate text-[10px] font-medium text-zinc-400">
                  @{identity.username}
                </span>
                {isVerifiedAccount ? (
                  <Image
                    src="/x-verified.svg"
                    alt="Verified account"
                    width={12}
                    height={12}
                    className="h-3 w-3 shrink-0"
                  />
                ) : null}
              </div>
            </div>

            <span className="max-w-[48%] shrink-0 truncate rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {groupLabel}
            </span>
          </div>

          {isThread ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
                Thread
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{threadLabel}</p>
            </div>
          ) : null}

          <div className="mt-3 min-h-0 flex-1 overflow-hidden">
            <p
              className="whitespace-pre-wrap text-[13px] leading-5 text-zinc-100"
              style={COMPACT_BODY_CLAMP_STYLE}
            >
              {compactContent}
            </p>
          </div>

        </div>
      </article>
    );
  }

  return (
    <article
      className="rounded-[1.5rem] border border-white/10 bg-black/40 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-sm font-bold uppercase text-white">
          {renderAvatar(identity)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-white">
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
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">
              {item.postedAt ? formatContentTimestamp(item.postedAt) : "Just now"}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {previewPosts.length > 0 ? (
              previewPosts.map((post, index) => (
                <div
                  key={post.id}
                  className={index > 0 ? "border-t border-white/8 pt-3" : ""}
                >
                  {variant === "full" && isThread ? (
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                      Post {index + 1}
                    </p>
                  ) : null}
                  <p
                    className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100"
                  >
                    {post.content}
                  </p>
                  {index === 0 ? (
                    <ChatMediaAttachments
                      attachments={item.artifact?.mediaAttachments}
                      variant="draft"
                      onlyFirst={variant === "compact"}
                    />
                  ) : null}
                  {variant === "full" ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyPost(post.id, post.content);
                        }}
                        aria-label={
                          copiedPostId === post.id
                            ? isThread
                              ? `Copied post ${index + 1}`
                              : "Copied post"
                            : isThread
                              ? `Copy post ${index + 1}`
                              : "Copy post"
                        }
                        title={
                          copiedPostId === post.id
                            ? isThread
                              ? `Copied post ${index + 1}`
                              : "Copied post"
                            : isThread
                              ? `Copy post ${index + 1}`
                              : "Copy post"
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#111111] text-zinc-400 transition hover:border-white/20 hover:text-white"
                      >
                        {copiedPostId === post.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div>
                <p
                  className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100"
                >
                  {fallbackContent}
                </p>
                {variant === "full" ? (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopyPost(`${item.id}-fallback`, fallbackContent);
                      }}
                      aria-label={
                        copiedPostId === `${item.id}-fallback` ? "Copied post" : "Copy post"
                      }
                      title={
                        copiedPostId === `${item.id}-fallback` ? "Copied post" : "Copy post"
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#111111] text-zinc-400 transition hover:border-white/20 hover:text-white"
                    >
                      {copiedPostId === `${item.id}-fallback` ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
