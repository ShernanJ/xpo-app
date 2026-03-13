import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import type { VoiceTarget } from "../core/voiceTarget";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../orchestrator/groundingPacket";
import { buildPlanInstruction } from "./promptBuilders";

function summarizePlannerFetchFailure(reason: string): string {
  const normalized = reason.trim().toLowerCase();

  if (normalized === "returned invalid json") {
    return "the planner returned invalid JSON";
  }

  if (normalized === "returned no content") {
    return "the planner returned no content";
  }

  if (normalized === "returned no choices") {
    return "the planner returned no choices";
  }

  return "the planner request failed";
}

function summarizePlannerSchemaFailure(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "the planner returned an invalid plan shape";
  }

  const path = firstIssue.path
    .map((segment) => String(segment).trim())
    .filter(Boolean)
    .join(".");

  if (!path) {
    return "the planner returned an invalid plan shape";
  }

  return `the planner returned an invalid plan shape for ${path}`;
}

export const PlannerOutputSchema = z.object({
  objective: z.string(),
  angle: z.string(),
  targetLane: z.enum(["original", "reply", "quote"]),
  mustInclude: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  hookType: z.string(),
  pitchResponse: z.string().describe("A conversational message pitching this outline to the user before we write it. e.g. 'I'm thinking we do an original post focusing on X. Sound good?'")
});

/**
 * Thread-specific plan with per-post beat modeling.
 * Each post has an explicit role in the narrative arc.
 */
export const ThreadPostRole = z.enum([
  "hook",
  "setup",
  "proof",
  "turn",
  "payoff",
  "close",
]);

export const ThreadPostPlanSchema = z.object({
  role: ThreadPostRole.describe("The structural role this post plays in the thread"),
  objective: z.string().describe("What this specific post must accomplish"),
  proofPoints: z.array(z.string()).describe("Key facts, examples, or claims this post should include"),
  transitionHint: z.string().nullable().describe("How this post bridges to the next one. Null for the last post."),
});

export const ThreadPlanSchema = z.object({
  objective: z.string(),
  angle: z.string(),
  targetLane: z.enum(["original", "reply", "quote"]),
  mustInclude: z.array(z.string()),
  mustAvoid: z.array(z.string()),
  hookType: z.string(),
  pitchResponse: z.string(),
  posts: z.array(ThreadPostPlanSchema).min(3).max(8).describe("Per-post beat plan for the thread"),
});

export type ThreadPostPlan = z.infer<typeof ThreadPostPlanSchema>;
export type ThreadPlan = z.infer<typeof ThreadPlanSchema>;
export type PlannerOutput = (z.infer<typeof PlannerOutputSchema> | ThreadPlan) & StrategyPlan;

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
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
    voiceTarget?: VoiceTarget | null;
    groundingPacket?: GroundingPacket | null;
    creatorProfileHints?: CreatorProfileHints | null;
    onFailureReason?: (reason: string) => void;
  },
): Promise<PlannerOutput | null> {
  const isThread = options?.formatPreference === "thread";
  const instruction = buildPlanInstruction({
    userMessage,
    topicSummary,
    activeConstraints,
    recentHistory,
    activeDraft,
    voiceTarget: options?.voiceTarget,
    groundingPacket: options?.groundingPacket,
    creatorProfileHints: options?.creatorProfileHints,
    options,
  });

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: isThread ? "medium" : "low",
    temperature: 0.2,
    top_p: 0.9,
    onFailure: (reason) => {
      options?.onFailureReason?.(summarizePlannerFetchFailure(reason));
    },
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: `User Request: ${userMessage}` },
    ],
  });

  if (!data) return null;

  try {
    // For thread format, try the thread-specific schema first,
    // then fall back to the standard schema if it doesn't have posts[]
    if (isThread) {
      const threadResult = ThreadPlanSchema.safeParse(data);
      if (threadResult.success) {
        return threadResult.data as PlannerOutput;
      }
    }

    return PlannerOutputSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      options?.onFailureReason?.(summarizePlannerSchemaFailure(err));
    } else {
      options?.onFailureReason?.("the planner returned an invalid plan shape");
    }
    console.error("Planner validation failed", err);
    return null;
  }
}
