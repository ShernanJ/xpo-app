import { hasStrongDraftCommand } from "./conversationManagerLogic.ts";
import type { ConversationalDiagnosticContext } from "./conversationalDiagnostics.ts";

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

const DIAGNOSTIC_VIEW_CUES = [
  "why am i not getting views",
  "why am i not getting view",
  "why am i not getting impressions",
  "why am i not getting reach",
  "why am i not getting traction",
  "why aren't i getting views",
  "why arent i getting views",
];

const FAILURE_EXPLANATION_CUES = [
  "why did it fail",
  "why did that fail",
  "why did this fail",
  "what failed",
  "what went wrong",
  "why did the plan fail",
];

const MISSING_DRAFT_EDIT_CUES = [
  "help me improve this draft",
  "improve this draft",
  "help me edit this draft",
  "edit this draft",
  "revise this draft",
  "fix this draft",
  "tighten this draft",
];

const DIAGNOSTIC_FOCUS_CUES = [
  "what should i focus on",
  "what should i change",
  "what do i need to change",
  "where should i focus",
  "what do i fix",
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

  if (hasStrongDraftCommand(message)) {
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

function looksLikeFailureExplanationQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return FAILURE_EXPLANATION_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeMissingDraftEditRequest(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return MISSING_DRAFT_EDIT_CUES.some((cue) => normalized === cue);
}

function buildMissingDraftEditReply(): string {
  return "paste the draft you want me to improve and i'll tighten it up.";
}

function buildFailureExplanationReply(recentHistory: string): string | null {
  const lastAssistantTurn = getLastAssistantTurn(recentHistory);
  if (!lastAssistantTurn.includes("failed to")) {
    return null;
  }

  const becauseMatch = lastAssistantTurn.match(/failed to [^.?!]+ because ([^.?!]+)/);
  if (becauseMatch?.[1]) {
    return `it failed because ${becauseMatch[1].trim()}.`;
  }

  if (lastAssistantTurn.includes("failed to generate strategy plan")) {
    return "it failed because the planner didn't return a usable plan.";
  }

  return "it failed because the last generation step didn't return usable output.";
}

function resolveDiagnosticPromptKind(
  message: string,
): "views" | "focus" | "change" | null {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return null;
  }

  if (DIAGNOSTIC_VIEW_CUES.some((cue) => normalized.includes(cue))) {
    return "views";
  }

  if (DIAGNOSTIC_FOCUS_CUES.some((cue) => normalized.includes(cue))) {
    return normalized.includes("change") || normalized.includes("fix")
      ? "change"
      : "focus";
  }

  return null;
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

function extractKnownFacts(userContextString: string | undefined): string[] {
  const match = userContextString?.match(/- Known Facts:\s*(.+)$/mi);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split("|")
    .map((fact) => fact.trim())
    .filter(Boolean)
    .slice(0, 2);
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

function hasSpecificStoryContext(recentHistory: string): boolean {
  return recentHistory
    .split("\n")
    .map((line) => line.replace(/^(?:assistant|user):\s*/i, "").trim().toLowerCase())
    .some((line) => {
      if (!line || line.length < 24) {
        return false;
      }

      return (
        /\b(?:app|product|tool|story|loss|match|stan|case study|build|built|launch)\b/.test(
          line,
        ) &&
        /\b(?:use|show|turn|built|lost|sparked|flipped)\b/.test(line)
      );
    });
}

function buildDiagnosticPersonalization(args: {
  diagnosticContext: ConversationalDiagnosticContext;
  recentHistory: string;
  userContextString?: string;
}): string | null {
  const stage = extractStage(args.userContextString);
  const knownFacts = extractKnownFacts(args.userContextString);
  const knownFor = args.diagnosticContext.knownFor?.trim();
  const specificStoryContext =
    knownFacts.length > 0 || hasSpecificStoryContext(args.recentHistory);

  if (knownFor && specificStoryContext) {
    return `for you specifically, this looks less like a reach problem and more like making ${knownFor} legible through a sharper lived example.`;
  }

  if (knownFor) {
    return `for you specifically, the miss is making ${knownFor} instantly legible instead of spreading the feed across softer angles.`;
  }

  if (specificStoryContext) {
    return "for you specifically, the problem is not a lack of material. it's that your best personal proof is still not obvious fast enough.";
  }

  if (stage) {
    return `for this ${stage} stage, clarity and repetition usually matter more than trying to cover too many angles at once.`;
  }

  return null;
}

function buildDiagnosticReply(args: {
  kind: "views" | "focus" | "change";
  diagnosticContext: ConversationalDiagnosticContext;
  recentHistory: string;
  userContextString?: string;
}): string | null {
  const reasons = args.diagnosticContext.reasons
    .map((reason) => reason.trim())
    .filter(Boolean)
    .slice(0, 3);
  const nextActions = args.diagnosticContext.nextActions
    .map((action) => action.trim())
    .filter(Boolean)
    .slice(0, 3);
  const playbook = args.diagnosticContext.recommendedPlaybooks?.[0] ?? null;

  if (reasons.length === 0 && nextActions.length === 0) {
    return null;
  }

  const intro =
    args.kind === "views"
      ? "a few things are probably suppressing reach right now:"
      : args.kind === "change"
        ? "here's what i'd change first:"
        : "here's where i'd focus first:";
  const personalization = buildDiagnosticPersonalization({
    diagnosticContext: args.diagnosticContext,
    recentHistory: args.recentHistory,
    userContextString: args.userContextString,
  });
  const reasonLines = reasons.length
    ? `likely reasons:\n${reasons.map((reason, index) => `${index + 1}. ${reason}`).join("\n")}`
    : "";
  const actionLines = nextActions.length
    ? `next actions:\n${nextActions.map((action, index) => `${index + 1}. ${action}`).join("\n")}`
    : "";
  const followUp = playbook
    ? `full breakdown is there if you want it. the best playbook match is ${playbook.name.toLowerCase()}.`
    : "full breakdown is there if you want it.";

  return [intro, personalization, reasonLines, actionLines, followUp]
    .filter(Boolean)
    .join("\n\n");
}

export function getDeterministicChatReply(args: {
  userMessage: string;
  recentHistory: string;
  userContextString?: string;
  activeConstraints?: string[];
  diagnosticContext?: ConversationalDiagnosticContext | null;
}): string | null {
  const diagnosticKind = resolveDiagnosticPromptKind(args.userMessage);
  if (diagnosticKind && args.diagnosticContext) {
    const diagnosticReply = buildDiagnosticReply({
      kind: diagnosticKind,
      diagnosticContext: args.diagnosticContext,
      recentHistory: args.recentHistory,
      userContextString: args.userContextString,
    });

    if (diagnosticReply) {
      return diagnosticReply;
    }
  }

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

  if (looksLikeMissingDraftEditRequest(args.userMessage)) {
    return buildMissingDraftEditReply();
  }

  if (looksLikeFailureExplanationQuestion(args.userMessage)) {
    const failureReply = buildFailureExplanationReply(args.recentHistory);
    if (failureReply) {
      return failureReply;
    }
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
