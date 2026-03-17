import type { ImagePostVisualContext } from "@/app/chat/_features/composer/composerImageState";

export type ChatMediaKind = "image";

export interface ChatMediaAttachmentRef {
  assetId: string;
  kind: ChatMediaKind;
  src: string;
  previewSrc?: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  name?: string | null;
}

export interface ImageTurnContext {
  imageAssetId: string;
  visualContext: ImagePostVisualContext;
  supportAsset: string;
  mediaAttachments: ChatMediaAttachmentRef[];
  awaitingConfirmation: boolean;
}

export interface ChatMediaAssetRecordLike {
  id: string;
  kind?: string | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  originalName?: string | null;
}

export function buildChatMediaRouteSrc(
  assetId: string,
  variant?: "original" | "preview",
): string {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) {
    return "";
  }

  if (variant === "preview") {
    return `/api/creator/v2/chat/media/${normalizedAssetId}?variant=preview`;
  }

  return `/api/creator/v2/chat/media/${normalizedAssetId}`;
}

export function buildChatMediaAttachmentRef(
  asset: ChatMediaAssetRecordLike,
): ChatMediaAttachmentRef {
  return {
    assetId: asset.id,
    kind: "image",
    src: buildChatMediaRouteSrc(asset.id),
    previewSrc: buildChatMediaRouteSrc(asset.id, "preview"),
    mimeType: asset.mimeType,
    width: asset.width ?? null,
    height: asset.height ?? null,
    name: asset.originalName ?? null,
  };
}
