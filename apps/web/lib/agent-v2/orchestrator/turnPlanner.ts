import type { TurnPlan, V2ChatIntent, V2ConversationMemory } from "../contracts/chat";

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
  /^(?:make|change|fix|rewrite|remove|delete|cut|drop|add|swap|replace|rephrase|update)\b/,
  /^(?:tighten|trim|shorten|expand|soften)\b/,
  /\b(?:too harsh|too aggressive|too long|too short|too generic|too salesy|too polished)\b/,
  /\b(?:feels|sounds)\s+too\s+\w+\b/,
  /\b(?:feels|sounds)\s+like\s+linkedin\b/,
  /\bkeep the same idea\b/,
  /\bdon'?t (?:say|use|mention|include)\b/,
  /^(?:clean)\s+(?:this|it)\s+up\b/,
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

const PLAN_APPROVAL_PATTERNS = [
  /^(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|run with it|let'?s do it|lets do it|write it)[.?!]*$/,
  /^(?:looks|sounds)\s+good[.?!]*$/,
];

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
    | "assistantTurnCount"
    | "unresolvedQuestion"
  >;
  explicitIntent?: V2ChatIntent | null;
}

export function planTurn(input: PlanTurnInput): TurnPlan | null {
  if (input.explicitIntent) {
    return null;
  }

  const normalized = input.userMessage.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

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

  if (!hasDraftContext && looksLikeMissingDraftEditRequest(normalized)) {
    return {
      userGoal: "chat",
      shouldGenerate: false,
      responseStyle: "natural",
      overrideClassifiedIntent: "coach",
    };
  }

  if (
    input.memory.pendingPlan &&
    input.memory.conversationState === "plan_pending_approval" &&
    looksLikePlanApproval(normalized)
  ) {
    return {
      userGoal: "draft",
      shouldGenerate: true,
      responseStyle: "structured",
      overrideClassifiedIntent: "planner_feedback",
    };
  }

  return null;
}

function looksLikeEditInstruction(normalized: string): boolean {
  if (EDIT_INSTRUCTION_CUES.some((cue) => normalized.includes(cue))) {
    return true;
  }

  return EDIT_REGEX_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeMissingDraftEditRequest(normalized: string): boolean {
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return MISSING_DRAFT_EDIT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikePlanApproval(normalized: string): boolean {
  return PLAN_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
