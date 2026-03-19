import type { CreatorProfileHints } from "../grounding/groundingPacket.ts";
import type { UserPreferences, VoiceStyleCard } from "./styleProfile.ts";

export type DraftCasingSource =
  | "explicit_preference"
  | "high_confidence_voice"
  | "default_normal";

export interface DraftCasingResolution {
  casing: "normal" | "lowercase" | "uppercase";
  source: DraftCasingSource;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function collectSignals(styleCard: VoiceStyleCard): string[] {
  return [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
    ...(styleCard.sentenceOpenings || []),
    ...(styleCard.sentenceClosers || []),
    ...(styleCard.slangAndVocabulary || []),
  ].filter(Boolean);
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

function normalizeExplicitCasingPreference(
  userPreferences?: Partial<UserPreferences> | null,
  styleCard?: VoiceStyleCard | null,
): UserPreferences["casing"] {
  const candidate = userPreferences?.casing ?? styleCard?.userPreferences?.casing;
  return candidate === "auto" ||
    candidate === "normal" ||
    candidate === "lowercase" ||
    candidate === "uppercase"
    ? candidate
    : "auto";
}

function hasHighConfidenceLowercaseVoice(
  creatorProfileHints?: CreatorProfileHints | null,
): boolean {
  const voiceProfile = creatorProfileHints?.voiceProfile;
  if (!voiceProfile || voiceProfile.primaryCasing !== "lowercase") {
    return false;
  }

  const isLongFormCreator =
    voiceProfile.averageLengthBand === "long" ||
    creatorProfileHints?.threadBias === "high" ||
    voiceProfile.multiLinePostRate >= 30;

  if (isLongFormCreator) {
    return (
      voiceProfile.lowercaseSharePercent >= 95 &&
      voiceProfile.multiLinePostRate < 10
    );
  }

  return (
    voiceProfile.lowercaseSharePercent >= 72 &&
    voiceProfile.multiLinePostRate < 35
  );
}

export function resolveDraftCasingPreference(args: {
  userPreferences?: Partial<UserPreferences> | null;
  styleCard?: VoiceStyleCard | null;
  creatorProfileHints?: CreatorProfileHints | null;
}): DraftCasingResolution {
  const explicitPreference = normalizeExplicitCasingPreference(
    args.userPreferences,
    args.styleCard,
  );

  if (
    explicitPreference === "normal" ||
    explicitPreference === "lowercase" ||
    explicitPreference === "uppercase"
  ) {
    return {
      casing: explicitPreference,
      source: "explicit_preference",
    };
  }

  if (hasHighConfidenceLowercaseVoice(args.creatorProfileHints)) {
    return {
      casing: "lowercase",
      source: "high_confidence_voice",
    };
  }

  return {
    casing: "normal",
    source: "default_normal",
  };
}

export function inferLowercasePreference(styleCard: VoiceStyleCard | null): boolean {
  if (!styleCard) {
    return false;
  }

  const signals = collectSignals(styleCard).map(normalizeText);
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

export function inferPreferredListMarker(styleCard: VoiceStyleCard | null): "-" | ">" | null {
  if (!styleCard) {
    return null;
  }

  const signals = collectSignals(styleCard).map(normalizeText);
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

  const markerSignals = [
    ...(styleCard.sentenceOpenings || []),
    ...(styleCard.sentenceClosers || []),
  ];

  const chevronCount = markerSignals.filter((signal) => signal.trim().startsWith("> ")).length;
  const dashCount = markerSignals.filter((signal) => signal.trim().startsWith("- ")).length;

  if (chevronCount > dashCount && chevronCount > 0) {
    return ">";
  }

  if (dashCount > chevronCount && dashCount > 0) {
    return "-";
  }

  return null;
}

export function lowercasePreservingProtectedTokens(text: string): string {
  const protectedTokens: string[] = [];
  const protectedPattern =
    /https?:\/\/\S+|@[a-z0-9_]+|#[a-z0-9_]+|\b(?:[A-Z]{2,}|X)\b|\b[A-Z][a-z]+(?:[’'-][A-Z]?[a-z]+)*\b/g;

  const tokenized = text.replace(
    protectedPattern,
    (match: string, offset: number, source: string) => {
      const isCapitalizedWord = /^[A-Z][a-z]+(?:[’'-][A-Z]?[a-z]+)*$/.test(match);
      if (isCapitalizedWord) {
        const prefix = source.slice(0, offset);
        const isSentenceStart = /(^|[.!?]\s+|\n\s*)$/.test(prefix);
        if (isSentenceStart) {
          return match;
        }
      }

      const index = protectedTokens.push(match) - 1;
      return `__PROTECTED_${index}__`;
    },
  );

  const lowercased = tokenized.toLowerCase();
  return lowercased.replace(/__protected_(\d+)__/g, (_match, index: string) => {
    const value = protectedTokens[Number(index)];
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

export function enforceVoiceStyleOnDraft(
  text: string,
  styleCard: VoiceStyleCard | null,
  options?: {
    userPreferences?: Partial<UserPreferences> | null;
    creatorProfileHints?: CreatorProfileHints | null;
  },
): string {
  if (!styleCard) {
    return text.trim();
  }

  let nextText = text.trim();
  const casingResolution = resolveDraftCasingPreference({
    userPreferences: options?.userPreferences,
    styleCard,
    creatorProfileHints: options?.creatorProfileHints,
  });

  if (casingResolution.casing === "lowercase") {
    nextText = lowercasePreservingProtectedTokens(nextText);
  } else if (casingResolution.casing === "uppercase") {
    nextText = nextText.toUpperCase();
  }

  const preferredListMarker = inferPreferredListMarker(styleCard);
  if (preferredListMarker) {
    nextText = normalizeListMarkers(nextText, preferredListMarker);
  }

  return nextText.trim();
}
