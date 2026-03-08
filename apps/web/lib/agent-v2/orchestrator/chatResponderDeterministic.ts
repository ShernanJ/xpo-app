const GREETING_CUES = [
  "hi",
  "hey",
  "hello",
  "yo",
  "sup",
  "what's up",
  "whats up",
  "how are you",
  "how're you",
  "how are u",
  "how you doing",
  "how's it going",
];

const SMALL_TALK_STATUS_CUES = [
  "good",
  "great",
  "pretty good",
  "doing good",
  "doing well",
  "all good",
  "solid",
  "chilling",
  "vibing",
  "hanging in",
  "not bad",
  "tired",
  "busy",
];

const META_ASSISTANT_CUES = [
  "sound more human",
  "sound more natural",
  "sound less robotic",
  "sound less like a bot",
  "make you sound more human",
  "make u sound more human",
  "make this sound more human",
  "make it sound more human",
  "how do i make you sound more human",
  "how do i make u sound more human",
  "why do you sound robotic",
  "why do u sound robotic",
  "why do you sound like a bot",
  "how do i make this flow better",
  "how do i make this more conversational",
];

const CHAT_RESET_CUES = [
  "super random",
  "that's random",
  "thats random",
  "kinda random",
  "kind of random",
  "why are you asking that",
];

const CAPABILITY_CUES = [
  "what can you do",
  "how can you help",
  "what do you do",
  "help me grow",
  "i want to grow",
  "help me write",
];

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/g, "")
    .replace(/\s+/g, " ");
}

function getLastAssistantTurn(recentHistory: string): string {
  const assistantTurns = recentHistory
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("assistant:"));

  return assistantTurns[assistantTurns.length - 1]?.toLowerCase() || "";
}

function looksLikeGreeting(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  if (GREETING_CUES.some((cue) => normalized === cue)) {
    return true;
  }

  const greetingPrefix = GREETING_CUES.find((cue) => normalized.startsWith(`${cue} `));
  if (!greetingPrefix || normalized.length > 40) {
    return false;
  }

  const remainder = normalized.slice(greetingPrefix.length).trim();
  return [
    "there",
    "hey",
    "hello",
    "how are you",
    "how are u",
    "how you doing",
    "how's it going",
    "what's up",
    "whats up",
  ].some((value) => remainder === value);
}

function assistantWasDoingSmallTalk(recentHistory: string): boolean {
  const lastAssistantTurn = getLastAssistantTurn(recentHistory);
  if (!lastAssistantTurn) {
    return false;
  }

  return (
    lastAssistantTurn.includes("how are you") ||
    lastAssistantTurn.includes("how are u") ||
    lastAssistantTurn.includes("how you doing") ||
    /\byou\?\s*$/.test(lastAssistantTurn.trim())
  );
}

function looksLikeSmallTalkReply(message: string, recentHistory: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 80 || !assistantWasDoingSmallTalk(recentHistory)) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return (
    wordCount <= 4 &&
    SMALL_TALK_STATUS_CUES.some((cue) => normalized === cue || normalized.includes(cue))
  );
}

function looksLikeMetaAssistantQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return META_ASSISTANT_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeConversationReset(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  return CHAT_RESET_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeCapabilityQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return CAPABILITY_CUES.some((cue) => normalized.includes(cue));
}

function buildGreetingReply(message: string): string {
  const normalized = normalizeMessage(message);
  if (
    normalized.includes("how are you") ||
    normalized.includes("how are u") ||
    normalized.includes("how you doing") ||
    normalized.includes("how's it going")
  ) {
    return "doing good. you?";
  }

  return "hey. i can help with post ideas, drafts, or tightening something you've already got.";
}

function buildSmallTalkReply(): string {
  return "nice. i can help with post ideas, draft something, or tighten up something you've already got.";
}

function buildConversationResetReply(): string {
  return "fair. i can help with post ideas, draft something, or tighten up something you've already got.";
}

function buildMetaAssistantReply(): string {
  return "react to what they actually said, use contractions, and don't jump into strategy too early. paste a reply and i'll make it sound more natural.";
}

function buildCapabilityReply(): string {
  return "i can help you figure out what to post, draft in your voice, revise drafts, and give growth feedback without making you overthink it.";
}

export function getDeterministicChatReply(args: {
  userMessage: string;
  recentHistory: string;
}): string | null {
  if (looksLikeGreeting(args.userMessage)) {
    return buildGreetingReply(args.userMessage);
  }

  if (looksLikeSmallTalkReply(args.userMessage, args.recentHistory)) {
    return buildSmallTalkReply();
  }

  if (looksLikeConversationReset(args.userMessage)) {
    return buildConversationResetReply();
  }

  if (looksLikeCapabilityQuestion(args.userMessage)) {
    return buildCapabilityReply();
  }

  if (looksLikeMetaAssistantQuestion(args.userMessage)) {
    return buildMetaAssistantReply();
  }

  return null;
}
