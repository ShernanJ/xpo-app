import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import { VoiceStyleCard } from "../core/styleProfile";
import type { ConversationState } from "../contracts/chat";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildGoalHydrationBlock,
  buildStateHydrationBlock,
  buildVoiceHydrationBlock,
} from "../prompts/promptHydrator";

export const IdeaSchema = z.object({
  title: z.string().describe("A broad, conversational, open-ended question that prompts the user for a story. Keep it general and simple. e.g. 'Are there any recent projects you worked on that you can talk about?' or 'What is a common misconception about building AI tools?'"),
  why_this_works: z.string().describe("Conversational explanation of why this fits their profile/audience. e.g. 'Your audience loves raw, behind-the-scenes building stories...'"),
  opening_lines: z.any().describe("2 distinct options for opening sentences to show them how it could start"),
  subtopics: z.any().describe("What they should talk about in the reply, e.g. 'The specific bug • The frustrated caffeine-fueled moment • The fix'"),
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
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
  },
): Promise<IdeasMenu | null> {
  const goal = options?.goal || "audience growth";
  const conversationState = options?.conversationState || "collecting_context";
  const antiPatterns = options?.antiPatterns || [];

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

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "ideate")}
${buildStateHydrationBlock(conversationState, "ideate")}
${buildVoiceHydrationBlock(styleCard)}
${buildAntiPatternBlock(antiPatterns)}

THE IDEATION FORMAT (CRITICAL):
You MUST follow this exact structure for your output:
1. Provide a conversational "intro" paragraph acknowledging what they asked for or evaluating their recent content trends. 
2. Provide 2-5 distinct "angles" (ideas). For each angle, you must NOT write a formal post title or hook. Instead, you must provide:
   - title: A very SIMPLE, broad, conversational QUESTION to ask the user. Do not make hyper-specific assumptions about them crying or quitting. (e.g. "What is a project you've worked on recently?" or "What's a common mistake you see beginners make?")
   - why_this_works: An explanation of why this specific angle fits their authority/niche.
   - opening_lines: 2 different scroll-stopping first-sentence options to give them a taste of the final post.
   - subtopics: A short list of talking points they should include in their response.
3. Provide a "close" sentence asking which one they want to flesh out.

${anchorContext}

NICHE ENFORCEMENT:
- Ideas MUST be highly personalized to their niche, but keep the questions BROAD enough that anyone in that niche could answer them.
- NEVER invent generic topics like "5 ways to be productive".
- Do not invent hyper-specific emotional scenarios (like "the moment you cried"). Keep it professional but casual.

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
    max_tokens: 2048,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `Topic/message: ${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    return IdeasMenuSchema.parse(data);
  } catch (err) {
    console.error("Ideator validation failed.", err);
    console.error("RAW DATA RETURNED:", JSON.stringify(data, null, 2));
    return null;
  }
}
