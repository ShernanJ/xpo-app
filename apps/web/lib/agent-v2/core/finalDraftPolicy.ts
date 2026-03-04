import type { DraftFormatPreference } from "../contracts/chat";
import type { UserPreferences } from "./styleProfile";

const SHORT_FORM_X_LIMIT = 280;
const LONG_FORM_X_LIMIT = 25_000;

function getXCharacterLimitForFormat(
  isVerified: boolean,
  formatPreference: "shortform" | "longform",
): number {
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

export function applyFinalDraftPolicy(args: {
  draft: string;
  formatPreference?: DraftFormatPreference | null;
  isVerifiedAccount?: boolean;
  userPreferences?: Partial<UserPreferences> | null;
  maxCharacterLimit?: number | null;
}): string {
  const normalizedPreferences = normalizeUserPreferences(args.userPreferences);
  const formatPreference = args.formatPreference === "longform" ? "longform" : "shortform";
  const hardLimit =
    typeof args.maxCharacterLimit === "number" && args.maxCharacterLimit > 0
      ? args.maxCharacterLimit
      : getXCharacterLimitForFormat(Boolean(args.isVerifiedAccount), formatPreference);

  const shortformFirstLimit =
    formatPreference === "longform"
      ? hardLimit
      : Math.min(hardLimit, getXCharacterLimitForFormat(Boolean(args.isVerifiedAccount), "shortform"));

  const withNoMarkdown = stripUnsupportedMarkdown(args.draft);
  const withBetterCta = normalizeWeakEngagementBaitCta(withNoMarkdown);
  const withBlacklistsApplied = applyBlacklist(withBetterCta, normalizedPreferences.blacklist);
  const withBullets = normalizeBulletStyle(withBlacklistsApplied, normalizedPreferences.bulletStyle);
  const withCasing = applyCasing(withBullets, normalizedPreferences.casing);

  return trimToXCharacterLimit(withCasing, shortformFirstLimit);
}
