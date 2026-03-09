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

const IDEATION_RATIONALE_CUES = [
  "why did you choose these",
  "why did you pick these",
  "why those ideas",
  "why these ideas",
  "how did you choose these",
  "how did you pick these",
  "how did you come up with these",
  "why these",
];

const POST_REFERENCE_CUES = [
  "which post are you referring to",
  "what post are you referring to",
  "which post do you mean",
  "what post do you mean",
  "which tweet are you referring to",
  "what tweet are you referring to",
  "what are you referring to",
];

const CONFUSION_PING_VALUES = new Set([
  "what",
  "what?",
  "what??",
  "huh",
  "huh?",
  "wdym",
  "wdym?",
  "what do you mean",
  "that makes no sense",
  "i explained it though",
  "i already explained it",
  "i literally explained it",
]);

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

function parseAssistantTurns(recentHistory: string): string[] {
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

    if (role === "assistant" || role === "agent") {
      turns.push(content);
    }
  }

  return turns;
}

function extractAssistantAngleTitles(recentHistory: string): string[] {
  if (!recentHistory || recentHistory.trim().toLowerCase() === "none") {
    return [];
  }

  const lines = recentHistory.split(/\r?\n/);
  const titles: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() || "";
    if (!line) {
      continue;
    }

    const inlineMatch = line.match(/^(?:assistant(?:_angles)?\s*:\s*)?\d+\.\s+(.+\?)$/i);
    if (inlineMatch?.[1]) {
      titles.push(inlineMatch[1].trim().replace(/\s+/g, " "));
      continue;
    }

    if (/^(?:assistant(?:_angles)?\s*:\s*)?\d+\.\s*$/i.test(line)) {
      const nextLine = (lines[index + 1] || "").trim();
      if (nextLine && /\?$/.test(nextLine)) {
        titles.push(nextLine.replace(/\s+/g, " "));
      }
    }
  }

  return Array.from(new Set(titles)).slice(-6);
}

function inferTopicFromAngles(angleTitles: string[]): string | null {
  const joined = angleTitles.join(" ").toLowerCase();
  if (!joined.trim()) {
    return null;
  }

  const conversionMatch = joined.match(
    /\b(linkedin|substack|youtube|newsletter)\b[\s\w]{0,20}\b(?:to|into)\b[\s\w]{0,20}\b(x|twitter)\b/i,
  );
  if (conversionMatch?.[1] && conversionMatch?.[2]) {
    return `${conversionMatch[1]} to ${conversionMatch[2]}`;
  }

  const ampmMatch = joined.match(/\bampm\b/i);
  if (ampmMatch) {
    return "ampm vs real life";
  }

  return null;
}

export function looksLikeSourceTransparencyRequest(message: string): boolean {
  const normalized = normalizeForSourceMatching(message);
  if (!normalized) {
    return false;
  }

  return SOURCE_TRANSPARENCY_CUES.some((cue) => normalized.includes(cue));
}

export function looksLikeIdeationRationaleRequest(message: string): boolean {
  const normalized = normalizeForSourceMatching(message);
  if (!normalized) {
    return false;
  }

  return IDEATION_RATIONALE_CUES.some((cue) => normalized.includes(cue));
}

export function looksLikePostReferenceRequest(message: string): boolean {
  const normalized = normalizeForSourceMatching(message);
  if (!normalized) {
    return false;
  }

  return POST_REFERENCE_CUES.some((cue) => normalized.includes(cue));
}

export function looksLikeConfusionPing(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  if (CONFUSION_PING_VALUES.has(normalized)) {
    return true;
  }

  return (
    normalized.length <= 8 &&
    (/^what[?!]*$/.test(normalized) || /^huh[?!]*$/.test(normalized))
  );
}

export function inferIdeationRationaleReply(args: {
  userMessage: string;
  topicSummary: string | null;
  recentHistory: string;
  lastIdeationAngles?: string[];
}): string | null {
  if (!looksLikeIdeationRationaleRequest(args.userMessage)) {
    return null;
  }

  const angleTitles = Array.from(
    new Set([
      ...(args.lastIdeationAngles || []),
      ...extractAssistantAngleTitles(args.recentHistory),
    ]),
  )
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(-3);
  const inferredTopic = inferTopicFromAngles(angleTitles);
  const topic = args.topicSummary?.trim() || inferredTopic || null;

  if (angleTitles.length > 0) {
    const sampled = angleTitles
      .slice(0, 2)
      .map((title, index) => `${index + 1}) ${title}`)
      .join(" ");
    if (topic) {
      return `i chose them to stay in your ${topic} lane and give you different ways in. i was grounding it in the ideas right above: ${sampled}. if you want, i can make the next set tighter or totally different.`;
    }

    return `i chose them to stay close to the lane you asked for and give you different ways to start writing. i was grounding it in the ideas right above: ${sampled}. if you want, i can tighten the next batch.`;
  }

  if (topic) {
    return `i chose them to stay in your ${topic} lane and keep each prompt broad enough to answer from real experience. if you want, i can make the next set more specific.`;
  }

  return "i chose them to stay in the lane you asked for and keep each prompt easy to answer from real experience. if you want, i can make the next set more specific.";
}

export function inferPostReferenceReply(args: {
  userMessage: string;
  recentHistory: string;
}): string | null {
  if (!looksLikePostReferenceRequest(args.userMessage)) {
    return null;
  }

  const recentUrls = Array.from(
    new Set(
      (args.recentHistory.match(/https?:\/\/\S+/g) || []).map((url) =>
        url.replace(/[),.!?]+$/, ""),
      ),
    ),
  );

  if (recentUrls.length > 0) {
    return `i was referring to this link from the chat: ${recentUrls[recentUrls.length - 1]}.`;
  }

  const assistantTurns = parseAssistantTurns(args.recentHistory);
  const assistantPostMention = assistantTurns
    .slice()
    .reverse()
    .find((turn) => /\bpost|tweet|thread\b/i.test(turn));
  if (assistantPostMention) {
    return "i wasn't pointing to a specific post link there - i was referring to the general direction we were discussing. my bad for making that sound concrete.";
  }

  return "i wasn't referring to a specific post there. my bad - i should've asked instead of assuming one.";
}

export function inferSourceTransparencyReply(args: {
  userMessage: string;
  activeDraft: string | null | undefined;
  referenceText?: string | null;
  recentHistory: string;
  contextAnchors: string[];
}): string | null {
  void args.contextAnchors;

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

  const referenceText = (args.referenceText || args.activeDraft || "").trim();
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
  ].map((candidate) => ({
    ...candidate,
    score: scoreSourceMatch(candidate.text, referenceTokens),
    snippet: pickEvidenceSnippet(candidate.text, referenceTokens),
  }));

  const bestMatch = sourceCandidates
    .slice()
    .sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.score < 2 || !bestMatch.text.trim()) {
    return "it didn't come from anything you explicitly said earlier in this chat. that was my mistake and i should've asked first.";
  }

  if (bestMatch.key === "prior_message") {
    return `that came from your prior message in this chat: "${bestMatch.snippet}".`;
  }

  return `that came from earlier in this chat (not your last message): "${bestMatch.snippet}".`;
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
    "i was correcting you",
    "i was just correcting you",
    "that was a correction",
    "that's not a pain point",
    "thats not a pain point",
  ].some((candidate) => normalized.includes(candidate));
}

export function hasConcreteCorrectionDetail(message: string): boolean {
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
    "doesn't",
    "doesnt",
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
    .replace(/^(?:but|and|ok|okay|nah|no)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!,]+$/, "");
}

export function extractLatestCorrectionLock(activeConstraints: string[]): string | null {
  const latest = activeConstraints
    .slice()
    .reverse()
    .find((constraint) => /^Correction lock:/i.test(constraint));

  return latest ? latest.replace(/^Correction lock:\s*/i, "").trim() || null : null;
}

function normalizeTopicToken(value: string): string {
  return value.trim().toLowerCase().replace(/[.?!,]+$/, "");
}

function extractGroundingPayload(constraint: string): string | null {
  if (/^Correction lock:/i.test(constraint)) {
    return constraint.replace(/^Correction lock:\s*/i, "").trim() || null;
  }

  if (/^Topic grounding:/i.test(constraint)) {
    return constraint.replace(/^Topic grounding:\s*/i, "").trim() || null;
  }

  return null;
}

export function extractTopicGrounding(
  activeConstraints: string[],
  topic: string,
): string | null {
  const normalizedTopic = normalizeTopicToken(topic);
  if (!normalizedTopic) {
    return null;
  }

  const details = activeConstraints
    .map((constraint) => extractGroundingPayload(constraint))
    .filter((detail): detail is string => Boolean(detail))
    .filter((detail) => normalizeTopicToken(detail).includes(normalizedTopic));

  const uniqueDetails = Array.from(new Set(details.map((detail) => detail.trim()).filter(Boolean)));
  return uniqueDetails.length > 0 ? uniqueDetails.join(". ") : null;
}

export function buildSemanticCorrectionAcknowledgment(args: {
  userMessage: string;
  activeConstraints: string[];
  hadPendingPlan: boolean;
}): string | null {
  const detail = hasConcreteCorrectionDetail(args.userMessage)
    ? normalizeRepairDetail(args.userMessage)
    : extractLatestCorrectionLock(args.activeConstraints);

  if (!detail) {
    return null;
  }

  const normalized = args.userMessage.trim().toLowerCase();
  const correctionLead =
    normalized.includes("correcting you") ||
    normalized.includes("that was a correction") ||
    normalized.includes("not a pain point")
      ? "right. you were correcting me."
      : "right.";
  const correctionClose = args.hadPendingPlan
    ? " want me to rework the post around that?"
    : " i'll keep that straight from here.";

  return `${correctionLead} i'll keep this factual: ${detail}.${correctionClose}`;
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
