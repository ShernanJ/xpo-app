import type { DraftFormatPreference } from "../contracts/chat";
import type { CreatorProfileHints } from "../grounding/groundingPacket.ts";
import type { UserPreferences, VoiceStyleCard } from "./styleProfile";
import {
  inferPreferredListMarker,
  lowercasePreservingProtectedTokens,
  resolveDraftCasingPreference,
  type DraftCasingResolution,
} from "./voiceSignals.ts";
import {
  joinSerializedThreadPosts,
  splitSerializedThreadPosts,
  type ThreadFramingStyle,
} from "../../onboarding/draftArtifacts.ts";

const SHORT_FORM_X_LIMIT = 280;
const LONG_FORM_X_LIMIT = 25_000;
const THREAD_DEFAULT_POST_COUNT = 6;

function getThreadTotalXLimit(isVerified: boolean): number {
  return (isVerified ? LONG_FORM_X_LIMIT : SHORT_FORM_X_LIMIT) * THREAD_DEFAULT_POST_COUNT;
}

function normalizeListMarkers(text: string, marker: "-" | ">"): string {
  const bulletPattern = /^\s*(?:[-*•>|→]|[–—]|\d+[.)])\s+(.*)$/;
  const lines = text.split("\n");
  let replacedAny = false;

  const nextLines = lines.map((line) => {
    const match = line.match(bulletPattern);
    if (!match) {
      return line;
    }

    replacedAny = true;
    return `${marker} ${match[1].trim()}`;
  });

  return replacedAny ? nextLines.join("\n") : text;
}

function applyStyleCardVoice(value: string, styleCard: VoiceStyleCard | null): string {
  if (!styleCard) {
    return value.trim();
  }

  let nextValue = value.trim();

  const preferredListMarker = inferPreferredListMarker(styleCard);
  if (preferredListMarker) {
    nextValue = normalizeListMarkers(nextValue, preferredListMarker);
  }

  return nextValue.trim();
}

function getXCharacterLimitForFormat(
  isVerified: boolean,
  formatPreference: "shortform" | "longform" | "thread",
): number {
  if (formatPreference === "thread") {
    return getThreadTotalXLimit(isVerified);
  }

  if (formatPreference === "longform" && isVerified) {
    return LONG_FORM_X_LIMIT;
  }

  return SHORT_FORM_X_LIMIT;
}

function countWeightedSegment(segment: string): number {
  let weighted = 0;

  for (const character of segment) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isWide =
      codePoint > 0xffff ||
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(
        character,
      );

    weighted += isWide ? 2 : 1;
  }

  return weighted;
}

function trimSegmentToWeightedLimit(segment: string, limit: number): {
  value: string;
  weightUsed: number;
} {
  if (limit <= 0) {
    return { value: "", weightUsed: 0 };
  }

  let weightUsed = 0;
  let result = "";

  for (const character of segment) {
    const characterWeight = countWeightedSegment(character);
    if (weightUsed + characterWeight > limit) {
      break;
    }

    result += character;
    weightUsed += characterWeight;
  }

  const cleaned =
    result.length < segment.length
      ? retreatToCleanBoundary(result)
      : result;

  return { value: cleaned, weightUsed: countWeightedSegment(cleaned) };
}

function retreatToCleanBoundary(value: string): string {
  const trimmed = value.trimEnd();
  if (!trimmed) {
    return trimmed;
  }

  const sentenceBoundary = findSentenceBoundary(trimmed);
  if (
    sentenceBoundary !== null &&
    sentenceBoundary >= Math.max(24, Math.floor(trimmed.length * 0.6))
  ) {
    return trimmed.slice(0, sentenceBoundary).trimEnd();
  }

  const wordBoundary = findWordBoundary(trimmed);
  if (
    wordBoundary !== null &&
    wordBoundary >= Math.max(12, Math.floor(trimmed.length * 0.8))
  ) {
    return trimmed.slice(0, wordBoundary).trimEnd();
  }

  return trimmed;
}

function findSentenceBoundary(value: string): number | null {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (!/[.!?…]/.test(value[index] || "")) {
      continue;
    }

    let boundary = index + 1;
    while (/["'”’)\]]/.test(value[boundary] || "")) {
      boundary += 1;
    }

    return boundary;
  }

  return null;
}

function findWordBoundary(value: string): number | null {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (/\s/.test(value[index] || "")) {
      return index;
    }
  }

  return null;
}

function computeXWeightedCharacterCount(text: string): number {
  const urlRegex = /https?:\/\/\S+/gi;
  let weighted = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    weighted += countWeightedSegment(text.slice(lastIndex, start));
    weighted += 23;
    lastIndex = start + match[0].length;
  }

  weighted += countWeightedSegment(text.slice(lastIndex));
  return weighted;
}

function trimToXCharacterLimit(text: string, maxCharacterLimit: number): string {
  if (computeXWeightedCharacterCount(text) <= maxCharacterLimit) {
    return text;
  }

  const urlRegex = /https?:\/\/\S+/gi;
  let remaining = maxCharacterLimit;
  let result = "";
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const start = match.index ?? 0;
    const segment = text.slice(lastIndex, start);
    const trimmedSegment = trimSegmentToWeightedLimit(segment, remaining);

    result += trimmedSegment.value;
    remaining -= trimmedSegment.weightUsed;

    if (remaining <= 0) {
      return result.trimEnd();
    }

    if (remaining < 23) {
      return result.trimEnd();
    }

    result += match[0];
    remaining -= 23;
    lastIndex = start + match[0].length;
  }

  const finalSegment = trimSegmentToWeightedLimit(text.slice(lastIndex), remaining);
  result += finalSegment.value;

  return result.trimEnd();
}

function stripUnsupportedMarkdown(value: string): string {
  return value
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
}

const DRAFT_TRANSCRIPT_LINE_PATTERNS = [
  /^(?:user|assistant):\s*/i,
];

const DRAFT_COMPOSER_UI_LINE_PATTERNS = [
  /^just now$/i,
  /^·$/u,
  /^\d[\d,]*\s*\/\s*\d[\d,]*\s+chars$/i,
  /^shorter$/i,
  /^longer$/i,
  /^softer$/i,
  /^punchier$/i,
  /^less negative$/i,
  /^more specific$/i,
  /^turn into thread$/i,
  /^turn into shortform$/i,
  /^turn into longform$/i,
  /^collapse$/i,
  /^expand$/i,
  /^post$/i,
];

const DRAFT_META_BLOCK_PATTERNS = [
  /^i['’]ll drop a draft:/i,
  /^share a quick, actionable insight/i,
  /^if that'?s the angle, i['’]ll draft it\.?$/i,
  /^looks good\. write this version now\.?$/i,
  /^tightened it so it reads fast(?: and clean)?\.?$/i,
];

function looksLikeTranscriptLine(line: string): boolean {
  const trimmed = line.trim();
  return DRAFT_TRANSCRIPT_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function looksLikeComposerUiLine(line: string): boolean {
  const trimmed = line.trim();
  return DRAFT_COMPOSER_UI_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function looksLikeDraftMetaBlock(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed) {
    return false;
  }

  return DRAFT_META_BLOCK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isLikelyHandleLine(line: string): boolean {
  return /^@[a-z0-9_]{1,30}$/i.test(line.trim());
}

function isLikelyDisplayNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) {
    return false;
  }

  return !/[.:;!?]/.test(trimmed) && !trimmed.startsWith("@");
}

function trimComposerFooter(lines: string[]): string[] {
  const nextLines = [...lines];

  while (nextLines.length > 0 && looksLikeComposerUiLine(nextLines[nextLines.length - 1] || "")) {
    nextLines.pop();
  }

  while (nextLines.length > 0 && !(nextLines[nextLines.length - 1] || "").trim()) {
    nextLines.pop();
  }

  return nextLines;
}

function extractDraftFromEmbeddedComposerPreview(value: string): string | null {
  const lines = value.split("\n");

  for (let index = 1; index < lines.length; index += 1) {
    const currentLine = lines[index]?.trim() || "";
    const previousLine = lines[index - 1]?.trim() || "";

    if (!isLikelyHandleLine(currentLine) || !isLikelyDisplayNameLine(previousLine)) {
      continue;
    }

    const afterHandle = lines.slice(index + 1);
    while (afterHandle.length > 0 && !afterHandle[0]?.trim()) {
      afterHandle.shift();
    }

    const trimmedFooter = trimComposerFooter(afterHandle);
    const candidate = trimmedFooter.join("\n").trim();
    if (!candidate) {
      continue;
    }

    return candidate;
  }

  return null;
}

function stripLeakedDraftScaffolding(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return normalized;
  }

  const embeddedComposerDraft = extractDraftFromEmbeddedComposerPreview(normalized);
  if (embeddedComposerDraft) {
    return embeddedComposerDraft;
  }

  const hasLeakageSignal =
    normalized
      .split("\n")
      .some((line) => looksLikeTranscriptLine(line) || looksLikeComposerUiLine(line)) ||
    normalized
      .split(/\n{2,}/)
      .some((block) => looksLikeDraftMetaBlock(block));

  if (!hasLeakageSignal) {
    return normalized;
  }

  const filteredLines = trimComposerFooter(
    normalized
      .split("\n")
      .filter((line) => !looksLikeTranscriptLine(line))
      .filter((line) => !looksLikeComposerUiLine(line)),
  );
  const filtered = filteredLines.join("\n").trim();

  if (!filtered) {
    return normalized;
  }

  const blocks = filtered
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const substantiveBlocks = blocks.filter((block) => !looksLikeDraftMetaBlock(block));

  if (substantiveBlocks.length === 0) {
    return filtered;
  }

  const likelyDraftBlock = [...substantiveBlocks]
    .reverse()
    .find((block) => block.length >= 40 || block.includes("\n") || block.includes("---"));

  return likelyDraftBlock || substantiveBlocks[substantiveBlocks.length - 1] || filtered;
}

function hasCtaIncentiveCue(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "i'll dm",
    "ill dm",
    "dm you",
    "send you",
    "i'll send",
    "ill send",
    "template",
    "checklist",
    "guide",
    "link",
    "copy",
    "resource",
    "download",
    "access",
    "freebie",
  ].some((phrase) => normalized.includes(phrase));
}

function normalizeWeakEngagementBaitCta(value: string): string {
  if (hasCtaIncentiveCue(value)) {
    return value;
  }

  return value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const isWeakWordReplyCta =
        /^(?:try|give|test|run|do).{0,80}(?:reply|comment)\s+["'][^"']+["']/i.test(trimmed) ||
        /^(?:reply|comment)\s+["'][^"']+["']\s+if\b/i.test(trimmed);

      return isWeakWordReplyCta ? "if you try it, let me know how it goes." : line;
    })
    .join("\n");
}

function inferResourceCtaKeyword(context: string): string {
  const normalized = context.toLowerCase();

  if (/\bhir(?:e|ing|es|ed)|recruit/i.test(normalized)) {
    return "HIRING";
  }

  if (/\bdelegat/i.test(normalized)) {
    return "DELEGATION";
  }

  if (/\bgrowth|scale|scaling|arr\b/i.test(normalized)) {
    return "GROWTH";
  }

  if (/\bteam\b/i.test(normalized)) {
    return "TEAM";
  }

  if (/\bplaybook\b/i.test(normalized)) {
    return "PLAYBOOK";
  }

  if (/\bchecklist\b/i.test(normalized)) {
    return "CHECKLIST";
  }

  if (/\btemplate\b/i.test(normalized)) {
    return "TEMPLATE";
  }

  return "ACCESS";
}

function inferResourceCtaObject(context: string): string {
  const normalized = context.toLowerCase();

  if (/\bhiring\b.*\bplaybook\b|\bplaybook\b.*\bhiring\b/i.test(normalized)) {
    return "my hiring playbook";
  }

  if (/\bdelegation\b.*\bplaybook\b|\bplaybook\b.*\bdelegation\b/i.test(normalized)) {
    return "my delegation playbook";
  }

  if (/\bplaybook\b/i.test(normalized)) {
    return "the playbook";
  }

  if (/\bchecklist\b/i.test(normalized)) {
    return "the checklist";
  }

  if (/\btemplate\b/i.test(normalized)) {
    return "the template";
  }

  if (/\bguide\b/i.test(normalized)) {
    return "the guide";
  }

  if (/\bpdf\b/i.test(normalized)) {
    return "the PDF";
  }

  return "the resource";
}

function buildResourceAccessCta(context: string): string {
  const keyword = inferResourceCtaKeyword(context);
  const object = inferResourceCtaObject(context);
  return `Comment "${keyword}" to get access to ${object}.`;
}

function hasConcreteResourceCue(value: string): boolean {
  return /\b(playbook|guide|checklist|template|worksheet|resource|download|access|pdf)\b/i.test(
    value,
  );
}

function lineLooksLikeGenericResourceCta(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    /^(?:comment|reply)\s+["'][^"']+["']/.test(normalized) &&
    hasConcreteResourceCue(normalized)
  ) {
    return false;
  }

  if (
    /^(?:leave|drop)\s+a\s+comment\b/.test(normalized) ||
    /^(?:comment|reply)\b/.test(normalized) ||
    /\bcomment below\b/.test(normalized) ||
    /\bdm me\b/.test(normalized)
  ) {
    return true;
  }

  return (
    /^(?:i(?:'m| am)?\s+happy\s+to\s+share|happy\s+to\s+share|i(?:'ll| will)?\s+send|i\s+can\s+send|i\s+can\s+share|i(?:'ll| will)\s+share)\b/.test(
      normalized,
    ) &&
    /\b(playbook|guide|checklist|template|resource|pdf)\b/.test(normalized)
  );
}

function normalizeGenericResourceCtas(value: string): string {
  if (!hasConcreteResourceCue(value)) {
    return value;
  }

  const lines = value.split("\n");
  let replaced = false;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index]?.trim() || "";
    if (!trimmed || !lineLooksLikeGenericResourceCta(trimmed)) {
      continue;
    }

    const context = [value, lines[index - 1] || "", lines[index + 1] || ""]
      .filter(Boolean)
      .join(" ");
    lines[index] = buildResourceAccessCta(context);
    replaced = true;
    break;
  }

  return replaced ? lines.join("\n") : value;
}

function normalizeGeneratedLinks(value: string): string {
  const lines = value.split("\n");
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  const urlPattern = /https?:\/\/[^\s)]+/gi;

  const normalizedLines = lines
    .map((line, index) => {
      const urlMatches = [
        ...Array.from(line.matchAll(markdownLinkPattern), (match) => match[2] || ""),
        ...Array.from(line.matchAll(urlPattern), (match) => match[0] || ""),
      ].filter(Boolean);

      if (urlMatches.length === 0) {
        return line;
      }

      const previousLine = lines[index - 1]?.trim() || "";
      const nextLine = lines[index + 1]?.trim() || "";
      const linkContext = `${previousLine} ${line} ${nextLine} ${urlMatches.join(" ")}`.trim();
      const isResourceLink =
        /\.(?:pdf|docx?|pptx?|xlsx?)(?:[?#].*)?$/i.test(linkContext) ||
        /\b(playbook|guide|checklist|template|worksheet|resource|download|access|pdf)\b/i.test(
          linkContext,
        );

      if (isResourceLink) {
        return buildResourceAccessCta(linkContext);
      }

      const withoutMarkdownLinks = line.replace(markdownLinkPattern, "$1");
      const withoutUrls = withoutMarkdownLinks.replace(urlPattern, "");

      return withoutUrls.replace(/[ \t]{2,}/g, " ").trimEnd();
    })
    .filter((line, index, array) => {
      if (line.trim()) {
        return true;
      }

      const previous = array[index - 1]?.trim() || "";
      const next = array[index + 1]?.trim() || "";
      return previous && next;
    });

  return normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function applyBlacklist(value: string, blacklist: string[]): string {
  let nextDraft = value;
  for (const blockedTerm of blacklist) {
    const escaped = blockedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nextDraft = nextDraft.replace(new RegExp(escaped, "gi"), "");
  }

  return nextDraft
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function applyNormalSentenceCasing(value: string): string {
  return value.replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix: string, character: string) =>
    `${prefix}${character.toUpperCase()}`,
  );
}

function applyCasing(value: string, casing: UserPreferences["casing"]): string {
  switch (casing) {
    case "normal":
      return applyNormalSentenceCasing(value);
    case "lowercase":
      return lowercasePreservingProtectedTokens(value);
    case "uppercase":
      return value.toUpperCase();
    default:
      return value;
  }
}

function normalizeBulletStyle(
  value: string,
  bulletStyle: UserPreferences["bulletStyle"],
): string {
  if (bulletStyle === "auto") {
    return value;
  }

  const marker = bulletStyle === "dash" ? "-" : ">";
  return value.replace(/^\s*[-*>]\s+/gm, `${marker} `);
}

function normalizeUserPreferences(
  value: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  const nextBlacklist = Array.isArray(value?.blacklist)
    ? value.blacklist
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 24)
    : [];

  return {
    casing:
      value?.casing === "auto" ||
      value?.casing === "normal" ||
      value?.casing === "lowercase" ||
      value?.casing === "uppercase"
        ? value.casing
        : "auto",
    bulletStyle:
      value?.bulletStyle === "auto" ||
      value?.bulletStyle === "dash" ||
      value?.bulletStyle === "angle"
        ? value.bulletStyle
        : "auto",
    emojiUsage:
      value?.emojiUsage === "auto" ||
      value?.emojiUsage === "on" ||
      value?.emojiUsage === "off"
        ? value.emojiUsage
        : "auto",
    profanity:
      value?.profanity === "auto" ||
      value?.profanity === "on" ||
      value?.profanity === "off"
        ? value.profanity
        : "auto",
    blacklist: nextBlacklist,
    writingGoal:
      value?.writingGoal === "voice_first" ||
      value?.writingGoal === "balanced" ||
      value?.writingGoal === "growth_first"
        ? value.writingGoal
        : "balanced",
    verifiedMaxChars:
      typeof value?.verifiedMaxChars === "number" &&
      Number.isFinite(value.verifiedMaxChars) &&
      value.verifiedMaxChars >= 250 &&
      value.verifiedMaxChars <= 25000
        ? Math.round(value.verifiedMaxChars)
        : null,
  };
}

function normalizeThreadDraftFormatting(
  draft: string,
  threadFramingStyle: ThreadFramingStyle | null | undefined,
): string {
  const posts = splitSerializedThreadPosts(draft);

  if (posts.length <= 1) {
    return draft.trim();
  }

  const resolvedStyle = threadFramingStyle ?? "soft_signal";
  const normalizedPosts = posts.map((post, index) => {
    let nextPost =
      resolvedStyle === "numbered" ? post : stripThreadNumberingMarker(post);

    if (index === 0 && resolvedStyle !== "numbered") {
      nextPost = normalizeThreadOpeningPost(nextPost);
    }

    return nextPost.trim();
  });

  return joinSerializedThreadPosts(normalizedPosts);
}

function normalizeThreadComparisonText(value: string): string {
  return stripThreadNumberingMarker(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeThreadPostSimilarity(left: string, right: string): number {
  const leftTokens = Array.from(
    new Set(
      normalizeThreadComparisonText(left)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 4),
    ),
  );
  const rightTokens = Array.from(
    new Set(
      normalizeThreadComparisonText(right)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 4),
    ),
  );

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightTokenSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
}

function collapseSameyThreadPosts(draft: string): string {
  const posts = splitSerializedThreadPosts(draft);

  if (posts.length <= 3) {
    return draft.trim();
  }

  const keptPosts: string[] = [];

  for (const post of posts) {
    const previous = keptPosts[keptPosts.length - 1];
    if (!previous) {
      keptPosts.push(post);
      continue;
    }

    const similarity = computeThreadPostSimilarity(previous, post);
    const isNearDuplicate = similarity >= 0.7;

    if (isNearDuplicate && keptPosts.length >= 2) {
      continue;
    }

    keptPosts.push(post);
  }

  if (keptPosts.length <= 1) {
    return draft.trim();
  }

  return joinSerializedThreadPosts(keptPosts).trim();
}

function normalizeNonThreadSerializedDraft(
  draft: string,
  formatPreference: "shortform" | "longform",
): string {
  const segments = splitSerializedThreadPosts(draft);
  if (segments.length <= 1) {
    return draft.trim();
  }

  const joiner = formatPreference === "longform" ? "\n\n" : "\n";
  return segments.join(joiner).replace(/\n{3,}/g, "\n\n").trim();
}

function stripThreadNumberingMarker(value: string): string {
  return value
    .replace(
      /^(?:\d{1,2}\/\d{1,2}|(?:part|post)\s+\d{1,2}\s*(?:\/|of)\s*\d{1,2})\s*(?:\n+|\s+)/i,
      "",
    )
    .trim();
}

function normalizeThreadOpeningPost(value: string): string {
  const lines = expandInlineBulletRuns(value)
    .split("\n")
    .map((line, index) =>
      index === 0 ? line.trim() : line.replace(/^\s*[-*•>]\s+/, "").trim(),
    );
  const nextLines: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
        nextLines.push("");
      }
      continue;
    }

    nextLines.push(line);
  }

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function expandInlineBulletRuns(value: string): string {
  const bulletMatches = value.match(/\s+[•▪◦]\s+/g) || [];
  if (bulletMatches.length < 2) {
    return value;
  }

  return value
    .replace(/\s+[•▪◦]\s+/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyFinalDraftPolicyWithReport(args: {
  draft: string;
  formatPreference?: DraftFormatPreference | null;
  isVerifiedAccount?: boolean;
  userPreferences?: Partial<UserPreferences> | null;
  styleCard?: VoiceStyleCard | null;
  creatorProfileHints?: CreatorProfileHints | null;
  maxCharacterLimit?: number | null;
  threadFramingStyle?: ThreadFramingStyle | null;
}): {
  draft: string;
  casingResolution: DraftCasingResolution;
  adjustments: {
    markdownAdjusted: boolean;
    engagementAdjusted: boolean;
    styleAdjusted: boolean;
    trimmed: boolean;
  };
} {
  const normalizedPreferences = normalizeUserPreferences(args.userPreferences);
  const formatPreference =
    args.formatPreference === "longform"
      ? "longform"
      : args.formatPreference === "thread"
        ? "thread"
        : "shortform";
  const hardLimit =
    typeof args.maxCharacterLimit === "number" && args.maxCharacterLimit > 0
      ? args.maxCharacterLimit
      : getXCharacterLimitForFormat(Boolean(args.isVerifiedAccount), formatPreference);

  const shortformFirstLimit =
    formatPreference === "longform"
      ? hardLimit
      : formatPreference === "thread"
        ? hardLimit
      : Math.min(hardLimit, getXCharacterLimitForFormat(Boolean(args.isVerifiedAccount), "shortform"));
  const casingResolution = resolveDraftCasingPreference({
    userPreferences: normalizedPreferences,
    styleCard: args.styleCard ?? null,
    creatorProfileHints: args.creatorProfileHints ?? null,
  });

  const withNoScaffolding = stripLeakedDraftScaffolding(args.draft);
  const withNoMarkdown = stripUnsupportedMarkdown(withNoScaffolding);
  const withNoGeneratedLinks = normalizeGeneratedLinks(withNoMarkdown);
  const withResourceCta = normalizeGenericResourceCtas(withNoGeneratedLinks);
  const withResolvedFormat =
    formatPreference === "thread"
      ? withResourceCta
      : normalizeNonThreadSerializedDraft(withResourceCta, formatPreference);
  const withBetterCta = normalizeWeakEngagementBaitCta(withResolvedFormat);
  const withBlacklistsApplied = applyBlacklist(withBetterCta, normalizedPreferences.blacklist);
  const withBullets = normalizeBulletStyle(withBlacklistsApplied, normalizedPreferences.bulletStyle);
  const withCasing = applyCasing(withBullets, casingResolution.casing);
  const withStyle = applyStyleCardVoice(withCasing, args.styleCard ?? null);
  const withThreadFormatting =
    formatPreference === "thread"
      ? normalizeThreadDraftFormatting(withStyle, args.threadFramingStyle)
      : withStyle;
  const withThreadDeduped =
    formatPreference === "thread"
      ? collapseSameyThreadPosts(withThreadFormatting)
      : withThreadFormatting;
  const finalDraft = trimToXCharacterLimit(withThreadDeduped, shortformFirstLimit);

  return {
    draft: finalDraft,
    casingResolution,
    adjustments: {
      markdownAdjusted:
        withNoMarkdown !== args.draft.trim() || withNoGeneratedLinks !== withNoMarkdown,
      engagementAdjusted:
        withResourceCta !== withNoGeneratedLinks || withBetterCta !== withResolvedFormat,
      styleAdjusted:
        withResolvedFormat !== withNoMarkdown || withThreadFormatting !== withCasing,
      trimmed: finalDraft !== withThreadDeduped,
    },
  };
}

export function applyFinalDraftPolicy(args: {
  draft: string;
  formatPreference?: DraftFormatPreference | null;
  isVerifiedAccount?: boolean;
  userPreferences?: Partial<UserPreferences> | null;
  styleCard?: VoiceStyleCard | null;
  creatorProfileHints?: CreatorProfileHints | null;
  maxCharacterLimit?: number | null;
  threadFramingStyle?: ThreadFramingStyle | null;
}): string {
  return applyFinalDraftPolicyWithReport(args).draft;
}
