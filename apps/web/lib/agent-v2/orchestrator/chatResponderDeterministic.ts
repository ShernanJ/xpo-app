/**
 * Deterministic chat responses — intentionally minimal.
 *
 * Most conversational turns should go through the coach LLM for natural
 * variation. Only genuinely safety-critical or impossible-to-LLM paths
 * remain deterministic:
 *
 * 1. Missing draft edit requests (user asks to edit a draft that doesn't exist)
 * 2. Failure explanations (user asks why something broke)
 * 3. User knowledge questions (factual recall of stored context)
 *
 * Everything else — greetings, small talk, capability questions, meta
 * complaints, diagnostics — is now routed to the coach for natural handling.
 */

const MISSING_DRAFT_EDIT_CUES = [
  "help me improve this draft",
  "improve this draft",
  "help me edit this draft",
  "edit this draft",
  "revise this draft",
  "fix this draft",
  "tighten this draft",
];

const FAILURE_EXPLANATION_CUES = [
  "why did it fail",
  "why did that fail",
  "why did this fail",
  "what failed",
  "what went wrong",
  "why did the plan fail",
];

const USER_KNOWLEDGE_CUES = [
  "what do you know about me",
  "what do you know abt me",
  "summarize me",
  "what are my preferences",
  "what do you know about my writing",
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

function looksLikeFailureExplanationQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 120) {
    return false;
  }

  return FAILURE_EXPLANATION_CUES.some((cue) => normalized.includes(cue));
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

function looksLikeUserKnowledgeQuestion(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length > 160) {
    return false;
  }

  return USER_KNOWLEDGE_CUES.some((cue) => normalized.includes(cue));
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

export function getDeterministicChatReply(args: {
  userMessage: string;
  recentHistory: string;
  userContextString?: string;
  activeConstraints?: string[];
  diagnosticContext?: unknown;
}): string | null {
  // Safety-critical: user tries to edit a draft that doesn't exist
  if (looksLikeMissingDraftEditRequest(args.userMessage)) {
    return buildMissingDraftEditReply();
  }

  // Safety-critical: user asks why something failed
  if (looksLikeFailureExplanationQuestion(args.userMessage)) {
    const failureReply = buildFailureExplanationReply(args.recentHistory);
    if (failureReply) {
      return failureReply;
    }
  }

  // Factual: user asks what we know about them
  if (looksLikeUserKnowledgeQuestion(args.userMessage)) {
    return buildUserKnowledgeReply({
      userContextString: args.userContextString,
      activeConstraints: args.activeConstraints,
    });
  }

  // Everything else goes to the coach LLM for natural handling
  return null;
}
