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
import { dedupeAngleTitlesForRetry } from "../orchestrator/angleNovelty";

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

const GENERIC_IDEA_QUESTION_FRAGMENTS = [
  "what project are you building",
  "what's a project you're building",
  "what is a project you're building",
  "what have you worked on recently",
  "what's something you've worked on recently",
  "what's a recent win",
  "what is a recent win",
  "what's a common misconception",
  "what is a common misconception",
  "what's something you've learned",
  "what is something you've learned",
  "what's one thing you've learned",
  "what do beginners get wrong",
  "what's a hot take",
  "what is a hot take",
];

const GENERIC_IDEATION_REQUEST_PHRASES = new Set([
  "give me post ideas",
  "give me some post ideas",
  "give me more post ideas",
  "give me ideas",
  "give me some ideas",
  "give me more ideas",
  "more post ideas",
  "more ideas",
  "post ideas",
  "ideas",
  "brainstorm",
  "brainstorm with me",
  "what should i post",
  "what do i post",
  "help me figure out what to post",
  "give me angles",
  "give me some angles",
  "give me more angles",
  "try again",
  "another round",
  "one more round",
  "give me another idea",
  "give me another post idea",
  "give me another set of ideas",
  "give me a different set of ideas",
]);

const GENERIC_DRAFT_REQUEST_PHRASES = new Set([
  "draft a post",
  "draft a post for me",
  "draft me a post",
  "write a post",
  "write me a post",
  "write a post for me",
  "make a post",
  "make me a post",
  "generate a post",
  "create a post",
  "give me a post",
  "give me a random post i would use",
]);

const FOCUS_TOPIC_STOPWORDS = new Set([
  "about",
  "around",
  "with",
  "into",
  "from",
  "that",
  "this",
  "your",
  "their",
  "what",
  "when",
  "where",
  "why",
  "how",
  "help",
  "pick",
  "sharper",
  "angle",
  "post",
]);

function cleanFocusTopic(value: string): string {
  return value
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
}

function normalizeTopicCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.?!,]+$/, "")
    .replace(/\s+/g, " ");
}

function looksLikeGenericRequestTopic(value: string): boolean {
  const normalized = normalizeTopicCandidate(value);
  if (!normalized) {
    return false;
  }

  if (
    GENERIC_IDEATION_REQUEST_PHRASES.has(normalized) ||
    GENERIC_DRAFT_REQUEST_PHRASES.has(normalized)
  ) {
    return true;
  }

  if (/^(?:give|show|share|suggest|brainstorm)\s+me\s+(?:(?:some|more)\s+)?(?:post\s+)?ideas?$/.test(normalized)) {
    return true;
  }

  if (/^(?:give|show|share|suggest)\s+me\s+another\s+(?:post\s+)?idea$/.test(normalized)) {
    return true;
  }

  if (/^(?:try|run)\s+(?:that\s+)?again$/.test(normalized)) {
    return true;
  }

  if (/^(?:give|show|share|suggest)\s+me\s+(?:another|different|new)\s+(?:set\s+of\s+)?(?:post\s+)?ideas?$/.test(normalized)) {
    return true;
  }

  if (/^(?:write|draft|make|generate|create)\s+(?:me\s+)?(?:a\s+)?(?:random\s+)?post(?:\s+for me)?$/.test(normalized)) {
    return true;
  }

  return false;
}

function inferFocusTopic(userMessage: string, topicSummary: string | null): string | null {
  const sources = [userMessage, topicSummary || ""].filter(Boolean);

  for (const source of sources) {
    const aboutMatch = source.match(
      /\b(?:about|on|around|regarding|for)\s+([a-z0-9][a-z0-9\s/&'’-]{2,80})/i,
    );

    if (aboutMatch?.[1]) {
      const cleaned = cleanFocusTopic(aboutMatch[1]);
      if (cleaned && !looksLikeGenericRequestTopic(cleaned)) {
        return cleaned;
      }
    }
  }

  const topicCandidate = cleanFocusTopic(topicSummary || "");
  if (
    topicCandidate &&
    topicCandidate.split(/\s+/).length <= 10 &&
    !looksLikeGenericRequestTopic(topicCandidate)
  ) {
    return topicCandidate;
  }

  const messageCandidate = cleanFocusTopic(userMessage);
  if (
    messageCandidate &&
    messageCandidate.split(/\s+/).length <= 8 &&
    !looksLikeGenericRequestTopic(messageCandidate)
  ) {
    return messageCandidate;
  }

  return null;
}

function extractFocusKeywords(focusTopic: string | null): string[] {
  if (!focusTopic) {
    return [];
  }

  return focusTopic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length > 2 &&
        !FOCUS_TOPIC_STOPWORDS.has(value),
    );
}

function looksGenericIdeaTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return GENERIC_IDEA_QUESTION_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

function titleTouchesFocusTopic(title: string, focusTopic: string | null): boolean {
  if (!focusTopic) {
    return false;
  }

  const normalizedTitle = title.trim().toLowerCase();
  const normalizedFocus = focusTopic.trim().toLowerCase();
  if (normalizedTitle.includes(normalizedFocus)) {
    return true;
  }

  const keywords = extractFocusKeywords(focusTopic);
  return keywords.some((keyword) => normalizedTitle.includes(keyword));
}

function buildAnchoredQuestion(focusTopic: string, index: number): string {
  const patterns = [
    `what's the biggest tension you see with ${focusTopic}?`,
    `what do most people get wrong about ${focusTopic}?`,
    `where does ${focusTopic} break down in real life?`,
    `what's one thing you've learned the hard way about ${focusTopic}?`,
    `what part of ${focusTopic} feels most misunderstood?`,
  ];

  return patterns[index % patterns.length];
}

function buildSafeBroadQuestion(index: number): string {
  const patterns = [
    "what's the real tension here?",
    "what do people get wrong about this?",
    "where does this break down in practice?",
    "what's one lesson hiding in this?",
    "what feels most overlooked here?",
  ];

  return patterns[index % patterns.length];
}

function titleIntroducesUnsupportedSpecifics(
  title: string,
  sourceContext: string,
): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedContext = sourceContext.toLowerCase();
  const titleHasNumericSpecifics = /\$\s?\d|\b\d+(?:\.\d+)?%/.test(normalizedTitle);
  const contextHasNumericSpecifics = /\$\s?\d|\b\d+(?:\.\d+)?%/.test(normalizedContext);

  if (titleHasNumericSpecifics && !contextHasNumericSpecifics) {
    return true;
  }

  const riskyScenarioPhrases = [
    "credit card",
    "credit cards",
    "employees",
    "employee",
    "team",
    "office",
    "conference",
    "tech event",
    "board",
    "investor",
    "investors",
    "layoff",
    "layoffs",
    "acquisition",
    "unrestricted",
  ];

  return riskyScenarioPhrases.some(
    (phrase) =>
      normalizedTitle.includes(phrase) && !normalizedContext.includes(phrase),
  );
}

function personalizeAngles(
  angles: IdeasMenu["angles"],
  focusTopic: string | null,
): IdeasMenu["angles"] {
  return angles.map((angle, index) => {
    const cleanTitle = angle.title.trim().replace(/\s+/g, " ");

    if (focusTopic && cleanTitle && titleTouchesFocusTopic(cleanTitle, focusTopic)) {
      return angle;
    }

    if (focusTopic) {
      return {
        ...angle,
        title: buildAnchoredQuestion(focusTopic, index),
      };
    }

    if (!cleanTitle || looksGenericIdeaTitle(cleanTitle)) {
      return {
        ...angle,
        title: buildSafeBroadQuestion(index),
      };
    }

    return angle;
  });
}

function groundAngles(
  angles: IdeasMenu["angles"],
  focusTopic: string | null,
  sourceContext: string,
): IdeasMenu["angles"] {
  return angles.map((angle, index) => {
    const cleanTitle = angle.title.trim().replace(/\s+/g, " ");

    if (!cleanTitle) {
      return angle;
    }

    if (!titleIntroducesUnsupportedSpecifics(cleanTitle, sourceContext)) {
      return angle;
    }

    return {
      ...angle,
      title: focusTopic
        ? buildAnchoredQuestion(focusTopic, index)
        : buildSafeBroadQuestion(index),
    };
  });
}

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
  const focusTopic = inferFocusTopic(userMessage, topicSummary);

  const voiceHint = styleCard
    ? `Voice: ${styleCard.pacing}. Openers they use: ${styleCard.sentenceOpenings?.slice(0, 2).join(", ") || "N/A"}.`
    : "No voice profile loaded.";

  // Ground the ideas in actual post history — this prevents making up topics
  const hasRealAnchors = topicAnchors.length > 0;
  const anchorContext = hasRealAnchors
    ? `User's recent post topics (use these as the seed):\n${topicAnchors.slice(0, 3).map((a) => `- ${a.slice(0, 120)}`).join("\n")}`
    : `No post history found yet. Use the topic they gave you: "${topicSummary || userMessage}"`;
  const focusTopicBlock = focusTopic
    ? `CURRENT FOCUS TOPIC:
- ${focusTopic}
- Every angle must stay recognizably inside this topic.
- Do NOT reset back to generic prompts like "what project are you building?" when a topic is already present.
- If a question could fit almost any niche, it is too generic.
- At least 2 angle titles should clearly reference this topic or its core tension.`
    : `CURRENT FOCUS TOPIC:
- No tight topic yet. You may stay broader, but still avoid generic filler questions.`;

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

${focusTopicBlock}

${anchorContext}

INTRO ALIGNMENT RULES:
- The intro must only mention themes that are actually present in the angle titles you return.
- Do not add extra products, events, personas, or claims in the intro unless at least one angle title also includes them.
- Keep intro short and grounded. No hype claims like "people love this" unless supported by the provided context.

NICHE ENFORCEMENT:
- Ideas MUST be highly personalized to their niche, but keep the questions BROAD enough that anyone in that niche could answer them.
- NEVER invent generic topics like "5 ways to be productive".
- If the user already gave a concrete topic, every angle should feel like a sharper slice of that topic, not a total reset.
- Do not invent hyper-specific emotional scenarios (like "the moment you cried"). Keep it professional but casual.
- Do not invent exact dollar amounts, percentages, company policies, or made-up events unless the user or retrieved context already mentioned them.
- If you're not sure, stay broad and ask a safer question instead of creating a specific story premise.

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
    const parsed = IdeasMenuSchema.parse(data);
    const sourceContext = [
      userMessage,
      topicSummary || "",
      userContextString,
      ...topicAnchors.slice(0, 3),
    ]
      .filter(Boolean)
      .join(" ");
    const personalizedAngles = personalizeAngles(parsed.angles, focusTopic);
    const groundedAngles = groundAngles(personalizedAngles, focusTopic, sourceContext);
    const noveltyCheckedAngles = dedupeAngleTitlesForRetry({
      angles: groundedAngles,
      focusTopic,
      recentHistory,
      seed: userMessage,
    });

    return {
      ...parsed,
      angles: noveltyCheckedAngles,
    };
  } catch (err) {
    console.error("Ideator validation failed.", err);
    console.error("RAW DATA RETURNED:", JSON.stringify(data, null, 2));
    return null;
  }
}
