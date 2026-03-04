import type { VoiceStyleCard } from "./styleProfile";

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

export function enforceVoiceStyleOnDraft(
  text: string,
  styleCard: VoiceStyleCard | null,
): string {
  if (!styleCard) {
    return text.trim();
  }

  let nextText = text.trim();

  if (inferLowercasePreference(styleCard)) {
    nextText = lowercasePreservingUrls(nextText);
  }

  const preferredListMarker = inferPreferredListMarker(styleCard);
  if (preferredListMarker) {
    nextText = normalizeListMarkers(nextText, preferredListMarker);
  }

  return nextText.trim();
}
