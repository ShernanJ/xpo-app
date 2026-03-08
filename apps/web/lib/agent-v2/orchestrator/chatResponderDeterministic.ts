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
  "help me grow on x",
  "help me grow on twitter",
  "help with x growth",
  "help with twitter growth",
  "grow on x",
  "grow on twitter",
  "grow my account",
  "i want to grow",
  "help me write",
];

const USER_KNOWLEDGE_CUES = [
  "what do you know about me",
  "what do you know abt me",
  "summarize me",
  "what are my preferences",
  "what do you know about my writing",
];

const PERFORMANCE_CUES = [
  "highest performing post",
  "highest performing posts",
  "best post",
  "best tweet",
  "top post",
  "top tweet",
  "most comments",
  "most likes",
  "best performing",
];

const VISUAL_ADVICE_CUES = [
  "should i use images",
  "should i use image",
  "should i use an image",
  "should i use visuals",
  "should i use screenshots",
  "should i add an image",
  "should i add images",
];

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.?!,:;]+$/g, "")
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

function looksLikeUserKnowledgeQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return USER_KNOWLEDGE_CUES.some((cue) => normalized.includes(cue));
}

function looksLikePerformanceQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return PERFORMANCE_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeVisualAdviceQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return VISUAL_ADVICE_CUES.some((cue) => normalized.includes(cue));
}

function extractGoal(userContextString: string | undefined): string | null {
  const match = userContextString?.match(/- Primary Goal:\s*(.+)$/mi);
  const goal = match?.[1]?.trim();
  if (!goal || /^audience growth$/i.test(goal)) {
    return null;
  }
  return goal;
}

function extractStage(userContextString: string | undefined): string | null {
  const match = userContextString?.match(/- Stage:\s*(.+)$/mi);
  const stage = match?.[1]?.trim();
  if (!stage || /^unknown$/i.test(stage)) {
    return null;
  }
  return stage;
}

function summarizeConstraints(activeConstraints: string[] | undefined): string[] {
  return (activeConstraints || [])
    .filter((constraint) => !/^correction lock:/i.test(constraint))
    .map((constraint) => constraint.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function buildUserKnowledgeReply(args: {
  userContextString?: string;
  activeConstraints?: string[];
}): string {
  const facts: string[] = [];
  const goal = extractGoal(args.userContextString);
  const stage = extractStage(args.userContextString);
  const constraints = summarizeConstraints(args.activeConstraints);

  if (stage) {
    facts.push(`your stage is ${stage}`);
  }

  if (goal) {
    facts.push(`your main goal is ${goal}`);
  }

  if (constraints.length > 0) {
    facts.push(`you've asked for ${constraints.join(" and ")}`);
  }

  if (facts.length === 0) {
    return "not much beyond what you've actually told me in this thread. i can keep track of your voice, constraints, and product facts as we go, but i don't have hidden account data unless you share it.";
  }

  return `only what you've actually given me here: ${facts.join("; ")}. i don't have hidden analytics or private account history unless you share them.`;
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

  return "hey. i can help with what to post, draft something, or tighten something you've already got.";
}

function buildSmallTalkReply(): string {
  return "nice. i can help with what to post, draft something, or tighten something you've already got.";
}

function buildConversationResetReply(): string {
  return "fair. i can help with what to post, draft something, or tighten something you've already got.";
}

function buildMetaAssistantReply(): string {
  return "react to what they actually said, use contractions, and don't jump into strategy too early. paste a reply and i'll make it sound more natural.";
}

function buildCapabilityReply(): string {
  return "i can help with what to post on x, draft in your voice, revise drafts, and give blunt growth feedback. send what to post today, a rough idea, or a draft.";
}

function buildPerformanceReply(): string {
  return "i can't see your actual top posts or performance analytics in this chat. if you paste a few posts or screenshots, i'll tell you which one hit hardest and why.";
}

function buildVisualAdviceReply(): string {
  return "sometimes. use an image only if it adds proof, context, or a visual punchline. if the text already lands on its own, skip it.";
}

export function getDeterministicChatReply(args: {
  userMessage: string;
  recentHistory: string;
  userContextString?: string;
  activeConstraints?: string[];
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

  if (looksLikeUserKnowledgeQuestion(args.userMessage)) {
    return buildUserKnowledgeReply({
      userContextString: args.userContextString,
      activeConstraints: args.activeConstraints,
    });
  }

  if (looksLikePerformanceQuestion(args.userMessage)) {
    return buildPerformanceReply();
  }

  if (looksLikeVisualAdviceQuestion(args.userMessage)) {
    return buildVisualAdviceReply();
  }

  if (looksLikeMetaAssistantQuestion(args.userMessage)) {
    return buildMetaAssistantReply();
  }

  return null;
}
