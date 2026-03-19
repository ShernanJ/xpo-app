import { z } from "zod";

import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";
import type { ExtensionReplyMode, ReplyDraftPreflightResult } from "../extension/types.ts";

import {
  buildHeuristicSourceInterpretation,
  inferHeuristicReplySourceShape,
  resolveSourceInterpretation,
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
      z.enum(["adjacent_ideation", "literal_product_brainstorm", "unsupported_external_claim"]),
    )
    .max(6),
  literality_confidence: z.number().min(0).max(100),
  satire_confidence: z.number().min(0).max(100),
});

export const ReplyDraftPreflightSchema: z.ZodType<ReplyDraftPreflightResult> = z.object({
  op_tone: z.string().trim().min(1).max(160),
  post_intent: z.string().trim().min(1).max(240),
  recommended_reply_mode: z.enum([
    "joke_riff",
    "agree_and_amplify",
    "contrarian_pushback",
    "insightful_add_on",
    "empathetic_support",
  ]),
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

function buildClassifierPrompt(args: {
  sourceText: string;
  quotedText?: string | null;
  imageSummaryLines?: string[] | null;
  visualContext?: ReplyVisualContextSummary | null;
}): string {
  return [
    "Classify the best reply mode for drafting a native X reply.",
    "Return only valid JSON matching the requested schema.",
    "CRITICAL: If the post is sarcasm, a meme, shitposting, or internet slang, you MUST classify it as 'joke_riff'.",
    "CRITICAL: If the image carries the joke, punchline, or visible proof, reflect that in image_role and image_reply_anchor.",
    "CRITICAL: Decide whether the source is literal, non-literal, satirical, sarcastic, playful, or parody/mockup-driven before choosing the reply mode.",
    "",
    `Visible post text: ${args.sourceText.trim()}`,
    args.quotedText?.trim() ? `Quoted post text: ${args.quotedText.trim()}` : "Quoted post text: none",
    args.visualContext
      ? `Image role hint: ${args.visualContext.imageRole}`
      : "Image role hint: none",
    args.visualContext?.imageReplyAnchor
      ? `Image reply anchor hint: ${args.visualContext.imageReplyAnchor}`
      : "Image reply anchor hint: none",
    args.imageSummaryLines?.length
      ? `Image context: ${args.imageSummaryLines.join(" | ")}`
      : "Image context: none",
    "",
    "Also classify the source_shape as one of:",
    "- strategic_take",
    "- casual_observation",
    "- joke_setup",
    "- emotional_update",
    "",
    "Choose the best recommended_reply_mode from:",
    "- joke_riff",
    "- agree_and_amplify",
    "- contrarian_pushback",
    "- insightful_add_on",
    "- empathetic_support",
    "",
    "Also return:",
    "- image_role: none | punchline | proof | reaction | context | decorative",
    "- image_reply_anchor: the shortest useful image-led phrase or OCR snippet for a reply to anchor on",
    "- should_reference_image_text: true when readable in-image text should be treated as first-class source material",
    "- interpretation: a nested object with keys literality, humor_mode, post_frame, target, image_artifact_type, allowed_reply_moves, disallowed_reply_moves, literality_confidence, satire_confidence",
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
  const imageRole = args.visualContext?.imageRole || "none";
  const imageReplyAnchor = args.visualContext?.imageReplyAnchor || "";
  const shouldReferenceImageText =
    args.visualContext?.shouldReferenceImageText ||
    Boolean(args.visualContext?.readableText && imageRole !== "decorative" && imageRole !== "none");
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

  const raw = await fetchJsonFromGroq<unknown>({
    model: args.model?.trim() || DEFAULT_REPLY_PREFLIGHT_MODEL,
    temperature: 0,
    max_tokens: 160,
    jsonRepairInstruction:
      "Return ONLY valid JSON with keys op_tone, post_intent, recommended_reply_mode, source_shape, image_role, image_reply_anchor, should_reference_image_text, interpretation.",
    messages: [
      {
        role: "system",
        content:
          "You are a fast X reply strategist. Classify the source material and return only strict JSON.",
      },
      {
        role: "user",
        content: buildClassifierPrompt(args),
      },
    ],
  });

  if (!raw) {
    return buildHeuristicPreflight(args);
  }

  const parsed = ReplyDraftPreflightSchema.safeParse(raw);
  if (!parsed.success) {
    return buildHeuristicPreflight(args);
  }

  return {
    ...parsed.data,
    interpretation: resolveSourceInterpretation({
      sourceText: args.sourceText,
      quotedText: args.quotedText || null,
      preflightResult: parsed.data,
      visualContext: args.visualContext || null,
    }),
  };
}

export function normalizeReplyMode(value: unknown): ExtensionReplyMode | null {
  const parsed = ReplyDraftPreflightSchema.shape.recommended_reply_mode.safeParse(value);
  return parsed.success ? parsed.data : null;
}
