"use client";

import type { ChatMediaAttachmentRef } from "@/lib/chat/chatMedia";

interface ChatMediaAttachmentsProps {
  attachments: ChatMediaAttachmentRef[] | null | undefined;
  variant?: "bubble" | "draft";
  onlyFirst?: boolean;
}

export function ChatMediaAttachments(props: ChatMediaAttachmentsProps) {
  const attachments = (props.attachments || [])
    .filter((attachment) => attachment.kind === "image" && attachment.src)
    .slice(0, props.onlyFirst ? 1 : undefined);

  if (attachments.length === 0) {
    return null;
  }

  const wrapperClassName =
    props.variant === "draft"
      ? "mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#050505]"
      : "mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20";
  const imageClassName =
    props.variant === "draft"
      ? "block max-h-[360px] w-full object-cover"
      : "block max-h-[320px] w-full object-cover";

  return (
    <div className={wrapperClassName}>
      {attachments.map((attachment) => (
        <img
          key={attachment.assetId}
          src={attachment.previewSrc || attachment.src}
          alt={attachment.name || "Attached image"}
          className={imageClassName}
        />
      ))}
    </div>
  );
}
