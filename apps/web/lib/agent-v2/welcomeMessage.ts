import type { CreatorProfile } from "@/lib/onboarding/types";

interface WelcomeVoiceContextParams {
  creatorProfile?: CreatorProfile | null;
  recentUserMessages?: string[];
}

interface WelcomeFallbackParams extends WelcomeVoiceContextParams {
  accountName?: string | null;
  topicHint?: string | null;
  voiceExamples?: string[];
  conversationExamples?: string[];
}

function normalizeSnippet(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function collectUniqueSnippets(
  values: string[],
  limit: number,
  maxLength: number,
): string[] {
  const seen = new Set<string>();
  const snippets: string[] = [];

  for (const value of values) {
    const snippet = normalizeSnippet(value, maxLength);
    const key = snippet.toLowerCase();

    if (!snippet || seen.has(key)) {
      continue;
    }

    seen.add(key);
    snippets.push(snippet);

    if (snippets.length >= limit) {
      break;
    }
  }

  return snippets;
}

function prefersLowercase(params: WelcomeVoiceContextParams): boolean {
  const { creatorProfile, recentUserMessages = [] } = params;

  if (creatorProfile) {
    return (
      creatorProfile.voice.primaryCasing === "lowercase" &&
      creatorProfile.voice.lowercaseSharePercent >= 70
    );
  }

  const joined = recentUserMessages.join("");
  const alphaChars = joined.match(/[A-Za-z]/g) ?? [];
  if (alphaChars.length === 0) {
    return true;
  }

  const lowercaseChars = joined.match(/[a-z]/g) ?? [];
  return lowercaseChars.length / alphaChars.length >= 0.75;
}

function buildSeedFromValues(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("|");
}

function pickVariant(seed: string, options: string[]): string {
  if (options.length === 0) {
    return "";
  }

  const score = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return options[score % options.length];
}

function prefersLowercaseFromExamples(values: string[]): boolean {
  const joined = values.join("");
  const alphaChars = joined.match(/[A-Za-z]/g) ?? [];
  if (alphaChars.length === 0) {
    return true;
  }

  const lowercaseChars = joined.match(/[a-z]/g) ?? [];
  return lowercaseChars.length / alphaChars.length >= 0.75;
}

function inferWelcomeOpener(params: WelcomeFallbackParams, lower: boolean): string {
  const seed = buildSeedFromValues([
    params.accountName,
    ...(params.conversationExamples || []),
    ...(params.voiceExamples || []),
  ]).toLowerCase();

  if (seed.includes("yo")) {
    return lower ? "yo" : "Yo";
  }

  if (lower) {
    return pickVariant(seed, ["yo", "yo", "ay"]);
  }

  return pickVariant(seed, ["Hey", "Hi", "Yo"]);
}

function inferWelcomeQuestion(params: WelcomeFallbackParams, lower: boolean): string {
  const seed = buildSeedFromValues([
    params.accountName,
    params.topicHint,
    ...(params.recentUserMessages || []),
    ...(params.conversationExamples || []),
  ]).toLowerCase();
  const mentionsAudit =
    seed.includes("audit") || seed.includes("analy") || seed.includes("review");
  const mentionsTighten =
    seed.includes("tighten") || seed.includes("tweak") || seed.includes("edit");

  const finalMode = mentionsAudit
    ? "auditing"
    : mentionsTighten
      ? "tightening something up"
      : "tightening something up";

  const lowerOptions = [
    `what are we working on today - drafting, ideating, or ${finalMode}?`,
    `what's the move today - drafting, ideating, or ${finalMode}?`,
    `what are we tackling - drafting, ideating, or ${finalMode}?`,
  ];
  const sentenceOptions = [
    `What are we working on today - drafting, ideating, or ${finalMode}?`,
    `What's the move today - drafting, ideating, or ${finalMode}?`,
    `What are we tackling - drafting, ideating, or ${finalMode}?`,
  ];

  return pickVariant(seed, lower ? lowerOptions : sentenceOptions);
}

function inferTopicLead(params: WelcomeFallbackParams, lower: boolean): string | null {
  const topicHint = normalizeSnippet(
    params.topicHint ?? buildWelcomeTopicHint(params.creatorProfile) ?? "",
    72,
  );

  if (!topicHint) {
    return null;
  }

  const seed = buildSeedFromValues([
    params.accountName,
    topicHint,
    ...(params.voiceExamples || []),
  ]);
  const lowerOptions = [
    `been seeing you post things like "${topicHint}".`,
    `your recent stuff has been around "${topicHint}".`,
    `you've been circling topics like "${topicHint}".`,
  ];
  const sentenceOptions = [
    `Been seeing you post things like "${topicHint}".`,
    `Your recent stuff has been around "${topicHint}".`,
    `You've been circling topics like "${topicHint}".`,
  ];

  return pickVariant(seed, lower ? lowerOptions : sentenceOptions);
}

export function isTemplateyWelcomeMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return [
    "what do you want to work on today",
    "what would you like to work on today",
    "how can i help today",
    "how can i help you today",
    "what are we tackling today",
    "what's on the agenda today",
    "drafting, ideating, or auditing?",
  ].some((candidate) => normalized.includes(candidate));
}

export function buildWelcomeTopicHint(
  creatorProfile?: CreatorProfile | null,
): string | null {
  if (!creatorProfile) {
    return null;
  }

  const sourcePost =
    creatorProfile.examples.bestPerforming[0] ??
    creatorProfile.examples.voiceAnchors[0] ??
    creatorProfile.examples.replyVoiceAnchors[0] ??
    creatorProfile.examples.quoteVoiceAnchors[0];

  return sourcePost ? normalizeSnippet(sourcePost.text, 90) : null;
}

export function buildWelcomeVoiceContext(params: WelcomeVoiceContextParams): {
  toneGuide: string;
  voiceExamples: string[];
  conversationExamples: string[];
} {
  const { creatorProfile, recentUserMessages = [] } = params;
  const conversationExamples = collectUniqueSnippets(recentUserMessages, 3, 140);

  if (!creatorProfile) {
    return {
      toneGuide: conversationExamples.length > 0
        ? `Mirror a direct, casual peer. When they message the agent, they sound like: ${conversationExamples.map((example) => `"${example}"`).join(" | ")}`
        : "Mirror a direct, casual peer.",
      voiceExamples: [],
      conversationExamples,
    };
  }

  const { voice, styleCard, examples } = creatorProfile;
  const toneCues: string[] = [
    prefersLowercase(params)
      ? "Default to lowercase unless a quoted example clearly suggests otherwise."
      : "Use natural sentence casing.",
  ];

  if (voice.styleNotes.length > 0) {
    toneCues.push(`Style notes: ${voice.styleNotes.slice(0, 2).join(" | ")}`);
  }

  if (styleCard.preferredOpeners.length > 0) {
    toneCues.push(`Common openers: ${styleCard.preferredOpeners.slice(0, 2).join(" | ")}`);
  }

  if (styleCard.signaturePhrases.length > 0) {
    toneCues.push(`Signature phrases: ${styleCard.signaturePhrases.slice(0, 3).join(" | ")}`);
  }

  if (styleCard.punctuationGuidelines.length > 0) {
    toneCues.push(`Punctuation: ${styleCard.punctuationGuidelines.slice(0, 2).join(" | ")}`);
  }

  if (styleCard.emojiPolicy) {
    toneCues.push(`Emoji policy: ${styleCard.emojiPolicy}`);
  }

  if (conversationExamples.length > 0) {
    toneCues.push(
      `When they message the agent, they sound like: ${conversationExamples.map((example) => `"${example}"`).join(" | ")}`,
    );
  }

  const voiceExamples = collectUniqueSnippets(
    [
      ...examples.voiceAnchors.map((post) => post.text),
      ...examples.replyVoiceAnchors.map((post) => post.text),
      ...examples.quoteVoiceAnchors.map((post) => post.text),
      ...examples.bestPerforming.map((post) => post.text),
    ],
    3,
    160,
  );

  return {
    toneGuide: toneCues.join(" "),
    voiceExamples,
    conversationExamples,
  };
}

export function buildWelcomeFallbackMessage(params: WelcomeFallbackParams): string {
  const { accountName, creatorProfile, recentUserMessages = [] } = params;
  const normalizedHandle = (accountName ?? "there").trim().replace(/^@+/, "") || "there";
  const handle = normalizedHandle === "there" ? "there" : `@${normalizedHandle}`;
  const lower =
    prefersLowercase({ creatorProfile, recentUserMessages }) ||
    prefersLowercaseFromExamples([
      ...(params.voiceExamples || []),
      ...(params.conversationExamples || []),
    ]);
  const opener = inferWelcomeOpener(params, lower);
  const question = inferWelcomeQuestion(params, lower);
  const topicLead = inferTopicLead(params, lower);

  if (!topicLead) {
    return `${opener} ${handle} - ${question}`;
  }

  return `${opener} ${handle} - ${topicLead} ${question}`;
}
