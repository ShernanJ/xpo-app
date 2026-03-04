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

interface WelcomeToneProfile {
  lower: boolean;
  casual: boolean;
}

const TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "in",
  "into",
  "ll",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

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

function hasCreatorProfile(
  params: WelcomeFallbackParams,
): params is WelcomeFallbackParams & { creatorProfile: CreatorProfile } {
  return Boolean(params.creatorProfile);
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

function extractKnownOpener(values: string[]): string | null {
  for (const value of values) {
    const match = value.trim().toLowerCase().match(/^(yo|hey|hi|gm|sup|ay)\b/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function inferWelcomeTone(params: WelcomeFallbackParams): WelcomeToneProfile {
  const exampleValues = hasCreatorProfile(params)
    ? [...(params.voiceExamples || [])]
    : [
        ...(params.voiceExamples || []),
        ...(params.conversationExamples || []),
      ];
  const styleText = buildSeedFromValues([
    ...(params.creatorProfile?.voice.styleNotes || []),
    ...(params.creatorProfile?.styleCard.preferredOpeners || []),
    ...(params.creatorProfile?.styleCard.signaturePhrases || []),
    ...(params.creatorProfile?.styleCard.punctuationGuidelines || []),
    ...exampleValues,
  ]).toLowerCase();
  const explicitOpener = extractKnownOpener([
    ...(params.creatorProfile?.styleCard.preferredOpeners || []),
    ...(hasCreatorProfile(params) ? [] : params.conversationExamples || []),
  ]);

  const lower = hasCreatorProfile(params)
    ? prefersLowercase({ creatorProfile: params.creatorProfile })
    : prefersLowercaseFromExamples(exampleValues);

  const casualSignalCount = [
    explicitOpener === "yo" || explicitOpener === "sup" || explicitOpener === "ay",
    /\b(casual|conversational|playful|punchy|internet-native|loose)\b/.test(styleText),
    /\b(yo|sup|ay|lol|lmao|bro|dawg|bet|nah|wanna|gonna)\b/.test(styleText),
  ].filter(Boolean).length;

  const professionalSignalCount = [
    /\b(professional|analytical|operator|structured|clear|concise|clean|formal|executive)\b/.test(styleText),
    explicitOpener === "hi",
  ].filter(Boolean).length;

  return {
    lower,
    casual: casualSignalCount > professionalSignalCount,
  };
}

function formatWelcomeOpener(opener: string, lower: boolean): string {
  return lower ? opener.toLowerCase() : opener.charAt(0).toUpperCase() + opener.slice(1).toLowerCase();
}

function inferWelcomeOpener(params: WelcomeFallbackParams, tone: WelcomeToneProfile): string {
  const seed = buildSeedFromValues([
    params.accountName,
    ...(params.conversationExamples || []),
    ...(params.voiceExamples || []),
  ]).toLowerCase();
  const explicitOpener = extractKnownOpener([
    ...(params.creatorProfile?.styleCard.preferredOpeners || []),
    ...(params.conversationExamples || []),
  ]);

  if (explicitOpener) {
    if (explicitOpener === "yo" && !tone.casual) {
      return formatWelcomeOpener("hey", tone.lower);
    }

    return formatWelcomeOpener(explicitOpener, tone.lower);
  }

  if (tone.casual) {
    return formatWelcomeOpener(pickVariant(seed, ["hey", "yo", "hey"]), tone.lower);
  }

  return formatWelcomeOpener(pickVariant(seed, ["hey", "hi"]), tone.lower);
}

function inferWelcomeQuestion(params: WelcomeFallbackParams, tone: WelcomeToneProfile): string {
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

  const casualLowerOptions = [
    `want to draft, ideate, or ${finalMode}?`,
    `want to draft something, kick around ideas, or ${finalMode}?`,
    `want to write, ideate, or ${finalMode}?`,
  ];
  const casualSentenceOptions = [
    `Want to draft, ideate, or ${finalMode}?`,
    `Want to draft something, kick around ideas, or ${finalMode}?`,
    `Want to write, ideate, or ${finalMode}?`,
  ];
  const professionalLowerOptions = [
    `want to draft, ideate, or refine something?`,
    `want to draft something, develop an idea, or tighten a post?`,
    `want to write, workshop an idea, or refine a post?`,
  ];
  const professionalSentenceOptions = [
    "Want to draft, ideate, or refine something?",
    "Want to draft something, develop an idea, or tighten a post?",
    "Want to write, workshop an idea, or refine a post?",
  ];

  const options = tone.casual
    ? tone.lower
      ? casualLowerOptions
      : casualSentenceOptions
    : tone.lower
      ? professionalLowerOptions
      : professionalSentenceOptions;

  return pickVariant(seed, options);
}

function normalizeTopicPhrase(value: string): string {
  return normalizeSnippet(value, 56)
    .replace(/^["']+|["']+$/g, "")
    .replace(/[.:;!?]+$/g, "")
    .trim();
}

function isUsableTopicHint(value: string): boolean {
  const normalized = normalizeTopicPhrase(value).toLowerCase();
  if (!normalized || normalized.length < 4) {
    return false;
  }

  if (!/^[a-z0-9\s/&'+-]+$/i.test(normalized)) {
    return false;
  }

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9&/+ -]/gi, "").trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  const meaningfulTokens = tokens.filter(
    (token) => token.length >= 3 && !TOPIC_STOPWORDS.has(token),
  );

  if (meaningfulTokens.length === 0) {
    return false;
  }

  const joinedMeaningful = meaningfulTokens.join(" ");
  return joinedMeaningful.length >= 4;
}

function inferTopicLead(params: WelcomeFallbackParams, tone: WelcomeToneProfile): string | null {
  const topicHint = normalizeSnippet(
    params.topicHint ?? buildWelcomeTopicHint(params.creatorProfile) ?? "",
    56,
  );

  if (!topicHint) {
    return null;
  }

  const topicLabel = normalizeTopicPhrase(topicHint);
  if (!topicLabel) {
    return null;
  }

  const seed = buildSeedFromValues([
    params.accountName,
    topicLabel,
    ...(params.voiceExamples || []),
  ]);
  const casualLowerOptions = [
    `you've been around ${topicLabel} lately.`,
    `looks like you've been talking about ${topicLabel} lately.`,
    `seems like ${topicLabel} has been in the mix lately.`,
  ];
  const casualSentenceOptions = [
    `You've been around ${topicLabel} lately.`,
    `Looks like you've been talking about ${topicLabel} lately.`,
    `Seems like ${topicLabel} has been in the mix lately.`,
  ];
  const professionalLowerOptions = [
    `looks like you've been focused on ${topicLabel} lately.`,
    `you've been writing a lot about ${topicLabel} lately.`,
    `seems like ${topicLabel} has been a real theme lately.`,
  ];
  const professionalSentenceOptions = [
    `Looks like you've been focused on ${topicLabel} lately.`,
    `You've been writing a lot about ${topicLabel} lately.`,
    `Seems like ${topicLabel} has been a real theme lately.`,
  ];

  const options = tone.casual
    ? tone.lower
      ? casualLowerOptions
      : casualSentenceOptions
    : tone.lower
      ? professionalLowerOptions
      : professionalSentenceOptions;

  return pickVariant(seed, options);
}

export function isTemplateyWelcomeMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  const hasKnownTemplatePhrase = [
    "what do you want to work on today",
    "what would you like to work on today",
    "how can i help today",
    "how can i help you today",
    "what are we tackling today",
    "what's on the agenda today",
    "drafting, ideating, or auditing?",
    "your recent stuff has been around",
    "been seeing you post things like",
    "you've been circling topics like",
  ].some((candidate) => normalized.includes(candidate));

  const hasQuotedSnippet = /"[^"]{24,}"/.test(message);
  const hasDashTemplate = /@\w+\s-\s/i.test(message);

  return hasKnownTemplatePhrase || hasQuotedSnippet || hasDashTemplate;
}

export function buildWelcomeTopicHint(
  creatorProfile?: CreatorProfile | null,
): string | null {
  if (!creatorProfile) {
    return null;
  }

  const contentPillar = creatorProfile.topics.contentPillars.find((value) =>
    isUsableTopicHint(value),
  );
  if (contentPillar) {
    return normalizeTopicPhrase(contentPillar);
  }

  const dominantTopic = creatorProfile.topics.dominantTopics.find((topic) =>
    isUsableTopicHint(topic.label),
  );
  if (dominantTopic) {
    return normalizeTopicPhrase(dominantTopic.label);
  }

  return null;
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
  const tone = inferWelcomeTone({
    ...params,
    creatorProfile,
    recentUserMessages,
  });
  const opener = inferWelcomeOpener(params, tone);
  const question = inferWelcomeQuestion(params, tone);
  const topicLead = inferTopicLead(params, tone);

  if (!topicLead) {
    return `${opener} ${handle}. ${question}`;
  }

  return `${opener} ${handle}. ${topicLead} ${question}`;
}
