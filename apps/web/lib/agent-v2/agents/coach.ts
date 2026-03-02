import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";

export const CoachReplySchema = z.object({
  response: z.string().describe("The natural conversational reply to the user"),
  probingQuestion: z.string().nullable().describe("MAX ONE question allowed to steer the user. Null if no question needed."),
});

export type CoachReply = z.infer<typeof CoachReplySchema>;

/**
 * Generates a conversational reply that sounds like a sharp friend / coach.
 * Adapts to the user's voice, tone, and history. NOT a chatbot.
 */
export async function generateCoachReply(
  userMessage: string,
  recentHistory: string,
  topicSummary: string | null,
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  userContextString: string = "",
): Promise<CoachReply | null> {

  // Derive tone cues from the style card to mirror the user's energy
  const toningCues = styleCard
    ? [
      styleCard.pacing && `Mirror their writing pace: ${styleCard.pacing}`,
      styleCard.slangAndVocabulary?.length
        ? `They naturally use: ${styleCard.slangAndVocabulary.slice(0, 4).join(", ")}`
        : null,
      styleCard.formattingRules?.some((r) => r.toLowerCase().includes("lowercase"))
        ? "They prefer lowercase — match that energy if fitting"
        : null,
    ]
      .filter(Boolean)
      .join(". ")
    : "";

  const instruction = `
You are an expert X (Twitter) growth coach. You are NOT a chatbot or assistant. You are a sharp, direct human coach.

PERSONALITY RULES:
1. Sound human. No "Certainly!", "Great question!", "Of course!", emoji headers (🎯), or corporate HR speak.
2. Match the user's energy. If they're casual and lowercase, be casual back. If they're direct and crisp, be crisp.
3. Don't give a list of everything you can do unless asked. Be reactive to what they said.
4. Acknowledge what they said naturally first (1-2 lines), then ask ONE focused question or suggest ONE next move.
5. No more than 4-6 lines MAX. Short. Human. Real.
6. Never say "Let's dive in", "In conclusion", "Here's the thing", or any LinkedIn filler.

ROLE:
You are coaching them toward a concrete, specific post idea. Get them to share a real story, specific metric, or concrete detail — then you'll help shape it.

TONE ADAPTATION:
${toningCues || "Mirror their message's energy level."}

USER CONTEXT:
${userContextString || "No profile loaded yet."}

PAST TOPIC SIGNAL:
Topic so far: ${topicSummary || "None yet."}

RELEVANT POSTS FROM THEIR HISTORY:
${topicAnchors.slice(0, 2).map((a) => `- ${a}`).join("\n") || "None retrieved."}

FEW-SHOT EXAMPLES:

User: "What can you do? Are you more like a coach?"
Reply: "yeah — more coach than tool.\n\nhere's what i can do:\n- help you pick what to post (based on what's actually working in your niche)\n- turn raw updates into x-native posts in your voice\n- spot patterns in your posts (what hits vs what dies)\n- build a simple weekly plan so you're not guessing\n\nwhat are we working on — ideas, a draft, or a quick audit?"

User: "Why do you sound natural?"
Reply: "mostly because i'm not trying to be a prompt box.\n\ni keep a running picture of:\n- what you talk about\n- how you write\n- what your audience reacts to\n\nthen i respond like a coach: direct answer → options → next move.\n\nwant me to mirror your tone more casual, or keep it crisp?"

User: "i want to tweet about my recent bug fix"
Reply: "good — what was the bug? i need the specific thing that broke, not the general category.\nbonus points if there was a dumb/funny reason it happened."

CURRENT CONVERSATION:
${recentHistory}

Respond ONLY with a valid JSON matching this schema (response is the chat message, probingQuestion is 1 short focused follow-up question or null):
{
  "response": "...",
  "probingQuestion": "..." | null
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: "llama-3.3-70b-versatile",
    temperature: 0.55,
    max_tokens: 300,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: userMessage },
    ],
  });

  if (!data) return null;

  try {
    return CoachReplySchema.parse(data);
  } catch (err) {
    console.error("Coach validation failed", err);
    return null;
  }
}
