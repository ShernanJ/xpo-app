import { fetchStructuredJsonFromGroq } from "./llm.ts";
import { z } from "zod";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  FormatIntent,
  SessionConstraint,
  StrategyPlan,
} from "../contracts/chat";
import type { VoiceTarget } from "../core/voiceTarget";
import { normalizePlannerOutput } from "../core/plannerNormalization";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../grounding/groundingPacket";
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
  pitchResponse: z.string().describe("A short plain-language description of the direction itself. e.g. 'lead with the contradiction between the promise and what actually changed'"),
  extracted_constraints: z.array(z.string()).default([]),
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
  pitchResponse: z.string().describe("A short plain-language description of the thread direction itself."),
  extracted_constraints: z.array(z.string()).default([]),
  posts: z.array(ThreadPostPlanSchema).min(3).max(8).describe("Per-post beat plan for the thread"),
});

export type ThreadPostPlan = z.infer<typeof ThreadPostPlanSchema>;
export interface ThreadPlan extends StrategyPlan {
  posts: ThreadPostPlan[];
}
type RawPlannerOutput = z.infer<typeof PlannerOutputSchema> | z.infer<typeof ThreadPlanSchema>;
export type PlannerOutput = StrategyPlan | ThreadPlan;

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
    formatIntent?: FormatIntent;
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
    voiceTarget?: VoiceTarget | null;
    groundingPacket?: GroundingPacket | null;
    creatorProfileHints?: CreatorProfileHints | null;
    activeTaskSummary?: string | null;
    sessionConstraints?: SessionConstraint[];
    userContextString?: string;
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
    activeTaskSummary: options?.activeTaskSummary,
    sessionConstraints: options?.sessionConstraints,
    userContextString: options?.userContextString,
    options,
  });

  const loadPlan = async (
    schema: typeof ThreadPlanSchema | typeof PlannerOutputSchema,
  ) =>
    fetchStructuredJsonFromGroq({
      schema,
      modelTier: "planning",
      fallbackModel: "openai/gpt-oss-120b",
      reasoning_effort: isThread ? "medium" : "low",
      temperature: 0.2,
      top_p: 0.9,
      onFailure: (reason) => {
        options?.onFailureReason?.(summarizePlannerFetchFailure(reason));
      },
      onSchemaFailure: (error) => {
        options?.onFailureReason?.(summarizePlannerSchemaFailure(error));
      },
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: `User Request: ${userMessage}` },
      ],
    });

  const data: RawPlannerOutput | null =
    (isThread ? await loadPlan(ThreadPlanSchema) : null) ||
    (await loadPlan(PlannerOutputSchema));

  if (!data) return null;

  try {
    return normalizePlannerOutput(data) as PlannerOutput;
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
