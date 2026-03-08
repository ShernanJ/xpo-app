import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import {
  buildAntiPatternBlock,
  buildConversationToneBlock,
  buildDraftPreferenceBlock,
  buildFormatPreferenceBlock,
  buildGoalHydrationBlock,
  buildStateHydrationBlock,
} from "../prompts/promptHydrator";

export const PlannerOutputSchema = z.object({
  objective: z.string(),
  angle: z.string(),
  targetLane: z.enum(["original", "reply", "quote"]),
  mustInclude: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  hookType: z.string(),
  pitchResponse: z.string().describe("A conversational message pitching this outline to the user before we write it. e.g. 'I'm thinking we do an original post focusing on X. Sound good?'")
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema> & StrategyPlan;

/**
 * High speed strategic planner. Defines exactly HOW a post will be structured
 * before we actually write it.
 */
export async function generatePlan(
  userMessage: string,
  topicSummary: string | null,
  activeConstraints: string[],
  recentHistory: string,
  activeDraft?: string,
  options?: {
    goal?: string;
    conversationState?: ConversationState;
    antiPatterns?: string[];
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
  },
): Promise<PlannerOutput | null> {
  const isEditing = !!activeDraft;
  const goal = options?.goal || "audience growth";
  const conversationState = options?.conversationState || "collecting_context";
  const antiPatterns = options?.antiPatterns || [];
  const draftPreference = options?.draftPreference || "balanced";
  const formatPreference = options?.formatPreference || "shortform";
  const instruction = `
You are shaping the strongest next post direction for an X creator.
Return a tight plan the writer can execute, not a presentation about your process.
${isEditing
      ? `This turn is about revising an existing draft. Keep the core idea unless the user clearly wants a different angle.`
      : `This turn is about a new ${formatPreference === "longform" ? "longform" : "shortform"} post.`}

${buildConversationToneBlock()}
${buildGoalHydrationBlock(goal, "plan")}
${buildStateHydrationBlock(conversationState, "plan")}
${buildDraftPreferenceBlock(draftPreference, "plan")}
${buildFormatPreferenceBlock(formatPreference, "plan")}
${buildAntiPatternBlock(antiPatterns)}

${isEditing ? `EXISTING DRAFT TO EDIT:\n${activeDraft}\n\n` : ""}

RECENT CHAT HISTORY (For context on what they are replying to):
${recentHistory}

USER'S CORE TOPIC/SUMMARY:
${topicSummary || "None"}

USER'S DIRECT REQUEST:
${userMessage}

ACTIVE SESSION CONSTRAINTS (Rules the user has previously set):
${activeConstraints.join(" | ") || "None"}

${isEditing ? `REQUIREMENTS:
1. Identify EXACTLY what needs to change in the existing draft to satisfy the user's request.
2. Keep the core angle intact unless the user explicitly asks to change it.
3. If they ask to remove something (e.g. emojis), put that in "mustAvoid".
4. If they ask to add something, put that in "mustInclude".
5. If any active session constraint starts with "Correction lock:", treat it as a hard factual correction. Preserve it exactly and do not reintroduce the old assumption.` :
      `REQUIREMENTS:
1. Identify a compelling, non-obvious angle for this topic.
2. Choose a target lane (is this an original thought, or pushing back on common advice?)
3. Determine what must be included (proof points) and avoided (cliches).
4. CRITICAL: DO NOT invent fake metrics, backstory, or constraints that the user hasn't provided (e.g., if they say they built a tool, do not add "cut manual steps by 30%").
5. If the user names a product, extension, tool, or company but does NOT explain what it actually does, keep the plan generic. Do NOT invent hidden workflow steps, UI pain points, or product behavior.
6. Specify the best hook type (e.g., "Counter-narrative", "Direct Action", "Framework").
7. Keep "pitchResponse" short, lowercase, natural, and collaborator-like. Never start with "got it", "let's", "here's the plan", or corporate framing.`}

STYLE:
- No internal workflow language.
- No consultant tone.
- No fake certainty if the topic is underspecified.
- The plan can be structured, but the pitch to the user should feel like a smart DM, not a strategy memo.

Respond ONLY with a valid JSON matching this schema:
{
  "objective": "...",
  "angle": "...",
  "targetLane": "original", // or "reply" or "quote"
  "mustInclude": ["specific detail 1"],
  "mustAvoid": ["generic word 1"],
  "hookType": "...",
  "pitchResponse": "Conversational pitch to the user..."
}
  `.trim();

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "low",
    temperature: 0.2,
    top_p: 0.9,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `User Request: ${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    return PlannerOutputSchema.parse(data);
  } catch (err) {
    console.error("Planner validation failed", err);
    return null;
  }
}
