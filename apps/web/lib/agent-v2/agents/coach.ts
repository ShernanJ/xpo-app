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
import {
  buildWelcomeFallbackMessage,
  isTemplateyWelcomeMessage,
} from "../welcomeMessage";

export const CoachReplySchema = z.object({
  response: z.string().describe("The natural conversational reply to the user"),
  probingQuestion: z.string().nullable().describe("ONE follow-up question if needed. Null if not needed."),
});

export type CoachReply = z.infer<typeof CoachReplySchema>;

function inferCoachTopic(userMessage: string, topicSummary: string | null): string | null {
  const trimmed = userMessage.trim().replace(/[.?!,]+$/, "");
  const aboutMatch = trimmed.match(/\b(?:about|on)\s+([a-z0-9][a-z0-9\s/&'’-]{1,80})$/i);
  if (aboutMatch?.[1]) {
    return aboutMatch[1].trim();
  }

  if (
    trimmed &&
    trimmed.length <= 48 &&
    trimmed.split(/\s+/).length <= 5 &&
    /^[a-z0-9\s/&'’-]+$/i.test(trimmed) &&
    !trimmed.includes("?")
  ) {
    return trimmed;
  }

  return topicSummary?.trim() || null;
}

function looksLikeBuildMessage(normalized: string): boolean {
  return (
    ["building", "making", "creating", "shipping", "rebuilding"].some((cue) =>
      normalized.includes(cue),
    ) &&
    ["tool", "app", "product", "extension", "plugin"].some((cue) =>
      normalized.includes(cue),
    )
  );
}

function looksGenericProbingQuestion(question: string | null): boolean {
  if (!question) {
    return true;
  }

  const normalized = question.trim().toLowerCase();

  return [
    "tell me more",
    "can you tell me more",
    "what do you want to talk about",
    "what do you want to write about",
    "what are you thinking",
    "what's on your mind",
    "whats on your mind",
    "what do you mean",
    "say more",
    "what happened",
    "what are you working on",
    "what are you building",
    "what do you want to hit",
  ].some((cue) => normalized.includes(cue));
}

function buildSharperCoachQuestion(
  userMessage: string,
  topicSummary: string | null,
): string | null {
  const normalized = userMessage.trim().toLowerCase();
  const topic = inferCoachTopic(userMessage, topicSummary);

  if (looksLikeBuildMessage(normalized)) {
    if (
      normalized.includes("but for ") ||
      normalized.includes("like stanley") ||
      normalized.includes("for x")
    ) {
      return "what's the one thing it actually does, and how is it different from what you're comparing it to?";
    }

    return "what does it actually do, and what's the one part people would care about?";
  }

  if (
    topic &&
    topic.length <= 48 &&
    topic.split(/\s+/).length <= 5
  ) {
    return `what part of ${topic} do you actually want to hit - your take, a mistake, or something you learned?`;
  }

  if (normalized.includes("fixed a bug") || normalized.includes("bug")) {
    return "what was the dumbest part of it - the mistake, the fix, or the thing you learned?";
  }

  if (normalized.includes("shipped") || normalized.includes("launch")) {
    return "what's the part that actually matters here - the win, the mistake, or what surprised you?";
  }

  return null;
}

function buildCoachFallbackResponse(userMessage: string, question: string): string {
  const normalized = userMessage.trim().toLowerCase();

  if (normalized.startsWith(">")) {
    return `love that angle. ${question}`;
  }

  if (looksLikeBuildMessage(normalized)) {
    return `nice. ${question}`;
  }

  return `got it. ${question}`;
}

function normalizeCoachReply(
  reply: CoachReply,
  userMessage: string,
  topicSummary: string | null,
): CoachReply {
  const sharperQuestion = buildSharperCoachQuestion(userMessage, topicSummary);
  if (!sharperQuestion) {
    return reply;
  }

  if (!looksGenericProbingQuestion(reply.probingQuestion)) {
    return reply;
  }

  return {
    response: buildCoachFallbackResponse(userMessage, sharperQuestion),
    probingQuestion: sharperQuestion,
  };
}

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
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
  },
): Promise<CoachReply | null> {
  const goal = options?.goal || "audience growth";
  const conversationState = options?.conversationState || "collecting_context";
  const antiPatterns = options?.antiPatterns || [];

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

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "coach")}
${buildStateHydrationBlock(conversationState, "coach")}
${buildVoiceHydrationBlock(styleCard)}
${buildAntiPatternBlock(antiPatterns)}

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
   If they name a topic, product, or situation, your question must stay anchored to that exact topic. Never fall back to generic lines like "tell me more" or "what do you want to talk about?"

3. **User is asking what you can do**
   React: be direct about your value. No bullet list of 10 things. 3-4 lines, conversational.

4. **User sends ONLY a quoted question (e.g. "> What project are you building?") without an answer**
   React: Acknowledge they picked that angle, and ask them to actually answer it so you can draft it.
   e.g. "love that angle. what are you actually building right now?"

5. **User says something lazy like "just write anything", "idk just make something", "hmm just write it"**
   React: DO NOT keep probing. Give them a concrete one-liner suggestion they can immediately greenlight.
   e.g. "bet — how about a quick post about what it's like building XPO solo? something real and raw. want me to draft that?"
   The goal is to move forward, not ask more questions.

6. **Anything else vague / unclear**
   React: ask ONE short focused question to move forward.

RULES:
- ONE question max. Never two.
- Never generate post ideas in coach mode. That's ideate mode.
- Never say "Let's dive in", "In conclusion", "Great question", "Certainly", or anything that sounds like a customer support bot.
- Never use emoji headers or bold section headers.
- If the user gives a concrete topic, repeat that topic in the follow-up question so it feels specific.
- Avoid generic follow-up questions. "tell me more" is almost always too weak.

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
    const parsed = CoachReplySchema.parse(data);
    return normalizeCoachReply(parsed, userMessage, topicSummary);
  } catch (err) {
    console.error("Coach validation failed", err);
    return null;
  }
}

export const WelcomeOutputSchema = z.object({
  response: z.string().describe("A short, dynamic welcome message in the user's voice"),
});

export type WelcomeOutput = z.infer<typeof WelcomeOutputSchema>;

function normalizeWelcomeResponse(args: {
  response: string;
  accountName: string;
  topicHint: string | null;
  voiceExamples: string[];
  conversationExamples: string[];
}): string {
  const trimmed = args.response.trim();
  if (!trimmed) {
    return buildWelcomeFallbackMessage({
      accountName: args.accountName,
      topicHint: args.topicHint,
      recentUserMessages: args.conversationExamples,
      voiceExamples: args.voiceExamples,
      conversationExamples: args.conversationExamples,
    });
  }

  if (!isTemplateyWelcomeMessage(trimmed)) {
    return trimmed;
  }

  return buildWelcomeFallbackMessage({
    accountName: args.accountName,
    topicHint: args.topicHint,
    recentUserMessages: args.conversationExamples,
    voiceExamples: args.voiceExamples,
    conversationExamples: args.conversationExamples,
  });
}

export async function generateWelcome(
  accountName: string,
  topicHint: string | null,
  toningCues: string,
  voiceExamples: string[] = [],
  conversationExamples: string[] = [],
): Promise<WelcomeOutput | null> {
  const instruction = `
You are the peer-collaborator and ghostwriter for the X (Twitter) creator "${accountName}".
Your job right now is to write a single, short Welcome Message when they open the app.

${buildConversationToneBlock()}

USER'S VIBE / TONE INSTRUCTIONS:
${toningCues || "Mirror a casual, lowercase peer."}

RECENT TOPIC HINT:
${topicHint ? `A recent post sounded like: "${topicHint}"` : "None available."}

REAL POST EXAMPLES TO MATCH:
${voiceExamples.length > 0
    ? voiceExamples.map((example, index) => `${index + 1}. ${example}`).join("\n")
    : "No direct post examples available."}

HOW THEY USUALLY TALK TO THE AGENT:
${conversationExamples.length > 0
    ? conversationExamples.map((example, index) => `${index + 1}. ${example}`).join("\n")
    : "No prior chat examples yet. Default to the creator's public voice."}

REQUIREMENTS:
1. Greet them by name (e.g. "yo ${accountName} —").
2. Mention the recent topic briefly if available (e.g., "saw you've been posting things like X...").
3. If examples are available, mirror their actual sentence shape, casing, and wording habits instead of using a generic assistant greeting.
4. Ask what they want to work on today (drafting, ideating, or auditing).
5. KEEP IT SHORT. 2-3 sentences max.
6. NO emojis unless their style explicitly asks for it.
7. NO robotic enthusiasm ("Welcome to the app!", "I am your AI assistant!"). Act like a human peer opening a Slack thread.
8. Never sound more polished, formal, or supportive-bot-ish than the user's own writing.
9. Use the conversation examples more than the public post examples for cadence if both are available.
10. Avoid stock/template phrasing. Do NOT default to the same opener or always say "what do you want to work on today".
11. Make the final question feel like a fresh DM, not a reusable app greeting.

Respond ONLY with valid JSON matching this schema:
{
  "response": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.8,
    max_tokens: 256, // fast response
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Write the welcome message now." },
    ],
  });

  if (!data) return null;

  try {
    const parsed = WelcomeOutputSchema.parse(data);
    return {
      response: normalizeWelcomeResponse({
        response: parsed.response,
        accountName,
        topicHint,
        voiceExamples,
        conversationExamples,
      }),
    };
  } catch (err) {
    console.error("Welcome validation failed", err);
    return null;
  }
}
