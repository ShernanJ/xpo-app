"use client";

import type { ChatMediaAttachmentRef } from "@/lib/chat/chatMedia";
import { InteractivePreviewImage } from "./InteractivePreviewImage";

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

  if (props.variant === "draft") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {attachments.map((attachment, index) => (
          <InteractivePreviewImage
            key={attachment.assetId}
            src={attachment.previewSrc || attachment.src}
            alt={attachment.name || "Attached image"}
            buttonLabel={`Expand draft image ${index + 1}`}
            dialogLabel="Expanded draft image"
            frameClassName="group relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#050505] text-left"
            imageClassName="aspect-square w-full object-cover"
          />
        ))}
      </div>
    );
  }

  const wrapperClassName =
    "mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20";
  const imageClassName = "block max-h-[320px] w-full object-cover";

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
