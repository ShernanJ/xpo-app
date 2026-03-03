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
  recentHistory: string,
  activeDraft?: string,
): Promise<WriterOutput | null> {
  const isEditing = !!activeDraft;
  const instruction = `
You are an elite ghostwriter for X (Twitter).
${isEditing ? `Your task is to take a Strategy Plan and apply it to EDIT an existing draft.`
      : `Your task is to take a strict Strategy Plan and generate EXACTLY 1 focused, high-quality draft.`}

${isEditing ? `EXISTING DRAFT TO EDIT (USE THIS AS YOUR BASELINE):\n${activeDraft}\n\n` : ""}

RECENT CHAT HISTORY (Provides context on what the user is replying to):
${recentHistory}

STRATEGY PLAN:
Objective: ${plan.objective}
Angle: ${plan.angle}
Target Lane: ${plan.targetLane}
Hook Type: ${plan.hookType}
Must Include: ${plan.mustInclude.join(" | ") || "None"}
Must Avoid: ${plan.mustAvoid.join(" | ") || "None"}
Active Session Constraints: ${activeConstraints.join(" | ") || "None"}

USER'S HISTORICAL POSTS (FOR VIBE AND TONE REFERENCE ONLY):
${topicAnchors.join("\n---") || "None"}
CRITICAL: DO NOT copy facts, metrics, or personal stories from these historical posts into the new draft. Use them ONLY to understand their voice and pacing.

${styleCard
      ? `
USER'S SPECIFIC WRITING STYLE:
- Sentence Openings: ${styleCard.sentenceOpenings.join(", ")}
- Sentence Closers: ${styleCard.sentenceClosers.join(", ")}
- Pacing: ${styleCard.pacing}
- Emojis: IF the user rarely uses emojis, DO NOT USE THEM. If they do, use them sparingly. (Pattern: ${styleCard.emojiPatterns.join(", ") || "None"})
- Slang/Vocabulary: ${styleCard.slangAndVocabulary.join(", ")}
- Formatting: ${styleCard.formattingRules.join(", ")}
${styleCard.customGuidelines.length > 0 ? `- EXPLICIT USER GUIDELINES (CRITICAL): ${styleCard.customGuidelines.join(" | ")}` : ""}
`
      : "No style card available. Write in a clean, punchy, conversational tone."
    }

REQUIREMENTS:
1. Generate EXACTLY 1 draft. Not 2. Not 3. One.
2. DO NOT invent random metrics, constraints, or backstory (like "juggling my day job" or "30% faster"). Stick ONLY to the facts the user provided in the chat history.
${isEditing ? `3. IMPORTANT: Do NOT rewrite the entire post from scratch unless the plan requires it. Keep the original structure and phrasing as much as possible, applying ONLY the edits requested in the "mustInclude", "mustAvoid", or "Angle" sections.` : `3. The draft should be the best possible execution of the plan.`}
4. Make it sound like the user actually wrote it — match their voice perfectly (e.g., if they write in all lowercase, YOU MUST write in all lowercase).
5. Provide a brief conversational "response" introducing the draft (1 line, casual).
6. Provide an idea for a "supportAsset" (image/video idea to attach).

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
