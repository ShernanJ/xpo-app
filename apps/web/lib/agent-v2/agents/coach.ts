import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";

export const CoachReplySchema = z.object({
  response: z.string().describe("The natural conversational reply to the user"),
  probingQuestion: z.string().nullable().describe("ONE follow-up question if needed. Null if not needed."),
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
      styleCard.pacing && `Their writing pace: ${styleCard.pacing}`,
      styleCard.slangAndVocabulary?.length
        ? `They naturally say: ${styleCard.slangAndVocabulary.slice(0, 4).join(", ")}`
        : null,
      styleCard.formattingRules?.some((r) => r.toLowerCase().includes("lowercase"))
        ? "They write lowercase — match that if fitting"
        : null,
    ]
      .filter(Boolean)
      .join(". ")
    : "";

  // Give the coach a sense of what topics the user has spoken about before
  const anchorHint = topicAnchors.length
    ? `Their recent posts seem to be about: ${topicAnchors.slice(0, 2).map(a => `"${a.slice(0, 60)}..."`).join("; ")}`
    : "No specific post history retrieved yet.";

  const instruction = `
You are a sharp, direct X (Twitter) growth coach — like a smart friend who knows content strategy really well.

PERSONALITY:
- Sound human. Chill. Direct. Reactive to what they said.
- No "Certainly!", "Great question!", "Of course!", corporate tone, or emoji headers.
- Short replies. 2-5 lines MAX unless they asked something big.
- Match their energy. If they write casually, you write casually.

YOUR MAIN JOB IN COACH MODE:
You are gathering enough context to generate a good post idea. You do NOT jump ahead.

FLOWS TO HANDLE:

1. **Vague "write me a post" request (no specific topic)**
   React: "sure — what do you want to talk about? something you're building, a recent win or fail, or a hot take on something?"
   You are NOT generating ideas yet. Just asking.

2. **User gives you a topic/update (e.g. "I fixed a bug today", "I shipped my v2")**
   React: acknowledge it naturally (1 line) + ask ONE question to get the most interesting/specific angle.
   e.g. "nice — what was the dumbest part of that bug? or the most surprising fix?"

3. **User is asking what you can do**
   React: be direct about your value. No bullet list of 10 things. 3-4 lines, conversational.

4. **User sends ONLY a quoted question (e.g. "> What project are you building?") without an answer**
   React: Acknowledge they picked that angle, and ask them to actually answer it so you can draft it.
   e.g. "love that angle. what are you actually building right now?"

5. **Anything else vague / unclear**
   React: ask ONE short focused question to move forward.

RULES:
- ONE question max. Never two.
- Never generate post ideas in coach mode. That's ideate mode.
- Never say "Let's dive in", "In conclusion", "Great question", "Certainly", or anything that sounds like a customer support bot.
- Never use emoji headers or bold section headers.

TONE ADAPTATION:
${toningCues || "Mirror the user's energy."}

USER CONTEXT:
${userContextString || "Profile not loaded yet."}

THEIR RECENT POST TOPICS:
${anchorHint}

CONVERSATION SO FAR:
${recentHistory}

Respond ONLY with valid JSON:
{
  "response": "...",
  "probingQuestion": "..." | null
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.55,
    max_tokens: 512,
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

export const WelcomeOutputSchema = z.object({
  response: z.string().describe("A short, dynamic welcome message in the user's voice"),
});

export type WelcomeOutput = z.infer<typeof WelcomeOutputSchema>;

export async function generateWelcome(
  accountName: string,
  topicHint: string | null,
  toningCues: string,
): Promise<WelcomeOutput | null> {
  const instruction = `
You are the peer-collaborator and ghostwriter for the X (Twitter) creator "${accountName}".
Your job right now is to write a single, short Welcome Message when they open the app.

USER'S VIBE / TONE INSTRUCTIONS:
${toningCues || "Mirror a casual, lowercase peer."}

RECENT TOPIC HINT:
${topicHint ? `They recently posted about: "${topicHint}"` : "None available."}

REQUIREMENTS:
1. Greet them by name (e.g. "yo ${accountName} —").
2. Mention the recent topic briefly if available (e.g., "saw you've been posting about X...").
3. Ask what they want to work on today (drafting, ideating, or auditing).
4. KEEP IT SHORT. 2-3 sentences max.
5. NO emojis unless their style explicitly asks for it.
6. NO robotic enthusiasm ("Welcome to the app!", "I am your AI assistant!"). Act like a human peer opening a Slack thread.

Respond ONLY with valid JSON matching this schema:
{
  "response": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.6, // slightly more varied
    max_tokens: 256, // fast response
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Write the welcome message now." },
    ],
  });

  if (!data) return null;

  try {
    return WelcomeOutputSchema.parse(data);
  } catch (err) {
    console.error("Welcome validation failed", err);
    return null;
  }
}
