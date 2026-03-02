import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { WriterOutput } from "./writer";

export const CriticOutputSchema = z.object({
  approved: z.boolean().describe("Whether the drafts pass the harsh review without major rewrites"),
  finalResponse: z.string().describe("The final conversational response introducing the drafts"),
  finalAngles: z.array(z.string()).describe("The final underlying angle for each draft"),
  finalDrafts: z.array(z.string()).describe("The final, corrected drafts ready for the user"),
  issues: z.array(z.string()).describe("Any minor or major issues found during critique"),
});

export type CriticOutput = z.infer<typeof CriticOutputSchema>;

/**
 * High speed rule-checker. Enforces hard constraints and standardizes 
 * the draft output shapes before they are shown to the user.
 */
export async function critiqueDrafts(
  writerOutput: WriterOutput,
  activeConstraints: string[],
): Promise<CriticOutput | null> {
  const instruction = `
You are the final Quality Assurance editor for an elite X (Twitter) creator.
Your job is to take a set of 3 drafts and ruthlessly enforce constraints.

RULES:
1. Do NOT change the meaning or the core angle of the drafts.
2. If a draft uses emojis and the constraints explicitly say "no emojis", you MUST remove them.
3. If a draft uses the words "Delve", "Unlock", "Testament", or "Embark", you MUST replace them.
4. If a draft contains obvious AI-isms (like "Here are 3 reasons why", "Let's dive in", "A story in 3 parts"), you MUST delete those phrases.
5. If the draft fails fundamentally, set "approved" to false. Otherwise, return true.

DRAFTS TO REVIEW:
${writerOutput.drafts.map((d, i) => `Draft ${i + 1}:\n${d}`).join("\n\n---\n\n")}

ACTIVE CONSTRAINTS:
${activeConstraints.join(" | ") || "None"}

Respond ONLY with a valid JSON matching this schema:
{
  "approved": boolean,
  "finalResponse": "...",
  "finalAngles": ["...", "...", "..."],
  "finalDrafts": ["Draft 1 corrected...", "Draft 2 corrected...", "Draft 3 corrected..."],
  "issues": ["Issue 1 found and fixed", "Issue 2 found and fixed"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.1-8b-instant", // Fast logic checker
    temperature: 0.1, // Strict determinism
    max_tokens: 800,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Review and correct the drafts now." },
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
