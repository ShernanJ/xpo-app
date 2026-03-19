import { z } from "zod";

import type {
  ExtensionReplyDraftRequest,
  ExtensionReplyMediaImage,
  ExtensionReplyDraftResponse,
  ExtensionReplyOption,
} from "../../../../lib/extension/types.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function readBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return false;
}

function normalizeReplyStage(value: string) {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "0_to_1k":
    case "0-1k":
    case "0to1k":
      return "0_to_1k" as const;
    case "1k_to_10k":
    case "1k-10k":
    case "1kto10k":
      return "1k_to_10k" as const;
    case "10k_to_50k":
    case "10k-50k":
    case "10kto50k":
      return "10k_to_50k" as const;
    case "50k_plus":
    case "50k+":
    case "50kplus":
      return "50k_plus" as const;
    default:
      return null;
  }
}

function normalizeReplyTone(value: string) {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "safe":
    case "dry":
      return "dry" as const;
    case "bold":
      return "bold" as const;
    case "builder":
      return "builder" as const;
    case "warm":
      return "warm" as const;
    case "playful":
    case "comedic":
    case "casual":
    case "joke":
      return "playful" as const;
    default:
      return null;
  }
}

function normalizePostType(value: string | undefined) {
  switch ((value || "").trim().toLowerCase()) {
    case "original":
    case "reply":
    case "quote":
    case "repost":
    case "unknown":
      return value?.trim().toLowerCase() as NonNullable<ExtensionReplyDraftRequest["postType"]>;
    default:
      return null;
  }
}

function normalizeImage(value: unknown): ExtensionReplyMediaImage | null {
  if (typeof value === "string" && value.trim()) {
    return {
      imageUrl: value.trim(),
    };
  }

  const image = asRecord(value);
  if (!image) {
    return null;
  }

  const imageUrl = readString(image.imageUrl, image.url, image.src);
  const imageDataUrl = readString(image.imageDataUrl, image.dataUrl, image.base64);
  const altText = readString(image.altText, image.alt, image.caption);

  if (!imageUrl && !imageDataUrl && !altText) {
    return null;
  }

  return {
    ...(imageUrl ? { imageUrl: imageUrl.trim() } : {}),
    ...(imageDataUrl ? { imageDataUrl: imageDataUrl.trim() } : {}),
    ...(altText ? { altText: altText.trim() } : {}),
  };
}

function normalizeImages(...values: unknown[]) {
  const normalized: ExtensionReplyMediaImage[] = [];

  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      const image = normalizeImage(entry);
      if (!image) {
        continue;
      }

      const key = JSON.stringify(image);
      if (!normalized.some((existing) => JSON.stringify(existing) === key)) {
        normalized.push(image);
      }
    }
  }

  return normalized;
}

function normalizeQuotedPost(...values: unknown[]) {
  for (const value of values) {
    const quoted = asRecord(value);
    if (!quoted) {
      continue;
    }

    const author = asRecord(quoted.author);
    const tweetText = readString(quoted.tweetText, quoted.postText, quoted.text, quoted.fullText);
    const rawAuthor = typeof quoted.author === "string" ? quoted.author : undefined;
    if (!tweetText.trim()) {
      continue;
    }

    return {
      ...(readString(quoted.tweetId, quoted.postId, quoted.id)
        ? { tweetId: readString(quoted.tweetId, quoted.postId, quoted.id).trim() }
        : {}),
      tweetText: tweetText.trim(),
      ...(readString(
        quoted.authorHandle,
        quoted.handle,
        rawAuthor,
        quoted.authorUsername,
        author?.handle,
        author?.username,
      )
        ? {
            authorHandle: readString(
              quoted.authorHandle,
              quoted.handle,
              rawAuthor,
              quoted.authorUsername,
              author?.handle,
              author?.username,
            )
              .trim()
              .replace(/^@+/, ""),
          }
        : {}),
      ...(readString(quoted.tweetUrl, quoted.postUrl, quoted.url)
        ? { tweetUrl: readString(quoted.tweetUrl, quoted.postUrl, quoted.url).trim() }
        : {}),
    };
  }

  return null;
}

const ExtensionReplyDraftRequestSchema = z
  .object({})
  .passthrough()
  .transform((raw, ctx) => {
    const value = raw as Record<string, unknown>;
    const post = asRecord(value.post);
    const candidate = asRecord(value.candidate);
    const author =
      asRecord(value.author) ||
      asRecord(post?.author) ||
      asRecord(candidate?.author);
    const toneObject = asRecord(value.tone);
    const strategy = asRecord(value.strategy);
    const opportunity = asRecord(value.opportunity);
    const media = asRecord(value.media) || asRecord(post?.media) || asRecord(candidate?.media);
    const conversation =
      asRecord(value.conversation) || asRecord(post?.conversation) || asRecord(candidate?.conversation);
    const tweetId =
      readString(
        value.tweetId,
        value.postId,
        post?.postId,
        candidate?.postId,
        value.tweet_id,
      );
    const tweetText =
      readString(
        value.tweetText,
        value.postText,
        value.text,
        post?.text,
        post?.postText,
        candidate?.text,
        value.sourceText,
      );
    const authorHandle =
      readString(
        value.authorHandle,
        value.handle,
        value.authorUsername,
        value.inReplyToHandle,
        value.author_handle,
        author?.handle,
        author?.username,
        post?.authorHandle,
        candidate?.authorHandle,
      );
    const tweetUrlInput =
      readString(
        value.tweetUrl,
        value.postUrl,
        value.url,
        post?.url,
        candidate?.url,
        value.tweet_url,
        value.sourceUrl,
      );
    const postType = normalizePostType(
      readString(value.postType, value.type, post?.postType, candidate?.postType),
    );
    const quotedPost = normalizeQuotedPost(
      value.quotedPost,
      value.quote,
      value.quotedTweet,
      value.quotedStatus,
      post?.quotedPost,
      post?.quote,
      candidate?.quotedPost,
    );
    const images = normalizeImages(
      value.imageUrls,
      value.images,
      media?.images,
      media?.photos,
      media?.imageUrls,
    );
    const stageInput =
      readString(
        value.stage,
        value.growthStage,
        strategy?.stage,
        strategy?.growthStage,
        opportunity?.stage,
      ) || "0_to_1k";
    const toneInput =
      readString(
        value.tone,
        value.risk,
        toneObject?.risk,
        toneObject?.tone,
        strategy?.tone,
      ) || "builder";
    const goal =
      readString(
        value.goal,
        value.primaryGoal,
        strategy?.goal,
        strategy?.primaryGoal,
        opportunity?.goal,
      ) || "followers";
    const heuristicScore =
      typeof value.heuristicScore === "number"
        ? value.heuristicScore
        : typeof value.score === "number"
          ? value.score
          : typeof opportunity?.score === "number"
            ? opportunity.score
            : typeof candidate?.score === "number"
              ? candidate.score
              : undefined;
    const heuristicTier =
      readString(
        value.heuristicTier,
        value.tier,
        opportunity?.heuristicTier,
        opportunity?.tier,
      ) || undefined;
    const synthesizedTweetUrl =
      tweetUrlInput.trim() ||
      (authorHandle.trim() && tweetId.trim()
        ? `https://x.com/${authorHandle.trim().replace(/^@+/, "")}/status/${tweetId.trim()}`
        : "");

    if (!tweetId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tweetId"],
        message: "tweetId is required.",
      });
    }

    if (!tweetText.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tweetText"],
        message: "tweetText is required.",
      });
    }

    if (!authorHandle.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorHandle"],
        message: "authorHandle is required.",
      });
    }

    if (!synthesizedTweetUrl.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tweetUrl"],
        message: "tweetUrl is required.",
      });
    } else if (!z.string().trim().url().safeParse(synthesizedTweetUrl).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tweetUrl"],
        message: "tweetUrl must be a valid URL.",
      });
    }

    if (typeof heuristicScore === "number" && !Number.isFinite(heuristicScore)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["heuristicScore"],
        message: "heuristicScore must be a finite number.",
      });
    }

    const stage = normalizeReplyStage(stageInput);
    if (!stage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stage"],
        message: "Invalid option: expected one of \"0_to_1k\"|\"1k_to_10k\"|\"10k_to_50k\"|\"50k_plus\".",
      });
    }

    const tone = normalizeReplyTone(toneInput);
    if (!tone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tone"],
        message: "Invalid option: expected one of \"dry\"|\"bold\"|\"builder\"|\"warm\"|\"playful\".",
      });
    }

    if (!stage || !tone) {
      return z.NEVER;
    }

    return {
      tweetId: tweetId.trim(),
      tweetText: tweetText.trim(),
      authorHandle: authorHandle.trim().replace(/^@+/, ""),
      tweetUrl: synthesizedTweetUrl.trim(),
      ...(postType ? { postType } : {}),
      ...(quotedPost ? { quotedPost } : {}),
      ...(images.length > 0 ||
      readBoolean(media?.hasVideo, media?.video) ||
      readBoolean(media?.hasGif, media?.gif) ||
      readBoolean(media?.hasLink, media?.link)
        ? {
            media: {
              images,
              hasVideo: readBoolean(media?.hasVideo, media?.video),
              hasGif: readBoolean(media?.hasGif, media?.gif),
              hasLink: readBoolean(media?.hasLink, media?.link),
            },
          }
        : {}),
      ...(readString(
        conversation?.inReplyToPostId,
        conversation?.parentPostId,
        conversation?.replyToPostId,
      ) ||
      readString(conversation?.inReplyToHandle, conversation?.replyToHandle)
        ? {
            conversation: {
              ...(readString(
                conversation?.inReplyToPostId,
                conversation?.parentPostId,
                conversation?.replyToPostId,
              )
                ? {
                    inReplyToPostId: readString(
                      conversation?.inReplyToPostId,
                      conversation?.parentPostId,
                      conversation?.replyToPostId,
                    ).trim(),
                  }
                : {}),
              ...(readString(conversation?.inReplyToHandle, conversation?.replyToHandle)
                ? {
                    inReplyToHandle: readString(
                      conversation?.inReplyToHandle,
                      conversation?.replyToHandle,
                    )
                      .trim()
                      .replace(/^@+/, ""),
                  }
                : {}),
            },
          }
        : {}),
      stage,
      tone,
      goal: goal.trim(),
      heuristicScore,
      heuristicTier: heuristicTier?.trim(),
    } satisfies ExtensionReplyDraftRequest;
  });

export function parseExtensionReplyDraftRequest(body: unknown):
  | { ok: true; data: ExtensionReplyDraftRequest }
  | { ok: false; message: string } {
  const parsed = ExtensionReplyDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension reply draft request.",
    };
  }

  return { ok: true, data: parsed.data };
}

function isValidOption(option: ExtensionReplyOption): boolean {
  if (!option?.id?.trim() || !option?.text?.trim()) {
    return false;
  }

  const validLabel = option.label === "safe" || option.label === "bold";
  if (!validLabel) {
    return false;
  }

  if (!option.intent) {
    return true;
  }

  return (
    Boolean(option.intent.label) &&
    Boolean(option.intent.strategyPillar?.trim()) &&
    Boolean(option.intent.anchor?.trim()) &&
    Boolean(option.intent.rationale?.trim())
  );
}

export function assertExtensionReplyDraftResponseShape(
  response: ExtensionReplyDraftResponse,
): boolean {
  if (!Array.isArray(response.options) || response.options.length < 1 || response.options.length > 2) {
    return false;
  }

  return response.options.every(isValidOption);
}
