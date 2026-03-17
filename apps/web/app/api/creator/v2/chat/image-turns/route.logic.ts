import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ChatMediaAttachmentRef, ImageTurnContext } from "@/lib/chat/chatMedia";
import {
  buildChatMediaAttachmentRef,
  type ChatMediaAssetRecordLike,
} from "@/lib/chat/chatMedia";
import type { ImageVisionContext } from "@/lib/creator/imagePostGeneration";

const MB = 1024 * 1024;

export const MAX_IMAGE_TURN_PREVIEW_BYTES = 2 * MB;

interface ValidationError {
  field: string;
  message: string;
}

export interface InitialImageTurnInput {
  threadId: string;
  imageFile: File;
  idea: string | null;
  previewDataUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface ImageTurnConfirmationInput {
  threadId: string;
  assistantMessageId: string;
  decision: "confirm" | "decline";
  displayUserMessage: string | null;
}

export function parseInitialImageTurnFormData(
  formData: FormData,
): { ok: true; data: InitialImageTurnInput } | { ok: false; errors: ValidationError[] } {
  const rawThreadId = formData.get("threadId");
  const threadId = typeof rawThreadId === "string" ? rawThreadId.trim() : "";
  if (!threadId) {
    return {
      ok: false,
      errors: [{ field: "threadId", message: "A thread is required for image turns." }],
    };
  }

  const rawImage = formData.get("image");
  if (!(rawImage instanceof File)) {
    return {
      ok: false,
      errors: [{ field: "image", message: "An image upload is required." }],
    };
  }

  const rawIdea = formData.get("idea");
  const idea =
    typeof rawIdea === "string" && rawIdea.trim().length > 0
      ? rawIdea.trim().slice(0, 500)
      : null;
  const rawPreviewDataUrl = formData.get("previewDataUrl");
  const previewDataUrl =
    typeof rawPreviewDataUrl === "string" && rawPreviewDataUrl.trim().length > 0
      ? rawPreviewDataUrl.trim()
      : null;
  const rawWidth = formData.get("width");
  const rawHeight = formData.get("height");

  return {
    ok: true,
    data: {
      threadId,
      imageFile: rawImage,
      idea,
      previewDataUrl,
      width: parseOptionalPositiveInt(rawWidth),
      height: parseOptionalPositiveInt(rawHeight),
    },
  };
}

export function parseImageTurnConfirmationBody(
  value: unknown,
): { ok: true; data: ImageTurnConfirmationInput } | { ok: false; errors: ValidationError[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ field: "body", message: "Confirmation body must be a JSON object." }],
    };
  }

  const record = value as Record<string, unknown>;
  const threadId = typeof record.threadId === "string" ? record.threadId.trim() : "";
  const assistantMessageId =
    typeof record.assistantMessageId === "string" ? record.assistantMessageId.trim() : "";
  const displayUserMessage =
    typeof record.displayUserMessage === "string" && record.displayUserMessage.trim().length > 0
      ? record.displayUserMessage.trim()
      : null;

  if (!threadId) {
    return {
      ok: false,
      errors: [{ field: "threadId", message: "A thread is required for confirmation." }],
    };
  }

  if (!assistantMessageId) {
    return {
      ok: false,
      errors: [{ field: "assistantMessageId", message: "Assistant message id is required." }],
    };
  }

  if (record.decision !== "confirm" && record.decision !== "decline") {
    return {
      ok: false,
      errors: [{ field: "decision", message: "Decision must be confirm or decline." }],
    };
  }

  return {
    ok: true,
    data: {
      threadId,
      assistantMessageId,
      decision: record.decision,
      displayUserMessage,
    },
  };
}

export async function fileToBytes(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

export function parsePreviewDataUrl(
  value: string | null,
): { mimeType: string; bytes: Buffer } | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_TURN_PREVIEW_BYTES) {
    return null;
  }

  return {
    mimeType,
    bytes,
  };
}

export function buildImageTurnContext(args: {
  imageAssetId: string;
  visualContext: ImageVisionContext;
  supportAsset: string;
  mediaAttachments: ChatMediaAttachmentRef[];
  awaitingConfirmation: boolean;
}): ImageTurnContext {
  return {
    imageAssetId: args.imageAssetId,
    visualContext: args.visualContext,
    supportAsset: args.supportAsset,
    mediaAttachments: args.mediaAttachments,
    awaitingConfirmation: args.awaitingConfirmation,
  };
}

export function parseImageTurnContext(value: unknown): ImageTurnContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const imageAssetId =
    typeof record.imageAssetId === "string" && record.imageAssetId.trim()
      ? record.imageAssetId.trim()
      : null;
  const supportAsset =
    typeof record.supportAsset === "string" && record.supportAsset.trim()
      ? record.supportAsset.trim()
      : null;
  const visualContext =
    record.visualContext && typeof record.visualContext === "object" && !Array.isArray(record.visualContext)
      ? (record.visualContext as ImageVisionContext)
      : null;
  const mediaAttachments = Array.isArray(record.mediaAttachments)
    ? (record.mediaAttachments as ChatMediaAttachmentRef[])
    : [];

  if (!imageAssetId || !supportAsset || !visualContext) {
    return null;
  }

  return {
    imageAssetId,
    supportAsset,
    visualContext,
    mediaAttachments,
    awaitingConfirmation: record.awaitingConfirmation === true,
  };
}

export function serializeStoredChatMessage(args: {
  message: {
    id: string;
    threadId: string;
    role: string;
    content: string;
    data: Prisma.JsonValue | null;
    createdAt: Date;
  };
}): Record<string, unknown> {
  return {
    id: args.message.id,
    threadId: args.message.threadId,
    role: args.message.role,
    content: args.message.content,
    createdAt: args.message.createdAt.toISOString(),
    ...(args.message.data && typeof args.message.data === "object" && !Array.isArray(args.message.data)
      ? (args.message.data as Record<string, unknown>)
      : {}),
  };
}

export function createChatMediaAssetRecord(args: {
  mimeType: string;
  width: number | null;
  height: number | null;
  originalName: string | null;
}): ChatMediaAssetRecordLike & { id: string } {
  return {
    id: `chat-media-${randomUUID()}`,
    mimeType: args.mimeType,
    width: args.width,
    height: args.height,
    originalName: args.originalName,
  };
}

export function buildUserImageMessageData(args: {
  mediaAttachments: ChatMediaAttachmentRef[];
}): Prisma.InputJsonValue {
  return {
    mediaAttachments: args.mediaAttachments,
  } as unknown as Prisma.InputJsonValue;
}

export function buildAssistantImageTurnMessageData(args: {
  reply: string;
  outputShape: "coach_question" | "ideation_angles";
  surfaceMode: "ask_one_question" | "offer_options";
  quickReplies: unknown[];
  angles?: Array<{ title: string }>;
  ideationFormatHint?: "post" | "thread";
  supportAsset: string | null;
  imageTurnContext: ImageTurnContext;
}): Prisma.InputJsonValue {
  return {
    reply: args.reply,
    angles: args.angles ?? [],
    ...(args.ideationFormatHint ? { ideationFormatHint: args.ideationFormatHint } : {}),
    quickReplies: args.quickReplies,
    plan: null,
    draft: null,
    drafts: [],
    draftArtifacts: [],
    draftBundle: null,
    supportAsset: args.supportAsset,
    mediaAttachments: [],
    groundingSources: [],
    autoSavedSourceMaterials: null,
    outputShape: args.outputShape,
    surfaceMode: args.surfaceMode,
    replyArtifacts: null,
    replyParse: null,
    contextPacket: null,
    imageTurnContext: args.imageTurnContext,
  } as unknown as Prisma.InputJsonValue;
}

function parseOptionalPositiveInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildAttachmentRefsFromAsset(
  asset: ChatMediaAssetRecordLike,
): ChatMediaAttachmentRef[] {
  return [buildChatMediaAttachmentRef(asset)];
}
