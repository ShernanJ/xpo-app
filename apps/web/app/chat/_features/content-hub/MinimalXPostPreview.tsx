"use client";

import Image from "next/image";

import { ChatMediaAttachments } from "../shared/ChatMediaAttachments";
import type {
  ContentHubAuthorIdentity,
  ContentItemRecord,
} from "./contentHubTypes";
import { formatContentTimestamp } from "./contentHubViewState";

interface MinimalXPostPreviewProps {
  item: ContentItemRecord;
  identity: ContentHubAuthorIdentity;
  isVerifiedAccount: boolean;
  variant?: "compact" | "full";
}

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

  return (
    <article
      className={`rounded-[1.5rem] border border-white/10 bg-black/40 ${
        variant === "compact" ? "p-3" : "p-4"
      }`}
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
                    className={`whitespace-pre-wrap text-zinc-100 ${
                      variant === "compact"
                        ? "line-clamp-4 text-[14px] leading-6"
                        : "text-[15px] leading-7"
                    }`}
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
                </div>
              ))
            ) : (
              <p
                className={`whitespace-pre-wrap text-zinc-100 ${
                  variant === "compact"
                    ? "line-clamp-4 text-[14px] leading-6"
                    : "text-[15px] leading-7"
                }`}
              >
                {fallbackContent}
              </p>
            )}
          </div>

          {variant === "compact" && isThread ? (
            <p className="mt-3 text-xs text-zinc-500">
              {posts.length} posts in thread
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
