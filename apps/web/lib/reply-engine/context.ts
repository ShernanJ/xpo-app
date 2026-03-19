import {
  analyzeImageVisualContext,
} from "../creator/imagePostGeneration.ts";
import type {
  ExtensionOpportunityPostType,
  ExtensionReplyDraftRequest,
} from "../extension/types.ts";

import type {
  ReplySourceContext,
  ReplySourceImage,
  ReplyVisualContextSummary,
} from "./types.ts";

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() || "";
  return normalized || null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim() || "";
  return normalized || null;
}

function normalizePostType(value: string | null | undefined): ExtensionOpportunityPostType {
  if (
    value === "original" ||
    value === "reply" ||
    value === "quote" ||
    value === "repost" ||
    value === "unknown"
  ) {
    return value;
  }

  return "original";
}

function normalizeImages(images: ReplySourceImage[] | null | undefined): ReplySourceImage[] {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => ({
      imageUrl: normalizeUrl(image?.imageUrl),
      imageDataUrl: normalizeUrl(image?.imageDataUrl),
      altText: image?.altText?.trim() || null,
    }))
    .filter((image) => image.imageUrl || image.imageDataUrl || image.altText);
}

export function buildReplySourceContextFromExtensionRequest(
  request: ExtensionReplyDraftRequest,
): ReplySourceContext {
  const images = normalizeImages([
    ...(request.media?.images || []),
    ...((request.imageUrls || []).map((imageUrl) => ({ imageUrl }))),
  ]);

  return {
    primaryPost: {
      id: request.tweetId,
      url: normalizeUrl(request.tweetUrl),
      text: request.tweetText.trim(),
      authorHandle: normalizeHandle(request.authorHandle),
      postType: normalizePostType(request.postType),
    },
    quotedPost: request.quotedPost?.tweetText?.trim()
      ? {
          id: request.quotedPost.tweetId?.trim() || null,
          url: normalizeUrl(request.quotedPost.tweetUrl),
          text: request.quotedPost.tweetText.trim(),
          authorHandle: normalizeHandle(request.quotedPost.authorHandle),
        }
      : null,
    media:
      images.length > 0 ||
      Boolean(request.media?.hasVideo || request.media?.hasGif || request.media?.hasLink)
        ? {
            images,
            hasVideo: Boolean(request.media?.hasVideo),
            hasGif: Boolean(request.media?.hasGif),
            hasLink: Boolean(request.media?.hasLink),
          }
        : null,
    conversation:
      request.conversation?.inReplyToPostId || request.conversation?.inReplyToHandle
        ? {
            inReplyToPostId: request.conversation.inReplyToPostId?.trim() || null,
            inReplyToHandle: normalizeHandle(request.conversation.inReplyToHandle),
          }
        : null,
  };
}

export function buildReplySourceContextFromFlatInput(args: {
  sourceText: string;
  sourceUrl?: string | null;
  authorHandle?: string | null;
  postType?: ExtensionOpportunityPostType | null;
  sourceContext?: ReplySourceContext | null;
}): ReplySourceContext {
  if (args.sourceContext) {
    return args.sourceContext;
  }

  return {
    primaryPost: {
      id: "reply-source",
      url: normalizeUrl(args.sourceUrl),
      text: args.sourceText.trim(),
      authorHandle: normalizeHandle(args.authorHandle),
      postType: normalizePostType(args.postType),
    },
    quotedPost: null,
    media: null,
    conversation: null,
  };
}

function pickAnalyzableImages(sourceContext: ReplySourceContext): string[] {
  const seen = new Set<string>();
  const analyzable: string[] = [];
  const images = sourceContext.media?.images || [];
  for (const image of images) {
    const candidate = image.imageDataUrl?.trim() || image.imageUrl?.trim() || "";
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    analyzable.push(candidate);
    if (analyzable.length >= 4) {
      break;
    }
  }

  return analyzable;
}

export async function analyzeReplySourceVisualContext(
  sourceContext: ReplySourceContext,
): Promise<ReplyVisualContextSummary | null> {
  const imageUrls = pickAnalyzableImages(sourceContext);
  if (imageUrls.length === 0) {
    return null;
  }

  const settled = await Promise.allSettled(
    imageUrls.map(async (imageUrl) => {
      const result = await analyzeImageVisualContext({
        imageDataUrl: imageUrl,
      });

      return {
        imageUrl,
        primarySubject: result.visualContext.primary_subject,
        setting: result.visualContext.setting,
        lightingAndMood: result.visualContext.lighting_and_mood,
        readableText: result.visualContext.any_readable_text,
        keyDetails: result.visualContext.key_details,
      };
    }),
  );

  const images = settled
    .flatMap((result) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }

      console.warn("Failed to analyze reply image context:", result.reason);
      return [];
    });

  if (images.length === 0) {
    return null;
  }

  const summaryLines = images.flatMap((image, index) => {
    const prefix = images.length > 1 ? `Image ${index + 1}` : "Image";
    return [
      `${prefix} primary subject: ${image.primarySubject}`,
      `${prefix} setting: ${image.setting}`,
      `${prefix} mood: ${image.lightingAndMood}`,
      image.readableText ? `${prefix} readable text: ${image.readableText}` : null,
      image.keyDetails.length > 0
        ? `${prefix} key details: ${image.keyDetails.slice(0, 4).join(" | ")}`
        : null,
    ].filter((line): line is string => Boolean(line));
  });

  return {
    primarySubject: images.map((image) => image.primarySubject).join(" | "),
    setting: images.map((image) => image.setting).join(" | "),
    lightingAndMood: images.map((image) => image.lightingAndMood).join(" | "),
    readableText: images
      .map((image) => image.readableText.trim())
      .filter(Boolean)
      .join(" | "),
    keyDetails: Array.from(
      new Set(images.flatMap((image) => image.keyDetails.map((detail) => detail.trim()).filter(Boolean))),
    ).slice(0, 12),
    imageCount: images.length,
    images,
    summaryLines,
  };
}
