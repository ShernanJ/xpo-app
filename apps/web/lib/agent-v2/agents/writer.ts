import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { PlannerOutput } from "./planner";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
} from "../contracts/chat";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
  buildGoalHydrationBlock,
  buildStateHydrationBlock,
  buildVoiceHydrationBlock,
} from "../prompts/promptHydrator";

export const WriterOutputSchema = z.object({
  angle: z.string().describe("The approach/angle used for this draft"),
  draft: z.string().describe("The actual generated X post — one single draft"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.string().describe("One-sentence rationale for why this draft works"),
  watchOutFor: z.string().describe("One-sentence warning about risk or tone"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema>;

function hasNoFabricationGuardrail(entries: string[]): boolean {
  return entries.some((entry) =>
    /(factual guardrail|invent(?:ed|ing)? personal anecdote|fabricat(?:ed|ing)|offline event|named place|timeline)/i.test(
      entry,
    ),
  );
}

/**
 * High capability draft writer. Takes the constraints from the Planner and the StyleCard
 * from the Profile to generate exactly 1 focused draft.
 */
export async function generateDrafts(
  plan: PlannerOutput,
  styleCard: VoiceStyleCard | null,
  topicAnchors: string[],
  activeConstraints: string[],
  recentHistory: string,
  activeDraft?: string,
  options?: {
    conversationState?: ConversationState;
    antiPatterns?: string[];
    maxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
  },
): Promise<WriterOutput | null> {
  const isEditing = !!activeDraft;
  const conversationState = options?.conversationState || "draft_ready";
  const antiPatterns = options?.antiPatterns || [];
  const maxCharacterLimit = options?.maxCharacterLimit ?? 280;
  const goal = options?.goal || "audience growth";
  const draftPreference = options?.draftPreference || "balanced";
  const formatPreference = options?.formatPreference || plan.formatPreference || "shortform";
  const noFabricatedAnecdotesGuardrail = hasNoFabricationGuardrail([
    ...plan.mustAvoid,
    ...activeConstraints,
  ]);
  const instruction = `
You are an elite ghostwriter for X (Twitter).
${isEditing ? `Your task is to take a Strategy Plan and apply it to EDIT an existing draft.`
      : `Your task is to take a strict Strategy Plan and generate EXACTLY 1 focused, high-quality draft.`}

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "draft")}
${buildStateHydrationBlock(conversationState, "draft")}
${buildDraftPreferenceBlock(draftPreference, "draft")}
${buildFormatPreferenceBlock(formatPreference, "draft")}
${buildVoiceHydrationBlock(styleCard)}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT (USE THIS AS YOUR BASELINE):\n${activeDraft}\n\n` : ""}

RECENT CHAT HISTORY (Provides context on what the user is replying to):
${recentHistory}

STRATEGY PLAN:
Objective: ${plan.objective}
Angle: ${plan.angle}
Target Lane: ${plan.targetLane}
Hook Type: ${plan.hookType}
Must Include: ${plan.mustInclude.join(" | ") || "None"}
Must Avoid: ${plan.mustAvoid.join(" | ") || "None"}
Active Session Constraints: ${activeConstraints.join(" | ") || "None"}

USER'S HISTORICAL POSTS (FOR VOICE AND THEMATIC REFERENCE):
${topicAnchors.join("\n---") || "None"}
CRITICAL: DO NOT copy facts, metrics, or personal stories from these historical posts into the new draft. Use them to understand the user's voice, pacing, and recurring thematic territory only.

${styleCard
      ? `
USER'S SPECIFIC WRITING STYLE:
- Sentence Openings: ${styleCard.sentenceOpenings.join(", ")}
- Sentence Closers: ${styleCard.sentenceClosers.join(", ")}
- Pacing: ${styleCard.pacing}
- Emojis: IF the user rarely uses emojis, DO NOT USE THEM. If they do, use them sparingly. (Pattern: ${styleCard.emojiPatterns.join(", ") || "None"})
- Slang/Vocabulary: ${styleCard.slangAndVocabulary.join(", ")}
- Formatting: ${styleCard.formattingRules.join(", ")}
${styleCard.customGuidelines.length > 0 ? `- EXPLICIT USER GUIDELINES (CRITICAL): ${styleCard.customGuidelines.join(" | ")}` : ""}
`
      : "No style card available. Write in a clean, punchy, conversational tone."
    }

REQUIREMENTS:
1. Generate EXACTLY 1 draft. Not 2. Not 3. One.
2. DO NOT invent random metrics, constraints, or backstory (like "juggling my day job" or "30% faster"). Stick ONLY to the facts the user provided in the chat history.
2a. NEVER invent specific counts or quantities (for example years, teammates, launches, percentages, revenue, follower counts, timelines, or attendance) unless that exact number is explicitly present in RECENT CHAT HISTORY or Active Session Constraints.
${noFabricatedAnecdotesGuardrail
      ? `2b. STRICT FACTUAL MODE: Do NOT claim specific real-world events, attendance, conversations, travel, timelines, or named places (for example: "yesterday i was at ...") unless that fact is explicitly present in the chat history or active constraints. If details are missing, write a principle/opinion/framework post instead of an anecdote.`
      : ""}
${isEditing ? `3. IMPORTANT: Do NOT rewrite the entire post from scratch unless the plan requires it. Keep the original structure and phrasing as much as possible, applying ONLY the edits requested in the "mustInclude", "mustAvoid", or "Angle" sections.` : `3. The draft should be the best possible execution of the plan.`}
4. Make it sound like the user actually wrote it — match their voice perfectly (e.g., if they write in all lowercase, YOU MUST write in all lowercase).
5. If the user did not specify a concrete topic, stay inside the user's usual subject matter and angles from their historical posts instead of drifting into random generic business content.
6. Provide an idea for a "supportAsset" (image/video idea to attach).
7. ANTI-RECYCLING: If the chat history contains a previous draft, you MUST write a COMPLETELY DIFFERENT structure, hook, and framing for the new draft. Do NOT reuse the same template, phrasing patterns, or CTA. Every draft must feel fresh.
8. If the user gave negative feedback about a previous draft (e.g. "i don't like the emoji usage", "it's all over the place"), treat that as a HARD constraint for this draft.
9. HARD LENGTH CAP: The "draft" field must stay at or under ${maxCharacterLimit.toLocaleString()} weighted X characters. This is a maximum, not a target.
10. If this is shortform, stay tight and get to the payoff fast. If this is longform, you may use more room for setup and development, but keep it readable and sharp.
11. Verification is not a professionalism signal. Do not make the writing more polished or corporate just because the account is verified.
12. If any Active Session Constraint starts with "Correction lock:", treat it as a hard factual correction. Preserve it exactly and do not drift back to the earlier assumption.
13. X does NOT support markdown styling. Do not use bold, italics, headings, or other markdown markers like **text**, __text__, *text*, # heading, or backticks.
14. Do NOT use empty engagement-bait CTAs like "reply 'FOCUS'" or "comment 'X'" unless the reader clearly gets something specific in return (for example: a DM, a template, a checklist, a link, a copy, or access). If there is no real payoff, use a more natural CTA like asking for their take or asking them to try it and report back.

Respond ONLY with a valid JSON matching this schema:
{
  "angle": "...",
  "draft": "The actual post text...",
  "supportAsset": "...",
  "whyThisWorks": "...",
  "watchOutFor": "..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: 0.45,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Generate the draft now." },
    ],
  });

  if (!data) return null;

  try {
    return WriterOutputSchema.parse(data);
  } catch (err) {
    console.error("Writer validation failed", err);
    return null;
  }
}
