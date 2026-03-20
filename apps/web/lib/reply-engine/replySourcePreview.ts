import type { ReplySourceContext, ReplySourceImage } from "./types.ts";

export type ReplySourcePreviewMediaType = "image" | "video" | "gif";

export interface ReplySourcePreviewAuthor {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface ReplySourcePreviewMediaItem {
  type: ReplySourcePreviewMediaType;
  url: string | null;
  altText?: string | null;
}

export interface ReplySourcePreviewPost {
  postId: string | null;
  sourceUrl: string | null;
  author: ReplySourcePreviewAuthor;
  text: string;
  media: ReplySourcePreviewMediaItem[];
}

export interface ReplySourcePreview extends ReplySourcePreviewPost {
  quotedPost?: ReplySourcePreviewPost | null;
  conversation?: {
    inReplyToPostId?: string | null;
    inReplyToHandle?: string | null;
  } | null;
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function normalizeUsername(value: string | null | undefined): string | null {
  const normalized = normalizeString(value)?.replace(/^@+/, "").toLowerCase() ?? null;
  return normalized || null;
}

function dedupeMediaItems(items: ReplySourcePreviewMediaItem[]): ReplySourcePreviewMediaItem[] {
  const seen = new Set<string>();
  const deduped: ReplySourcePreviewMediaItem[] = [];

  for (const item of items) {
    const key = `${item.type}:${item.url ?? ""}:${item.altText ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function buildReplySourcePreviewAuthor(args?: {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean | null;
} | null): ReplySourcePreviewAuthor {
  return {
    displayName: normalizeString(args?.displayName),
    username: normalizeUsername(args?.username),
    avatarUrl: normalizeString(args?.avatarUrl),
    isVerified: args?.isVerified === true,
  };
}

export function buildReplyPreviewMediaItems(args: {
  images?: ReplySourceImage[] | null;
  hasVideo?: boolean | null;
  hasGif?: boolean | null;
}): ReplySourcePreviewMediaItem[] {
  const imageItems = (args.images || [])
    .map((image) => {
      const url = normalizeString(image.imageUrl);
      if (!url) {
        return null;
      }

      return {
        type: "image" as const,
        url,
        altText: normalizeString(image.altText),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const nonImageItems: ReplySourcePreviewMediaItem[] = [];
  if (args.hasVideo) {
    nonImageItems.push({
      type: "video",
      url: null,
      altText: null,
    });
  }
  if (args.hasGif) {
    nonImageItems.push({
      type: "gif",
      url: null,
      altText: null,
    });
  }

  return dedupeMediaItems([...imageItems, ...nonImageItems]).slice(0, 6);
}

export function buildReplySourcePreviewFromContext(args: {
  sourceContext: ReplySourceContext;
  primaryAuthor?: ReplySourcePreviewAuthor | null;
  quotedAuthor?: ReplySourcePreviewAuthor | null;
  primaryMedia?: ReplySourceImage[] | null;
  quotedMedia?: ReplySourceImage[] | null;
}): ReplySourcePreview {
  const primaryMedia = buildReplyPreviewMediaItems({
    images: args.primaryMedia ?? args.sourceContext.media?.images,
    hasVideo: args.sourceContext.media?.hasVideo,
    hasGif: args.sourceContext.media?.hasGif,
  });

  const quotedMedia = buildReplyPreviewMediaItems({
    images:
      args.quotedMedia ??
      (args.sourceContext.media?.images || []).filter((image) =>
        (image.altText || "").toLowerCase().startsWith("quoted post image:"),
      ),
    hasVideo: false,
    hasGif: false,
  });

  return {
    postId: normalizeString(args.sourceContext.primaryPost.id),
    sourceUrl: normalizeString(args.sourceContext.primaryPost.url),
    author:
      args.primaryAuthor ||
      buildReplySourcePreviewAuthor({
        username: args.sourceContext.primaryPost.authorHandle,
      }),
    text: args.sourceContext.primaryPost.text,
    media: primaryMedia,
    quotedPost: args.sourceContext.quotedPost
      ? {
          postId: normalizeString(args.sourceContext.quotedPost.id),
          sourceUrl: normalizeString(args.sourceContext.quotedPost.url),
          author:
            args.quotedAuthor ||
            buildReplySourcePreviewAuthor({
              username: args.sourceContext.quotedPost.authorHandle,
            }),
          text: args.sourceContext.quotedPost.text,
          media: quotedMedia,
        }
      : null,
    conversation: args.sourceContext.conversation
      ? {
          inReplyToPostId:
            normalizeString(args.sourceContext.conversation.inReplyToPostId) || null,
          inReplyToHandle:
            normalizeUsername(args.sourceContext.conversation.inReplyToHandle) || null,
        }
      : null,
  };
}
