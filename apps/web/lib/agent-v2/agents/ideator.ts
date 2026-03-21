import { fetchStructuredJsonFromGroq } from "./llm.ts";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type {
  ConversationState,
  SessionConstraint,
  StrategyPlan,
} from "../contracts/chat";
import {
  buildConversationToneBlock,
  buildPromptHydrationEnvelope,
} from "../prompts/promptHydrator";
import { dedupeAngleTitlesForRetry } from "../core/angleNovelty";
import type { CreatorProfileHints } from "../grounding/groundingPacket";

export const IdeaSchema = z.object({
  title: z.string().describe("A concise, draftable angle title for the post idea. Keep it short, specific, and immediately usable as a direction, not an open-ended question. e.g. 'the hiring filter that kept our team lean' or 'why founder-led sales breaks when the process stays tribal'"),
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
  "what should i post today",
  "what should i post this week",
  "what should i post right now",
  "what should i post on x",
  "what should i post on twitter",
  "what should i tweet",
  "what should i tweet today",
  "what should i tweet this week",
  "what do i post",
  "what do i post today",
  "what do i post this week",
  "what do i post on x",
  "what do i post on twitter",
  "what do i tweet",
  "what do i tweet today",
  "what do i tweet this week",
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

type IdeationDirection = "same_lane" | "switch_direction" | null;

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

  if (
    /^what should i post(?:\s+(?:today|this week|right now))?(?:\s+on\s+(?:x|twitter))?$/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /^what do i post(?:\s+(?:today|this week))?(?:\s+on\s+(?:x|twitter))?$/.test(normalized)
  ) {
    return true;
  }

  if (/^what should i tweet(?:\s+(?:today|this week|right now))?$/.test(normalized)) {
    return true;
  }

  if (/^what do i tweet(?:\s+(?:today|this week))?$/.test(normalized)) {
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

function inferIdeationDirection(userMessage: string): IdeationDirection {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    /\bmore like this\b/.test(normalized) ||
    /\bsame lane\b/.test(normalized) ||
    /\bmore ideas like this\b/.test(normalized) ||
    /\bstay on this theme\b/.test(normalized) ||
    /\bkeep this lane\b/.test(normalized)
  ) {
    return "same_lane";
  }

  if (
    /\bchange it up\b/.test(normalized) ||
    /\bswitch direction\b/.test(normalized) ||
    /\bdifferent direction\b/.test(normalized) ||
    /\bnew direction\b/.test(normalized)
  ) {
    return "switch_direction";
  }

  return null;
}

function extractRecentAngleTitles(recentHistory: string): string[] {
  if (!recentHistory.trim()) {
    return [];
  }

  const lines = recentHistory.split(/\r?\n/);
  const titles: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() || "";
    if (!line) {
      continue;
    }

    const inlineMatch = line.match(/^(?:assistant(?:_angles)?\s*:\s*)?\d+\.\s+(.+)$/i);
    if (inlineMatch?.[1]) {
      titles.push(inlineMatch[1].trim().replace(/\s+/g, " "));
      continue;
    }

    if (/^(?:assistant(?:_angles)?\s*:\s*)?\d+\.\s*$/i.test(line)) {
      const nextLine = (lines[index + 1] || "").trim();
      if (nextLine) {
        titles.push(nextLine.replace(/\s+/g, " "));
      }
    }
  }

  return Array.from(new Set(titles)).slice(-8);
}

function inferFocusTopicFromRecentAngles(recentHistory: string): string | null {
  const titles = extractRecentAngleTitles(recentHistory);
  if (titles.length === 0) {
    return null;
  }

  const joined = titles.join(" ").toLowerCase();
  const conversionMatch = joined.match(
    /\b(linkedin|substack|youtube|newsletter)\b[\s\w]{0,20}\b(?:to|into)\b[\s\w]{0,20}\b(x|twitter)\b/i,
  );
  if (conversionMatch?.[1] && conversionMatch?.[2]) {
    return `${conversionMatch[1]} to ${conversionMatch[2]}`;
  }

  const ampmMatch = joined.match(/\bampm\b/i);
  if (ampmMatch) {
    return "ampm vs real life";
  }

  return null;
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
    `the hard lesson behind ${focusTopic}`,
    `the mistake most people make with ${focusTopic}`,
    `where ${focusTopic} breaks down in real life`,
    `the playbook behind ${focusTopic}`,
    `why ${focusTopic} gets misunderstood`,
  ];

  return patterns[index % patterns.length];
}

function buildSafeBroadQuestion(index: number): string {
  const patterns = [
    "the hard lesson behind a recent win",
    "the mistake people keep repeating",
    "where this breaks down in practice",
    "the playbook behind the result",
    "why this gets overlooked",
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
    activeConstraints?: string[];
    sessionConstraints?: SessionConstraint[];
    creatorProfileHints?: CreatorProfileHints | null;
    activeTaskSummary?: string | null;
    activePlan?: StrategyPlan | null;
    activeDraft?: string;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
  },
): Promise<IdeasMenu | null> {
  const goal = options?.goal || "audience growth";
  const conversationState = options?.conversationState || "collecting_context";
  const antiPatterns = options?.antiPatterns || [];
  const ideationDirection = inferIdeationDirection(userMessage);
  const focusTopic = inferFocusTopic(userMessage, topicSummary);
  const historicalFocusTopic =
    ideationDirection === "same_lane"
      ? inferFocusTopicFromRecentAngles(recentHistory)
      : null;
  const effectiveFocusTopic = focusTopic || historicalFocusTopic;

  const voiceHint = styleCard
    ? `Voice: ${styleCard.pacing}. Openers they use: ${styleCard.sentenceOpenings?.slice(0, 2).join(", ") || "N/A"}.`
    : "No voice profile loaded.";
  const hydrationEnvelope = buildPromptHydrationEnvelope({
    mode: "ideate",
    goal,
    conversationState,
    styleCard,
    antiPatterns,
    activeConstraints:
      options?.sessionConstraints?.map((constraint) => constraint.text) ||
      options?.activeConstraints ||
      [],
    sessionConstraints: options?.sessionConstraints,
    creatorProfileHints: options?.creatorProfileHints,
    userContextString,
    activeTaskSummary: options?.activeTaskSummary,
    activePlan: options?.activePlan || null,
    activeDraft: options?.activeDraft,
    latestRefinementInstruction: options?.latestRefinementInstruction || null,
    lastIdeationAngles: options?.lastIdeationAngles || [],
  });

  // Ground the ideas in actual post history — this prevents making up topics
  const hasRealAnchors = topicAnchors.length > 0;
  const anchorContext = hasRealAnchors
    ? `User's recent post topics (use these as the seed):\n${topicAnchors.slice(0, 3).map((a) => `- ${a.slice(0, 120)}`).join("\n")}`
    : `No post history found yet. Use the topic they gave you: "${topicSummary || userMessage}"`;
  const focusTopicBlock = effectiveFocusTopic
    ? `CURRENT FOCUS TOPIC:
- ${effectiveFocusTopic}
- Every angle must stay recognizably inside this topic.
- Do NOT reset back to generic prompts like "what project are you building?" when a topic is already present.
- If a question could fit almost any niche, it is too generic.
- At least 2 angle titles should clearly reference this topic or its core tension.`
    : `CURRENT FOCUS TOPIC:
- No tight topic yet. You may stay broader, but still avoid generic filler questions.`;
  const ideationDirectionBlock =
    ideationDirection === "same_lane"
      ? `IDEATION DIRECTION:
- User asked for MORE LIKE THIS.
- Keep the same core lane/topic as the previous idea set.
- Generate fresh angles, but do not reset into unrelated categories.`
      : ideationDirection === "switch_direction"
        ? `IDEATION DIRECTION:
- User asked to CHANGE IT UP.
- Keep broad relevance to the creator's lane, but shift to a clearly different angle family.
- Avoid reusing near-identical phrasing from the immediately previous angle set in history.`
        : `IDEATION DIRECTION:
- No explicit direction override.`;

  const instruction = `
You are an elite X (Twitter) content strategist collaborating directly with a creator.
Your job is to provide highly tailored post ideas based on their history or current request, sounding like an expert peer.

${buildConversationToneBlock()}
${hydrationEnvelope}

THE IDEATION FORMAT (CRITICAL):
You MUST follow this exact structure for your output:
1. Provide a conversational "intro" paragraph acknowledging what they asked for or evaluating their recent content trends. 
2. Provide 2-5 distinct "angles" (ideas). For each angle, you must NOT write a formal post title or hook. Instead, you must provide:
   - title: A concise, draftable ANGLE TITLE. It should read like a post direction someone could instantly pick, not a question to ask the user. (e.g. "the hiring filter that kept our team lean" or "why onboarding breaks when nobody owns the first week")
   - why_this_works: An explanation of why this specific angle fits their authority/niche.
   - opening_lines: 2 different scroll-stopping first-sentence options to give them a taste of the final post.
   - subtopics: A short list of talking points they should include in their response.
3. Provide a "close" sentence asking which one they want to flesh out.

FORMAT MIX:
- Do not just pitch 3 standard growth hooks.
- If you return 3 or more angles, include at least 1 tactical lesson, 1 personal story, and 1 contrarian observation or joke so the user can choose a voice lane.
- Placeholder-based Mad-Libs angles are allowed when the specifics are not known yet. Hooks like "how i used [Tool] to improve [Metric] by [X]%" are valid as long as the placeholders stay explicit.

${focusTopicBlock}

${anchorContext}

${ideationDirectionBlock}

INTRO ALIGNMENT RULES:
- The intro must only mention themes that are actually present in the angle titles you return.
- Do not add extra products, events, personas, or claims in the intro unless at least one angle title also includes them.
- Keep intro short and grounded. No hype claims like "people love this" unless supported by the provided context.

NICHE ENFORCEMENT:
- Ideas MUST be highly personalized to their niche, but the title should still feel broadly usable as a post direction rather than a one-off anecdote.
- NEVER invent generic topics like "5 ways to be productive".
- If the user already gave a concrete topic, every angle should feel like a sharper slice of that topic, not a total reset.
- Do not invent hyper-specific emotional scenarios (like "the moment you cried"). Keep it professional but casual.
- Do not invent exact dollar amounts, percentages, company policies, or made-up events unless the user or retrieved context already mentioned them.
- If you're not sure, stay broad and choose a safer angle instead of creating a specific story premise.

${userContextString || ""}

VOICE GUIDELINES:
${voiceHint}
Speak directly to them ("You've lived this", "Your audience trusts you"). 
Limit emojis, unless their stylecard heavily uses them. Be a professional but casual peer.

WORKFLOW CONTEXT PACKET:
${recentHistory}

Respond ONLY with valid JSON matching the exact schema requirements.
  `.trim();

  const data = await fetchStructuredJsonFromGroq({
    schema: IdeasMenuSchema,
    modelTier: "planning",
    fallbackModel: "openai/gpt-oss-120b",
    optionalDefaults: {
      intro: "",
      angles: [],
      close: "",
    },
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
    const parsed = data;
    const sourceContext = [
      userMessage,
      topicSummary || "",
      userContextString,
      ...topicAnchors.slice(0, 3),
    ]
      .filter(Boolean)
      .join(" ");
    const personalizedAngles = personalizeAngles(parsed.angles, effectiveFocusTopic);
    const groundedAngles = groundAngles(personalizedAngles, effectiveFocusTopic, sourceContext);
    const noveltyCheckedAngles = dedupeAngleTitlesForRetry({
      angles: groundedAngles,
      focusTopic: effectiveFocusTopic,
      recentHistory,
      seed:
        ideationDirection === "switch_direction"
          ? `${userMessage}|switch_direction`
          : ideationDirection === "same_lane"
            ? `${userMessage}|same_lane`
            : userMessage,
    });

    return {
      ...parsed,
      angles: noveltyCheckedAngles,
    };
  } catch (err) {
    console.error("Ideator validation failed.", err);
    console.error("Ideator validation returned an unexpected payload shape.");
    return null;
  }
}
