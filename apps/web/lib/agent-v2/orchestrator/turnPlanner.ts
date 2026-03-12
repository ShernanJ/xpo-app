import { extractTopicGrounding } from "./correctionRepair.ts";
import type { TurnPlan, V2ChatIntent, V2ConversationMemory } from "../contracts/chat";
import {
  hasStrongDraftCommand,
  isBareDraftRequest,
  isMultiDraftRequest,
} from "./conversationManagerLogic.ts";
import {
  classifyContextualFollowUp,
  getTurnRelationContext,
  type TurnRelationContext,
} from "./turnRelation.ts";

// ---------------------------------------------------------------------------
// Deterministic Turn Planner (V3)
// ---------------------------------------------------------------------------
// Runs BEFORE the LLM classifier. Catches high-confidence patterns where
// deterministic rules are more reliable than the classifier's conservative
// bias. Returns null when unsure → falls through to LLM classification.
// ---------------------------------------------------------------------------

// --- Edit intent cues -------------------------------------------------------

const EDIT_INSTRUCTION_CUES = [
  "make it",
  "make this",
  "change the",
  "fix the",
  "rewrite the",
  "less harsh",
  "less aggressive",
  "more casual",
  "more direct",
  "less salesy",
  "less hype",
  "more subtle",
  "softer",
  "punchier",
  "shorter",
  "longer",
  "tighter",
  "shorten it",
  "trim it",
  "tighten it",
  "expand it",
  "remove the",
  "delete the",
  "cut the",
  "drop the",
  "add a",
  "swap",
  "replace",
  "rephrase",
  "tone down",
  "tone it down",
  "dial back",
  "dial it back",
  "less cringe",
  "cleaner",
  "clean this up",
  "clean it up",
  "too much",
  "too forced",
  "too safe",
  "sounds forced",
  "feels forced",
  "less stiff",
  "less try-hard",
  "less try hard",
  "less linkedin",
  "sounds like linkedin",
  "feels like linkedin",
  "builder-coded",
  "builder coded",
  "stronger hook",
  "same idea",
  "keep the same idea",
  "make the hook",
  "fix the hook",
  "rewrite the hook",
  "better hook",
  "more like me",
  "sound like me",
  "make it sound human",
  "make this sound human",
  "sound more human",
  "sound less robotic",
  "no emojis",
  "remove emojis",
  "less corporate",
  "less formal",
  "more raw",
  "more authentic",
  "start over",
  "rewrite the whole thing",
  "rewrite this",
];

const EDIT_REGEX_PATTERNS = [
  /^(?:make|change|fix|rewrite|remove|delete|cut|drop|add|swap|replace|rephrase)\b/,
  /\b(?:too harsh|too aggressive|too long|too short|too generic|too salesy|too polished)\b/,
  /\b(?:feels|sounds)\s+too\s+\w+\b/,
  /\b(?:feels|sounds)\s+like\s+linkedin\b/,
  /\bkeep the same idea\b/,
  /\bdon'?t (?:say|use|mention|include)\b/,
  /^(?:clean)\s+(?:this|it)\s+up\b/,
];

// --- Chat / conversational cues ---------------------------------------------

const CHAT_CUES = [
  "what do you do",
  "who are you",
  "how can you help",
  "what can you do",
  "what are you",
  "help me grow",
  "i want to grow",
  "help me write",
  "which angle",
  "which one",
  "what do you think",
  "what do you mean",
  "why did you",
  "why is this",
  "why that",
  "can you explain",
  "tell me more",
  "how does",
  "is this good",
  "is that good",
  "does this work",
  "which is better",
  "which is stronger",
  "what's the difference",
  "compare these",
  "compare the",
  "between these",
  "what do you know about me",
  "summarize me",
  "what are my preferences",
  "highest performing",
  "best post",
  "top post",
  "most comments",
  "most likes",
  "when did i write that",
  "should i use images",
  "should i use an image",
  "should i use screenshots",
  "should i use visuals",
];

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

const MISSING_DRAFT_EDIT_PATTERNS = [
  /^(?:can you\s+)?help me improve this draft[.?!]*$/,
  /^(?:can you\s+)?improve this draft[.?!]*$/,
  /^(?:can you\s+)?help me edit this draft[.?!]*$/,
  /^(?:can you\s+)?edit this draft[.?!]*$/,
  /^(?:can you\s+)?revise this draft[.?!]*$/,
  /^(?:can you\s+)?fix this draft[.?!]*$/,
  /^(?:can you\s+)?tighten this draft[.?!]*$/,
];

// --- Draft commands (skip clarification gauntlet) ---------------------------

const IMMEDIATE_DRAFT_CUES = [
  "just write it",
  "just draft it",
  "go ahead",
  "write it now",
  "draft it now",
  "ok write it",
  "okay write it",
  "ok draft it",
  "sure write it",
  "yes write it",
  "yes draft it",
  "do it",
  "send it",
  "run with it",
  "let's go",
  "turn that into a post",
  "turn this into a post",
  "make that a post",
  "make this a post",
  "write that up",
  "write this up",
  "draft that",
  "draft this",
  "write this version",
  "draft this version",
  "looks good",
  "sounds good",
  "this works",
  "lets do it",
  "let's do it",
  "write this",
];

const DIRECT_DRAFT_REQUEST_PATTERNS = [
  /^(?:can you\s+)?(?:write|draft|make|create|generate)\s+(?:me\s+)?(?:a\s+)?(?:(?:post|tweet|thread)|(?:x|tweet)\s+thread)\s+(?:about|on)\s+(.+)$/,
  /^(?:can you\s+)?(?:write|draft|make|do)\s+(?:me\s+)?(?:one|something)\s+(?:about|on)\s+(.+)$/,
  /^(?:can you\s+)?(?:write|draft|make|create|generate)\s+(?:me\s+)?something\s+about\s+(.+)$/,
];

const DIRECT_DRAFT_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "with",
  "about",
  "on",
  "my",
  "this",
  "that",
  "something",
  "post",
  "tweet",
  "thread",
  "threads",
  "x",
]);

const VAGUE_PRODUCT_DRAFT_CUES = ["tool", "app", "product", "extension", "plugin"];
const PRODUCT_DETAIL_CUES = [
  "it helps",
  "it does",
  "it lets",
  "it turns",
  "it rewrites",
  "it automates",
  "it converts",
  "works with",
  "works for",
  "because",
  "so that",
  "so you can",
  "different from",
];

// --- Constraint acknowledgment cues -----------------------------------------

const CONSTRAINT_CUES = [
  "no emojis",
  "no hashtags",
  "no cta",
  "no call to action",
  "keep it under",
  "max length",
  "don't use",
  "dont use",
  "never use",
  "avoid using",
  "stop using",
  "don't mention",
  "dont mention",
  "never mention",
  "no lists",
  "no bullet points",
  "no markdown",
];

// ---------------------------------------------------------------------------
// Core planner
// ---------------------------------------------------------------------------

export interface PlanTurnInput {
  userMessage: string;
  recentHistory: string;
  activeDraft?: string;
  memory: Pick<
    V2ConversationMemory,
    | "conversationState"
    | "concreteAnswerCount"
    | "topicSummary"
    | "pendingPlan"
    | "currentDraftArtifactId"
    | "activeConstraints"
    | "assistantTurnCount"
    | "unresolvedQuestion"
  >;
  explicitIntent?: V2ChatIntent | null;
}

/**
 * Deterministic turn planner. Runs before the LLM intent classifier.
 *
 * Returns a TurnPlan with overrideClassifiedIntent when there is high
 * confidence in what the user wants. Returns null when the LLM classifier
 * should decide.
 */
export function planTurn(input: PlanTurnInput): TurnPlan | null {
  // If the frontend already sent an explicit intent, don't override it.
  if (input.explicitIntent) {
    return null;
  }

  const trimmed = input.userMessage.trim();
  const normalized = trimmed.toLowerCase();

  if (!normalized) {
    return null;
  }

  // --- Rule 1: Edit intent with active draft context ----------------------
  // If there is a draft in scope (either from frontend or from memory) and
  // the message looks like an edit instruction, force edit mode immediately.
  // This is the highest-ROI rule: prevents "make it less harsh" → question.

  const hasDraftContext =
    Boolean(input.activeDraft) ||
    Boolean(input.memory.currentDraftArtifactId) ||
    input.memory.conversationState === "draft_ready" ||
    input.memory.conversationState === "editing";

  if (hasDraftContext && looksLikeEditInstruction(normalized)) {
    return {
      userGoal: "edit",
      shouldGenerate: true,
      responseStyle: "structured",
      overrideClassifiedIntent: "edit",
    };
  }

  if (
    looksLikeGreetingOrSmallTalk(normalized, trimmed, input.recentHistory) ||
    looksLikeConversationReset(normalized, trimmed) ||
    looksLikeMetaAssistantQuestion(normalized, trimmed)
  ) {
    return {
      userGoal: "chat",
      shouldGenerate: false,
      responseStyle: "natural",
      overrideClassifiedIntent: "coach",
    };
  }

  // --- Rule 2: Constraint capture -----------------------------------------
  // "no emojis", "don't use hashtags" etc. should be acknowledged and stored,
  // not trigger a new generation pipeline. Route to coach for acknowledgment.

  if (looksLikeConstraintOnly(normalized)) {
    return {
      userGoal: "chat",
      shouldGenerate: false,
      responseStyle: "natural",
      // Let the classifier handle this → it will route to coach which will
      // capture the constraint via the memory_update flag.
    };
  }

  if (!hasDraftContext && looksLikeMissingDraftEditRequest(trimmed)) {
    return {
      userGoal: "chat",
      shouldGenerate: false,
      responseStyle: "natural",
      overrideClassifiedIntent: "coach",
    };
  }

  // --- Rule 3: Immediate draft command after context is established --------
  // The user has already provided context and is saying "just write it".
  // Skip the clarification gauntlet.

  const hasEnoughContext =
    input.memory.concreteAnswerCount >= 1 ||
    Boolean(input.memory.topicSummary) ||
    Boolean(input.memory.pendingPlan);

  const turnRelation = getTurnRelationContext(input.recentHistory);
  const relatedFollowUpPlan = resolveRelatedFollowUp({
    original: trimmed,
    hasEnoughContext,
    memory: input.memory,
    turnRelation,
  });

  if (relatedFollowUpPlan) {
    return relatedFollowUpPlan;
  }

  const assistantOfferedDraft = turnRelation.lastAssistantKind === "draft_offer";
  const isAffirmationAfterOffer =
    assistantOfferedDraft &&
    /^(yes|yeah|yep|sure|ok|okay|do it|lets do it|let's do it|sounds good|go for it|please do)[.?!]*$/.test(
      normalized,
    );

  if (hasEnoughContext && (looksLikeImmediateDraftCommand(normalized) || isAffirmationAfterOffer)) {
    return buildAutoDraftTurnPlan(input.memory);
  }

  if (!hasDraftContext && hasEnoughContext && isMemoryGroundedMultiDraftRequest(normalized)) {
    return buildAutoDraftTurnPlan(input.memory);
  }

  const directDraftPayload = extractDirectDraftPayload(normalized);
  const groundedDirectDraftPayload =
    directDraftPayload &&
    extractTopicGrounding(input.memory.activeConstraints || [], directDraftPayload);

  if (!hasDraftContext && directDraftPayload && groundedDirectDraftPayload) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      shouldAutoDraftFromPlan: true,
      overrideClassifiedIntent: "draft",
    };
  }

  if (
    !hasDraftContext &&
    directDraftPayload &&
    looksLikeVagueProductDraftRequest(normalized, directDraftPayload)
  ) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      overrideClassifiedIntent: "plan",
    };
  }

  if (!hasDraftContext && directDraftPayload && !looksLikeSelfContainedDraftRequest(normalized)) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      overrideClassifiedIntent: "plan",
    };
  }

  if (!hasDraftContext && directDraftPayload && looksLikeSelfContainedDraftRequest(normalized)) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      shouldAutoDraftFromPlan: true,
      overrideClassifiedIntent: "draft",
    };
  }

  const answeredOutstandingQuestion =
    Boolean(input.memory.unresolvedQuestion?.trim()) &&
    looksLikeClarificationAnswer(normalized, trimmed);

  if (!hasDraftContext && answeredOutstandingQuestion) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      shouldAutoDraftFromPlan: true,
      overrideClassifiedIntent: "plan",
    };
  }

  // --- Rule 4: Conversational question (no generation needed) -------------
  // Short messages that are clearly about discussing, not producing content.

  if (looksLikeChatQuestion(normalized, trimmed)) {
    return {
      userGoal: "chat",
      shouldGenerate: false,
      responseStyle: "natural",
      overrideClassifiedIntent: "coach",
    };
  }

  // --- Default: let the LLM classifier decide -----------------------------
  return null;
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

function looksLikeEditInstruction(normalized: string): boolean {
  if (EDIT_INSTRUCTION_CUES.some((cue) => normalized.includes(cue))) {
    return true;
  }

  return EDIT_REGEX_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeConstraintOnly(normalized: string): boolean {
  // Must match a constraint cue AND be short enough that it's not a
  // full draft request embedded with a constraint.
  return (
    normalized.length <= 60 &&
    CONSTRAINT_CUES.some((cue) => normalized.includes(cue))
  );
}

function looksLikeImmediateDraftCommand(normalized: string): boolean {
  return IMMEDIATE_DRAFT_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeMissingDraftEditRequest(original: string): boolean {
  const normalized = original.trim().toLowerCase();
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return MISSING_DRAFT_EDIT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isMemoryGroundedMultiDraftRequest(normalized: string): boolean {
  if (!isMultiDraftRequest(normalized)) {
    return false;
  }

  return /\b(?:from|based on|using)\s+what\s+you\s+know\s+about\s+me\b/.test(normalized);
}

function extractDirectDraftPayload(normalized: string): string | null {
  for (const pattern of DIRECT_DRAFT_REQUEST_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function payloadLooksSpecific(payload: string): boolean {
  const tokens = payload
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token && !DIRECT_DRAFT_STOPWORDS.has(token));

  return tokens.length >= 3 || payload.length >= 24;
}

function looksLikeVagueProductDraftRequest(
  normalized: string,
  payload: string,
): boolean {
  const mentionsProductCue = VAGUE_PRODUCT_DRAFT_CUES.some((cue) =>
    normalized.includes(cue),
  );

  if (!mentionsProductCue) {
    return false;
  }

  if (PRODUCT_DETAIL_CUES.some((cue) => normalized.includes(cue))) {
    return false;
  }

  const payloadTokens = payload
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return payloadTokens.length <= 8;
}

function looksLikeSelfContainedDraftRequest(normalized: string): boolean {
  const payload = extractDirectDraftPayload(normalized);
  if (!payload) {
    return false;
  }

  if (!payloadLooksSpecific(payload)) {
    return false;
  }

  if (looksLikeVagueProductDraftRequest(normalized, payload)) {
    return false;
  }

  return true;
}

function looksLikeGreetingOrSmallTalk(
  normalized: string,
  original: string,
  recentHistory: string,
): boolean {
  if (original.length > 120) {
    return false;
  }

  const compact = normalized.replace(/[.?!,]+$/g, "").trim();
  if (!compact) {
    return false;
  }

  if (GREETING_CUES.some((cue) => compact === cue)) {
    return true;
  }

  const greetingPrefix = GREETING_CUES.find((cue) => compact.startsWith(`${cue} `));
  if (greetingPrefix && compact.length <= 40) {
    const remainder = compact.slice(greetingPrefix.length).trim();
    if (
      [
        "there",
        "hey",
        "hello",
        "how are you",
        "how are u",
        "how you doing",
        "how's it going",
        "what's up",
        "whats up",
      ].some((value) => remainder === value)
    ) {
      return true;
    }
  }

  const lastAssistantMessage = getTurnRelationContext(recentHistory).lastAssistantTurn?.toLowerCase() || "";

  const assistantWasDoingSmallTalk =
    lastAssistantMessage.includes("how are you") ||
    lastAssistantMessage.includes("how are u") ||
    lastAssistantMessage.includes("how you doing") ||
    /\byou\?\s*$/.test(lastAssistantMessage.trim());

  if (!assistantWasDoingSmallTalk) {
    return false;
  }

  const wordCount = compact.split(/\s+/).filter(Boolean).length;
  return (
    wordCount <= 4 &&
    SMALL_TALK_STATUS_CUES.some((cue) => compact === cue || compact.includes(cue))
  );
}

function looksLikeMetaAssistantQuestion(normalized: string, original: string): boolean {
  if (original.length > 160) {
    return false;
  }

  return META_ASSISTANT_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeConversationReset(normalized: string, original: string): boolean {
  if (original.length > 80) {
    return false;
  }

  return CHAT_RESET_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeChatQuestion(
  normalized: string,
  original: string,
): boolean {
  // Must be relatively short and contain a chat cue.
  if (original.length > 120) {
    return false;
  }

  if (hasStrongDraftCommand(original)) {
    return false;
  }

  return CHAT_CUES.some((cue) => normalized.includes(cue));
}

function looksLikeClarificationAnswer(
  normalized: string,
  original: string,
): boolean {
  if (!original || original.length > 240) {
    return false;
  }

  if (original.includes("?")) {
    return false;
  }

  if (looksLikeImmediateDraftCommand(normalized) || looksLikeConstraintOnly(normalized)) {
    return false;
  }

  if (looksLikeChatQuestion(normalized, original)) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 || normalized.length >= 12;
}

function buildAutoDraftTurnPlan(
  memory: PlanTurnInput["memory"],
): TurnPlan {
  if (memory.pendingPlan && memory.conversationState === "plan_pending_approval") {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      overrideClassifiedIntent: "planner_feedback",
    };
  }

  return {
    userGoal: "draft",
    shouldGenerate: true,
    responseStyle: "structured",
    shouldAutoDraftFromPlan: true,
    overrideClassifiedIntent: "draft",
  };
}

function resolveRelatedFollowUp(args: {
  original: string;
  hasEnoughContext: boolean;
  memory: PlanTurnInput["memory"];
  turnRelation: TurnRelationContext;
}): TurnPlan | null {
  if (!args.turnRelation.lastAssistantTurn) {
    return null;
  }

  const followUpKind = classifyContextualFollowUp(args.original);
  if (!followUpKind) {
    return null;
  }

  if (followUpKind === "explain") {
    if (args.turnRelation.lastAssistantKind !== "generic") {
      return {
        userGoal: "chat",
        shouldGenerate: false,
        responseStyle: "natural",
        overrideClassifiedIntent: "coach",
      };
    }

    return null;
  }

  if (followUpKind === "example") {
    if (args.memory.pendingPlan && args.memory.conversationState === "plan_pending_approval") {
      return buildAutoDraftTurnPlan(args.memory);
    }

    if (args.turnRelation.lastAssistantKind === "diagnostic") {
      return {
        userGoal: "chat",
        shouldGenerate: false,
        responseStyle: "natural",
        overrideClassifiedIntent: "coach",
      };
    }

    if (
      args.turnRelation.lastAssistantKind === "content_direction" ||
      args.turnRelation.lastAssistantKind === "draft_offer"
    ) {
      return buildAutoDraftTurnPlan(args.memory);
    }

    return null;
  }

  if (followUpKind === "execute") {
    if (
      args.turnRelation.lastAssistantKind === "diagnostic" ||
      args.turnRelation.lastAssistantKind === "content_direction" ||
      args.turnRelation.lastAssistantKind === "draft_offer" ||
      args.hasEnoughContext
    ) {
      return buildAutoDraftTurnPlan(args.memory);
    }
  }

  return null;
}
