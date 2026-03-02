import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { WriterOutput } from "./writer";

export const CriticOutputSchema = z.object({
  approved: z.boolean().describe("Whether the draft passes the harsh review without major rewrites"),
  finalResponse: z.string().describe("The final conversational response introducing the draft"),
  finalAngle: z.string().describe("The final underlying angle for the draft"),
  finalDraft: z.string().describe("The final, corrected draft ready for the user"),
  issues: z.array(z.string()).describe("Any minor or major issues found during critique"),
});

export type CriticOutput = z.infer<typeof CriticOutputSchema>;

/**
 * High speed rule-checker. Enforces hard constraints and standardizes
 * the draft output before it is shown to the user.
 */
export async function critiqueDrafts(
  writerOutput: WriterOutput,
  activeConstraints: string[],
): Promise<CriticOutput | null> {
  const instruction = `
You are the final Quality Assurance editor for an elite X (Twitter) creator.
Your job is to take a draft and ruthlessly enforce constraints.

RULES:
1. Do NOT change the meaning or the core angle of the draft.
2. If the draft uses emojis and the constraints explicitly say "no emojis", you MUST remove them.
3. If the draft uses the words "Delve", "Unlock", "Testament", or "Embark", you MUST replace them.
4. If the draft contains obvious AI-isms (like "Here are 3 reasons why", "Let's dive in", "A story in 3 parts"), you MUST delete those phrases.
5. If the draft fails fundamentally, set "approved" to false. Otherwise, return true.

DRAFT TO REVIEW:
${writerOutput.draft}

ACTIVE CONSTRAINTS:
${activeConstraints.join(" | ") || "None"}

Respond ONLY with a valid JSON matching this schema:
{
  "approved": boolean,
  "finalResponse": "...",
  "finalAngle": "...",
  "finalDraft": "The corrected draft text...",
  "issues": ["Issue 1 found and fixed", "Issue 2 found and fixed"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Review and correct the draft now." },
    ],
  });

  if (!data) return null;

  try {
    return CriticOutputSchema.parse(data);
  } catch (err) {
    console.error("Critic validation failed", err);
    return null;
  }
}
