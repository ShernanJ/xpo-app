import type { VoiceStyleCard } from "../core/styleProfile";

type CadenceTone = "blunt" | "balanced" | "warm";

export interface CadenceProfile {
  lowercase: boolean;
  tone: CadenceTone;
}

export interface ToneBuckets {
  blunt: string[];
  balanced: string[];
  warm: string[];
}

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic(options: string[], seed: string): string {
  return options[deterministicIndex(seed, options.length)];
}

function inferLowercasePreference(styleCard: VoiceStyleCard | null | undefined): boolean {
  if (!styleCard) {
    return false;
  }

  const explicitCasing = styleCard.userPreferences?.casing;
  if (explicitCasing === "lowercase") {
    return true;
  }
  if (explicitCasing === "normal" || explicitCasing === "uppercase") {
    return false;
  }

  const signals = [
    ...(styleCard.formattingRules || []),
    ...(styleCard.customGuidelines || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    signals.includes("all lowercase") ||
    signals.includes("always lowercase") ||
    signals.includes("never uses capitalization") ||
    signals.includes("no uppercase")
  );
}

function inferCadenceTone(
  userMessage: string,
  styleCard: VoiceStyleCard | null | undefined,
): CadenceTone {
  const normalized = userMessage.trim().toLowerCase();
  const styleSignals = [
    styleCard?.pacing || "",
    ...(styleCard?.customGuidelines || []),
    ...(styleCard?.sentenceOpenings || []),
    ...(styleCard?.sentenceClosers || []),
  ]
    .join(" ")
    .toLowerCase();

  let bluntScore = 0;
  let warmScore = 0;

  if (styleCard?.userPreferences?.writingGoal === "growth_first") {
    bluntScore += 1;
  }
  if (styleCard?.userPreferences?.writingGoal === "voice_first") {
    warmScore += 1;
  }

  if (
    [
      "blunt",
      "direct",
      "tight",
      "concise",
      "short",
      "punchy",
      "no fluff",
    ].some((cue) => styleSignals.includes(cue))
  ) {
    bluntScore += 2;
  }

  if (
    [
      "warm",
      "friendly",
      "human",
      "casual",
      "conversational",
      "supportive",
      "empathetic",
      "playful",
    ].some((cue) => styleSignals.includes(cue))
  ) {
    warmScore += 2;
  }

  if (
    [
      "just",
      "do it",
      "write it",
      "ship it",
      "go ahead",
      "make it",
      "tighten",
      "shorter",
      "faster",
      "quick",
    ].some((cue) => normalized.includes(cue))
  ) {
    bluntScore += 1;
  }

  if (
    [
      "please",
      "pls",
      "could you",
      "can you",
      "would you",
      "thanks",
      "thank you",
      "appreciate",
      "haha",
      "lol",
    ].some((cue) => normalized.includes(cue))
  ) {
    warmScore += 1;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount <= 4) {
    bluntScore += 1;
  }

  if (bluntScore >= warmScore + 2) {
    return "blunt";
  }

  if (warmScore >= bluntScore + 2) {
    return "warm";
  }

  return "balanced";
}

export function resolveCadenceProfile(args: {
  userMessage: string;
  styleCard?: VoiceStyleCard | null;
}): CadenceProfile {
  return {
    lowercase: inferLowercasePreference(args.styleCard),
    tone: inferCadenceTone(args.userMessage, args.styleCard),
  };
}

function applyCadenceCase(value: string, profile: CadenceProfile): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!profile.lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function pickToneOption(
  options: ToneBuckets,
  profile: CadenceProfile,
  seed: string,
): string {
  const bucket =
    profile.tone === "blunt"
      ? options.blunt
      : profile.tone === "warm"
        ? options.warm
        : options.balanced;

  return pickDeterministic(bucket, `${seed}|${profile.tone}`);
}

export function buildCadenceReply(args: {
  action: ToneBuckets;
  followUp: ToneBuckets;
  profile: CadenceProfile;
  seed: string;
}): string {
  const actionLine = pickToneOption(args.action, args.profile, `${args.seed}|action`);
  const followUp = pickToneOption(args.followUp, args.profile, `${args.seed}|follow`);
  return applyCadenceCase(`${actionLine} ${followUp}`, args.profile);
}
