import { fetchJsonFromGroq } from "./llm";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import type { PlannerOutput } from "./planner";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  StrategyPlan,
} from "../contracts/chat";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../orchestrator/groundingPacket";
import { buildWriterInstruction } from "./promptBuilders";

export const WriterOutputSchema = z.object({
  angle: z.string().describe("The approach/angle used for this draft"),
  draft: z.string().describe("The actual generated X post — one single draft"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.string().describe("One-sentence rationale for why this draft works"),
  watchOutFor: z.string().describe("One-sentence warning about risk or tone"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema>;

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
    threadPostMaxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    sourceUserMessage?: string;
    voiceTarget?: VoiceTarget | null;
    referenceAnchorMode?: "historical_posts" | "reference_hints";
    threadFramingStyle?: ThreadFramingStyle | null;
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
    groundingPacket?: GroundingPacket | null;
    creatorProfileHints?: CreatorProfileHints | null;
  },
): Promise<WriterOutput | null> {
  const instruction = buildWriterInstruction({
    plan,
    styleCard,
    topicAnchors,
    referenceAnchorMode: options?.referenceAnchorMode,
    activeConstraints,
    recentHistory,
    activeDraft,
    voiceTarget: options?.voiceTarget,
    groundingPacket: options?.groundingPacket,
    creatorProfileHints: options?.creatorProfileHints,
    options,
  });

  const shouldUseStrictFactualTemperature =
    Boolean(options?.groundingPacket) &&
    (options?.groundingPacket?.unknowns.length || 0) > 0 &&
    (options?.groundingPacket?.allowedFirstPersonClaims.length || 0) === 0;

  const data = await fetchJsonFromGroq<unknown>({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: shouldUseStrictFactualTemperature ? 0.2 : 0.45,
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
