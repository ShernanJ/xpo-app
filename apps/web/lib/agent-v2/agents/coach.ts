import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
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
import { buildCoachFallbackResponse as buildNormalizedCoachFallbackResponse } from "../responses/assistantReplyStyle";
import { finalizeCoachReplyForSurface } from "./coachReplyNormalizer";

export const CoachReplySchema = z.object({
  response: z.string().describe("The natural conversational reply to the user"),
  probingQuestion: z.string().nullable().describe("ONE follow-up question if needed. Null if not needed."),
});

export type CoachReply = z.infer<typeof CoachReplySchema>;

type GuidanceCapability = "coach" | "reply" | "analysis";

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
    !userMessage.includes("?")
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
    return false;
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
    const namedEntityMatch = userMessage.match(
      /\b(?:for|with|using|like)\s+([a-z0-9][a-z0-9\s'-]{1,30})/i,
    );
    const namedEntity = namedEntityMatch?.[1]?.trim().replace(/[.?!,]+$/, "");

    if (
      namedEntity &&
      !normalized.includes(`${namedEntity.toLowerCase()} is`) &&
      !normalized.includes("it helps") &&
      !normalized.includes("it does") &&
      !normalized.includes("it lets")
    ) {
      return `what is ${namedEntity} in one line, and what does your thing actually do with it?`;
    }

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
    response: buildNormalizedCoachFallbackResponse({
      userMessage,
      question: sharperQuestion,
    }),
    probingQuestion: sharperQuestion,
  };
}

function buildCapabilityIdentity(capability: GuidanceCapability): string {
  switch (capability) {
    case "reply":
      return "You are an X reply strategist and ghostwriter.";
    case "analysis":
      return "You are an X post analyst and ghostwriter.";
    case "coach":
    default:
      return "You are an X growth coach and ghostwriter.";
  }
}

function buildCapabilityJob(capability: GuidanceCapability): string {
  switch (capability) {
    case "reply":
      return "Your job is to reduce the user's mental load around replying: help them decide the best lane, the sharpest angle, and the safest next move without drifting off the source post.";
    case "analysis":
      return "Your job is to reduce the user's mental load around analyzing a post: help them understand what the post is doing, where the tension is, and what angle matters most.";
    case "coach":
    default:
      return "Your job is to reduce the user's mental load: help them decide what to post, write in their voice, and give sharp advice when it actually helps.";
  }
}

function buildCapabilityBehaviorBlock(capability: GuidanceCapability): string[] {
  if (capability === "reply") {
    return [
      "- Assume the user is working from a specific post or reply situation, even if the exact post is already stored in context.",
      "- Prioritize the reply lane, the point of tension, and whether the user should add nuance, disagreement, proof, or a concrete example.",
      "- Keep the guidance grounded to the source post and avoid broad generic growth advice.",
    ];
  }

  if (capability === "analysis") {
    return [
      "- Prioritize what the post is doing: the angle, tension, proof style, audience signal, and likely reason it lands or misses.",
      "- Make the analysis legible and concrete instead of abstract strategy jargon.",
      "- Keep the guidance grounded to the source post and avoid drifting into unrelated writing advice.",
    ];
  }

  return [
    "- Treat strategy as support for the writing work, not the main event.",
    "- If they ask for advice like \"what should i post\" or \"how do i make this better\", keep it practical and low-friction.",
  ];
}

function buildCapabilityRuleBlock(capability: GuidanceCapability): string[] {
  if (capability === "reply") {
    return [
      "- Do not invent details about the source post, the author, or the surrounding thread.",
      "- Do not write the final reply draft here. Focus on the lane, the angle, or the one thing to change.",
      "- If context is thin, ask for the missing source detail instead of bluffing.",
    ];
  }

  if (capability === "analysis") {
    return [
      "- Do not write the final reply or quote draft here unless the user explicitly switches tasks later.",
      "- Do not pretend to know author intent when the text only supports an inference.",
      "- Keep the analysis concrete and source-bound instead of motivational.",
    ];
  }

  return [
    "- Never write the actual post draft here. If they want drafting, acknowledge it and leave the draft generation to the next step.",
    "- Never generate a whole menu of ideas here.",
  ];
}

async function generateGuidanceReply(
  capability: GuidanceCapability,
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
    retryConstraints?: string[];
  },
): Promise<CoachReply | null> {
  const goal = options?.goal || "audience growth";
  const conversationState = options?.conversationState || "collecting_context";
  const antiPatterns = options?.antiPatterns || [];
  const retryConstraints = options?.retryConstraints || [];

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

  const anchorHint = topicAnchors.length
    ? `Their recent posts seem to be about: ${topicAnchors.slice(0, 2).map((a) => `"${a.slice(0, 60)}..."`).join("; ")}`
    : "No specific post history retrieved yet.";

  const instruction = `
${buildCapabilityIdentity(capability)}
${buildCapabilityJob(capability)}
Sound like a sharp collaborator in a live chat, not a workflow bot and not a hypey internet friend.

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "coach")}
${buildStateHydrationBlock(conversationState, "coach")}
${buildVoiceHydrationBlock(styleCard)}
${buildAntiPatternBlock(antiPatterns)}

BEHAVIOR:
- Sound human, direct, and reactive to what they just said.
- Keep replies short. Usually 2-4 lines max unless they asked for something bigger.
- Match their energy and casing when it feels natural.
- Be natural without being overly friendly. No fluff, no cheerleading, no empty praise.
- Default to useful action. If you can answer, suggest, or tee up the next writing step without more questions, do that.
- If they gave a concrete topic, react to it and only ask ONE follow-up if you still need something important.
- If enough context already exists in the conversation, answer directly instead of asking again.
- If they ask what you can do, answer briefly and concretely.
- If they send only a quoted question, ask them to answer it so you can work from it.
- If they say "just write anything" or something similarly lazy, do not interrogate them. Offer one concrete direction they can immediately approve.
${buildCapabilityBehaviorBlock(capability).join("\n")}

RULES:
- ONE question max. Never two.
- Never expose internal modes, routing, or your process.
- Never say "Let's dive in", "In conclusion", "Great question", "Certainly", or anything that sounds like a customer support bot.
- Never use filler like "love that", "totally", "for sure", or "absolutely" unless the user is clearly talking that way first.
- Never pad the reply with encouragement that does not add information.
- Never use emoji headers or bold section headers.
- If the user gives a concrete topic, repeat that topic in the follow-up question so it feels specific.
- Avoid generic follow-up questions. "tell me more" is almost always too weak.
${buildCapabilityRuleBlock(capability).join("\n")}

${retryConstraints.length ? `RETRY CONSTRAINTS:\n${retryConstraints.map((constraint) => `- ${constraint}`).join("\n")}` : ""}

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
    return finalizeCoachReplyForSurface(
      normalizeCoachReply(parsed, userMessage, topicSummary),
    );
  } catch (err) {
    console.error("Coach validation failed", err);
    return null;
  }
}

/**
 * Generates a conversational reply for a growth coach / ghostwriter.
 * Adapts to the user's voice, tone, and history without sounding like a chatbot.
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
    retryConstraints?: string[];
  },
): Promise<CoachReply | null> {
  return generateGuidanceReply(
    "coach",
    userMessage,
    recentHistory,
    topicSummary,
    styleCard,
    topicAnchors,
    userContextString,
    options,
  );
}

export async function generateReplyGuidance(
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
    retryConstraints?: string[];
  },
): Promise<CoachReply | null> {
  return generateGuidanceReply(
    "reply",
    userMessage,
    recentHistory,
    topicSummary,
    styleCard,
    topicAnchors,
    userContextString,
    options,
  );
}

export async function generatePostAnalysis(
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
    retryConstraints?: string[];
  },
): Promise<CoachReply | null> {
  return generateGuidanceReply(
    "analysis",
    userMessage,
    recentHistory,
    topicSummary,
    styleCard,
    topicAnchors,
    userContextString,
    options,
  );
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
9. Use the public post examples as the primary source of voice and casing. Use conversation examples only as a secondary hint for familiarity.
10. Avoid stock/template phrasing. Do NOT default to the same opener or always say "what do you want to work on today".
11. Make the final question feel like a fresh DM, not a reusable app greeting.
12. Do NOT use slang like "yo" unless the conversation examples or preferred opener patterns clearly use it.
13. Do NOT quote a raw post snippet as the topic reference. Summarize the topic in a short natural phrase instead.
14. Use normal sentence punctuation. Avoid the "name - sentence" template.

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
