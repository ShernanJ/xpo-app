import type { VoiceStyleCard } from "../core/styleProfile";

interface BuildIdeationReplyArgs {
  intro?: string | null;
  close?: string | null;
  userMessage: string;
  styleCard?: VoiceStyleCard | null;
}

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
}): string {
  if (args.warm) {
    return pickDeterministic(
      [
        "sounds good. i pulled a few ideas for you.",
        "cool, i got a few ideas you can run with.",
      ],
      `${args.seed}|first|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "sounds good. here are a few ideas.",
        "nice. i pulled a few ideas.",
      ],
      `${args.seed}|first|concise`,
    );
  }

  return pickDeterministic(
    [
      "sounds good. i got a few ideas for you.",
      "for sure. here are a few ideas to play with.",
    ],
    `${args.seed}|first|balanced`,
  );
}

function pickMoreIdeasLead(args: {
  seed: string;
  concise: boolean;
  warm: boolean;
}): string {
  if (args.warm) {
    return pickDeterministic(
      [
        "sounds good - i got some more ideas for you.",
        "love it. i pulled together more ideas for you.",
      ],
      `${args.seed}|more|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "sounds good. i got more ideas for you.",
        "nice. got more ideas for you.",
      ],
      `${args.seed}|more|concise`,
    );
  }

  return pickDeterministic(
    [
      "sounds good - i got some more ideas for you.",
      "for sure. i pulled together a fresh batch of ideas for you.",
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
        "here are a few ideas. what do you think?",
        "here are some ideas i thought of. what feels most like you?",
        "here are a few options. want me to draft one?",
      ],
      `${args.seed}|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "here are some ideas. what do you think?",
        "pick one and i'll draft it.",
        "which one should i draft first?",
      ],
      `${args.seed}|concise`,
    );
  }

  return pickDeterministic(
    [
      "here are a few ideas. what do you think?",
      "here are some ideas i thought of. which one should we turn into a draft?",
      "a few options to start. want me to draft one now?",
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
        "here are a few more ideas. what do you think, or want me to switch it up?",
        "here are more options. want me to stay on this theme, or should i take it in a different direction?",
      ],
      `${args.seed}|more|close|warm`,
    );
  }

  if (args.concise) {
    return pickDeterministic(
      [
        "here are more ideas. stay on this theme or switch it up?",
        "more ideas ready. want to stay with this angle or change direction?",
      ],
      `${args.seed}|more|close|concise`,
    );
  }

  return pickDeterministic(
    [
      "here are a few more ideas. what do you think, or want me to switch it up?",
      "fresh ideas below. want me to stick with this theme, or should i take it in a different direction?",
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
  const fallbackClose = pickCasualClose({ seed, concise, warm });
  const closeLine = moreIdeasRequest
    ? pickMoreIdeasClose({ seed, concise, warm })
    : !close || looksRigidAnglePrompt(close)
      ? fallbackClose
      : close;
  const shouldRewriteIntro =
    !intro ||
    looksStiltedIdeationIntro(intro);
  const lead = moreIdeasRequest
    ? pickMoreIdeasLead({ seed, concise, warm })
    : shouldRewriteIntro
      ? pickFirstIdeasLead({ seed, concise, warm })
      : intro;

  if (lead) {
    return applyCase(
      humanizeIdeaWording(`${lead}\n\n${closeLine}`),
      lowercase,
    );
  }

  return applyCase(humanizeIdeaWording(closeLine), lowercase);
}
