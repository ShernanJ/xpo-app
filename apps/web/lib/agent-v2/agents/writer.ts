import type { Persona } from "../../generated/prisma/client";
import { fetchStructuredJsonFromGroq } from "./llm.ts";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import type { ReplyContextCard } from "../core/replyContextExtractor.ts";
import { retrieveGoldenExamples } from "../core/retrieval";
import type { PlannerOutput } from "./planner";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";
import type {
  ConversationState,
  DraftFormatPreference,
  DraftPreference,
  FormatIntent,
  SessionConstraint,
  StrategyPlan,
} from "../contracts/chat";
import type {
  CreatorProfileHints,
  GroundingPacket,
} from "../grounding/groundingPacket";
import { buildDraftRequestPolicy } from "../grounding/requestPolicy.ts";
import { buildWriterInstruction } from "./promptBuilders";

export const WriterOutputSchema = z.object({
  angle: z.string().describe("The approach/angle used for this draft"),
  draft: z.string().describe("The actual generated X post — one single draft"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.string().describe("One-sentence rationale for why this draft works"),
  watchOutFor: z.string().describe("One-sentence warning about risk or tone"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema> & {
  retrievedAnchorIds?: string[];
};

function splitRetrievedGoldenExamples(
  examples: Awaited<ReturnType<typeof retrieveGoldenExamples>>,
): {
  goldenExamples: string[];
  retrievedAnchorIds: string[];
} {
  return {
    goldenExamples: examples.map((example) => example.content),
    retrievedAnchorIds: examples.map((example) => example.id),
  };
}

export async function resolveWriterGoldenExamples(args: {
  plan: PlannerOutput;
  sourceUserMessage?: string;
  voiceProfileId?: string | null;
  goldenExampleCount?: number;
  deps?: {
    retrieveGoldenExamples?: typeof retrieveGoldenExamples;
  };
}): Promise<
  | {
      goldenExamples: string[];
      retrievedAnchorIds: string[];
    }
  | undefined
> {
  const promptIntent = (
    args.sourceUserMessage || [args.plan.objective, args.plan.angle].join(" ")
  ).trim();

  if (!args.voiceProfileId || (args.goldenExampleCount ?? 0) <= 0 || !promptIntent) {
    return undefined;
  }

  const examples = await (args.deps?.retrieveGoldenExamples || retrieveGoldenExamples)(
    args.voiceProfileId,
    promptIntent,
  );

  return splitRetrievedGoldenExamples(examples);
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
    threadPostMaxCharacterLimit?: number;
    goal?: string;
    draftPreference?: DraftPreference;
    formatPreference?: DraftFormatPreference;
    formatIntent?: FormatIntent;
    sourceUserMessage?: string;
    voiceTarget?: VoiceTarget | null;
    referenceAnchorMode?: "historical_posts" | "reference_hints";
    threadFramingStyle?: ThreadFramingStyle | null;
    voiceProfileId?: string | null;
    goldenExampleCount?: number;
    primaryPersona?: Persona | null;
    activePlan?: StrategyPlan | null;
    latestRefinementInstruction?: string | null;
    lastIdeationAngles?: string[];
    groundingPacket?: GroundingPacket | null;
    creatorProfileHints?: CreatorProfileHints | null;
    userContextString?: string;
    sessionConstraints?: SessionConstraint[];
    activeTaskSummary?: string | null;
    liveContext?: string;
    replyContext?: ReplyContextCard | null;
  },
): Promise<WriterOutput | null> {
  const requestPolicy = buildDraftRequestPolicy({
    userMessage:
      options?.sourceUserMessage || [plan.objective, plan.angle].join(" "),
    formatIntent: options?.formatIntent || plan.formatIntent,
  });
  const goldenExamplePayload = await resolveWriterGoldenExamples({
    plan,
    sourceUserMessage: options?.sourceUserMessage,
    voiceProfileId: options?.voiceProfileId,
    goldenExampleCount: options?.goldenExampleCount,
  });
  const instruction = buildWriterInstruction({
    plan,
    styleCard,
    primaryPersona: options?.primaryPersona,
    goldenExamples: goldenExamplePayload?.goldenExamples,
    topicAnchors,
    referenceAnchorMode: options?.referenceAnchorMode,
    activeConstraints,
    recentHistory,
    activeDraft,
    liveContext: options?.liveContext,
    voiceTarget: options?.voiceTarget,
    groundingPacket: options?.groundingPacket,
    creatorProfileHints: options?.creatorProfileHints,
    userContextString: options?.userContextString,
    sessionConstraints: options?.sessionConstraints,
    options,
  });

  const shouldUseStrictFactualTemperature =
    Boolean(options?.groundingPacket) &&
    !requestPolicy.allowHumorFabrication &&
    (options?.groundingPacket?.unknowns.length || 0) > 0 &&
    (options?.groundingPacket?.allowedFirstPersonClaims.length || 0) === 0 &&
    !requestPolicy.preserveStoryPlaceholders;

  const data = await fetchStructuredJsonFromGroq({
    schema: WriterOutputSchema,
    modelTier: "writing",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: shouldUseStrictFactualTemperature ? 0.2 : 0.45,
    max_tokens: 4096,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: "Generate the draft now." },
    ],
  });

  if (!data) {
    return null;
  }

  return {
    ...data,
    retrievedAnchorIds: goldenExamplePayload?.retrievedAnchorIds || [],
  };
}
