import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";

export const IdeaSchema = z.object({
  title: z.string().describe("The core topic or hook, e.g. 'Is AI a threat or opportunity?'"),
  why_this_works: z.string().describe("Conversational explanation of why this fits their profile/audience. e.g. 'Why this works for you: You've lived this...'"),
  opening_lines: z.array(z.string()).describe("2 distinct options for opening sentences"),
  subtopics: z.string().describe("Bullet-point-like string of subtopics, e.g. 'How AI changes work • Skills to develop • Builder perspective'"),
});

export const IdeasMenuSchema = z.object({
  intro: z.string().describe("A conversational intro paragraph evaluating their request/history before listing the ideas."),
  angles: z.array(IdeaSchema).describe("2-5 highly personalized post ideas"),
  close: z.string().describe("One casual follow-up asking which idea resonates, e.g. 'Which of these resonates? I can help you draft any of them 🫡'"),
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
You are an elite X (Twitter) content strategist collaborating directly with a creator.
Your job is to provide highly tailored post ideas based on their history or current request, sounding like an expert peer.

THE IDEATION FORMAT (CRITICAL):
You MUST follow this exact structure for your output:
1. Provide a conversational "intro" paragraph acknowledging what they asked for or evaluating their recent content trends. 
2. Provide 2-5 distinct "angles" (ideas). For each angle, you must provide:
   - title: A punchy topic or hook.
   - why_this_works: An explanation of why this specific angle fits their authority/niche.
   - opening_lines: 2 different scroll-stopping first-sentence options.
   - subtopics: A short list of talking points (e.g. "Point 1 • Point 2 • Point 3").
3. Provide a "close" sentence asking which one they want to draft.

${anchorContext}

NICHE ENFORCEMENT:
- Ideas MUST be highly personalized to what they actually do.
- NEVER invent generic topics like "5 ways to be productive".
- If they build AI tools, give them angles about the reality of building AI tools.

${userContextString || ""}

VOICE GUIDELINES:
${voiceHint}
Speak directly to them ("You've lived this", "Your audience trusts you"). 
Limit emojis, unless their stylecard heavily uses them. Be a professional but casual peer.

CONVERSATION SO FAR:
${recentHistory}

Respond ONLY with valid JSON matching the exact schema requirements.
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
