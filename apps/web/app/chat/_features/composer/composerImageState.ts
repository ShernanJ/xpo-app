"use client";

import type { ChatQuickReply } from "../chat-page/chatPageTypes";
import type { ComposerImageAttachment } from "./composerTypes";
import {
  buildImageIdeationQuickReplies as buildSharedImageIdeationQuickReplies,
  buildImagePostSupportAsset as buildSharedImagePostSupportAsset,
} from "@/lib/chat/imageTurnShared";

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

export async function readComposerImagePreviewPayload(file: File): Promise<{
  previewDataUrl: string | null;
  width: number | null;
  height: number | null;
}> {
  if (!file.type.toLowerCase().startsWith("image/")) {
    return {
      previewDataUrl: null,
      width: null,
      height: null,
    };
  }

  try {
    const sourceDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Invalid image data"));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to decode image"));
      nextImage.src = sourceDataUrl;
    });

    const maxDimension = 320;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return {
        previewDataUrl: null,
        width: image.width,
        height: image.height,
      };
    }

    context.drawImage(image, 0, 0, width, height);
    return {
      previewDataUrl: canvas.toDataURL("image/jpeg", 0.78),
      width: image.width,
      height: image.height,
    };
  } catch {
    return {
      previewDataUrl: null,
      width: null,
      height: null,
    };
  }
}

export const buildImagePostSupportAsset = buildSharedImagePostSupportAsset;

export function buildImageIdeationQuickReplies(args: {
  angles: readonly string[];
  supportAsset: string;
  imageAssetId?: string;
}): ChatQuickReply[] {
  return buildSharedImageIdeationQuickReplies(args) as ChatQuickReply[];
}

function buildLocalImageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
