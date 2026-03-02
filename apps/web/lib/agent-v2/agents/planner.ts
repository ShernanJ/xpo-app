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
  activeDraft?: string,
): Promise<PlannerOutput | null> {
  const isEditing = !!activeDraft;
  const instruction = `
You are the Lead Strategist for an elite X (Twitter) creator.
${isEditing ? `Your task is to take the user's request and formulate a precise plan to EDIT their existing draft.`
      : `Your task is to take the user's requested topic and formulate a precise plan for a NEW short-form post.`}

${isEditing ? `EXISTING DRAFT TO EDIT:\n${activeDraft}\n\n` : ""}
USER'S REQUEST:
${userMessage}

ACTIVE SESSION CONSTRAINTS (Rules the user has previously set):
${activeConstraints.join(" | ") || "None"}

${isEditing ? `REQUIREMENTS:
1. Identify EXACTLY what needs to change in the existing draft to satisfy the user's request.
2. Keep the core angle intact unless the user explicitly asks to change it.
3. If they ask to remove something (e.g. emojis), put that in "mustAvoid".
4. If they ask to add something, put that in "mustInclude".` :
      `REQUIREMENTS:
1. Identify a compelling, non-obvious angle for this topic.
2. Choose a target lane (is this an original thought, or pushing back on common advice?)
3. Determine what must be included (proof points) and avoided (cliches).
4. Specify the best hook type (e.g., "Counter-narrative", "Direct Action", "Framework").`}

Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original", // or "reply" or "quote"
  "mustInclude": ["specific detail 1"],
  "mustAvoid": ["generic word 1"],
  "hookType": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
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
