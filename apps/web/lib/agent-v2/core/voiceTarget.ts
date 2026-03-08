import type { DraftFormatPreference, DraftPreference } from "../contracts/chat";
import type { VoiceStyleCard } from "./styleProfile";
import { inferLowercasePreference } from "./voiceSignals";

export type VoiceTargetCompression = "tight" | "medium" | "spacious";
export type VoiceTargetFormality = "casual" | "neutral" | "formal";
export type VoiceTargetHookStyle = "blunt" | "curious" | "contrarian" | "story";
export type VoiceTargetEmojiPolicy = "none" | "sparse" | "expressive";
export type VoiceTargetCtaPolicy = "none" | "thoughts" | "question" | "soft_ask";
export type VoiceTargetRisk = "safe" | "bold";
export type VoiceTargetLane = "original" | "reply" | "quote";

export interface VoiceTarget {
  casing: "normal" | "lowercase";
  compression: VoiceTargetCompression;
  formality: VoiceTargetFormality;
  hookStyle: VoiceTargetHookStyle;
  emojiPolicy: VoiceTargetEmojiPolicy;
  ctaPolicy: VoiceTargetCtaPolicy;
  risk: VoiceTargetRisk;
  lane: VoiceTargetLane;
  summary: string;
  rationale: string[];
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function collectSignals(styleCard: VoiceStyleCard | null): string[] {
  if (!styleCard) {
    return [];
  }

  return [
    styleCard.pacing || "",
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
    ...(styleCard.sentenceOpenings || []),
    ...(styleCard.sentenceClosers || []),
    ...(styleCard.slangAndVocabulary || []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function resolveCompression(args: {
  normalizedMessage: string;
  signalText: string;
  formatPreference?: DraftFormatPreference | null;
}): VoiceTargetCompression {
  if (args.formatPreference === "thread") {
    return "tight";
  }

  if (args.formatPreference === "longform") {
    return includesAny(args.normalizedMessage, ["tight", "compressed", "trim"])
      ? "medium"
      : "spacious";
  }

  if (
    includesAny(args.normalizedMessage, [
      "tight",
      "short",
      "shorter",
      "compressed",
      "punchier",
      "trim",
    ]) ||
    includesAny(args.signalText, ["short", "punchy", "tight", "concise", "no fluff"])
  ) {
    return "tight";
  }

  if (
    includesAny(args.normalizedMessage, ["more detail", "deeper", "longer", "expanded"]) ||
    includesAny(args.signalText, ["long", "essay", "spacious", "flowing"])
  ) {
    return "spacious";
  }

  return "medium";
}

function resolveFormality(args: {
  signalText: string;
  draftPreference: DraftPreference;
}): VoiceTargetFormality {
  if (
    args.draftPreference === "voice_first" ||
    includesAny(args.signalText, ["casual", "direct", "plainspoken", "human", "lowercase"])
  ) {
    return "casual";
  }

  if (includesAny(args.signalText, ["formal", "professional", "polished", "executive"])) {
    return "formal";
  }

  return "neutral";
}

function resolveHookStyle(args: {
  normalizedMessage: string;
  signalText: string;
  lane: VoiceTargetLane;
}): VoiceTargetHookStyle {
  if (args.lane === "reply") {
    return "curious";
  }

  if (
    includesAny(args.normalizedMessage, ["contrarian", "hot take", "push back", "wrong about"]) ||
    includesAny(args.signalText, ["contrarian", "hot take"])
  ) {
    return "contrarian";
  }

  if (
    includesAny(args.normalizedMessage, ["story", "mistake", "learned", "happened", "shipped"]) ||
    includesAny(args.signalText, ["story", "anecdote"])
  ) {
    return "story";
  }

  if (args.lane === "quote") {
    return "contrarian";
  }

  return "blunt";
}

function resolveEmojiPolicy(styleCard: VoiceStyleCard | null, signalText: string): VoiceTargetEmojiPolicy {
  const explicitPreference = styleCard?.userPreferences?.emojiUsage;
  if (explicitPreference === "off") {
    return "none";
  }
  if (explicitPreference === "on") {
    return "sparse";
  }

  if (
    includesAny(signalText, [
      "no emoji",
      "never use emoji",
      "no emojis",
      "without emojis",
      "rarely uses emojis",
    ])
  ) {
    return "none";
  }

  const emojiPatterns = styleCard?.emojiPatterns || [];
  if (emojiPatterns.length >= 3) {
    return "expressive";
  }
  if (emojiPatterns.length > 0) {
    return "sparse";
  }

  return "none";
}

function resolveCtaPolicy(args: {
  styleCard: VoiceStyleCard | null;
  lane: VoiceTargetLane;
  signalText: string;
}): VoiceTargetCtaPolicy {
  if (args.lane === "reply") {
    return "question";
  }

  if (includesAny(args.signalText, ["no cta", "without cta", "avoid cta"])) {
    return "none";
  }

  const closers = (args.styleCard?.sentenceClosers || []).map(normalizeText);
  if (closers.some((closer) => closer.includes("thoughts"))) {
    return "thoughts";
  }
  if (closers.some((closer) => closer.includes("?"))) {
    return "question";
  }
  if (closers.length > 0) {
    return "soft_ask";
  }

  return "none";
}

function resolveRisk(args: {
  draftPreference: DraftPreference;
  normalizedMessage: string;
}): VoiceTargetRisk {
  if (
    args.draftPreference === "growth_first" ||
    includesAny(args.normalizedMessage, ["bolder", "spicier", "hotter", "sharper"])
  ) {
    return "bold";
  }

  return "safe";
}

export function resolveVoiceTarget(args: {
  styleCard: VoiceStyleCard | null;
  userMessage: string;
  draftPreference?: DraftPreference;
  formatPreference?: DraftFormatPreference | null;
  lane?: VoiceTargetLane;
}): VoiceTarget {
  const draftPreference = args.draftPreference || "balanced";
  const lane = args.lane || "original";
  const normalizedMessage = normalizeText(args.userMessage);
  const signalText = collectSignals(args.styleCard)
    .map(normalizeText)
    .join(" | ");
  const casing = inferLowercasePreference(args.styleCard) ? "lowercase" : "normal";
  const compression = resolveCompression({
    normalizedMessage,
    signalText,
    formatPreference: args.formatPreference,
  });
  const formality = resolveFormality({
    signalText,
    draftPreference,
  });
  const hookStyle = resolveHookStyle({
    normalizedMessage,
    signalText,
    lane,
  });
  const emojiPolicy = resolveEmojiPolicy(args.styleCard, signalText);
  const ctaPolicy = resolveCtaPolicy({
    styleCard: args.styleCard,
    lane,
    signalText,
  });
  const risk = resolveRisk({
    draftPreference,
    normalizedMessage,
  });

  const rationale = [
    casing === "lowercase"
      ? "Keep the draft in lowercase unless a proper noun or URL clearly needs casing."
      : "Use the creator's normal casing instead of flattening everything to lowercase.",
    compression === "tight"
      ? "Bias toward compressed, fast-reading phrasing."
      : compression === "spacious"
        ? "Give the idea room to develop without losing clarity."
        : "Keep the structure balanced and readable.",
    formality === "casual"
      ? "Stay conversational and unpolished in a good way."
      : formality === "formal"
        ? "Keep the tone more measured than playful."
        : "Stay neutral and direct.",
    hookStyle === "story"
      ? "Lead with a scene, mistake, or lived detail."
      : hookStyle === "contrarian"
        ? "Use a sharper contrast or pushback hook."
        : hookStyle === "curious"
          ? "Open a conversation corridor instead of monologuing."
          : "Land the point fast with a blunt hook.",
    emojiPolicy === "none"
      ? "Skip emojis."
      : emojiPolicy === "sparse"
        ? "Use emoji sparingly if they genuinely fit."
        : "Emoji can help carry tone if it stays natural.",
    ctaPolicy === "none"
      ? "Avoid an explicit CTA unless the draft truly needs one."
      : ctaPolicy === "thoughts"
        ? "If the close needs a CTA, a light 'thoughts?' style ending fits best."
        : ctaPolicy === "question"
          ? "End with a real question when it helps start replies."
          : "If there is a CTA, keep it soft and non-gimmicky.",
    risk === "bold"
      ? "Allow sharper framing as long as it still sounds like the creator."
      : "Keep the framing safe and grounded.",
  ];

  return {
    casing,
    compression,
    formality,
    hookStyle,
    emojiPolicy,
    ctaPolicy,
    risk,
    lane,
    summary:
      `${casing} casing, ${compression} compression, ${formality} tone, ` +
      `${hookStyle} hook, ${emojiPolicy} emoji usage, ${ctaPolicy} CTA, ${risk} risk.`,
    rationale,
  };
}
