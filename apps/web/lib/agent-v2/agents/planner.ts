import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";

export const PlannerOutputSchema = z.object({
  objective: z.string(),
  angle: z.string(),
  targetLane: z.enum(["original", "reply", "quote"]),
  mustInclude: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  hookType: z.string(),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

/**
 * High speed strategic planner. Defines exactly HOW a post will be structured
 * before we actually write it.
 */
export async function generatePlan(
  userMessage: string,
  topicSummary: string | null,
  activeConstraints: string[],
): Promise<PlannerOutput | null> {
  const instruction = `
You are the Chief Strategy Officer for an elite X (Twitter) creator.
Your job is to read what the user wants to talk about and create a strict "Planner" contract.
This contract will guide the actual writer.

Topic Summary: ${topicSummary || "None"}
Active Constraints: ${activeConstraints.join(", ") || "None"}

RULES:
1. Determine the core objective (e.g. "Prove expertise", "Build credibility", "Entertain").
2. Determine the best angle (e.g. "Contrarian take", "Process breakdown", "Identity reveal").
3. Always "mustInclude" specific concrete details the user provided.
4. Always "mustAvoid" generic fluff, emojis (if requested), and the active constraints.
5. Pick an optimal hook type ("Observation", "Hard Rule", "Vivid Micro-Story").

Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original", // or "reply" or "quote"
  "mustInclude": ["specific detail 1", "specific detail 2"],
  "mustAvoid": ["generic word 1", "generic word 2"],
  "hookType": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.1-8b-instant", // Fast analytical planner
    temperature: 0.2,
    top_p: 0.9,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `User Request: ${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    return PlannerOutputSchema.parse(data);
  } catch (err) {
    console.error("Planner validation failed", err);
    return null;
  }
}
