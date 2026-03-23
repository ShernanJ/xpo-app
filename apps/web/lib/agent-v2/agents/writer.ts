import type { Persona } from "../../generated/prisma/client";
import {
  fetchRawJsonContentFromGroq,
  fetchStructuredJsonFromGroq,
} from "./llm.ts";
import { z } from "zod";
import type { VoiceStyleCard } from "../core/styleProfile";
import type { VoiceTarget } from "../core/voiceTarget";
import type { ReplyContextCard } from "../core/replyContextExtractor.ts";
import { retrieveGoldenExamples } from "../core/retrieval.ts";
import type { PlannerOutput } from "./planner";
import type { ThreadFramingStyle } from "../../onboarding/draftArtifacts";
import { joinSerializedThreadPosts } from "../../onboarding/shared/draftArtifacts.ts";
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
import { buildWriterInstruction } from "./promptBuilders.ts";
import { StructuredThreadSchema } from "./jsonPromptContracts.ts";
import type { RoutingTracePatch } from "../runtime/types.ts";

export const WriterOutputSchema = z.object({
  angle: z.string().describe("The approach/angle used for this draft"),
  draft: z.string().describe("The actual generated X post — one single draft"),
  supportAsset: z.string().describe("Idea for what image/video to attach"),
  whyThisWorks: z.string().describe("One-sentence rationale for why this draft works"),
  watchOutFor: z.string().describe("One-sentence warning about risk or tone"),
});

export type WriterOutput = z.infer<typeof WriterOutputSchema> & {
  retrievedAnchorIds?: string[];
  routingTracePatch?: RoutingTracePatch;
};

type FlatWriterData = z.infer<typeof WriterOutputSchema>;

interface WriterGenerationDeps {
  retrieveGoldenExamples?: typeof retrieveGoldenExamples;
  runFlatWriterGeneration?: (args: {
    instruction: string;
    temperature: number;
  }) => Promise<FlatWriterData | null>;
  runStructuredThreadGeneration?: (args: {
    instruction: string;
    temperature: number;
  }) => Promise<string | null>;
}

function summarizeStructuredThreadParseError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    if (!firstIssue) {
      return "structured thread JSON failed schema validation";
    }

    const path = firstIssue.path
      .map((segment) => String(segment).trim())
      .filter(Boolean)
      .join(".");
    const issueMessage = firstIssue.message.trim();
    return path ? `${path}: ${issueMessage}` : issueMessage;
  }

  if (error instanceof Error) {
    return error.message.trim() || "structured thread JSON parsing failed";
  }

  return "structured thread JSON parsing failed";
}

function buildStructuredThreadFallbackPatch(error: unknown): RoutingTracePatch {
  return {
    writerFallback: {
      reason: "structured_thread_parse_failed",
      detail: summarizeStructuredThreadParseError(error).slice(0, 220),
      fallbackUsed: "flat_writer_json",
    },
  };
}

async function runFlatWriterGeneration(args: {
  instruction: string;
  temperature: number;
}): Promise<FlatWriterData | null> {
  return fetchStructuredJsonFromGroq({
    schema: WriterOutputSchema,
    modelTier: "writing",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: args.temperature,
    max_tokens: 4096,
    messages: [
      { role: "system", content: args.instruction },
      { role: "user", content: "Generate the draft now." },
    ],
  });
}

async function runStructuredThreadGeneration(args: {
  instruction: string;
  temperature: number;
}): Promise<string | null> {
  return fetchRawJsonContentFromGroq({
    modelTier: "writing",
    fallbackModel: "openai/gpt-oss-120b",
    reasoning_effort: "medium",
    temperature: args.temperature,
    max_tokens: 4096,
    messages: [
      { role: "system", content: args.instruction },
      { role: "user", content: "Generate the draft now." },
    ],
  });
}

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
  deps?: WriterGenerationDeps,
): Promise<WriterOutput | null> {
  const requestPolicy = buildDraftRequestPolicy({
    userMessage:
      options?.sourceUserMessage || [plan.objective, plan.angle].join(" "),
    formatIntent: options?.formatIntent || plan.formatIntent,
  });
  const effectiveFormatPreference =
    options?.formatPreference ||
    options?.activePlan?.formatPreference ||
    plan.formatPreference ||
    "shortform";
  const isThreadRequested = effectiveFormatPreference === "thread";
  const goldenExamplePayload = await resolveWriterGoldenExamples({
    plan,
    sourceUserMessage: options?.sourceUserMessage,
    voiceProfileId: options?.voiceProfileId,
    goldenExampleCount: options?.goldenExampleCount,
    deps: {
      retrieveGoldenExamples: deps?.retrieveGoldenExamples,
    },
  });
  const buildInstruction = (structuredThreadOutput: boolean) =>
    buildWriterInstruction({
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
      options: {
        ...options,
        formatPreference: effectiveFormatPreference,
        structuredThreadOutput,
      },
    });

  const shouldUseStrictFactualTemperature =
    Boolean(options?.groundingPacket) &&
    !requestPolicy.allowHumorFabrication &&
    (options?.groundingPacket?.unknowns.length || 0) > 0 &&
    (options?.groundingPacket?.allowedFirstPersonClaims.length || 0) === 0 &&
    !requestPolicy.preserveStoryPlaceholders;
  const temperature = shouldUseStrictFactualTemperature ? 0.2 : 0.45;
  const resolveFlatWriterData =
    deps?.runFlatWriterGeneration || runFlatWriterGeneration;
  const resolveStructuredThreadData =
    deps?.runStructuredThreadGeneration || runStructuredThreadGeneration;

  const buildWriterResult = (
    data: FlatWriterData,
    routingTracePatch?: RoutingTracePatch,
  ): WriterOutput => ({
    ...data,
    retrievedAnchorIds: goldenExamplePayload?.retrievedAnchorIds || [],
    ...(routingTracePatch ? { routingTracePatch } : {}),
  });

  const loadFlatWriterResult = async (
    routingTracePatch?: RoutingTracePatch,
  ): Promise<WriterOutput | null> => {
    const flatData = await resolveFlatWriterData({
      instruction: buildInstruction(false),
      temperature,
    });

    if (!flatData) {
      return null;
    }

    return buildWriterResult(flatData, routingTracePatch);
  };

  if (isThreadRequested) {
    const rawThreadPayload = await resolveStructuredThreadData({
      instruction: buildInstruction(true),
      temperature,
    });

    if (rawThreadPayload) {
      try {
        const parsedThread = StructuredThreadSchema.parse(
          JSON.parse(rawThreadPayload),
        );
        const tweets = parsedThread.tweets
          .map((tweet) => tweet.content.trim())
          .filter(Boolean);

        if (tweets.length === 0) {
          throw new Error("structured thread returned no tweet content");
        }

        return {
          angle: plan.angle,
          draft: joinSerializedThreadPosts(tweets),
          supportAsset: "",
          whyThisWorks: "",
          watchOutFor: "",
          retrievedAnchorIds: goldenExamplePayload?.retrievedAnchorIds || [],
        };
      } catch (error) {
        console.error("Structured thread parsing failed; falling back to flat writer JSON.", error);
        return loadFlatWriterResult(buildStructuredThreadFallbackPatch(error));
      }
    }

    return loadFlatWriterResult();
  }

  return loadFlatWriterResult();
}
