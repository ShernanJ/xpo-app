import { z } from "zod";

import { fetchJsonFromGroq } from "./llm.ts";
import type { ConversationState, V2ChatIntent } from "../contracts/chat";

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

interface ControllerMemorySummary {
  conversationState: ConversationState;
  topicSummary: string | null;
  hasPendingPlan: boolean;
  hasActiveDraft: boolean;
  unresolvedQuestion: string | null;
  concreteAnswerCount: number;
}

function summarizeMemory(memory: ControllerMemorySummary): string {
  return [
    `Conversation state: ${memory.conversationState}`,
    `Topic summary: ${memory.topicSummary || "None"}`,
    `Pending plan: ${memory.hasPendingPlan ? "yes" : "no"}`,
    `Active draft: ${memory.hasActiveDraft ? "yes" : "no"}`,
    `Unresolved question: ${memory.unresolvedQuestion || "None"}`,
    `Concrete answer count: ${memory.concreteAnswerCount}`,
  ].join("\n");
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

export async function controlTurn(args: {
  userMessage: string;
  recentHistory: string;
  memory: ControllerMemorySummary;
}): Promise<ControllerDecision | null> {
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

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 256,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: args.userMessage },
    ],
  });

  if (!data) {
    return null;
  }

  try {
    return ControllerDecisionSchema.parse(data);
  } catch (error) {
    console.error("Controller validation failed", error);
    return null;
  }
}
