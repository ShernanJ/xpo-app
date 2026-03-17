import type { VoiceStyleCard } from "../core/styleProfile";

interface BuildIdeationReplyArgs {
  intro?: string | null;
  close?: string | null;
  userMessage: string;
  styleCard?: VoiceStyleCard | null;
  primaryAngleChipMode?: boolean;
}

type IdeationArtifact = "post" | "thread" | null;

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic(options: string[], seed: string): string {
  return options[deterministicIndex(seed, options.length)];
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureQuestion(value: string): string {
  const normalized = normalizeLine(value);
  if (!normalized) {
    return "";
  }

  if (/[?]$/.test(normalized)) {
    return normalized;
  }

  return `${normalized.replace(/[.!;:,]+$/, "")}?`;
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

function inferConcisePreference(styleCard: VoiceStyleCard | null | undefined): boolean {
  const pacing = styleCard?.pacing?.toLowerCase() || "";
  const guidance = (styleCard?.customGuidelines || []).join(" ").toLowerCase();
  const writingGoal = styleCard?.userPreferences?.writingGoal;

  return (
    writingGoal === "growth_first" ||
    pacing.includes("short") ||
    pacing.includes("punchy") ||
    pacing.includes("bullet") ||
    pacing.includes("scan") ||
    guidance.includes("blunt") ||
    guidance.includes("direct") ||
    guidance.includes("tight")
  );
}

function inferWarmPreference(
  styleCard: VoiceStyleCard | null | undefined,
  userMessage: string,
): boolean {
  const normalizedMessage = userMessage.trim().toLowerCase();
  const styleSignals = [
    styleCard?.pacing || "",
    ...(styleCard?.customGuidelines || []),
    ...(styleCard?.sentenceOpenings || []),
    ...(styleCard?.sentenceClosers || []),
  ]
    .join(" ")
    .toLowerCase();

  return (
    [
      "warm",
      "friendly",
      "human",
      "casual",
      "conversational",
      "playful",
      "supportive",
      "empathetic",
    ].some((cue) => styleSignals.includes(cue)) ||
    ["please", "thanks", "thank you", "lol", "haha"].some((cue) =>
      normalizedMessage.includes(cue),
    )
  );
}

function applyCase(value: string, lowercase: boolean): string {
  const normalized = normalizeLine(value);
  if (!lowercase) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function humanizeIdeaWording(value: string): string {
  return value
    .replace(/\bhere are some angles\b/gi, "here are some ideas i thought of")
    .replace(/\bhere are a few angles\b/gi, "here are some ideas i thought of");
}

function inferRequestedArtifact(userMessage: string): IdeationArtifact {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/\bthread\b/.test(normalized)) {
    return "thread";
  }

  if (/\bpost\b|\btweet\b/.test(normalized)) {
    return "post";
  }

  return null;
}

function isLooseDraftIdeationRequest(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  return (
    /\b(?:write|draft|make|generate|create)\b/.test(normalized) &&
    /\b(?:post|thread|tweet)\b/.test(normalized)
  );
}

function looksRigidAnglePrompt(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\bwhich angle\b/.test(normalized) ||
    /\bflesh(?:ing)? out\b/.test(normalized) ||
    /\bworth fleshing\b/.test(normalized) ||
    /\bfull post\b/.test(normalized) ||
    /\bwhich one do you want to\b/.test(normalized)
  );
}

function isMoreIdeasRequest(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\bmore\s+(?:post\s+)?ideas?\b/.test(normalized) ||
    /\banother\s+(?:post\s+)?idea\b/.test(normalized) ||
    /\bmore\s+angles?\b/.test(normalized)
  );
}

function looksStiltedIdeationIntro(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /^(?:gotcha|sounds good|for sure|nice|cool)\b/.test(normalized) ||
    /\bsaw your\b/.test(normalized) ||
    /\bnoticed you\b/.test(normalized) ||
    /\byou keep riffing\b/.test(normalized) ||
    /\briff(?:ing)? on\b/.test(normalized) ||
    /\bpeople love\b/.test(normalized) ||
    /\blet'?s spin that into\b/.test(normalized) ||
    /\byou wanna spin\b/.test(normalized) ||
    /\bshow(?:s|ing)? off\b/.test(normalized) ||
    /\bplay to your\b/.test(normalized) ||
    /\bculture clash\b/.test(normalized)
  );
}

function pickFirstIdeasLead(args: {
  seed: string;
  concise: boolean;
  warm: boolean;
  artifact: IdeationArtifact;
}): string {
  if (args.artifact === "thread") {
    return "here are a few thread directions.";
  }

  if (args.artifact === "post") {
    return "here are a few post directions.";
  }

  if (args.warm) {
    return pickDeterministic(
      [
        "i pulled a few ideas.",
        "here are a few directions.",
      ],
      `${args.seed}|first|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "here are a few ideas.",
        "a few ideas below.",
      ],
      `${args.seed}|first|concise`,
    );
  }

  return pickDeterministic(
    [
      "i pulled a few ideas.",
      "here are a few directions.",
    ],
    `${args.seed}|first|balanced`,
  );
}

function pickMoreIdeasLead(args: {
  seed: string;
  concise: boolean;
  warm: boolean;
  artifact: IdeationArtifact;
}): string {
  if (args.artifact === "thread") {
    return "more thread directions below.";
  }

  if (args.artifact === "post") {
    return "more post directions below.";
  }

  if (args.warm) {
    return pickDeterministic(
      [
        "i pulled more ideas.",
        "more ideas below.",
      ],
      `${args.seed}|more|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "more ideas below.",
        "got more ideas.",
      ],
      `${args.seed}|more|concise`,
    );
  }

  return pickDeterministic(
    [
      "more ideas below.",
      "i pulled another batch.",
    ],
    `${args.seed}|more|balanced`,
  );
}

function pickCasualClose(args: {
  seed: string;
  concise: boolean;
  warm: boolean;
}): string {
  if (args.warm) {
    return pickDeterministic(
      [
        "pick one and i can draft it.",
        "which one feels most like you?",
        "want one drafted?",
      ],
      `${args.seed}|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "pick one and i'll draft it.",
        "pick one and i'll draft it.",
        "which one should i draft first?",
      ],
      `${args.seed}|concise`,
    );
  }

  return pickDeterministic(
    [
      "pick one and i'll draft it.",
      "which one should i draft first?",
      "if one works, i'll draft it.",
    ],
    `${args.seed}|balanced`,
  );
}

function pickMoreIdeasClose(args: {
  seed: string;
  concise: boolean;
  warm: boolean;
}): string {
  if (args.warm) {
    return pickDeterministic(
      [
        "want me to stay on this theme or change direction?",
        "want more in this lane or a different angle?",
      ],
      `${args.seed}|more|close|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "stay on this theme or change direction?",
        "more in this lane or a different angle?",
      ],
      `${args.seed}|more|close|concise`,
    );
  }

  return pickDeterministic(
    [
      "stay on this theme or change direction?",
      "want more in this lane or a different angle?",
    ],
    `${args.seed}|more|close|balanced`,
  );
}

export function buildIdeationReply(args: BuildIdeationReplyArgs): string {
  const intro = normalizeLine(args.intro || "");
  const close = ensureQuestion(args.close || "");
  const seed = [
    args.userMessage.trim().toLowerCase(),
    intro.toLowerCase(),
    close.toLowerCase(),
  ].join("|");
  const lowercase = inferLowercasePreference(args.styleCard);
  const concise = inferConcisePreference(args.styleCard);
  const warm = inferWarmPreference(args.styleCard, args.userMessage);
  const moreIdeasRequest = isMoreIdeasRequest(args.userMessage);
  const artifact = inferRequestedArtifact(args.userMessage);

  if (args.primaryAngleChipMode) {
    const lead =
      artifact === "thread"
        ? "i pulled three thread directions."
        : artifact === "post"
          ? "i pulled three post directions."
          : "i pulled three directions.";
    const closeLine = pickCasualClose({ seed, concise, warm });

    return applyCase(`${lead}\n\n${closeLine}`, lowercase);
  }

  const fallbackClose = pickCasualClose({ seed, concise, warm });
  const closeLine = moreIdeasRequest
    ? pickMoreIdeasClose({ seed, concise, warm })
      : !close || looksRigidAnglePrompt(close)
      ? fallbackClose
      : close;
  const shouldRewriteIntro =
    !intro ||
    looksStiltedIdeationIntro(intro) ||
    isLooseDraftIdeationRequest(args.userMessage);
  const lead = moreIdeasRequest
    ? pickMoreIdeasLead({ seed, concise, warm, artifact })
    : shouldRewriteIntro
      ? pickFirstIdeasLead({ seed, concise, warm, artifact })
      : intro;

  if (lead) {
    return applyCase(
      humanizeIdeaWording(`${lead}\n\n${closeLine}`),
      lowercase,
    );
  }

  return applyCase(humanizeIdeaWording(closeLine), lowercase);
}
