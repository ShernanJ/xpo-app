import { z } from "zod";

import { fetchJsonFromGroq } from "../agent-v2/agents/llm.ts";

export const DEFAULT_IMAGE_TO_POST_VISION_MODEL =
  process.env.GROQ_IMAGE_TO_POST_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";

export const DEFAULT_IMAGE_TO_POST_COPY_MODEL =
  process.env.GROQ_IMAGE_TO_POST_COPY_MODEL || "openai/gpt-oss-120b";

export const IMAGE_TO_POST_VISION_SYSTEM_PROMPT =
  "Analyze this image and extract its core components. Return a strict JSON object with these keys: `primary_subject` (string), `setting` (string), `lighting_and_mood` (string), `any_readable_text` (string), and `key_details` (array of strings). Do not write a description, only return the JSON.";

export const IMAGE_TO_POST_COPYWRITER_SYSTEM_PROMPT =
  "You are an elite ghostwriter for X (Twitter) focused on high-engagement, organic growth. Using the visual context provided in the JSON, generate 3 distinct post options to accompany this image. The posts must sound natural, punchy, and avoid cringe or overly corporate language. Option 1: A thought-provoking question or hook to drive replies. Option 2: A short, relatable observation. Option 3: A bold, value-driven statement. Return the output as a JSON array of strings containing the 3 drafted posts.";

export interface ImageVisionContext {
  primary_subject: string;
  setting: string;
  lighting_and_mood: string;
  any_readable_text: string;
  key_details: string[];
}

export type CopywriterPostOptions = [string, string, string];

export interface ImageToPostGenerationInput {
  imageDataUrl: string;
  idea?: string | null;
  visionModel?: string;
  copyModel?: string;
}

export interface ImageToPostGenerationResult {
  visualContext: ImageVisionContext;
  posts: CopywriterPostOptions;
  idea: string | null;
  models: {
    vision: string;
    copy: string;
  };
}

export const ImageVisionContextSchema: z.ZodType<ImageVisionContext> = z.object({
  primary_subject: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  lighting_and_mood: z.string().trim().min(1),
  any_readable_text: z.string().trim(),
  key_details: z.array(z.string().trim().min(1)).max(12),
});

export const CopywriterPostOptionsSchema: z.ZodType<CopywriterPostOptions> = z.tuple([
  z.string().trim().min(1),
  z.string().trim().min(1),
  z.string().trim().min(1),
]);

export class ImageToPostGenerationError extends Error {
  readonly code:
    | "vision_request_failed"
    | "vision_response_invalid"
    | "copy_request_failed"
    | "copy_response_invalid";

  constructor(
    message: string,
    code:
      | "vision_request_failed"
      | "vision_response_invalid"
      | "copy_request_failed"
      | "copy_response_invalid",
  ) {
    super(message);
    this.name = "ImageToPostGenerationError";
    this.code = code;
  }
}

function buildCopywriterUserPrompt(args: {
  visualContext: ImageVisionContext;
  idea: string | null;
}): string {
  return [
    "Visual context JSON:",
    JSON.stringify(args.visualContext, null, 2),
    args.idea
      ? `User niche or rough idea: ${args.idea}`
      : "User niche or rough idea: none provided.",
    "Generate the 3 post options now.",
  ].join("\n\n");
}

export async function generateImageToPostOptions(
  input: ImageToPostGenerationInput,
): Promise<ImageToPostGenerationResult> {
  const idea = input.idea?.trim() || null;
  const visionModel = input.visionModel || DEFAULT_IMAGE_TO_POST_VISION_MODEL;
  const copyModel = input.copyModel || DEFAULT_IMAGE_TO_POST_COPY_MODEL;

  const rawVisionContext = await fetchJsonFromGroq<unknown>({
    model: visionModel,
    temperature: 0,
    max_tokens: 1024,
    jsonRepairInstruction:
      "Your previous response was not valid JSON. Return ONLY the corrected JSON object with these exact keys: primary_subject, setting, lighting_and_mood, any_readable_text, key_details.",
    messages: [
      {
        role: "system",
        content: IMAGE_TO_POST_VISION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze the uploaded image and return only the requested JSON object.",
          },
          {
            type: "image_url",
            image_url: {
              url: input.imageDataUrl,
            },
          },
        ],
      },
    ],
  });

  if (!rawVisionContext) {
    throw new ImageToPostGenerationError(
      "Vision model did not return a JSON response.",
      "vision_request_failed",
    );
  }

  const parsedVisionContext = ImageVisionContextSchema.safeParse(rawVisionContext);
  if (!parsedVisionContext.success) {
    throw new ImageToPostGenerationError(
      "Vision model returned an invalid JSON shape.",
      "vision_response_invalid",
    );
  }

  const rawPostOptions = await fetchJsonFromGroq<unknown>({
    model: copyModel,
    reasoning_effort: "medium",
    temperature: 0.7,
    max_tokens: 1024,
    jsonRepairInstruction:
      "Your previous response was not valid JSON. Return ONLY a valid JSON array of exactly 3 strings and no markdown or commentary.",
    messages: [
      {
        role: "system",
        content: IMAGE_TO_POST_COPYWRITER_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildCopywriterUserPrompt({
          visualContext: parsedVisionContext.data,
          idea,
        }),
      },
    ],
  });

  if (!rawPostOptions) {
    throw new ImageToPostGenerationError(
      "Copywriting model did not return a JSON response.",
      "copy_request_failed",
    );
  }

  const parsedPostOptions = CopywriterPostOptionsSchema.safeParse(rawPostOptions);
  if (!parsedPostOptions.success) {
    throw new ImageToPostGenerationError(
      "Copywriting model returned an invalid JSON shape.",
      "copy_response_invalid",
    );
  }

  return {
    visualContext: parsedVisionContext.data,
    posts: parsedPostOptions.data,
    idea,
    models: {
      vision: visionModel,
      copy: copyModel,
    },
  };
}
