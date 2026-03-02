import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";

export const IntentClassificationSchema = z.object({
  intent: z.enum(["coach", "ideate", "draft", "review", "edit", "answer_question"]),
  needs_memory_update: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

/**
 * High speed, deterministic intent classifier using Llama3-8b.
 * Decides what mode the orchestrator should run next.
 */
export async function classifyIntent(
  userMessage: string,
  recentHistory: string,
): Promise<IntentClassification | null> {
  const instruction = `
You are an expert intent classifier for a creator growth agent.
Your job is to look at the user's latest message (and recent context) and determine what they want to do next.

INTENTS:
- "draft": The user explicitly wants you to write/generate a post right now (e.g. "Draft this", "Write a post about X").
- "ideate": The user wants ideas, angles, or topics to talk about but isn't ready to draft yet (e.g. "What should I post today?", "Give me some angles").
- "edit": The user is asking to change/correct a draft you just generated (e.g. "Make the hook punchier", "Too long, shorten it").
- "answer_question": The user is asking a direct question about strategy, meaning, or how something works.
- "coach": The default fallback. The user is just chatting, needs pushing to find a specific angle, or gave a vague topic ("I want to grow").

RULES:
- If they just say "Hello" or "Help me grow", the intent is "coach".
- If they say "Stop using emojis", intent is "coach" AND needs_memory_update is true.

Respond ONLY with a valid JSON matching this schema:
{
  "intent": "coach" | "ideate" | "draft" | "review" | "edit" | "answer_question",
  "needs_memory_update": boolean,
  "confidence": number // 0.0 to 1.0
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.1-8b-instant", // Fast logic model
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 150,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Recent History:\n${recentHistory}\n\nUser Message:\n${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    return IntentClassificationSchema.parse(data);
  } catch (err) {
    console.error("Classifier validation failed", err);
    return null;
  }
}
