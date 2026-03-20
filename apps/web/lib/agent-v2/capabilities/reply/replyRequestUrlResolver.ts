import type { ReplySourceContext, ReplySourceImage } from "../../../reply-engine/types.ts";

import {
  isStandaloneXStatusUrl,
  parseXStatusUrl,
  type ParsedXStatusUrl,
} from "./replyStatusUrl.ts";

const DEFAULT_X_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SYNDICATION_USER_AGENT =
  "Googlebot/2.1 (+http://www.google.com/bot.html)";

export interface ResolvedReplyRequestSource {
  sourceText: string;
  sourceUrl: string;
  authorHandle: string | null;
  sourceContext: ReplySourceContext;
}

interface ResolvedHtmlStatusDetails {
  sourceText: string;
  sourceUrl: string;
  authorHandle: string | null;
  imageUrls: string[];
}

interface ResolvedSyndicationStatusDetails {
  sourceText: string;
  sourceUrl: string;
  authorHandle: string | null;
  sourceContext: ReplySourceContext;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value).replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function parseMetaContents(html: string, keys: string[]): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`,
        "gi",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedKey}["']`,
        "gi",
      ),
    ];

    for (const pattern of patterns) {
      let match = pattern.exec(html);
      while (match) {
        const normalized = normalizeWhitespace(match[1] || "");
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          results.push(normalized);
        }
        match = pattern.exec(html);
      }
    }
  }

  return results;
}

function parseTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function parseCanonicalStatusUrl(html: string): ParsedXStatusUrl | null {
  const match = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  if (!match?.[1]) {
    return null;
  }

  return parseXStatusUrl(decodeHtmlEntities(match[1]));
}

function parseQuotedStatusText(value: string): string | null {
  const match = value.match(/[“"]([^"”]{20,})[”"]/);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function sanitizeStatusTextCandidate(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const quoted = parseQuotedStatusText(normalized);
  if (quoted) {
    return quoted;
  }

  const withoutSuffix = normalized.replace(/\s+\/\s*(?:X|Twitter)\s*$/i, "").trim();
  const withoutPrefix = withoutSuffix.replace(/^.+?\s+on\s+(?:X|Twitter):\s*/i, "").trim();
  const stripped = withoutPrefix.replace(/^[“"'`]+|[”"'`]+$/g, "").trim();

  if (!stripped) {
    return null;
  }

  const lowered = stripped.toLowerCase();
  if (
    lowered.includes("join x today") ||
    lowered.includes("log in to x") ||
    lowered.includes("see new posts") ||
    lowered.includes("it's what's happening") ||
    lowered === "x"
  ) {
    return null;
  }

  return stripped.length >= 12 ? stripped : null;
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    const raw = match[1]?.trim();
    if (!raw) {
      match = pattern.exec(html);
      continue;
    }

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed blocks.
    }

    match = pattern.exec(html);
  }

  return blocks;
}

function flattenJsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLdNodes(entry));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const graph = Array.isArray(record["@graph"]) ? record["@graph"] : null;
  return graph ? graph.flatMap((entry) => flattenJsonLdNodes(entry)) : [record];
}

function readJsonLdString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? normalizeWhitespace(value) : null;
}

function collectJsonLdImageUrls(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectJsonLdImageUrls(entry));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return [
    ...collectJsonLdImageUrls(record.url),
    ...collectJsonLdImageUrls(record.contentUrl),
    ...collectJsonLdImageUrls(record.image),
  ];
}

function readAuthorHandleFromJsonLd(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const candidates = [
    readJsonLdString(record.alternateName),
    readJsonLdString(record.identifier),
    readJsonLdString(record.url),
    readJsonLdString(record.name),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const urlMatch = parseXStatusUrl(candidate);
    if (urlMatch?.authorHandle) {
      return urlMatch.authorHandle;
    }

    const handleMatch = candidate.match(/@?([A-Za-z0-9_]{1,15})$/);
    if (handleMatch?.[1]) {
      return handleMatch[1].toLowerCase();
    }
  }

  return null;
}

function prioritizeImageUrls(values: string[]): string[] {
  const unique = Array.from(
    new Set(
      values
        .map((value) => normalizeWhitespace(value))
        .filter((value) => value.startsWith("http://") || value.startsWith("https://")),
    ),
  );

  const likelyTweetMedia = unique.filter(
    (value) =>
      /pbs\.twimg\.com/i.test(value) &&
      !/profile_images|profile_banners|semantic_core_img|abs\.twimg\.com/i.test(value),
  );

  return (likelyTweetMedia.length > 0 ? likelyTweetMedia : unique).slice(0, 4);
}

function buildStatusUrl(args: {
  authorHandle?: string | null;
  postId?: string | null;
}): string | null {
  const postId = asString(args.postId);
  if (!postId) {
    return null;
  }

  const authorHandle = asString(args.authorHandle)?.replace(/^@+/, "").toLowerCase() || null;
  return authorHandle
    ? `https://x.com/${authorHandle}/status/${postId}`
    : `https://x.com/i/web/status/${postId}`;
}

function readStatusText(value: Record<string, unknown>): string | null {
  const noteTweet = asRecord(value.note_tweet);
  const noteTweetResults = asRecord(noteTweet?.note_tweet_results);
  const noteTweetResult = asRecord(noteTweetResults?.result);
  return (
    asString(value.full_text) ||
    asString(value.text) ||
    asString(value.tweetText) ||
    asString(value.note_tweet_text) ||
    asString(noteTweet?.text) ||
    asString(noteTweetResult?.text)
  );
}

function readStatusId(value: Record<string, unknown>): string | null {
  return (
    asString(value.id_str) ||
    asString(value.rest_id) ||
    asString(value.tweetId) ||
    asString(value.id)
  );
}

function readStatusHandle(value: Record<string, unknown>): string | null {
  const user = asRecord(value.user);
  return (
    asString(value.authorHandle)?.replace(/^@+/, "").toLowerCase() ||
    asString(user?.screen_name)?.replace(/^@+/, "").toLowerCase() ||
    asString(asRecord(value.author)?.screen_name)?.replace(/^@+/, "").toLowerCase() ||
    null
  );
}

function normalizeImageAltText(value: string | null, originLabel: string): string | null {
  const normalized = value ? normalizeWhitespace(value) : "";
  if (!normalized) {
    return null;
  }

  return originLabel === "quoted"
    ? `Quoted post image: ${normalized}`
    : normalized;
}

function collectMediaImages(args: {
  value: Record<string, unknown>;
  originLabel: "primary" | "quoted";
}): ReplySourceImage[] {
  const images: ReplySourceImage[] = [];
  const candidates = [
    ...(Array.isArray(args.value.mediaDetails) ? args.value.mediaDetails : []),
    ...(Array.isArray(args.value.photos) ? args.value.photos : []),
    ...(Array.isArray(asRecord(args.value.entities)?.media)
      ? (asRecord(args.value.entities)?.media as unknown[])
      : []),
    ...(Array.isArray(asRecord(args.value.extended_entities)?.media)
      ? (asRecord(args.value.extended_entities)?.media as unknown[])
      : []),
  ];

  for (const candidateValue of candidates) {
    const candidate = asRecord(candidateValue);
    if (!candidate) {
      continue;
    }

    const type = asString(candidate.type)?.toLowerCase() || null;
    const imageUrl =
      asString(candidate.media_url_https) ||
      asString(candidate.media_url) ||
      asString(candidate.url) ||
      asString(candidate.imageUrl);
    const altText = normalizeImageAltText(
      asString(candidate.ext_alt_text) ||
        asString(candidate.alt_text) ||
        asString(candidate.altText),
      args.originLabel,
    );

    if (imageUrl && type !== "video" && type !== "animated_gif") {
      images.push({
        imageUrl,
        ...(altText ? { altText } : {}),
      });
    }
  }

  const deduped = new Map<string, ReplySourceImage>();
  for (const image of images) {
    const key = JSON.stringify(image);
    if (!deduped.has(key)) {
      deduped.set(key, image);
    }
  }

  return Array.from(deduped.values()).slice(0, 4);
}

function collectMediaFlags(value: Record<string, unknown>) {
  const candidates = [
    ...(Array.isArray(value.mediaDetails) ? value.mediaDetails : []),
    ...(Array.isArray(value.photos) ? value.photos : []),
    ...(Array.isArray(asRecord(value.entities)?.media)
      ? (asRecord(value.entities)?.media as unknown[])
      : []),
    ...(Array.isArray(asRecord(value.extended_entities)?.media)
      ? (asRecord(value.extended_entities)?.media as unknown[])
      : []),
  ];

  let hasVideo = false;
  let hasGif = false;

  for (const candidateValue of candidates) {
    const candidate = asRecord(candidateValue);
    if (!candidate) {
      continue;
    }

    const type = asString(candidate.type)?.toLowerCase() || null;
    if (type === "video") {
      hasVideo = true;
    }
    if (type === "animated_gif" || type === "gif") {
      hasGif = true;
    }
  }

  return { hasVideo, hasGif };
}

function resolveSyndicationPostType(value: Record<string, unknown>) {
  if (asRecord(value.quoted_tweet)) {
    return "quote" as const;
  }
  if (
    asString(value.in_reply_to_status_id_str) ||
    asString(value.in_reply_to_screen_name) ||
    asString(value.in_reply_to_status_id)
  ) {
    return "reply" as const;
  }
  return "original" as const;
}

function resolveReplyRequestSourceFromSyndicationPayload(args: {
  parsedUrl: ParsedXStatusUrl;
  payload: unknown;
}): ResolvedSyndicationStatusDetails | null {
  const root = asRecord(args.payload);
  if (!root) {
    return null;
  }

  const sourceText = readStatusText(root);
  if (!sourceText) {
    return null;
  }

  const sourceId = readStatusId(root) || args.parsedUrl.postId;
  const authorHandle = readStatusHandle(root) || args.parsedUrl.authorHandle || null;
  const sourceUrl =
    asString(root.url) ||
    buildStatusUrl({
      authorHandle,
      postId: sourceId,
    }) ||
    args.parsedUrl.canonicalUrl;
  const quoted = asRecord(root.quoted_tweet);
  const quotedText = quoted ? readStatusText(quoted) : null;
  const quotedAuthorHandle = quoted ? readStatusHandle(quoted) : null;
  const quotedId = quoted ? readStatusId(quoted) : null;
  const primaryImages = collectMediaImages({
    value: root,
    originLabel: "primary",
  });
  const quotedImages = quoted
    ? collectMediaImages({
        value: quoted,
        originLabel: "quoted",
      })
    : [];
  const primaryFlags = collectMediaFlags(root);
  const quotedFlags = quoted ? collectMediaFlags(quoted) : { hasVideo: false, hasGif: false };

  const sourceContext: ReplySourceContext = {
    primaryPost: {
      id: sourceId,
      url: sourceUrl,
      text: sourceText,
      authorHandle,
      postType: resolveSyndicationPostType(root),
    },
    quotedPost:
      quoted && quotedText
        ? {
            id: quotedId,
            url:
              asString(quoted.url) ||
              buildStatusUrl({
                authorHandle: quotedAuthorHandle,
                postId: quotedId,
              }),
            text: quotedText,
            authorHandle: quotedAuthorHandle,
          }
        : null,
    media:
      primaryImages.length > 0 ||
      quotedImages.length > 0 ||
      primaryFlags.hasVideo ||
      primaryFlags.hasGif ||
      quotedFlags.hasVideo ||
      quotedFlags.hasGif
        ? {
            images: [...primaryImages, ...quotedImages].slice(0, 4),
            hasVideo: primaryFlags.hasVideo || quotedFlags.hasVideo,
            hasGif: primaryFlags.hasGif || quotedFlags.hasGif,
            hasLink: false,
          }
        : null,
    conversation:
      asString(root.in_reply_to_status_id_str) || asString(root.in_reply_to_screen_name)
        ? {
            inReplyToPostId:
              asString(root.in_reply_to_status_id_str) ||
              asString(root.in_reply_to_status_id) ||
              null,
            inReplyToHandle:
              asString(root.in_reply_to_screen_name)?.replace(/^@+/, "").toLowerCase() || null,
          }
        : null,
  };

  return {
    sourceText,
    sourceUrl,
    authorHandle,
    sourceContext,
  };
}

async function fetchSyndicationTweetResult(postId: string): Promise<unknown | null> {
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
  url.searchParams.set("id", postId);
  url.searchParams.set("lang", "en");
  url.searchParams.set(
    "token",
    Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "replydraft",
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": SYNDICATION_USER_AGENT,
      referer: "https://x.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function extractReplyRequestStatusDetailsFromHtml(args: {
  inputUrl: string;
  html: string;
}): ResolvedHtmlStatusDetails | null {
  const parsedInput = parseXStatusUrl(args.inputUrl);
  if (!parsedInput) {
    return null;
  }

  const parsedCanonical = parseCanonicalStatusUrl(args.html);
  const resolvedUrl = parsedCanonical?.canonicalUrl || parsedInput.canonicalUrl;
  const resolvedAuthorHandle = parsedCanonical?.authorHandle || parsedInput.authorHandle;
  const textCandidates: string[] = [];
  const imageCandidates: string[] = [];
  let jsonLdAuthorHandle: string | null = null;

  for (const block of parseJsonLdBlocks(args.html)) {
    for (const node of flattenJsonLdNodes(block)) {
      const text = sanitizeStatusTextCandidate(
        readJsonLdString(node.articleBody) ||
          readJsonLdString(node.description) ||
          readJsonLdString(node.text) ||
          readJsonLdString(node.headline) ||
          "",
      );
      if (text) {
        textCandidates.push(text);
      }

      if (!jsonLdAuthorHandle) {
        jsonLdAuthorHandle = readAuthorHandleFromJsonLd(node.author);
      }

      imageCandidates.push(...collectJsonLdImageUrls(node.image));
      imageCandidates.push(...collectJsonLdImageUrls(node.associatedMedia));
    }
  }

  textCandidates.push(
    ...parseMetaContents(args.html, [
      "twitter:description",
      "og:description",
      "description",
    ])
      .map((value) => sanitizeStatusTextCandidate(value))
      .filter((value): value is string => Boolean(value)),
  );

  const title = parseTitle(args.html);
  if (title) {
    const sanitizedTitle = sanitizeStatusTextCandidate(title);
    if (sanitizedTitle) {
      textCandidates.push(sanitizedTitle);
    }
  }

  imageCandidates.push(
    ...parseMetaContents(args.html, [
      "twitter:image",
      "twitter:image:src",
      "og:image",
      "og:image:url",
      "og:image:secure_url",
    ]),
  );

  const sourceText = [...textCandidates].sort((left, right) => right.length - left.length)[0] || null;
  if (!sourceText) {
    return null;
  }

  return {
    sourceText,
    sourceUrl: resolvedUrl,
    authorHandle: jsonLdAuthorHandle || resolvedAuthorHandle || null,
    imageUrls: prioritizeImageUrls(imageCandidates),
  };
}

export async function resolveReplyRequestSourceFromStatusUrl(
  input: string,
): Promise<ResolvedReplyRequestSource | null> {
  const parsed = parseXStatusUrl(input);
  if (!parsed) {
    return null;
  }

  const syndicationPayload = await fetchSyndicationTweetResult(parsed.postId);
  const syndicationDetails = resolveReplyRequestSourceFromSyndicationPayload({
    parsedUrl: parsed,
    payload: syndicationPayload,
  });
  if (syndicationDetails) {
    return {
      sourceText: syndicationDetails.sourceText,
      sourceUrl: syndicationDetails.sourceUrl,
      authorHandle: syndicationDetails.authorHandle,
      sourceContext: syndicationDetails.sourceContext,
    };
  }

  const response = await fetch(parsed.canonicalUrl, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        process.env.X_WEB_USER_AGENT?.trim() || DEFAULT_X_WEB_USER_AGENT,
      referer: "https://x.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const details = extractReplyRequestStatusDetailsFromHtml({
    inputUrl: parsed.canonicalUrl,
    html,
  });

  if (!details) {
    return null;
  }

  const sourceContext: ReplySourceContext = {
    primaryPost: {
      id: parsed.postId,
      url: details.sourceUrl,
      text: details.sourceText,
      authorHandle: details.authorHandle,
      postType: "original",
    },
    quotedPost: null,
    media:
      details.imageUrls.length > 0
        ? {
            images: details.imageUrls.map((imageUrl) => ({ imageUrl })),
            hasVideo: false,
            hasGif: false,
            hasLink: false,
          }
        : null,
    conversation: null,
  };

  return {
    sourceText: details.sourceText,
    sourceUrl: details.sourceUrl,
    authorHandle: details.authorHandle,
    sourceContext,
  };
}

export {
  isStandaloneXStatusUrl,
  resolveReplyRequestSourceFromSyndicationPayload,
};
