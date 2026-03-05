import type { ClarificationState } from "../contracts/chat";

const SOURCE_TRANSPARENCY_CUES = [
  "where did you get that",
  "where did that come from",
  "where did you get that information",
  "where did you get this information",
  "where did you get the idea",
  "where did this come from",
  "what is that based on",
  "what's that based on",
  "what are you basing this on",
  "what's the source",
  "source for that",
];

const SOURCE_TOKEN_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "because",
  "before",
  "between",
  "could",
  "doing",
  "from",
  "have",
  "here",
  "into",
  "just",
  "like",
  "more",
  "most",
  "much",
  "only",
  "other",
  "over",
  "same",
  "some",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "you",
  "dont",
  "didnt",
  "wont",
  "cant",
  "should",
  "couldnt",
  "im",
  "ive",
  "it's",
  "thats",
  "that's",
]);

function normalizeForSourceMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSourceTokens(value: string): string[] {
  const normalized = normalizeForSourceMatching(value);
  if (!normalized) {
    return [];
  }

  const unique: string[] = [];
  for (const token of normalized.split(" ")) {
    const isNumeric = /^[0-9]+$/.test(token);
    const keepToken = isNumeric ? token.length >= 2 : token.length >= 4;
    if (!keepToken || SOURCE_TOKEN_STOPWORDS.has(token) || unique.includes(token)) {
      continue;
    }
    unique.push(token);
    if (unique.length >= 24) {
      break;
    }
  }

  return unique;
}

function scoreSourceMatch(sourceText: string, referenceTokens: string[]): number {
  if (!sourceText.trim() || referenceTokens.length === 0) {
    return 0;
  }

  const sourceTokenSet = new Set(extractSourceTokens(sourceText));
  let score = 0;

  for (const token of referenceTokens) {
    if (!sourceTokenSet.has(token)) {
      continue;
    }
    score += /^[0-9]+$/.test(token) || token.length >= 8 ? 2 : 1;
  }

  return score;
}

function truncateSourceSnippet(value: string, maxLength = 90): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function pickEvidenceSnippet(sourceText: string, referenceTokens: string[]): string {
  const segments = sourceText
    .split(/[\n.!?]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (segments.length === 0) {
    return "";
  }

  let bestSegment = segments[0];
  let bestScore = scoreSourceMatch(segments[0], referenceTokens);

  for (const segment of segments.slice(1)) {
    const score = scoreSourceMatch(segment, referenceTokens);
    if (score > bestScore) {
      bestSegment = segment;
      bestScore = score;
    }
  }

  return truncateSourceSnippet(bestSegment);
}

function parseUserTurns(recentHistory: string): string[] {
  if (!recentHistory || recentHistory.trim().toLowerCase() === "none") {
    return [];
  }

  const turns: string[] = [];
  for (const rawLine of recentHistory.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^([a-z_]+)\s*:\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const role = match[1].toLowerCase();
    const content = match[2]?.trim() || "";
    if (!content) {
      continue;
    }

    if (role === "user" || role === "human" || role === "creator") {
      turns.push(content);
    }
  }

  return turns;
}

export function looksLikeSourceTransparencyRequest(message: string): boolean {
  const normalized = normalizeForSourceMatching(message);
  if (!normalized) {
    return false;
  }

  return SOURCE_TRANSPARENCY_CUES.some((cue) => normalized.includes(cue));
}

export function inferSourceTransparencyReply(args: {
  userMessage: string;
  activeDraft: string | null | undefined;
  recentHistory: string;
  contextAnchors: string[];
}): string | null {
  if (!looksLikeSourceTransparencyRequest(args.userMessage)) {
    return null;
  }

  const userTurns = parseUserTurns(args.recentHistory);
  const normalizedUserMessage = normalizeForSourceMatching(args.userMessage);
  const chatTurns = [...userTurns];

  if (
    chatTurns.length > 0 &&
    normalizeForSourceMatching(chatTurns[chatTurns.length - 1] || "") === normalizedUserMessage
  ) {
    chatTurns.pop();
  }

  const priorMessage = chatTurns.length > 0 ? chatTurns[chatTurns.length - 1] : "";
  const earlierChat = chatTurns.length > 1 ? chatTurns.slice(0, -1).join(" ") : "";
  const styleMemory = (args.contextAnchors || []).filter(Boolean).join(" ");

  const referenceText = (args.activeDraft || "").trim();
  const referenceTokens = extractSourceTokens(referenceText);
  const sourceCandidates = [
    {
      key: "prior_message" as const,
      label: "prior message",
      text: priorMessage,
    },
    {
      key: "current_chat" as const,
      label: "current chat",
      text: earlierChat,
    },
    {
      key: "style_memory" as const,
      label: "style memory",
      text: styleMemory,
    },
  ].map((candidate) => ({
    ...candidate,
    score: scoreSourceMatch(candidate.text, referenceTokens),
    snippet: pickEvidenceSnippet(candidate.text, referenceTokens),
  }));

  const bestMatch = sourceCandidates
    .slice()
    .sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.score < 2 || !bestMatch.text.trim()) {
    return "it didn't come from your prior message, current chat, or style memory. that was my mistake and i should've asked first.";
  }

  if (bestMatch.key === "prior_message") {
    return `that came from your prior message in this chat: "${bestMatch.snippet}".`;
  }

  if (bestMatch.key === "current_chat") {
    return `that came from earlier in this chat (not your last message): "${bestMatch.snippet}".`;
  }

  return `that came from style memory i had saved for you: "${bestMatch.snippet}".`;
}

export function looksLikeSemanticCorrection(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return [
    "not what i meant",
    "that's not what i meant",
    "thats not what i meant",
    "you assumed",
    "you just assumed",
    "you misunderstood",
    "you misread",
    "you flipped it",
    "you flipped it around",
    "you got it backwards",
    "that's backwards",
    "thats backwards",
    "that's not right",
    "thats not right",
    "that doesn't make sense",
    "that doesnt make sense",
    "this doesn't make sense",
    "this doesnt make sense",
    "where did you get that",
    "where did that come from",
    "where did you get that information",
    "where did you get this information",
    "where did you get the idea",
    "why did you write",
    "that was a question",
    "no that was a question",
    "dont falsify",
    "don't falsify",
    "do not falsify",
    "i dont wanna falsify",
    "i don't wanna falsify",
    "that's fake",
    "thats fake",
    "made up",
    "you made this up",
    "invented",
    "hallucinated",
    "you didn't ask",
    "you didnt ask",
  ].some((candidate) => normalized.includes(candidate));
}

function hasConcreteCorrectionDetail(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  if (normalized.length < 24) {
    return false;
  }

  return [
    "actually",
    "it's ",
    "its ",
    "it is ",
    "i mean",
    "the point is",
    "the real point",
    "the issue is",
    "what i mean is",
    "what i meant is",
    "my extension",
    "my app",
    "my tool",
    "it helps",
    "it does",
    "it lets",
    "it works",
    "it converts",
    "it rewrites",
    "works for",
    "because",
  ].some((candidate) => normalized.includes(candidate));
}

export function inferCorrectionRepairQuestion(
  userMessage: string,
  topicSummary: string | null,
): string | null {
  if (!looksLikeSemanticCorrection(userMessage)) {
    return null;
  }

  if (hasConcreteCorrectionDetail(userMessage)) {
    return null;
  }

  const normalized = userMessage.trim().toLowerCase();
  const topic = topicSummary?.trim().replace(/[.?!,]+$/, "") || "this";

  if (
    normalized.includes("you flipped it") ||
    normalized.includes("backwards") ||
    normalized.includes("misread")
  ) {
    return `got you. what's the exact relationship i should keep straight about ${topic}?`;
  }

  if (normalized.includes("you assumed") || normalized.includes("you didn't ask")) {
    return `fair. what's the key detail about ${topic} that i should've asked before drafting?`;
  }

  if (normalized.includes("where did you get the idea") || normalized.includes("why did you write")) {
    return `fair call. what should the post say instead of that assumption?`;
  }

  if (
    normalized.includes("where did you get that") ||
    normalized.includes("where did that come from") ||
    normalized.includes("falsify") ||
    normalized.includes("fake") ||
    normalized.includes("made up") ||
    normalized.includes("invented") ||
    normalized.includes("hallucinated")
  ) {
    return "fair call. what should i keep factual, and what should i strip out before i rewrite it?";
  }

  if (normalized.includes("that was a question")) {
    return "got it. do you want me to answer that question directly, or turn it into a draft?";
  }

  return `got you. what's the exact point about ${topic} i should lock onto before i rewrite it?`;
}

function normalizeRepairDetail(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!,]+$/, "");
}

export function buildSemanticRepairState(topicSummary: string | null): ClarificationState {
  return {
    branchKey: "semantic_repair",
    stepKey: "await_exact_fix",
    seedTopic: topicSummary,
    options: [],
  };
}

export function buildSemanticRepairDirective(
  userMessage: string,
  topicSummary: string | null,
): { constraint: string; rewriteRequest: string } {
  const detail = normalizeRepairDetail(userMessage);
  const topic = topicSummary?.trim().replace(/[.?!,]+$/, "") || "the topic";
  const constraint = `Correction lock: ${detail}`;

  return {
    constraint,
    rewriteRequest:
      `edit the current draft to reflect this exact correction about ${topic}: ${detail}. ` +
      "remove the old assumption and keep this relationship accurate.",
  };
}
