import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";
import {
  DEFAULT_IMAGE_TO_POST_VISION_MODEL,
  IMAGE_TO_POST_VISION_SYSTEM_PROMPT,
  ImageVisionContextSchema,
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
  const images = normalizeImages(request.media?.images);

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

function pickAnalyzableImage(sourceContext: ReplySourceContext): string | null {
  const images = sourceContext.media?.images || [];
  for (const image of images) {
    if (image.imageDataUrl?.trim()) {
      return image.imageDataUrl.trim();
    }
    if (image.imageUrl?.trim()) {
      return image.imageUrl.trim();
    }
  }

  return null;
}

function buildImagePrompt(imageUrl: string): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: IMAGE_TO_POST_VISION_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Analyze the attached reply-target image and return only the requested JSON object.",
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
          },
        },
      ],
    },
  ];
}

export async function analyzeReplySourceVisualContext(
  sourceContext: ReplySourceContext,
): Promise<ReplyVisualContextSummary | null> {
  const imageUrl = pickAnalyzableImage(sourceContext);
  if (!imageUrl) {
    return null;
  }

  try {
    const raw = await fetchJsonFromGroq<unknown>({
      model: DEFAULT_IMAGE_TO_POST_VISION_MODEL,
      temperature: 0,
      max_tokens: 1024,
      jsonRepairInstruction:
        "Return ONLY valid JSON with keys primary_subject, setting, lighting_and_mood, any_readable_text, key_details.",
      messages: buildImagePrompt(imageUrl),
    });

    const parsed = ImageVisionContextSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }

    const summaryLines = [
      `Primary subject: ${parsed.data.primary_subject}`,
      `Setting: ${parsed.data.setting}`,
      `Mood: ${parsed.data.lighting_and_mood}`,
      parsed.data.any_readable_text
        ? `Readable text: ${parsed.data.any_readable_text}`
        : null,
      parsed.data.key_details.length > 0
        ? `Key details: ${parsed.data.key_details.slice(0, 4).join(" | ")}`
        : null,
    ].filter((line): line is string => Boolean(line));

    return {
      primarySubject: parsed.data.primary_subject,
      setting: parsed.data.setting,
      lightingAndMood: parsed.data.lighting_and_mood,
      readableText: parsed.data.any_readable_text,
      keyDetails: parsed.data.key_details,
      summaryLines,
    };
  } catch (error) {
    console.warn("Failed to analyze reply image context:", error);
    return null;
  }
}
