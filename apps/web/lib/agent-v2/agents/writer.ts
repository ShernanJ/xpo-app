import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { PlannerOutput } from "./planner";

export const WriterOutputSchema = z.object({
  response: z.string().describe("A short conversational intro like 'here's what i came up with based on what you told me:'"),
  angle: z.string().describe("The approach/angle used for this draft"),
  draft: z.string().describe("The actual generated X post — one single draft"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.string().describe("One-sentence rationale for why this draft works"),
  watchOutFor: z.string().describe("One-sentence warning about risk or tone"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema>;

/**
 * High capability draft writer. Takes the constraints from the Planner and the StyleCard
 * from the Profile to generate exactly 1 focused draft.
 */
export async function generateDrafts(
  plan: PlannerOutput,
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  activeConstraints: string[],
): Promise<WriterOutput | null> {
  const instruction = `
You are an elite ghostwriter for X (Twitter).
Your task is to take a strict Strategy Plan and generate EXACTLY 1 focused, high-quality draft.

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
- Slang/Vocabulary: ${styleCard.slangAndVocabulary.join(", ")}
- Formatting: ${styleCard.formattingRules.join(", ")}
`
      : "No style card available. Write in a clean, punchy, conversational tone."
    }

REQUIREMENTS:
1. Generate EXACTLY 1 draft. Not 2. Not 3. One.
2. The draft should be the best possible execution of the plan.
3. Make it sound like the user actually wrote it — match their voice perfectly.
4. Provide a brief conversational "response" introducing the draft (1 line, casual).
5. Provide an idea for a "supportAsset" (image/video idea to attach).

Respond ONLY with a valid JSON matching this schema:
{
  "response": "...",
  "angle": "...",
  "draft": "The actual post text...",
  "supportAsset": "...",
  "whyThisWorks": "...",
  "watchOutFor": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.75,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Generate the draft now." },
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
