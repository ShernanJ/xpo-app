import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { PlannerOutput } from "./planner";

export const WriterOutputSchema = z.object({
  response: z.string().describe("A conversational lead-in like 'Here are a few options based on your style:'"),
  angles: z.array(z.string()).describe("The underlying angle for each draft (e.g., 'Contrarian Take')"),
  drafts: z.array(z.string()).describe("The actual generated X posts"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.array(z.string()).describe("One-sentence rationale for why each draft works"),
  watchOutFor: z.array(z.string()).describe("One-sentence warning about risk or tone for each draft"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema>;

/**
 * High capability draft writer. Takes the constraints from the Planner and the StyleCard
 * from the Profile to generate exactly 3 variants.
 */
export async function generateDrafts(
  plan: PlannerOutput,
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  activeConstraints: string[],
): Promise<WriterOutput | null> {
  const instruction = `
You are an elite ghostwriter for X (Twitter).
Your task is to take a strict Strategy Plan and generate EXACTLY 3 distinct draft variations of a post.

STRATEGY PLAN:
Objective: ${plan.objective}
Angle: ${plan.angle}
Target Lane: ${plan.targetLane}
Hook Type: ${plan.hookType}
Must Include: ${plan.mustInclude.join(" | ") || "None"}
Must Avoid: ${plan.mustAvoid.join(" | ") || "None"}
Active Session Constraints: ${activeConstraints.join(" | ") || "None"}

USER'S HISTORICAL ANCHORS (Details to weave in if relevant):
${topicAnchors.join("\\n---") || "None"}

${styleCard
      ? `
USER'S SPECIFIC WRITING STYLE (CRITICAL - YOU MUST FOLLOW THIS EXACTLY):
- Sentence Openings: ${styleCard.sentenceOpenings.join(", ")}
- Sentence Closers: ${styleCard.sentenceClosers.join(", ")}
- Pacing: ${styleCard.pacing}
- Emojis: ${styleCard.emojiPatterns.join(", ") || "None"}
- Slang/Vocaubulary: ${styleCard.slangAndVocabulary.join(", ")}
- Formatting: ${styleCard.formattingRules.join(", ")}
`
      : "No style card available. Write in a clean, punchy, conversational tone."
    }

REQUIREMENTS:
1. Generate exactly 3 text drafts.
2. Draft 1 should be a direct execution of the plan.
3. Draft 2 should be a more aggressive/confident execution of the plan.
4. Draft 3 should be a very concise, punchy execution.
5. Provide a brief conversational "response" introducing the drafts.
6. Provide an idea for a "supportAsset" (image/video idea to attach).

Respond ONLY with a valid JSON matching this schema:
{
  "response": "...",
  "angles": ["Direct", "Aggressive", "Concise"],
  "drafts": ["Draft 1 text...", "Draft 2 text...", "Draft 3 text..."],
  "supportAsset": "...",
  "whyThisWorks": ["Why 1 works", "Why 2 works", "Why 3 works"],
  "watchOutFor": ["Risk of 1", "Risk of 2", "Risk of 3"]
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.3-70b-versatile", // High capability for drafting
    temperature: 0.6, // Balanced creativity
    max_tokens: 800,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Generate the 3 drafts now." },
    ],
  });

  if (!data) return null;

  try {
    return WriterOutputSchema.parse(data);
  } catch (err) {
    console.error("Writer validation failed", err);
    return null;
  }
}
