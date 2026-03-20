import { z } from "zod";

import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";
import type { ExtensionReplyMode, ReplyDraftPreflightResult } from "../extension/types.ts";

import {
  buildHeuristicSourceInterpretation,
  inferHeuristicReplySourceShape,
  resolveSourceInterpretation,
  shouldPreferTextOverImageForReply,
} from "./interpretation.ts";
import type { ReplyVisualContextSummary } from "./types.ts";

export const DEFAULT_REPLY_PREFLIGHT_MODEL =
  process.env.GROQ_REPLY_PREFLIGHT_MODEL?.trim() || "llama-3.1-8b-instant";

const SourceInterpretationSchema = z.object({
  literality: z.enum(["literal", "non_literal", "mixed", "uncertain"]),
  humor_mode: z.enum(["none", "playful", "sarcasm", "satire", "parody", "absurdist"]),
  post_frame: z.enum([
    "proposal",
    "reaction",
    "recruiting_call",
    "mockup",
    "critique",
    "observation",
    "question",
    "announcement",
    "vent",
  ]),
  target: z.string().trim().min(1).max(200),
  image_artifact_type: z.enum([
    "real_screenshot",
    "mockup",
    "parody_ui",
    "meme",
    "photo",
    "mixed",
    "unknown",
  ]),
  allowed_reply_moves: z
    .array(z.enum(["react", "amplify", "pile_on", "critique", "clarify", "propose"]))
    .max(6),
  disallowed_reply_moves: z
    .array(
      z.enum([
        "adjacent_ideation",
        "literal_product_brainstorm",
        "self_nomination",
        "unsupported_external_claim",
      ]),
    )
    .max(6),
  literality_confidence: z.number().min(0).max(100),
  satire_confidence: z.number().min(0).max(100),
});

const ReplyDraftRecommendedModeSchema = z.enum([
  "joke_riff",
  "agree_and_amplify",
  "contrarian_pushback",
  "insightful_add_on",
  "empathetic_support",
]);

export const ReplyDraftPreflightSchema: z.ZodType<ReplyDraftPreflightResult> = z.object({
  op_tone: z.string().trim().min(1).max(160),
  post_intent: z.string().trim().min(1).max(240),
  recommended_reply_mode: ReplyDraftRecommendedModeSchema,
  source_shape: z.enum([
    "strategic_take",
    "casual_observation",
    "joke_setup",
    "emotional_update",
  ]),
  image_role: z.enum(["none", "punchline", "proof", "reaction", "context", "decorative"]),
  image_reply_anchor: z.string().trim().max(240),
  should_reference_image_text: z.boolean(),
  interpretation: SourceInterpretationSchema.optional(),
});

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function truncatePromptValue(value: string | null | undefined, max = 220): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "none";
  }
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function buildImageHintLines(args: {
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
  compact?: boolean;
}) {
  const summaryLines = (args.imageSummaryLines || []).slice(0, args.compact ? 3 : 5);
  const lines = [
    args.visualContext?.imageRole ? `Image role hint: ${args.visualContext.imageRole}` : null,
    args.visualContext?.imageArtifactType
      ? `Image artifact hint: ${args.visualContext.imageArtifactType}`
      : null,
    args.visualContext?.imageReplyAnchor
      ? `Image anchor hint: ${truncatePromptValue(args.visualContext.imageReplyAnchor, 120)}`
      : null,
    args.visualContext?.readableText
      ? `Image readable text hint: ${truncatePromptValue(args.visualContext.readableText, 140)}`
      : null,
    args.visualContext?.artifactTargetHint
      ? `Image target hint: ${truncatePromptValue(args.visualContext.artifactTargetHint, 120)}`
      : null,
    summaryLines.length > 0
      ? `Image summary: ${summaryLines.map((line) => truncatePromptValue(line, 90)).join(" | ")}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines : ["Image context: none"];
}

function buildClassifierPrompt(args: {
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
  compact?: boolean;
}): string {
  const compact = Boolean(args.compact);
  const imageHints = buildImageHintLines({
    imageSummaryLines: args.imageSummaryLines,
    visualContext: args.visualContext || null,
    compact,
  });

  return [
    "Classify the best reply mode for drafting a native X reply.",
    "Return only valid JSON matching the requested schema.",
    "If the post is sarcasm, a meme, shitposting, parody, or internet slang, prefer joke_riff.",
    "If the post is a hiring/recruiting/open call, mark interpretation.post_frame as recruiting_call and do not treat it like the reply should apply for the role.",
    "If the image carries the joke, punchline, or visible proof, reflect that in image_role and image_reply_anchor.",
    "Decide whether the source is literal, non-literal, satirical, sarcastic, playful, or parody/mockup-driven before choosing the reply mode.",
    "",
    `Visible post text: ${truncatePromptValue(args.sourceText, compact ? 220 : 320)}`,
    `Quoted post text: ${truncatePromptValue(args.quotedText, compact ? 160 : 220)}`,
    ...imageHints,
    "",
    compact
      ? "Enums: recommended_reply_mode=joke_riff|agree_and_amplify|contrarian_pushback|insightful_add_on|empathetic_support; source_shape=strategic_take|casual_observation|joke_setup|emotional_update; image_role=none|punchline|proof|reaction|context|decorative."
      : "source_shape must be one of strategic_take, casual_observation, joke_setup, emotional_update.",
    compact
      ? "interpretation must include literality, humor_mode, post_frame, target, image_artifact_type, allowed_reply_moves, disallowed_reply_moves, literality_confidence, satire_confidence."
      : "Return interpretation with keys literality, humor_mode, post_frame, target, image_artifact_type, allowed_reply_moves, disallowed_reply_moves, literality_confidence, satire_confidence.",
  ].join("\n");
}

export function buildReplyDraftPreflightFallback(): ReplyDraftPreflightResult {
  return {
    op_tone: "neutral",
    post_intent: "add a useful next layer without overreaching",
    recommended_reply_mode: "insightful_add_on",
    source_shape: "strategic_take",
    image_role: "none",
    image_reply_anchor: "",
    should_reference_image_text: false,
    interpretation: buildHeuristicSourceInterpretation({ sourceText: "" }),
  };
}

function buildHeuristicPreflight(args: {
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
}): ReplyDraftPreflightResult {
  const combined = [args.sourceText, args.quotedText || "", ...(args.imageSummaryLines || [])]
    .join("\n")
    .toLowerCase();
  const sourceShape = inferHeuristicReplySourceShape({
    sourceText: args.sourceText,
    quotedText: args.quotedText || null,
    imageSummaryLines: args.imageSummaryLines || [],
    visualContext: args.visualContext || null,
  });
  const rawImageRole = args.visualContext?.imageRole || "none";
  const imageReplyAnchor = args.visualContext?.imageReplyAnchor || "";
  const preferTextOverImage = shouldPreferTextOverImageForReply({
    sourceText: args.sourceText,
    visualContext: args.visualContext || null,
  });
  const imageRole =
    preferTextOverImage && (rawImageRole === "punchline" || rawImageRole === "proof")
      ? "context"
      : rawImageRole;
  const shouldReferenceImageText = Boolean(
    !preferTextOverImage &&
      (args.visualContext?.shouldReferenceImageText ||
        Boolean(args.visualContext?.readableText && imageRole !== "decorative" && imageRole !== "none")),
  );
  const interpretation = buildHeuristicSourceInterpretation({
    sourceText: args.sourceText,
    quotedText: args.quotedText || null,
    visualContext: args.visualContext || null,
  });

  if (/\b(sorry|grief|hard|hurt|feel for|sending love|brutal)\b/.test(combined)) {
    return {
      op_tone: "vulnerable",
      post_intent: "share or acknowledge an emotionally loaded experience",
      recommended_reply_mode: "empathetic_support",
      source_shape: "emotional_update",
      image_role: imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (
    interpretation.humor_mode === "satire" ||
    interpretation.humor_mode === "parody" ||
    interpretation.post_frame === "mockup" ||
    interpretation.image_artifact_type === "parody_ui" ||
    interpretation.image_artifact_type === "mockup"
  ) {
    return {
      op_tone: "playful",
      post_intent: "react to the satire or parody target instead of treating it literally",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
      image_role: imageRole === "none" ? "punchline" : imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (preferTextOverImage) {
    return {
      op_tone: "specific",
      post_intent:
        "respond to the main product or workflow point in the post text and use the screenshot only as supporting context",
      recommended_reply_mode: "insightful_add_on",
      source_shape: "strategic_take",
      image_role: imageRole,
      image_reply_anchor: "",
      should_reference_image_text: false,
      interpretation,
    };
  }

  if (imageRole === "proof") {
    return {
      op_tone: "specific",
      post_intent: "use the image as proof or evidence for the take",
      recommended_reply_mode: "insightful_add_on",
      source_shape: sourceShape === "joke_setup" ? "joke_setup" : "strategic_take",
      image_role: imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (sourceShape === "casual_observation") {
    return {
      op_tone: "casual",
      post_intent: "share a casual observation or shrug",
      recommended_reply_mode: "joke_riff",
      source_shape: "casual_observation",
      image_role: imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (sourceShape === "joke_setup" || imageRole === "punchline") {
    return {
      op_tone: "playful",
      post_intent: "riff on a joke or observation",
      recommended_reply_mode: "joke_riff",
      source_shape: "joke_setup",
      image_role: imageRole === "none" ? "punchline" : imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (/\b(but|wrong|disagree|actually|counterpoint|hot take)\b/.test(combined)) {
    return {
      op_tone: "combative",
      post_intent: "invite a sharper counterpoint",
      recommended_reply_mode: "contrarian_pushback",
      source_shape: "strategic_take",
      image_role: imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  if (/\b(yes|exactly|agree|true|same|100%)\b/.test(combined)) {
    return {
      op_tone: "affirming",
      post_intent: "reward a take that already feels directionally right",
      recommended_reply_mode: "agree_and_amplify",
      source_shape: "strategic_take",
      image_role: imageRole,
      image_reply_anchor: imageReplyAnchor,
      should_reference_image_text: shouldReferenceImageText,
      interpretation,
    };
  }

  return {
    ...buildReplyDraftPreflightFallback(),
    image_role: imageRole,
    image_reply_anchor: imageReplyAnchor,
    should_reference_image_text: shouldReferenceImageText,
    interpretation,
  };
}

function normalizePreflightForTextFirst(args: {
  sourceText: string;
  quotedText?: string | null;
  visualContext?: ReplyVisualContextSummary | null;
  result: ReplyDraftPreflightResult;
}): ReplyDraftPreflightResult {
  const preferTextOverImage = shouldPreferTextOverImageForReply({
    sourceText: args.sourceText,
    visualContext: args.visualContext || null,
  });
  if (!preferTextOverImage) {
    return args.result;
  }

  return {
    ...args.result,
    recommended_reply_mode: "insightful_add_on",
    source_shape: "strategic_take",
    image_role:
      args.result.image_role === "punchline" || args.result.image_role === "proof"
        ? "context"
        : args.result.image_role,
    image_reply_anchor: "",
    should_reference_image_text: false,
    interpretation: resolveSourceInterpretation({
      sourceText: args.sourceText,
      quotedText: args.quotedText || null,
      preflightResult: {
        ...args.result,
        recommended_reply_mode: "insightful_add_on",
        source_shape: "strategic_take",
        image_role:
          args.result.image_role === "punchline" || args.result.image_role === "proof"
            ? "context"
            : args.result.image_role,
        image_reply_anchor: "",
        should_reference_image_text: false,
      },
      visualContext: args.visualContext || null,
    }),
  };
}

export async function classifyReplyDraftMode(args: {
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
  model?: string;
}): Promise<ReplyDraftPreflightResult> {
  if (
    !process.env.GROQ_API_KEY?.trim() ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test") ||
    process.env.NODE_ENV === "test"
  ) {
    return buildHeuristicPreflight(args);
  }

  const model = args.model?.trim() || DEFAULT_REPLY_PREFLIGHT_MODEL;
  const fetchAttempt = (compact: boolean) =>
    fetchJsonFromGroq<unknown>({
      model,
      temperature: 0,
      max_tokens: compact ? 220 : 280,
      reasoning_effort: "low",
      jsonRepairInstruction:
        "Return ONLY valid JSON with keys op_tone, post_intent, recommended_reply_mode, source_shape, image_role, image_reply_anchor, should_reference_image_text, interpretation.",
      messages: [
        {
          role: "system",
          content:
            "You are a fast X reply strategist. Return only strict JSON. Keep the JSON compact and do not add commentary.",
        },
        {
          role: "user",
          content: buildClassifierPrompt({ ...args, compact }),
        },
      ],
    });

  let raw = await fetchAttempt(false);
  if (!raw) {
    raw = await fetchAttempt(true);
  }

  if (!raw) {
    return buildHeuristicPreflight(args);
  }

  const parsed = ReplyDraftPreflightSchema.safeParse(raw);
  if (!parsed.success) {
    return buildHeuristicPreflight(args);
  }

  return normalizePreflightForTextFirst({
    sourceText: args.sourceText,
    quotedText: args.quotedText || null,
    visualContext: args.visualContext || null,
    result: {
      ...parsed.data,
      interpretation: resolveSourceInterpretation({
        sourceText: args.sourceText,
        quotedText: args.quotedText || null,
        preflightResult: parsed.data,
        visualContext: args.visualContext || null,
      }),
    },
  });
}

export function normalizeReplyMode(value: unknown): ExtensionReplyMode | null {
  const parsed = ReplyDraftRecommendedModeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
