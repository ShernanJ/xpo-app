import { z } from "zod";

import { fetchStructuredJsonFromGroq } from "./llm.ts";
import type { ConversationState, V2ChatIntent } from "../contracts/chat";
import type { TurnPlan } from "../contracts/chat";
import { isBareDraftRequest } from "../core/conversationHeuristics.ts";

export const ControllerActionSchema = z.enum([
  "answer",
  "ask",
  "analyze",
  "plan",
  "draft",
  "revise",
  "retrieve_then_answer",
]);

export const ControllerDecisionSchema = z.object({
  action: ControllerActionSchema,
  needs_memory_update: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().max(240).default(""),
});

export type ControllerAction = z.infer<typeof ControllerActionSchema>;
export type ControllerDecision = z.infer<typeof ControllerDecisionSchema>;

export interface TopLevelActionResolution {
  decision: ControllerDecision;
  classifiedIntent: V2ChatIntent;
  source: "explicit_intent" | "turn_plan" | "controller";
}

export interface ControllerMemorySummary {
  conversationState: ConversationState;
  topicSummary: string | null;
  hasPendingPlan: boolean;
  hasActiveDraft: boolean;
  unresolvedQuestion: string | null;
  concreteAnswerCount: number;
  pendingPlanSummary?: string | null;
  latestRefinementInstruction?: string | null;
  lastIdeationAngles?: string[];
}

function summarizeMemory(memory: ControllerMemorySummary): string {
  return [
    `Conversation state: ${memory.conversationState}`,
    `Topic summary: ${memory.topicSummary || "None"}`,
    `Pending plan: ${memory.hasPendingPlan ? "yes" : "no"}`,
    `Active draft: ${memory.hasActiveDraft ? "yes" : "no"}`,
    `Unresolved question: ${memory.unresolvedQuestion || "None"}`,
    `Concrete answer count: ${memory.concreteAnswerCount}`,
    `Pending plan summary: ${memory.pendingPlanSummary || "None"}`,
    `Latest refinement instruction: ${memory.latestRefinementInstruction || "None"}`,
    `Last ideation angles: ${
      memory.lastIdeationAngles && memory.lastIdeationAngles.length > 0
        ? memory.lastIdeationAngles.slice(0, 3).join(" | ")
        : "None"
    }`,
  ].join("\n");
}

const CONTROLLER_APPROVAL_PATTERNS = [
  /^(?:yes|yeah|yep|sure|ok|okay|go ahead|do it|run with it|let'?s do it|lets do it|write it|draft it)[.?!]*$/,
  /^(?:looks|sounds)\s+good[.?!]*$/,
  /^(?:go with|use|run with)\s+(?:that|this|the plan|the angle)[.?!]*$/,
];

const CONTROLLER_IDEA_SELECTION_PATTERNS = [
  /^(?:go with|use|pick|do|draft|write)\s+(?:option|angle)\s+\d+\b/,
  /^(?:option|angle)\s+\d+\b/,
  /^(?:go with|use|pick)\s+(?:the\s+)?(?:first|second|third|\d+)(?:\s+one)?[.?!]*$/,
  /^(?:the\s+)?(?:first|second|third|\d+)(?:\s+one)?[.?!]*$/,
];

const CONTROLLER_REVISION_PATTERNS = [
  /^(?:make|keep|turn|rewrite|change|fix|trim|shorten|lengthen|expand|tighten|soften|punch(?:\s+it)?\s+up)\b/,
  /\b(?:shorter|longer|softer|punchier|cleaner|clearer|tighter|less|more)\b/,
  /\bsame angle\b/,
  /\bmake that\b/,
  /\bkeep that\b/,
];

const CONTROLLER_DIRECT_QUESTION_PREFIX =
  /^(?:what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are|am|will)\b/;
const CONTROLLER_CAPABILITY_PATTERNS = [
  /\bwhat can you do\b/,
  /\bhow can you help\b/,
  /\bwhat do you do\b/,
  /\bhow do you work\b/,
  /\bwhat are you good at\b/,
  /^help\b/,
];
const CONTROLLER_ANALYZE_PATTERNS = [
  /\bwhy (?:is|are|did|does)\b/,
  /\bunderperform(?:ing)?\b/,
  /\bwhat'?s wrong\b/,
  /\bdiagnos(?:e|is)\b/,
  /\baudit\b/,
  /\banaly[sz]e\b/,
  /\bcompare\b/,
  /\bwhich is stronger\b/,
  /\bwhat should i focus on\b/,
];
const CONTROLLER_PLAN_PATTERNS = [
  /\bideas?\b/,
  /\bangles?\b/,
  /\boptions?\b/,
  /\boutline\b/,
  /\bplan\b/,
  /\bdirection\b/,
  /\bbrainstorm\b/,
];
const CONTROLLER_DRAFT_PATTERNS = [
  /\b(?:write|draft|compose|generate|create|make)\b.*\b(?:post|thread|reply|tweet|bio|hook|draft)\b/,
  /\bturn this into\b/,
];
const CONTROLLER_RETRIEVE_PATTERNS = [
  /\bwhat do you know about me\b/,
  /\bwhat do you know about my (?:profile|background)\b/,
  /\bbased on what you know\b/,
  /\bmy (?:history|voice|style|positioning|profile|preferences|best posts?)\b/,
  /\b(?:top|best|strongest|most popular)\s+(?:recent\s+)?(?:post|thread|reply)\b/,
  /\bwhat performed best\b/,
  /\bwhich post performed best\b/,
  /\bwhy did (?:this|that|my) post do well\b/,
  /\b(?:past|previous|prior|best)\s+(?:posts?|threads?|replies?)\b/,
  /\bour history\b/,
];
const CONTROLLER_PROFILE_SUMMARY_PATTERNS = [
  /\bwrite (?:me\s+)?(?:a\s+)?summary about my profile\b/,
  /\bwrite (?:me\s+)?(?:a\s+)?summary of my profile\b/,
  /\bsummar(?:ize|ise) my (?:profile|background)\b/,
  /\b(?:quick\s+)?snapshot of my (?:profile|background)\b/,
  /\bprofile summary\b/,
];
const CONTROLLER_FACT_THIN_PATTERNS = [
  /\bmy (?:product|startup|company|app|tool|business|background|story|journey)\b/,
  /\bour (?:product|startup|company|app|tool|business|story|journey)\b/,
];

function normalizeControllerMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function looksLikeContinuationRevision(normalized: string): boolean {
  return CONTROLLER_REVISION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeDirectQuestion(normalized: string): boolean {
  return normalized.includes("?") || CONTROLLER_DIRECT_QUESTION_PREFIX.test(normalized);
}

function looksLikeRetrieveThenAnswerQuestion(normalized: string): boolean {
  return CONTROLLER_RETRIEVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeProfileSummaryRequest(normalized: string): boolean {
  return CONTROLLER_PROFILE_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildControllerFallbackDecision(args: {
  userMessage: string;
  memory: ControllerMemorySummary;
}): ControllerDecision {
  const normalized = normalizeControllerMessage(args.userMessage);

  if (isBareDraftRequest(normalized)) {
    return {
      action: "plan",
      needs_memory_update: false,
      confidence: 0.72,
      rationale: "fallback bare draft request",
    };
  }

  if (looksLikeProfileSummaryRequest(normalized)) {
    return {
      action: "retrieve_then_answer",
      needs_memory_update: false,
      confidence: 0.7,
      rationale: "fallback retrieval summary",
    };
  }

  if (
    CONTROLLER_CAPABILITY_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    looksLikeDirectQuestion(normalized)
  ) {
    if (
      looksLikeRetrieveThenAnswerQuestion(normalized) ||
      looksLikeProfileSummaryRequest(normalized)
    ) {
      return {
        action: "retrieve_then_answer",
        needs_memory_update: false,
        confidence: 0.62,
        rationale: "fallback retrieve question",
      };
    }

    if (CONTROLLER_ANALYZE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return {
        action: "analyze",
        needs_memory_update: false,
        confidence: 0.6,
        rationale: "fallback analysis question",
      };
    }

    return {
      action: "answer",
      needs_memory_update: false,
      confidence: 0.68,
      rationale: "fallback direct question",
    };
  }

  if (looksLikeContinuationRevision(normalized)) {
    return {
      action: args.memory.hasActiveDraft ? "revise" : args.memory.hasPendingPlan ? "plan" : "ask",
      needs_memory_update: false,
      confidence: 0.58,
      rationale: "fallback revision follow-up",
    };
  }

  if (CONTROLLER_DRAFT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      action:
        args.memory.hasPendingPlan ||
        args.memory.hasActiveDraft ||
        Boolean(args.memory.topicSummary) ||
        args.memory.concreteAnswerCount > 0
          ? "draft"
          : "plan",
      needs_memory_update: false,
      confidence: 0.58,
      rationale: "fallback writing request",
    };
  }

  if (CONTROLLER_PLAN_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      action: "plan",
      needs_memory_update: false,
      confidence: 0.56,
      rationale: "fallback planning request",
    };
  }

  if (
    CONTROLLER_FACT_THIN_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    !args.memory.topicSummary &&
    args.memory.concreteAnswerCount === 0
  ) {
    return {
      action: "ask",
      needs_memory_update: false,
      confidence: 0.55,
      rationale: "fallback missing product facts",
    };
  }

  return {
    action: "ask",
    needs_memory_update: false,
    confidence: 0.5,
    rationale: "fallback clarification",
  };
}

export function resolveArtifactContinuationAction(args: {
  userMessage: string;
  memory: ControllerMemorySummary;
}): ControllerAction | null {
  const normalized = normalizeControllerMessage(args.userMessage);
  if (!normalized || normalized.length > 120) {
    return null;
  }

  const hasIdeationChoices =
    args.memory.conversationState === "ready_to_ideate" &&
    Boolean(args.memory.lastIdeationAngles && args.memory.lastIdeationAngles.length > 0);

  if (
    args.memory.hasPendingPlan &&
    args.memory.conversationState === "plan_pending_approval" &&
    CONTROLLER_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return "draft";
  }

  if (hasIdeationChoices && CONTROLLER_IDEA_SELECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "plan";
  }

  if (args.memory.hasActiveDraft && looksLikeContinuationRevision(normalized)) {
    return "revise";
  }

  if (
    args.memory.hasPendingPlan &&
    !args.memory.hasActiveDraft &&
    looksLikeContinuationRevision(normalized)
  ) {
    return "plan";
  }

  return null;
}

export function mapIntentToControllerAction(intent: V2ChatIntent): ControllerAction {
  switch (intent) {
    case "draft":
    case "planner_feedback":
      return "draft";
    case "edit":
    case "review":
      return "revise";
    case "plan":
    case "ideate":
      return "plan";
    case "answer_question":
      return "answer";
    case "coach":
    default:
      return "ask";
  }
}

export function mapControllerActionToIntent(args: {
  action: ControllerAction;
  memory: ControllerMemorySummary;
}): V2ChatIntent {
  if (args.action === "draft") {
    if (args.memory.hasPendingPlan && args.memory.conversationState === "plan_pending_approval") {
      return "planner_feedback";
    }

    return args.memory.hasActiveDraft ? "edit" : "draft";
  }

  if (args.action === "revise") {
    return "edit";
  }

  if (args.action === "plan") {
    return "plan";
  }

  if (
    args.action === "analyze" ||
    args.action === "retrieve_then_answer" ||
    args.action === "answer"
  ) {
    return "answer_question";
  }

  return "coach";
}

export async function resolveTopLevelAction(args: {
  explicitIntent?: V2ChatIntent | null;
  turnPlan?: Pick<TurnPlan, "overrideClassifiedIntent"> | null;
  userMessage: string;
  recentHistory: string;
  memory: ControllerMemorySummary;
  controlTurnImpl?: typeof controlTurn;
}): Promise<TopLevelActionResolution> {
  if (args.turnPlan?.overrideClassifiedIntent && !args.explicitIntent) {
    const classifiedIntent = args.turnPlan.overrideClassifiedIntent as V2ChatIntent;
    return {
      classifiedIntent,
      source: "turn_plan",
      decision: {
        action: mapIntentToControllerAction(classifiedIntent),
        needs_memory_update: false,
        confidence: 1,
        rationale: "deterministic guardrail",
      },
    };
  }

  if (args.explicitIntent) {
    return {
      classifiedIntent: args.explicitIntent,
      source: "explicit_intent",
      decision: {
        action: mapIntentToControllerAction(args.explicitIntent),
        needs_memory_update: false,
        confidence: 1,
        rationale: "explicit intent",
      },
    };
  }

  const decision =
    (await (args.controlTurnImpl || controlTurn)({
      userMessage: args.userMessage,
      recentHistory: args.recentHistory,
      memory: args.memory,
    })) ||
    buildControllerFallbackDecision({
      userMessage: args.userMessage,
      memory: args.memory,
    });

  return {
    decision,
    classifiedIntent: mapControllerActionToIntent({
      action: decision.action,
      memory: args.memory,
    }),
    source: "controller",
  };
}

export async function controlTurn(args: {
  userMessage: string;
  recentHistory: string;
  memory: ControllerMemorySummary;
}): Promise<ControllerDecision | null> {
  const artifactContinuationAction = resolveArtifactContinuationAction(args);
  if (artifactContinuationAction) {
    return {
      action: artifactContinuationAction,
      needs_memory_update: false,
      confidence: 0.98,
      rationale: "artifact continuation",
    };
  }

  const instruction = `
You are the controller for Xpo, an AI growth agent for X.
Pick the SINGLE best next action for this turn.

ACTIONS:
- answer: the user asked a direct question and you can answer directly.
- retrieve_then_answer: the user asked a direct question that should be answered using remembered context or historical examples before answering.
- ask: one focused clarification is required before good work can happen.
- analyze: the user wants diagnosis, explanation, or evaluation, not drafting.
- plan: the user needs a direction, angle, outline, or options before writing.
- draft: the user wants output now. Use this when the user approves a pending plan or there is already enough context to write.
- revise: the user wants to change an existing draft or plan artifact already in scope.

RULES:
- Default to answer over ask when the user asked a direct question and the question is answerable from context.
- Default to ask when the request is autobiographical or product-specific and the missing facts would force invention.
- Use plan instead of draft when the user wants writing help but the topic/direction is still open.
- Use draft when the user clearly wants copy now, or approves a pending plan.
- Use revise when they are changing existing wording, tone, hook, length, or structure.
- Use analyze for "why is this underperforming", "what's wrong", "compare", "which is stronger", "what should i focus on".
- Use retrieve_then_answer when the question is about their history, preferences, best posts, prior context, or stored learning.
- Use retrieve_then_answer for profile-summary asks like "summarize my profile" or "write a summary about my profile" when synced workspace context already exists.
- If there is a pending plan and the user says "lets do it", "write it", or plainly approves it, choose draft.
- If there are ideation angles in scope and the user picks "option 2", "the second one", or similar, choose plan.
- If there is an active draft and the user says "make that punchier", "same angle but softer", or another short edit follow-up, choose revise.
- If there is a pending plan but no active draft and the user tweaks the angle/tone instead of approving it, choose plan.
- Do not over-route casual phrasing. Focus on the work they want next.
- Keep needs_memory_update false unless the message is clearly a stable preference or constraint worth saving.

CURRENT MEMORY:
${summarizeMemory(args.memory)}

RECENT HISTORY:
${args.recentHistory}

Respond ONLY with valid JSON:
{
  "action": "answer" | "ask" | "analyze" | "plan" | "draft" | "revise" | "retrieve_then_answer",
  "needs_memory_update": boolean,
  "confidence": number,
  "rationale": "short reason"
}
  `.trim();

  const data = await fetchStructuredJsonFromGroq({
    schema: ControllerDecisionSchema,
    modelTier: "control",
    fallbackModel: "openai/gpt-oss-120b",
    optionalDefaults: {
      rationale: "",
    },
    reasoning_effort: "low",
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 256,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: args.userMessage },
    ],
  });

  return (
    data ||
    buildControllerFallbackDecision({
      userMessage: args.userMessage,
      memory: args.memory,
    })
  );
}
