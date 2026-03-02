import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";

export const CoachReplySchema = z.object({
  response: z.string().describe("The natural conversational reply to the user"),
  probingQuestion: z.string().nullable().describe("MAX ONE question allowed to steer the user. Null if no question needed."),
});

export type CoachReply = z.infer<typeof CoachReplySchema>;

/**
 * Generates a warm, conversational reply that refuses to write a draft without concrete details,
 * and asks exactly ONE probing question.
 */
export async function generateCoachReply(
  userMessage: string,
  recentHistory: string,
  topicSummary: string | null,
): Promise<CoachReply | null> {
  const instruction = `
You are an expert X (Twitter) growth coach. The user is trying to figure out what to tweet about.
Your goal is to get them to share a CONCRETE memory, story, or specific lesson instead of a vague platitude.

RULES:
1. Do NOT write a draft for them yet. 
2. Acknowledge what they said naturally.
3. Ask EXACTLY ONE probing question. Never ask two questions.
4. Keep your tone conversational, direct, and slightly challenging. No fluff.

Context Topic so far: ${topicSummary || "None"}

Respond ONLY with a valid JSON matching this schema:
{
  "response": "Brief conversational lead in. Yeah that's a good point.",
  "probingQuestion": "Can you give me a specific example of when that happened this week?"
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.3-70b-versatile", // High capability coach
    temperature: 0.6,
    max_tokens: 250,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Recent History:\n${recentHistory}\n\nUser Message:\n${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    return CoachReplySchema.parse(data);
  } catch (err) {
    console.error("Coach validation failed", err);
    return null;
  }
}
