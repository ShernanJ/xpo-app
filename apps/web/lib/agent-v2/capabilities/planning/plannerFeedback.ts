import { z } from "zod";
import { fetchStructuredJsonFromGroq } from "../../agents/llm.ts";
import type { StrategyPlan } from "../../contracts/chat";

export type PlannerFeedbackDecision = "approve" | "revise" | "reject" | "unclear";

const PlannerFeedbackSchema = z.object({
  decision: z.enum(["approve", "revise", "reject", "unclear"]),
});

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

function isDirectMatch(message: string, candidates: string[]): boolean {
  return candidates.some((candidate) => message === candidate || message.includes(candidate));
}

export async function interpretPlannerFeedback(
  userMessage: string,
  plan: StrategyPlan,
): Promise<PlannerFeedbackDecision> {
  const normalized = normalizeMessage(userMessage);

  if (
    isDirectMatch(normalized, [
      "yes",
      "yeah",
      "yep",
      "looks good",
      "sounds good",
      "this works",
      "lets do it",
      "let's do it",
      "this works. draft this version",
      "draft this version",
      "go ahead",
      "write it",
      "ship it",
      "do it",
      "that works",
    ])
  ) {
    return "approve";
  }

  if (
    isDirectMatch(normalized, [
      "no",
      "nah",
      "not this",
      "different angle",
      "another angle",
      "something else",
      "don't like this",
    ])
  ) {
    return "reject";
  }

  if (
    isDirectMatch(normalized, [
      "make it tighter",
      "more blunt",
      "more personal",
      "more story driven",
      "less polished",
      "less robotic",
      "change the angle to",
      "make it",
    ])
  ) {
    return "revise";
  }

  const data = await fetchStructuredJsonFromGroq({
    schema: PlannerFeedbackSchema,
    modelTier: "control",
    fallbackModel: "openai/gpt-oss-120b",
    optionalDefaults: {
      decision: "unclear",
    },
    reasoning_effort: "low",
    temperature: 0.1,
    max_tokens: 128,
    messages: [
      {
        role: "system",
        content: [
          "Classify the user's response to a draft outline.",
          "Return approve if they are clearly greenlighting the current plan.",
          "Return reject if they want a different direction entirely.",
          "Return revise if they want to keep the idea but adjust the framing or tone.",
          "Return unclear only if the message is ambiguous.",
          "Respond only with JSON: {\"decision\":\"approve|revise|reject|unclear\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: `Current plan angle: ${plan.angle}\nCurrent plan objective: ${plan.objective}\nUser reply: ${userMessage}`,
      },
    ],
  });

  return data?.decision || "unclear";
}
