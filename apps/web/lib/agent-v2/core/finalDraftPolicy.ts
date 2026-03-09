import type { DraftFormatPreference } from "../contracts/chat";
import type { UserPreferences, VoiceStyleCard } from "./styleProfile";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";

const SHORT_FORM_X_LIMIT = 280;
const LONG_FORM_X_LIMIT = 25_000;
const THREAD_TOTAL_X_LIMIT = 1_680;
const THREAD_DEFAULT_POST_COUNT = 6;

function getThreadTotalXLimit(isVerified: boolean): number {
  return (isVerified ? LONG_FORM_X_LIMIT : SHORT_FORM_X_LIMIT) * THREAD_DEFAULT_POST_COUNT;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function countLetters(value: string): { lower: number; upper: number } {
  let lower = 0;
  let upper = 0;

  for (const char of value) {
    if (char >= "a" && char <= "z") {
      lower += 1;
    } else if (char >= "A" && char <= "Z") {
      upper += 1;
    }
  }

  return { lower, upper };
}

function isMostlyLowercase(values: string[]): boolean {
  const joined = values.join(" ");
  const { lower, upper } = countLetters(joined);
  const total = lower + upper;

  if (total < 12) {
    return false;
  }

  return upper / total <= 0.06 && lower / total >= 0.8;
}

function collectStyleSignals(styleCard: VoiceStyleCard): string[] {
  return [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
    ...(styleCard.sentenceOpenings || []),
    ...(styleCard.sentenceClosers || []),
    ...(styleCard.slangAndVocabulary || []),
  ].filter(Boolean);
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const signals = collectStyleSignals(styleCard).map(normalizeText);
  const lowercaseRule = signals.some(
    (signal) =>
      signal.includes("all lowercase") ||
      signal.includes("always lowercase") ||
      signal.includes("never uses capitalization") ||
      signal.includes("no uppercase") ||
      signal.includes("lowercase"),
  );

  if (lowercaseRule) {
    return true;
  }

  return isMostlyLowercase([
    ...(styleCard.sentenceOpenings || []),
    ...(styleCard.sentenceClosers || []),
    ...(styleCard.slangAndVocabulary || []),
  ]);
}

function inferPreferredListMarker(styleCard: VoiceStyleCard | null): "-" | ">" | null {
  if (!styleCard) {
    return null;
  }

  const signals = collectStyleSignals(styleCard).map(normalizeText);
  const prefersChevron = signals.some(
    (signal) =>
      signal.includes("uses >") ||
      signal.includes("prefers >") ||
      signal.includes("> bullets") ||
      signal.includes("quote-style bullets"),
  );
  if (prefersChevron) {
    return ">";
  }

  const prefersDash = signals.some(
    (signal) =>
      signal.includes("uses -") ||
      signal.includes("prefers -") ||
      signal.includes("dash bullets") ||
      signal.includes("hyphen bullets"),
  );
  if (prefersDash) {
    return "-";
  }

  return null;
}

function lowercasePreservingUrls(text: string): string {
  const urls: string[] = [];
  const tokenized = text.replace(/https?:\/\/\S+/gi, (match) => {
    const index = urls.push(match) - 1;
    return `__URL_${index}__`;
  });

  const lowercased = tokenized.toLowerCase();

  return lowercased.replace(/__url_(\d+)__/g, (_, index: string) => {
    const value = urls[Number(index)];
    return typeof value === "string" ? value : "";
  });
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

  if (inferLowercasePreference(styleCard)) {
    nextValue = lowercasePreservingUrls(nextValue);
  }

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

  return { value: result, weightUsed };
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
      return value.toLowerCase();
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
  const posts = draft
    .split(/\n\s*---\s*\n/g)
    .map((post) => post.trim())
    .filter(Boolean);

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

  return normalizedPosts.join("\n\n---\n\n");
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
  maxCharacterLimit?: number | null;
  threadFramingStyle?: ThreadFramingStyle | null;
}): {
  draft: string;
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

  const withNoMarkdown = stripUnsupportedMarkdown(args.draft);
  const withBetterCta = normalizeWeakEngagementBaitCta(withNoMarkdown);
  const withBlacklistsApplied = applyBlacklist(withBetterCta, normalizedPreferences.blacklist);
  const withBullets = normalizeBulletStyle(withBlacklistsApplied, normalizedPreferences.bulletStyle);
  const withCasing = applyCasing(withBullets, normalizedPreferences.casing);
  const withStyle = applyStyleCardVoice(withCasing, args.styleCard ?? null);
  const withThreadFormatting =
    formatPreference === "thread"
      ? normalizeThreadDraftFormatting(withStyle, args.threadFramingStyle)
      : withStyle;
  const finalDraft = trimToXCharacterLimit(withThreadFormatting, shortformFirstLimit);

  return {
    draft: finalDraft,
    adjustments: {
      markdownAdjusted: withNoMarkdown !== args.draft.trim(),
      engagementAdjusted: withBetterCta !== withNoMarkdown,
      styleAdjusted: withThreadFormatting !== withCasing,
      trimmed: finalDraft !== withThreadFormatting,
    },
  };
}

export function applyFinalDraftPolicy(args: {
  draft: string;
  formatPreference?: DraftFormatPreference | null;
  isVerifiedAccount?: boolean;
  userPreferences?: Partial<UserPreferences> | null;
  styleCard?: VoiceStyleCard | null;
  maxCharacterLimit?: number | null;
  threadFramingStyle?: ThreadFramingStyle | null;
}): string {
  return applyFinalDraftPolicyWithReport(args).draft;
}
