import { z } from "zod";

import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";
import type {
  ReplyImageArtifactType,
  ReplyDraftImageRole,
  ReplyDraftImageSceneType,
} from "../extension/types.ts";

import type { ReplySourceImage } from "./types.ts";

const DEFAULT_REPLY_IMAGE_VISION_MODEL =
  process.env.GROQ_REPLY_IMAGE_VISION_MODEL?.trim() ||
  process.env.GROQ_IMAGE_TO_POST_VISION_MODEL?.trim() ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

const REPLY_IMAGE_ANALYSIS_SYSTEM_PROMPT = [
  "Analyze this image for X reply drafting.",
  "Return only strict JSON with these exact keys:",
  "scene_type, image_role, image_artifact_type, readable_text, primary_subject, setting, lighting_and_mood, key_details, brand_signals, absurdity_markers, artifact_target_hint, joke_anchor, reply_relevance.",
  "scene_type must be one of screenshot, meme, product_ui, photo, mixed, unknown.",
  "image_role must be one of none, punchline, proof, reaction, context, decorative.",
  "image_artifact_type must be one of real_screenshot, mockup, parody_ui, meme, photo, mixed, unknown.",
  "Prioritize readable on-image text and interface text over generic object description when this is a screenshot or meme.",
  "Use image_role=punchline when the joke or bit clearly lands because of the image itself.",
  "Use image_role=proof when the image mainly acts as evidence, receipt, dashboard, or supporting proof.",
  "Use image_role=reaction when the image is mainly a reaction face/photo/gif-like response.",
  "Use image_role=context when the image materially sharpens the post but is not the joke or proof.",
  "Use image_role=decorative when the image adds little reply value.",
].join(" ");

export interface ReplyImageVisualContext {
  scene_type: ReplyDraftImageSceneType;
  image_role: ReplyDraftImageRole;
  image_artifact_type: ReplyImageArtifactType;
  readable_text: string;
  primary_subject: string;
  setting: string;
  lighting_and_mood: string;
  key_details: string[];
  brand_signals: string[];
  absurdity_markers: string[];
  artifact_target_hint: string;
  joke_anchor: string;
  reply_relevance: string;
}

export const ReplyImageVisualContextSchema: z.ZodType<ReplyImageVisualContext> = z.object({
  scene_type: z.enum(["screenshot", "meme", "product_ui", "photo", "mixed", "unknown"]),
  image_role: z.enum(["none", "punchline", "proof", "reaction", "context", "decorative"]),
  image_artifact_type: z.enum([
    "real_screenshot",
    "mockup",
    "parody_ui",
    "meme",
    "photo",
    "mixed",
    "unknown",
  ]),
  readable_text: z.string().trim(),
  primary_subject: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  lighting_and_mood: z.string().trim().min(1),
  key_details: z.array(z.string().trim().min(1)).max(12),
  brand_signals: z.array(z.string().trim().min(1)).max(8),
  absurdity_markers: z.array(z.string().trim().min(1)).max(8),
  artifact_target_hint: z.string().trim().max(200),
  joke_anchor: z.string().trim(),
  reply_relevance: z.string().trim().min(1).max(160),
});

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function truncate(value: string, max = 160): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= max) {
    return normalized;
  }

  const slice = normalized.slice(0, max);
  const cutoff = slice.lastIndexOf(" ");
  return `${slice.slice(0, cutoff > 24 ? cutoff : max).trimEnd()}...`;
}

function compact(values: Array<string | null | undefined>, limit = 6) {
  return values
    .map((value) => normalizeWhitespace(value || ""))
    .filter(Boolean)
    .slice(0, limit);
}

function seemsLikeTestOrNoVision() {
  return (
    !process.env.GROQ_API_KEY?.trim() ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test") ||
    process.env.NODE_ENV === "test"
  );
}

function normalizeSceneType(value: string): ReplyDraftImageSceneType {
  switch (value) {
    case "screenshot":
    case "meme":
    case "product_ui":
    case "photo":
    case "mixed":
      return value;
    default:
      return "unknown";
  }
}

function extractQuotedSnippets(value: string) {
  const matches = Array.from(value.matchAll(/["“]([^"”]{4,120})["”]/g))
    .map((match) => normalizeWhitespace(match[1] || ""))
    .filter(Boolean);

  return matches.slice(0, 3);
}

function extractReadableTextFallback(value: string): string {
  const normalized = normalizeWhitespace(value);
  const quoted = extractQuotedSnippets(normalized);
  if (quoted.length > 0) {
    return truncate(quoted[0], 120);
  }

  const errorMatch = normalized.match(
    /\b(posts? aren'?t loading right now|try again|something went wrong|error|404|failed to load|connection lost)\b/i,
  );
  if (errorMatch?.[0]) {
    return truncate(errorMatch[0], 120);
  }

  const uiLine = normalized.match(
    /\b(?:screen(?:shot)?|tweet|ui|error|banner|message|text|showing)\b[:\s-]+([^.;]{6,140})/i,
  );
  if (uiLine?.[1]) {
    return truncate(uiLine[1], 120);
  }

  return "";
}

function inferSceneTypeFromText(value: string): ReplyDraftImageSceneType {
  const normalized = value.toLowerCase();
  if (/\b(meme|shitpost|reaction image)\b/.test(normalized)) {
    return "meme";
  }
  if (/\b(screenshot|screen grab|tweet screenshot|ui screenshot|posts? aren'?t loading|banner)\b/.test(normalized)) {
    return "screenshot";
  }
  if (/\b(app|dashboard|settings|modal|screen|ui|interface|product ui)\b/.test(normalized)) {
    return "product_ui";
  }
  if (/\b(photo|person|people|standing|selfie|outside|inside|room|street|server rack)\b/.test(normalized)) {
    return "photo";
  }
  return "unknown";
}

function inferImageRoleFromText(args: {
  sourceText: string;
  quotedText?: string | null;
  sceneType: ReplyDraftImageSceneType;
  text: string;
  readableText: string;
}): ReplyDraftImageRole {
  const sourceCombined = normalizeWhitespace([args.sourceText, args.quotedText || ""].join(" ")).toLowerCase();
  const visualCombined = normalizeWhitespace([args.text, args.readableText].join(" ")).toLowerCase();
  const combined = `${sourceCombined} ${visualCombined}`;
  const sourceIsPlayful =
    /\b(lol|lmao|lmfao|haha|funny|meme|joke|bit|perfect|insane|wild|algo pull|shitpost)\b/.test(
      combined,
    );
  const looksLikeEvidence =
    /\b(proof|receipt|receipts|evidence|chart|dashboard|analytics|metric|graph|data|numbers|screenshot of|showing)\b/.test(
      visualCombined,
    );
  const looksLikeReaction =
    /\b(reaction|staring|looking at|face|expression|hands on hips)\b/.test(visualCombined);
  const uiFailureText =
    /\b(posts? aren'?t loading right now|try again|something went wrong|error|404|failed to load)\b/.test(
      visualCombined,
    );
  const looksLikeParodyUi =
    /\b(pro max plus|unlock x premium|see who(?:'s| is) viewing you|who viewed your profile|bookmarked your tweets|premium)\b/.test(
      combined,
    ) || /\b(?:\$|usd)\s*\d{3,}\s*\/\s*(?:month|mo)\b/.test(combined);

  if (
    (args.sceneType === "screenshot" || args.sceneType === "product_ui") &&
    (uiFailureText || looksLikeParodyUi || (args.readableText && sourceIsPlayful))
  ) {
    return "punchline";
  }

  if (looksLikeEvidence && !sourceIsPlayful) {
    return "proof";
  }

  if (looksLikeReaction) {
    return "reaction";
  }

  if (sourceIsPlayful && (args.readableText || args.sceneType === "meme")) {
    return "punchline";
  }

  if (args.sceneType === "photo" && visualCombined) {
    return "context";
  }

  if (args.readableText || visualCombined) {
    return "context";
  }

  return "decorative";
}

function inferPrimarySubject(args: {
  sceneType: ReplyDraftImageSceneType;
  text: string;
  readableText: string;
}) {
  if (args.readableText) {
    return args.sceneType === "screenshot" || args.sceneType === "product_ui"
      ? "app or tweet screenshot"
      : truncate(args.readableText, 72);
  }

  switch (args.sceneType) {
    case "screenshot":
      return "screenshot";
    case "product_ui":
      return "product ui";
    case "meme":
      return "meme image";
    case "photo":
      return "photo";
    default:
      return truncate(args.text || "image", 72);
  }
}

function collectBrandSignals(value: string): string[] {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const next: string[] = [];

  if (/\bx premium\b|\bx\b/.test(normalized)) {
    next.push("x");
  }
  if (/\btwitter\b/.test(normalized)) {
    next.push("twitter");
  }
  if (/\blinkedin\b/.test(normalized)) {
    next.push("linkedin");
  }
  if (/\bpremium\b/.test(normalized)) {
    next.push("premium");
  }
  if (/\bbookmarks?\b/.test(normalized)) {
    next.push("bookmarks");
  }
  if (/\bprofile views?\b|\bwho viewed your profile\b/.test(normalized)) {
    next.push("profile views");
  }

  return next.slice(0, 6);
}

function collectAbsurdityMarkers(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  const next: string[] = [];

  if (/\bpro max plus\b/i.test(normalized)) {
    next.push("exaggerated tier naming");
  }
  if (/\bunlock\b/i.test(normalized) && /\bpremium\b/i.test(normalized)) {
    next.push("upsell prompt");
  }
  if (/\b(?:\$|usd)\s*\d{3,}\s*\/\s*(?:month|mo)\b/i.test(normalized)) {
    next.push("absurd pricing");
  }
  if (/\bwho viewed your profile\b/i.test(normalized)) {
    next.push("surveillance feature framing");
  }
  if (/\bbookmarked your tweets\b/i.test(normalized)) {
    next.push("bookmark visibility joke");
  }

  return next.slice(0, 6);
}

function inferImageArtifactType(args: {
  sceneType: ReplyDraftImageSceneType;
  text: string;
  readableText: string;
  keyDetails: string[];
  absurdityMarkers?: string[];
}): ReplyImageArtifactType {
  const combined = normalizeWhitespace(
    [args.text, args.readableText, ...args.keyDetails, ...(args.absurdityMarkers || [])].join(" "),
  ).toLowerCase();

  if (args.sceneType === "meme") {
    return "meme";
  }
  if (args.sceneType === "photo") {
    return "photo";
  }
  if (args.sceneType === "mixed") {
    return "mixed";
  }
  if (args.sceneType === "screenshot" || args.sceneType === "product_ui") {
    if ((args.absurdityMarkers || []).length > 0 || /\b(parody|fake ui|mock premium|pro max plus)\b/.test(combined)) {
      return "parody_ui";
    }
    if (/\b(mockup|concept|idea)\b/.test(combined)) {
      return "mockup";
    }
    return "real_screenshot";
  }

  return "unknown";
}

function inferArtifactTargetHint(args: {
  readableText: string;
  jokeAnchor: string;
  text: string;
  absurdityMarkers: string[];
  imageArtifactType: ReplyImageArtifactType;
}): string {
  const combined = normalizeWhitespace(
    [args.readableText, args.jokeAnchor, args.text, ...args.absurdityMarkers].join(" "),
  ).toLowerCase();

  if (
    args.imageArtifactType === "parody_ui" &&
    /\b(viewed your profile|bookmarked your tweets|premium)\b/.test(combined)
  ) {
    return "premium social-surveillance UX";
  }
  if (/\b(posts? aren'?t loading right now|try again|something went wrong|failed to load)\b/.test(combined)) {
    return "app failure / loading banner";
  }
  if (args.imageArtifactType === "mockup") {
    return "concept ui in the screenshot";
  }

  return "";
}

function collectAnchorTokens(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 8);
}

function looksLikeUiText(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  return (
    /\b(posts? aren'?t loading right now|try again|something went wrong|error|404|failed to load|connection lost)\b/i.test(
      normalized,
    ) ||
    /\b@[a-z0-9_]+\b/i.test(normalized) ||
    /\b\d+\s*(?:k|m|b)?\b/i.test(normalized) ||
    /\b(?:tweet|post|reply|quote|retweet|likes?|views?)\b/i.test(normalized)
  );
}

function shouldPreferReadableTextAsAnchor(args: {
  jokeAnchor: string;
  readableText: string;
}) {
  const jokeAnchor = normalizeWhitespace(args.jokeAnchor);
  const readableText = normalizeWhitespace(args.readableText);
  if (!readableText) {
    return false;
  }

  if (!jokeAnchor) {
    return true;
  }

  if (
    /\b(man|person|people|guy|woman|photo|server|servers|server room|data center|error message)\b/i.test(
      jokeAnchor,
    )
  ) {
    return true;
  }

  const anchorTokens = new Set(collectAnchorTokens(jokeAnchor));
  const readableTokens = collectAnchorTokens(readableText);
  if (anchorTokens.size === 0) {
    return true;
  }

  return !readableTokens.some((token) => anchorTokens.has(token));
}

export function normalizeReplyImageVisualContext(args: {
  sourceText: string;
  quotedText?: string | null;
  visualContext: ReplyImageVisualContext;
}): ReplyImageVisualContext {
  let readableText = normalizeWhitespace(args.visualContext.readable_text);
  let sceneType = normalizeSceneType(args.visualContext.scene_type);
  let imageRole = args.visualContext.image_role;
  let primarySubject = normalizeWhitespace(args.visualContext.primary_subject);
  let setting = normalizeWhitespace(args.visualContext.setting);
  let lightingAndMood = normalizeWhitespace(args.visualContext.lighting_and_mood);
  let jokeAnchor = normalizeWhitespace(args.visualContext.joke_anchor);
  let keyDetails = compact(args.visualContext.key_details, 12);
  let brandSignals = compact(args.visualContext.brand_signals || [], 8);
  let absurdityMarkers = compact(args.visualContext.absurdity_markers || [], 8);
  let artifactTargetHint = normalizeWhitespace(args.visualContext.artifact_target_hint);
  let imageArtifactType = args.visualContext.image_artifact_type;
  const sourceTextLower = normalizeWhitespace([args.sourceText, args.quotedText || ""].join(" ")).toLowerCase();
  const anchorLooksLikeUiText = looksLikeUiText(jokeAnchor);
  const detailLooksLikeUi =
    keyDetails.some((detail) => looksLikeUiText(detail)) ||
    keyDetails.some((detail) => /\b(tweet|screenshot|ui|banner|message|text)\b/i.test(detail));

  if (!readableText && anchorLooksLikeUiText) {
    readableText = truncate(jokeAnchor.replace(/\s*\/\s*/g, " "), 120);
  }

  const combined = normalizeWhitespace(
    [args.sourceText, args.quotedText || "", readableText, jokeAnchor, ...keyDetails].join(" "),
  ).toLowerCase();
  const sourceSuggestsTweetScreenshot =
    /\b(algo pull|tweet|post|x\.com|twitter|timeline|feed)\b/i.test(sourceTextLower);
  const hasUiReadableText = looksLikeUiText(readableText);
  const shouldTreatAsScreenshot =
    hasUiReadableText ||
    anchorLooksLikeUiText ||
    (detailLooksLikeUi && sourceSuggestsTweetScreenshot);

  if (shouldTreatAsScreenshot) {
    sceneType = "screenshot";
    primarySubject = sourceSuggestsTweetScreenshot
      ? "tweet screenshot with embedded image"
      : "app or tweet screenshot";
    setting = "digital interface";
    if (!lightingAndMood || lightingAndMood === "neutral") {
      lightingAndMood = imageRole === "proof" ? "evidentiary and matter-of-fact" : "internet-native and jokey";
    }
    if (imageRole === "none" || imageRole === "context" || imageRole === "decorative" || imageRole === "reaction") {
      imageRole = /\b(proof|receipt|receipts|chart|dashboard|analytics|retention|graph|numbers)\b/i.test(
        combined,
      )
        ? "proof"
        : "punchline";
    }

    keyDetails = compact([
      "screenshot layout",
      sourceSuggestsTweetScreenshot ? "nested tweet image" : null,
      hasUiReadableText || anchorLooksLikeUiText ? "error banner" : null,
      ...keyDetails,
    ]);
  }

  brandSignals = compact([
    ...brandSignals,
    ...collectBrandSignals([args.sourceText, args.quotedText || "", readableText, jokeAnchor, ...keyDetails].join(" ")),
  ], 8);
  absurdityMarkers = compact([
    ...absurdityMarkers,
    ...collectAbsurdityMarkers([args.sourceText, args.quotedText || "", readableText, jokeAnchor, ...keyDetails].join(" ")),
  ], 8);
  imageArtifactType =
    imageArtifactType && imageArtifactType !== "unknown"
      ? imageArtifactType
      : inferImageArtifactType({
          sceneType,
          text: [args.sourceText, args.quotedText || "", jokeAnchor].join(" "),
          readableText,
          keyDetails,
          absurdityMarkers,
        });
  artifactTargetHint =
    artifactTargetHint ||
    inferArtifactTargetHint({
      readableText,
      jokeAnchor,
      text: [args.sourceText, args.quotedText || "", ...keyDetails].join(" "),
      absurdityMarkers,
      imageArtifactType,
    });

  if (shouldPreferReadableTextAsAnchor({ jokeAnchor, readableText })) {
    jokeAnchor = truncate(readableText, 120);
  }

  if (!primarySubject) {
    primarySubject = inferPrimarySubject({
      sceneType,
      text: combined,
      readableText,
    });
  }

  return {
    ...args.visualContext,
    scene_type: sceneType,
    image_role: imageRole,
    image_artifact_type: imageArtifactType,
    readable_text: readableText,
    primary_subject: primarySubject,
    setting: setting || "image context available",
    lighting_and_mood: lightingAndMood || "neutral",
    key_details: keyDetails,
    brand_signals: brandSignals,
    absurdity_markers: absurdityMarkers,
    artifact_target_hint: artifactTargetHint,
    joke_anchor: jokeAnchor,
    reply_relevance:
      args.visualContext.reply_relevance ||
      (imageRole === "punchline" || imageRole === "proof" ? "high" : "medium"),
  };
}

function buildFallbackReplyImageVisualContext(args: {
  sourceText: string;
  quotedText?: string | null;
  image: ReplySourceImage;
}): ReplyImageVisualContext | null {
  const fallbackText = normalizeWhitespace(
    [args.image.altText || "", args.image.imageUrl || ""].join(" "),
  );
  if (!fallbackText) {
    return null;
  }

  const sceneType = inferSceneTypeFromText(fallbackText);
  const readableText = extractReadableTextFallback(fallbackText);
  const imageRole = inferImageRoleFromText({
    sourceText: args.sourceText,
    quotedText: args.quotedText || null,
    sceneType,
    text: fallbackText,
    readableText,
  });
  const quotedSnippets = extractQuotedSnippets(fallbackText);
  const keyDetails = compact([
    sceneType === "screenshot" ? "screenshot layout" : null,
    sceneType === "product_ui" ? "ui elements visible" : null,
    sceneType === "photo" ? truncate(fallbackText, 80) : null,
    ...quotedSnippets.slice(0, 2),
  ]);
  const jokeAnchor = truncate(readableText || quotedSnippets[0] || fallbackText, 120);
  const brandSignals = collectBrandSignals([args.sourceText, args.quotedText || "", fallbackText].join(" "));
  const absurdityMarkers = collectAbsurdityMarkers([args.sourceText, args.quotedText || "", fallbackText].join(" "));
  const imageArtifactType = inferImageArtifactType({
    sceneType,
    text: [args.sourceText, args.quotedText || "", fallbackText].join(" "),
    readableText,
    keyDetails,
    absurdityMarkers,
  });
  const artifactTargetHint = inferArtifactTargetHint({
    readableText,
    jokeAnchor,
    text: [args.sourceText, args.quotedText || "", fallbackText].join(" "),
    absurdityMarkers,
    imageArtifactType,
  });

  return {
    scene_type: sceneType,
    image_role: imageRole,
    image_artifact_type: imageArtifactType,
    readable_text: readableText,
    primary_subject: inferPrimarySubject({
      sceneType,
      text: fallbackText,
      readableText,
    }),
    setting:
      sceneType === "screenshot" || sceneType === "product_ui"
        ? "digital interface"
        : sceneType === "photo"
          ? "captured real-world scene"
          : "image context available",
    lighting_and_mood:
      imageRole === "punchline"
        ? "internet-native and jokey"
        : imageRole === "proof"
          ? "evidentiary and matter-of-fact"
          : imageRole === "reaction"
            ? "reactive"
            : "neutral",
    key_details: keyDetails,
    brand_signals: brandSignals,
    absurdity_markers: absurdityMarkers,
    artifact_target_hint: artifactTargetHint,
    joke_anchor: jokeAnchor,
    reply_relevance:
      imageRole === "punchline" || imageRole === "proof"
        ? "high"
        : imageRole === "context" || imageRole === "reaction"
          ? "medium"
          : "low",
  };
}

function buildReplyImageUserPrompt(args: {
  sourceText: string;
  quotedText?: string | null;
  altText?: string | null;
}) {
  return [
    `Visible post text: ${normalizeWhitespace(args.sourceText) || "none"}`,
    args.quotedText?.trim()
      ? `Quoted post text: ${normalizeWhitespace(args.quotedText)}`
      : "Quoted post text: none",
    args.altText?.trim()
      ? `Image alt text or capture hint: ${truncate(args.altText, 400)}`
      : "Image alt text or capture hint: none",
    "Analyze the image for reply relevance now.",
  ].join("\n");
}

export async function analyzeReplyImageVisualContext(args: {
  sourceText: string;
  quotedText?: string | null;
  image: ReplySourceImage;
  visionModel?: string;
}): Promise<{
  visualContext: ReplyImageVisualContext;
  source: "vision" | "alt_text";
}> {
  const fallback = buildFallbackReplyImageVisualContext(args);
  const imageUrl = args.image.imageDataUrl?.trim() || args.image.imageUrl?.trim() || "";

  if (!imageUrl || seemsLikeTestOrNoVision()) {
    if (!fallback) {
      throw new Error("No analyzable image content or alt text was available.");
    }

    return {
      visualContext: normalizeReplyImageVisualContext({
        sourceText: args.sourceText,
        quotedText: args.quotedText || null,
        visualContext: fallback,
      }),
      source: "alt_text",
    };
  }

  const raw = await fetchJsonFromGroq<unknown>({
    model: args.visionModel || DEFAULT_REPLY_IMAGE_VISION_MODEL,
    temperature: 0,
    max_tokens: 1024,
    jsonRepairInstruction:
      "Return ONLY valid JSON with keys scene_type, image_role, image_artifact_type, readable_text, primary_subject, setting, lighting_and_mood, key_details, brand_signals, absurdity_markers, artifact_target_hint, joke_anchor, reply_relevance.",
    messages: [
      {
        role: "system",
        content: REPLY_IMAGE_ANALYSIS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildReplyImageUserPrompt({
              sourceText: args.sourceText,
              quotedText: args.quotedText || null,
              altText: args.image.altText || null,
            }),
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  });

  if (!raw) {
    if (!fallback) {
      throw new Error("Reply image analyzer returned no JSON response.");
    }

    return {
      visualContext: normalizeReplyImageVisualContext({
        sourceText: args.sourceText,
        quotedText: args.quotedText || null,
        visualContext: fallback,
      }),
      source: "alt_text",
    };
  }

  const parsed = ReplyImageVisualContextSchema.safeParse(raw);
  if (!parsed.success) {
    if (!fallback) {
      throw new Error("Reply image analyzer returned an invalid JSON shape.");
    }

    return {
      visualContext: normalizeReplyImageVisualContext({
        sourceText: args.sourceText,
        quotedText: args.quotedText || null,
        visualContext: fallback,
      }),
      source: "alt_text",
    };
  }

  return {
    visualContext: normalizeReplyImageVisualContext({
      sourceText: args.sourceText,
      quotedText: args.quotedText || null,
      visualContext: parsed.data,
    }),
    source: "vision",
  };
}

export function buildFallbackReplyImageContext(args: {
  sourceText: string;
  quotedText?: string | null;
  image: ReplySourceImage;
}): ReplyImageVisualContext | null {
  return buildFallbackReplyImageVisualContext(args);
}
