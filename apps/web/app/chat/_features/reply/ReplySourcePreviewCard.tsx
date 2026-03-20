"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowUpRight, Images, Maximize2, X } from "lucide-react";

import type {
  ReplySourcePreview,
  ReplySourcePreviewMediaItem,
  ReplySourcePreviewPost,
} from "@/lib/reply-engine/replySourcePreview";

interface ReplySourcePreviewCardProps {
  preview: ReplySourcePreview;
  className?: string;
  tone?: "neutral" | "reply";
  size?: "default" | "compact";
  showExternalCta?: boolean;
  ctaLabel?: string;
}

interface ExpandedReplyImage {
  altText: string | null;
  url: string;
}

function getToneClassName(tone: ReplySourcePreviewCardProps["tone"]) {
  if (tone === "reply") {
    return "border-white/12 bg-[#050505]";
  }

  return "border-white/10 bg-black/20";
}

function renderAuthorAvatar(
  post: ReplySourcePreviewPost,
  size: NonNullable<ReplySourcePreviewCardProps["size"]>,
) {
  const fallbackInitial =
    (post.author.displayName || post.author.username || "X").charAt(0).toUpperCase();
  const sizeClassName =
    size === "compact"
      ? "h-8 w-8 text-[11px]"
      : "h-10 w-10 text-sm";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 font-bold uppercase text-white ${sizeClassName}`}
    >
      {post.author.avatarUrl ? (
        <div
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${post.author.avatarUrl})` }}
          role="img"
          aria-label={`${post.author.displayName || post.author.username || "X"} profile photo`}
        />
      ) : (
        fallbackInitial
      )}
    </div>
  );
}

function renderMediaGrid(args: {
  media: ReplySourcePreviewMediaItem[];
  onOpenImage: (image: ExpandedReplyImage) => void;
  size: NonNullable<ReplySourcePreviewCardProps["size"]>;
}) {
  const { media, onOpenImage, size } = args;
  const imageMedia = media.filter(
    (item) => item.type === "image" && typeof item.url === "string" && item.url.trim(),
  );
  const secondaryMedia = media.filter((item) => item.type !== "image" || !item.url);
  const thumbnailClassName =
    size === "compact"
      ? "h-14 w-full cursor-zoom-in object-cover transition duration-200 group-hover:scale-[1.02] md:h-16"
      : "h-20 w-full cursor-zoom-in object-cover transition duration-200 group-hover:scale-[1.02] md:h-24";

  if (imageMedia.length === 0 && secondaryMedia.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2.5">
      {imageMedia.length > 0 ? (
        <div
          className={`grid gap-2 ${
            imageMedia.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {imageMedia.slice(0, 4).map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              onClick={() =>
                onOpenImage({
                  url: item.url ?? "",
                  altText: item.altText ?? null,
                })
              }
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] text-left transition hover:border-white/20"
              aria-label={`Expand source image ${index + 1}`}
            >
              <img
                src={item.url ?? ""}
                alt={item.altText || "Source post image"}
                className={thumbnailClassName}
                loading="lazy"
              />
              <span className="pointer-events-none absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <Maximize2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {secondaryMedia.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryMedia.map((item, index) => (
            <span
              key={`${item.type}-${index}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400"
            >
              <Images className="h-3.5 w-3.5" />
              {item.type === "gif" ? "GIF attached" : "Video attached"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReplySourcePostCard(props: {
  post: ReplySourcePreviewPost;
  quotePreview?: ReplySourcePreviewPost | null;
  nested?: boolean;
  onOpenImage: (image: ExpandedReplyImage) => void;
  size: NonNullable<ReplySourcePreviewCardProps["size"]>;
}) {
  const { post, quotePreview = null, nested = false, onOpenImage, size } = props;
  const bodyTextClassName =
    size === "compact"
      ? "text-[13px] leading-5 text-zinc-200"
      : "text-sm leading-6 text-zinc-200";

  return (
    <div
      className={`rounded-2xl border ${
        nested
          ? size === "compact"
            ? "border-white/[0.08] bg-[#050505] px-3 py-2.5"
            : "border-white/[0.08] bg-[#050505] px-3.5 py-3"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className={`flex items-start ${size === "compact" ? "gap-2.5" : "gap-3"}`}>
        {renderAuthorAvatar(post, size)}
        <div className="min-w-0 flex-1">
          <div className={`flex min-w-0 flex-wrap items-center ${size === "compact" ? "gap-1" : "gap-1.5"}`}>
            <span
              className={`truncate font-semibold text-white ${
                size === "compact" ? "text-[13px]" : "text-sm"
              }`}
            >
              {post.author.displayName || post.author.username || "Unknown"}
            </span>
            {post.author.isVerified ? (
              <Image
                src="/x-verified.svg"
                alt="Verified account"
                width={size === "compact" ? 14 : 16}
                height={size === "compact" ? 14 : 16}
                className={
                  size === "compact" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"
                }
              />
            ) : null}
            {post.author.username ? (
              <span
                className={`truncate text-zinc-500 ${
                  size === "compact" ? "text-[11px]" : "text-xs"
                }`}
              >
                @{post.author.username}
              </span>
            ) : null}
          </div>

          <p className={`mt-2 whitespace-pre-wrap ${bodyTextClassName}`}>
            {post.text}
          </p>
          {renderMediaGrid({
            media: post.media,
            onOpenImage,
            size,
          })}

          {quotePreview ? (
            <div className="mt-3">
              <ReplySourcePostCard
                post={quotePreview}
                nested
                onOpenImage={onOpenImage}
                size={size}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ReplySourcePreviewCard(props: ReplySourcePreviewCardProps) {
  const {
    preview,
    className,
    tone = "neutral",
    size = "default",
    showExternalCta = false,
    ctaLabel = "Reply",
  } = props;
  const [expandedImage, setExpandedImage] = useState<ExpandedReplyImage | null>(null);

  useEffect(() => {
    if (!expandedImage) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedImage(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [expandedImage]);

  const expandedImageModal =
    expandedImage && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded source image"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setExpandedImage(null);
              }
            }}
          >
            <div className="relative w-full max-w-6xl">
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                aria-label="Close expanded image"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050505] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                <img
                  src={expandedImage.url}
                  alt={expandedImage.altText || "Expanded source image"}
                  className="max-h-[88vh] w-full rounded-[1.2rem] object-contain"
                />
                {expandedImage.altText ? (
                  <p className="px-2 pb-1 pt-3 text-sm leading-6 text-zinc-300">
                    {expandedImage.altText}
                  </p>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <article
        className={[
          size === "compact"
            ? "rounded-[1.3rem] border px-3 py-3"
            : "rounded-[1.5rem] border px-4 py-4",
          getToneClassName(tone),
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {showExternalCta && preview.sourceUrl ? (
          <div className="flex items-start justify-end">
            <a
              href={preview.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] font-medium text-zinc-200 transition hover:bg-white/[0.08] hover:text-white ${
                size === "compact"
                  ? "px-2.5 py-1 text-[10px]"
                  : "px-3 py-1.5 text-[11px]"
              }`}
            >
              {ctaLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}

        <div className={showExternalCta && preview.sourceUrl ? "mt-3" : undefined}>
          <ReplySourcePostCard
            post={preview}
            quotePreview={preview.quotedPost ?? null}
            onOpenImage={setExpandedImage}
            size={size}
          />
        </div>
      </article>
      {expandedImageModal}
    </>
  );
}
