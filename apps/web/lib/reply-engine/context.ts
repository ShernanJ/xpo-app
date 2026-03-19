import type {
  ExtensionOpportunityCandidate,
  ExtensionOpportunityPostType,
  ExtensionReplyDraftRequest,
} from "../extension/types.ts";

import {
  analyzeReplyImageVisualContext,
  buildFallbackReplyImageContext,
} from "./imageAnalysis.ts";
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

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
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

export function buildReplySourceContextFromOpportunityCandidate(
  candidate: ExtensionOpportunityCandidate,
): ReplySourceContext {
  return {
    primaryPost: {
      id: candidate.postId,
      url: normalizeUrl(candidate.url),
      text: candidate.text.trim(),
      authorHandle: normalizeHandle(candidate.author.handle),
      postType: normalizePostType(candidate.postType),
    },
    quotedPost: null,
    media:
      candidate.media.hasMedia ||
      (candidate.media.images?.length || 0) > 0 ||
      candidate.media.hasVideo ||
      candidate.media.hasGif ||
      candidate.media.hasLink
        ? {
            images: normalizeImages(candidate.media.images || []),
            hasVideo: candidate.media.hasVideo,
            hasGif: candidate.media.hasGif,
            hasLink: candidate.media.hasLink,
          }
        : null,
    conversation:
      candidate.conversation.inReplyToPostId || candidate.conversation.inReplyToHandle
        ? {
            inReplyToPostId: candidate.conversation.inReplyToPostId?.trim() || null,
            inReplyToHandle: normalizeHandle(candidate.conversation.inReplyToHandle),
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

function pickReplySourceImages(sourceContext: ReplySourceContext): ReplySourceImage[] {
  const seen = new Set<string>();
  const analyzable: ReplySourceImage[] = [];
  const images = sourceContext.media?.images || [];
  for (const image of images) {
    const candidate =
      image.imageDataUrl?.trim() || image.imageUrl?.trim() || image.altText?.trim() || "";
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    analyzable.push(image);
    if (analyzable.length >= 4) {
      break;
    }
  }

  return analyzable;
}

function mergeSceneTypes(values: ReplyVisualContextSummary["images"]): ReplyVisualContextSummary["sceneType"] {
  const unique = Array.from(new Set(values.map((image) => image.sceneType)));
  if (unique.length === 0) {
    return "unknown";
  }
  if (unique.length === 1) {
    return unique[0];
  }
  return "mixed";
}

function pickPrimaryImageRole(values: ReplyVisualContextSummary["images"]): ReplyVisualContextSummary["imageRole"] {
  const priority: Array<ReplyVisualContextSummary["imageRole"]> = [
    "punchline",
    "proof",
    "reaction",
    "context",
    "decorative",
    "none",
  ];

  for (const role of priority) {
    if (values.some((image) => image.imageRole === role)) {
      return role;
    }
  }

  return "none";
}

function buildReplyVisualSummaryFromImages(
  images: ReplyVisualContextSummary["images"],
): ReplyVisualContextSummary | null {
  if (images.length === 0) {
    return null;
  }

  const imageRole = pickPrimaryImageRole(images);
  const readableText = images
    .map((image) => normalizeWhitespace(image.readableText))
    .filter(Boolean)
    .join(" | ");
  const brandSignals = Array.from(
    new Set(images.flatMap((image) => image.brandSignals.map((signal) => normalizeWhitespace(signal)).filter(Boolean))),
  ).slice(0, 8);
  const absurdityMarkers = Array.from(
    new Set(
      images.flatMap((image) => image.absurdityMarkers.map((marker) => normalizeWhitespace(marker)).filter(Boolean)),
    ),
  ).slice(0, 8);
  const artifactTargetHint =
    images.map((image) => normalizeWhitespace(image.artifactTargetHint)).find(Boolean) || "";
  const imageArtifactType =
    images.map((image) => image.imageArtifactType).find((type) => type && type !== "unknown") ||
    (images.length > 1 ? "mixed" : "unknown");
  const imageReplyAnchor =
    images
      .map((image) => image.jokeAnchor.trim())
      .find(Boolean) ||
    readableText ||
    images
      .flatMap((image) => image.keyDetails)
      .find(Boolean) ||
    "";
  const summaryLines = images.flatMap((image, index) => {
    const prefix = images.length > 1 ? `Image ${index + 1}` : "Image";
    return [
      `${prefix} scene type: ${image.sceneType}`,
      `${prefix} artifact type: ${image.imageArtifactType}`,
      `${prefix} role: ${image.imageRole}`,
      `${prefix} primary subject: ${image.primarySubject}`,
      `${prefix} setting: ${image.setting}`,
      `${prefix} mood: ${image.lightingAndMood}`,
      image.readableText ? `${prefix} readable text: ${image.readableText}` : null,
      image.brandSignals.length > 0 ? `${prefix} brand signals: ${image.brandSignals.join(" | ")}` : null,
      image.absurdityMarkers.length > 0
        ? `${prefix} absurdity markers: ${image.absurdityMarkers.join(" | ")}`
        : null,
      image.artifactTargetHint ? `${prefix} artifact target: ${image.artifactTargetHint}` : null,
      image.jokeAnchor ? `${prefix} reply anchor: ${image.jokeAnchor}` : null,
      image.keyDetails.length > 0
        ? `${prefix} key details: ${image.keyDetails.slice(0, 4).join(" | ")}`
        : null,
      image.replyRelevance ? `${prefix} reply relevance: ${image.replyRelevance}` : null,
    ].filter((line): line is string => Boolean(line));
  });

  return {
    primarySubject: images.map((image) => image.primarySubject).join(" | "),
    setting: images.map((image) => image.setting).join(" | "),
    lightingAndMood: images.map((image) => image.lightingAndMood).join(" | "),
    readableText,
    keyDetails: Array.from(
      new Set(images.flatMap((image) => image.keyDetails.map((detail) => detail.trim()).filter(Boolean))),
    ).slice(0, 12),
    brandSignals,
    absurdityMarkers,
    artifactTargetHint,
    imageCount: images.length,
    sceneType: mergeSceneTypes(images),
    imageArtifactType,
    imageRole,
    imageReplyAnchor,
    shouldReferenceImageText: Boolean(
      readableText && (imageRole === "punchline" || imageRole === "proof" || imageRole === "context"),
    ),
    replyRelevance:
      images.find((image) => image.imageRole === imageRole)?.replyRelevance ||
      (imageRole === "punchline" || imageRole === "proof" ? "high" : "medium"),
    images,
    summaryLines,
  };
}

export function deriveHeuristicReplySourceVisualContext(
  sourceContext: ReplySourceContext,
): ReplyVisualContextSummary | null {
  const images = pickReplySourceImages(sourceContext)
    .map((image) => {
      const fallback = buildFallbackReplyImageContext({
        sourceText: sourceContext.primaryPost.text,
        quotedText: sourceContext.quotedPost?.text || null,
        image,
      });
      if (!fallback) {
        return null;
      }

      return {
        imageUrl: image.imageUrl?.trim() || null,
        source: "alt_text" as const,
        sceneType: fallback.scene_type,
        imageRole: fallback.image_role,
        primarySubject: fallback.primary_subject,
        setting: fallback.setting,
        lightingAndMood: fallback.lighting_and_mood,
        readableText: fallback.readable_text,
        keyDetails: fallback.key_details,
        brandSignals: fallback.brand_signals,
        absurdityMarkers: fallback.absurdity_markers,
        artifactTargetHint: fallback.artifact_target_hint,
        imageArtifactType: fallback.image_artifact_type,
        jokeAnchor: fallback.joke_anchor,
        replyRelevance: fallback.reply_relevance,
      };
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  return buildReplyVisualSummaryFromImages(images);
}

export async function analyzeReplySourceVisualContext(
  sourceContext: ReplySourceContext,
): Promise<ReplyVisualContextSummary | null> {
  const sourceImages = pickReplySourceImages(sourceContext);
  if (sourceImages.length === 0) {
    return null;
  }

  const settled = await Promise.allSettled(
    sourceImages.map(async (image) => {
      const result = await analyzeReplyImageVisualContext({
        sourceText: sourceContext.primaryPost.text,
        quotedText: sourceContext.quotedPost?.text || null,
        image,
      });

      return {
        imageUrl: image.imageUrl?.trim() || null,
        source: result.source,
        sceneType: result.visualContext.scene_type,
        imageRole: result.visualContext.image_role,
        primarySubject: result.visualContext.primary_subject,
        setting: result.visualContext.setting,
        lightingAndMood: result.visualContext.lighting_and_mood,
        readableText: result.visualContext.readable_text,
        keyDetails: result.visualContext.key_details,
        brandSignals: result.visualContext.brand_signals,
        absurdityMarkers: result.visualContext.absurdity_markers,
        artifactTargetHint: result.visualContext.artifact_target_hint,
        imageArtifactType: result.visualContext.image_artifact_type,
        jokeAnchor: result.visualContext.joke_anchor,
        replyRelevance: result.visualContext.reply_relevance,
      };
    }),
  );

  const analyzedImages = settled
    .flatMap((result) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }

      console.warn("Failed to analyze reply image context:", result.reason);
      return [];
    });

  return (
    buildReplyVisualSummaryFromImages(analyzedImages) ||
    deriveHeuristicReplySourceVisualContext(sourceContext)
  );
}
