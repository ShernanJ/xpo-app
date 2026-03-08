import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import { buildPlanInstruction } from "./promptBuilders";

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
  const instruction = buildPlanInstruction({
    userMessage,
    topicSummary,
    activeConstraints,
    recentHistory,
    activeDraft,
    options,
  });

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
