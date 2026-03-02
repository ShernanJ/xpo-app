import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";

export const IdeasMenuSchema = z.object({
  angles: z.array(z.string()).describe("A list of 3 specific, distinct ways to frame the topic"),
  questions: z.array(z.string()).describe("A list of 3 probing questions to help the user unpack their thoughts"),
});

export type IdeasMenu = z.infer<typeof IdeasMenuSchema>;

/**
 * High creativity "Ideater" - builds out menus of possible angles 
 * when the user has a topic but doesn't know what to write.
 */
export async function generateIdeasMenu(
  userMessage: string,
  topicSummary: string | null,
  recentHistory: string,
): Promise<IdeasMenu | null> {
  const instruction = `
You are an expert X (Twitter) content strategist.
Your job is to read the user's topic and generate a menu of 3 distinct, compelling angles they could use for a post, 
plus 3 probing questions to help them unblock if none of those angles hit.

Topic Summary: ${topicSummary || "None"}
User's Recent Core Message: ${userMessage}

Examples of Angles:
- "Contrarian: Why everyone is doing X wrong, and what you actually built."
- "Process Breakdown: The 3 step system you used to scale Y."
- "Lesson Learned: The biggest failure that led to your success with Z."

Respond ONLY with a valid JSON matching this schema:
{
  "angles": ["Angle 1 description", "Angle 2 description", "Angle 3 description"],
  "questions": ["Specific probing question 1?", "Specific probing question 2?", "Specific probing question 3?"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.3-70b-versatile", // High creativity model for ideation
    temperature: 0.8,
    max_tokens: 300,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Context:\n${recentHistory}` },
    ],
  });

  if (!data) return null;

  try {
    return IdeasMenuSchema.parse(data);
  } catch (err) {
    console.error("Ideator validation failed", err);
    return null;
  }
}
