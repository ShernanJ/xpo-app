import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";

export const IdeaSchema = z.object({
  title: z.string().describe("Conversational pitch — what the post is about, max 10 words. Like how a friend would suggest it."),
  premise: z.string().describe("1 sentence — the specific angle or take within that topic"),
  format: z.string().describe("short format hint: story, contrast, list, hot take, etc."),
  proof_needed: z.string().describe("What concrete detail from the user powers this post"),
});

export const IdeasMenuSchema = z.object({
  angles: z.array(IdeaSchema).describe("2-3 ideas, specific to the user's actual topics and niche"),
  close: z.string().describe("One casual follow-up line after the ideas. Which to pick, or if none fit, ask what they want instead. Max 15 words."),
});

export type IdeasMenu = z.infer<typeof IdeasMenuSchema>;

/**
 * Generates post ideas anchored to the user's actual writing, topic, and niche.
 * Sounds like a friend suggesting ideas, not a template machine.
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
    ? `Voice: ${styleCard.pacing}. Openers they use: ${styleCard.sentenceOpenings?.slice(0, 2).join(", ") || "N/A"}.`
    : "No voice profile loaded.";

  // Ground the ideas in actual post history — this prevents making up topics
  const hasRealAnchors = topicAnchors.length > 0;
  const anchorContext = hasRealAnchors
    ? `User's recent post topics (use these as the seed):\n${topicAnchors.slice(0, 3).map((a) => `- ${a.slice(0, 120)}`).join("\n")}`
    : `No post history found yet. Use the topic they gave you: "${topicSummary || userMessage}"`;

  const instruction = `
You are an X (Twitter) content strategist helping a creator come up with post ideas.
Sound like a friend who knows their stuff — not a template generator.

THE MOST IMPORTANT RULE:
Every idea MUST be grounded in something specific the user actually does or talks about.
NEVER invent generic topics like "agile methodology", "project management tips", "5 ways to grow".
If their topic is vague, use their post history to find something real.
If their post history is empty, stick to what they literally told you and ask for one specific detail.

${anchorContext}

NICHE ENFORCEMENT (match what user actually does):
- If they talk about building products / shipping / AI agents → builder-focused angles only
- If they talk about GTM / VC / distribution → operator angles
- Never inject unrelated topics (AMPM ≠ growth strategy unless they're literally building for AMPM)

${userContextString || ""}

VOICE:
${voiceHint}

IDEATION STYLE:
Suggest ideas the way a friend would: casual, specific, low-pressure.
NOT: "Authenticity vs Online Persona" (generic angle anyone could write)
YES: "the part of your build that surprised you most this week" (grounded in their actual work)

After the ideas, say ONE casual closing line. Like: "any of these feel right?" or "id go with the first one tbh"

CONVERSATION SO FAR:
${recentHistory}

Respond ONLY with valid JSON:
{
  "angles": [
    { "title": "...", "premise": "...", "format": "...", "proof_needed": "..." },
    { "title": "...", "premise": "...", "format": "...", "proof_needed": "..." }
  ],
  "close": "..."
}

Keep to 2-3 ideas max. Specific > broad. Grounded > generic.
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.65,
    max_tokens: 1024,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Topic/message: ${userMessage}` },
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
