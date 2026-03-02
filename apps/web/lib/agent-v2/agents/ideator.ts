import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";

export const IdeaSchema = z.object({
  title: z.string().describe("Short post angle title — 5 words max"),
  premise: z.string().describe("What the idea is actually about, in 1 sentence. Specific, concrete, not generic."),
  format: z.string().describe("Suggested format: short story, contrast, 3 bullets, hook+lesson, etc."),
  proof_needed: z.string().describe("What concrete detail the user needs to provide to make this real"),
});

export const IdeasMenuSchema = z.object({
  angles: z.array(IdeaSchema).describe("3 niche-specific, non-generic post angles"),
  close: z.string().describe("1 short line from the coach — which angle to pick and why. Max 15 words."),
});

export type IdeasMenu = z.infer<typeof IdeasMenuSchema>;

/**
 * Generates concrete, niche-grounded post ideas for the user.
 * Uses the NicheProtocol exemplars + styleCard to avoid generic templates.
 */
export async function generateIdeasMenu(
  userMessage: string,
  topicSummary: string | null,
  recentHistory: string,
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  userContextString: string = "",
): Promise<IdeasMenu | null> {

  const voiceHint = styleCard
    ? `User voice: ${styleCard.pacing}. Typical openers: ${styleCard.sentenceOpenings?.slice(0, 2).join(", ") || "none found"}. Style: ${styleCard.formattingRules?.slice(0, 2).join(", ") || "standard"}.`
    : "No voice profile yet.";

  const instruction = `
You are an expert X (Twitter) content strategist. Your job: generate 3 specific, non-generic post angles.

NICHE ENFORCEMENT:
- No "5 tips" lists. No "aha moment" templates. No "journey to self-discovery" framing.
- Every angle must be grounded in a real experience, concrete artifact, or specific situation.
- The angle must be uniquely about THIS user's situation, not a generic template.
- Bad example: "Overcoming Obstacles" (generic, could be anyone)
- Good example: "why my agent sounded generic — retrieval was missing the whole time" (specific, concrete)

NICHE PROTOCOL — inspect user context and match accordingly:
- If they're in 0-1k / builder niche: casual tone, shipping updates, bug → fix → lesson, soft CTAs
- If they're in 1k-10k / builder pro: structured, authority tone, concrete claim + proof
- If they mention numbers/GTM/funnel: operator framing, metrics, repeatable process

USER CONTEXT:
${userContextString || "No profile loaded yet."}

VOICE PROFILE:
${voiceHint}

TOPIC SIGNAL:
${topicSummary || userMessage}

RELEVANT POSTS FROM THEIR HISTORY (for grounding):
${topicAnchors.slice(0, 3).map((a) => `- ${a}`).join("\n") || "No anchors found."}

FEW-SHOT EXAMPLE (niche: builder casual, stage: 0-1k):
User message: "Help me figure out what to post about the v2 agent bug fix."
Output angles:
1. title: "the bug that made my agent sound generic"
   premise: "Retrospective: scraping posts but not retrieving them at query time"
   format: "hook + 3 short lines + 1 concrete detail"
   proof_needed: "Name the pipeline step that was missing"

2. title: "coach-first fixed my instruction bot problem"
   premise: "Mode controller that prevents looping angle menus"
   format: "contrast (before/after) 4 lines"
   proof_needed: "1 concrete behavior change"

3. title: "novelty gates stopped me regenerating old bangers"
   premise: "Added ngram + embedding similarity filter"
   format: "hook + 3 bullets"
   proof_needed: "threshold values or rule of thumb"

close: "id go with #1 — it's the most surprising, easiest proof point."

Respond ONLY with valid JSON matching this schema (no prose outside the JSON):
{
  "angles": [
    { "title": "...", "premise": "...", "format": "...", "proof_needed": "..." },
    { "title": "...", "premise": "...", "format": "...", "proof_needed": "..." },
    { "title": "...", "premise": "...", "format": "...", "proof_needed": "..." }
  ],
  "close": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.3-70b-versatile",
    temperature: 0.55,
    max_tokens: 600,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: userMessage },
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
