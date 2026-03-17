"use client";

import type { ChatQuickReply } from "../chat-page/chatPageTypes";
import type { ComposerImageAttachment } from "./composerTypes";

const MB = 1024 * 1024;

export const COMPOSER_IMAGE_MAX_BYTES = 8 * MB;
export const COMPOSER_IMAGE_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;
export const COMPOSER_IMAGE_ACCEPT = COMPOSER_IMAGE_ACCEPTED_MIME_TYPES.join(",");

export interface ImagePostVisualContext {
  primary_subject: string;
  setting: string;
  lighting_and_mood: string;
  any_readable_text: string;
  key_details: string[];
}

export interface ImagePostRouteSuccessData {
  xHandle: string | null;
  visualContext: ImagePostVisualContext;
  angles: [string, string, string];
  idea: string | null;
  models: {
    vision: string;
    copy: string;
  };
}

export function formatComposerImageSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kb = sizeBytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

export function validateComposerImageFile(file: File): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  if (file.size <= 0) {
    return {
      ok: false,
      error: "That image looks empty. Try another file.",
    };
  }

  if (
    !COMPOSER_IMAGE_ACCEPTED_MIME_TYPES.includes(
      file.type as (typeof COMPOSER_IMAGE_ACCEPTED_MIME_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      error: "Use a PNG, JPG, JPEG, or WEBP image.",
    };
  }

  if (file.size > COMPOSER_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "Images need to be 8 MB or smaller.",
    };
  }

  return { ok: true };
}

export function createComposerImageAttachment(
  file: File,
): ComposerImageAttachment {
  return {
    id: buildLocalImageId("attachment"),
    file,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    objectUrl: URL.createObjectURL(file),
  };
}

export function revokeComposerImageAttachment(
  attachment: ComposerImageAttachment | null | undefined,
) {
  if (!attachment) {
    return;
  }

  URL.revokeObjectURL(attachment.objectUrl);
}

export function buildImagePostSupportAsset(
  visualContext: ImagePostVisualContext,
): string {
  const lines = [
    `Image anchor: ${visualContext.primary_subject} in ${visualContext.setting}.`,
    `Mood: ${visualContext.lighting_and_mood}.`,
    visualContext.any_readable_text
      ? `Readable text: ${visualContext.any_readable_text}.`
      : null,
    visualContext.key_details.length > 0
      ? `Key details: ${visualContext.key_details.slice(0, 4).join(", ")}.`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export function buildImageIdeationQuickReplies(args: {
  angles: readonly string[];
  supportAsset: string;
}): ChatQuickReply[] {
  return args.angles
    .map((angle) => angle.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((angle) => ({
      kind: "ideation_angle" as const,
      value: angle,
      label: angle,
      angle,
      formatHint: "post" as const,
      supportAsset: args.supportAsset,
    }));
}

function buildLocalImageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
