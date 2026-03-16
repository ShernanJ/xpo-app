import { z } from "zod";

import {
  fetchJsonFromGroq,
  type LlmCompletionOptions,
} from "../agent-v2/agents/llm.ts";

export const BANNER_VISION_MODEL =
  process.env.BANNER_ANALYSIS_VISION_MODEL ||
  "meta-llama/llama-4-scout-17b-16e-instruct";
export const BANNER_REASONING_MODEL =
  process.env.BANNER_ANALYSIS_REASONING_MODEL || "openai/gpt-oss-120b";

const BANNER_VISION_SYSTEM_PROMPT =
  "You are a visual data extractor. Analyze this X profile banner. Return a JSON object with the following keys: `readable_text` (string), `color_palette` (array of strings), `objects_detected` (array of strings), `is_bottom_left_clear` (boolean - true if the area where the profile picture goes is free of text/important graphics), and `overall_vibe` (string description of the aesthetic).";

const BANNER_REASONING_SYSTEM_PROMPT =
  "You are an expert X growth strategist helping a user grow from 0 to 1,000 followers. Review the visual data of the user's uploaded profile banner provided in the JSON. Grade the banner out of 10 based on value proposition clarity, aesthetic cohesion (e.g., does it successfully execute a specific vibe like a dark luxury dark starboy aesthetic or clean corporate minimalism?), and layout (is the bottom left clear for the PFP?). Return your response as a JSON object containing `score` (number), `strengths` (array of strings), and `actionable_improvements` (array of strings).";

export const BannerVisionExtractionSchema = z.object({
  readable_text: z.string(),
  color_palette: z.array(z.string()),
  objects_detected: z.array(z.string()),
  is_bottom_left_clear: z.boolean(),
  overall_vibe: z.string(),
});

export const BannerFeedbackSchema = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  actionable_improvements: z.array(z.string()),
});

export type BannerVisionExtraction = z.infer<typeof BannerVisionExtractionSchema>;
export type BannerFeedback = z.infer<typeof BannerFeedbackSchema>;
export interface BannerAnalysisResult {
  vision: BannerVisionExtraction;
  feedback: BannerFeedback;
  meta: {
    visionModel: string;
    reasoningModel: string;
    reasoningFallbackUsed: boolean;
  };
}

export class BannerAnalysisError extends Error {
  code: string;
  status: number;
  stage: "vision" | "reasoning";

  constructor(args: {
    code: string;
    message: string;
    status?: number;
    stage: "vision" | "reasoning";
  }) {
    super(args.message);
    this.name = "BannerAnalysisError";
    this.code = args.code;
    this.status = args.status ?? 502;
    this.stage = args.stage;
  }
}

type JsonFetcher = <T>(options: LlmCompletionOptions) => Promise<T | null>;

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|\n]/g)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of rawItems) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "no") {
    return false;
  }

  return null;
}

function normalizeScore(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(10, Math.max(0, Number(parsed.toFixed(1))));
}

export function normalizeBannerVisionExtraction(
  value: unknown,
): BannerVisionExtraction | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const isBottomLeftClear = normalizeBoolean(record.is_bottom_left_clear);
  if (isBottomLeftClear === null) {
    return null;
  }

  const parsed = BannerVisionExtractionSchema.safeParse({
    readable_text: normalizeString(record.readable_text),
    color_palette: normalizeStringArray(record.color_palette),
    objects_detected: normalizeStringArray(record.objects_detected),
    is_bottom_left_clear: isBottomLeftClear,
    overall_vibe:
      normalizeString(record.overall_vibe) || "Unclear or mixed banner aesthetic.",
  });

  return parsed.success ? parsed.data : null;
}

export function normalizeBannerFeedback(value: unknown): BannerFeedback | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const score = normalizeScore(record.score);
  if (score === null) {
    return null;
  }

  const parsed = BannerFeedbackSchema.safeParse({
    score,
    strengths: normalizeStringArray(record.strengths),
    actionable_improvements: normalizeStringArray(
      record.actionable_improvements,
    ),
  });

  return parsed.success ? parsed.data : null;
}

export function buildFallbackBannerFeedback(
  vision: BannerVisionExtraction,
): BannerFeedback {
  let score = 5;
  const strengths: string[] = [];
  const actionableImprovements: string[] = [];

  if (vision.readable_text.trim()) {
    strengths.push("The banner includes readable text, which creates a clearer chance to communicate a value proposition.");
    score += 1.5;
  } else {
    actionableImprovements.push("Add a short headline that tells visitors what you help with or what transformation they can expect.");
    score -= 1;
  }

  if (vision.is_bottom_left_clear) {
    strengths.push("The bottom-left area appears clear, so the profile photo should not cover key banner information.");
    score += 2;
  } else {
    actionableImprovements.push("Move important text and focal graphics away from the bottom-left profile-photo overlap zone.");
    score -= 2;
  }

  if (vision.color_palette.length >= 2 && vision.color_palette.length <= 5) {
    strengths.push("The palette looks contained enough to support a cohesive brand impression.");
    score += 1;
  } else if (vision.color_palette.length > 5) {
    actionableImprovements.push("Tighten the color palette so the banner feels more intentional and less visually noisy.");
    score -= 0.5;
  } else {
    actionableImprovements.push("Introduce 2-3 intentional brand colors so the banner feels more designed and memorable.");
  }

  if (vision.objects_detected.length > 0) {
    strengths.push("The banner has recognizable visual elements instead of feeling empty or generic.");
    score += 0.5;
  }

  if (!/unclear|mixed/i.test(vision.overall_vibe) && vision.overall_vibe.trim()) {
    strengths.push(`The overall vibe reads as ${vision.overall_vibe.trim()}, which gives the profile a more distinct first impression.`);
    score += 0.5;
  } else {
    actionableImprovements.push("Choose one clear visual direction and make the banner reinforce that single aesthetic consistently.");
  }

  if (vision.readable_text.length > 110) {
    actionableImprovements.push("Reduce the amount of copy so the promise is instantly readable on first glance.");
    score -= 0.5;
  }

  if (strengths.length === 0) {
    strengths.push("The banner gives you a starting visual asset to refine rather than building from scratch.");
  }

  if (actionableImprovements.length === 0) {
    actionableImprovements.push("Test one sharper headline variant that makes the audience, outcome, or niche more explicit.");
  }

  return BannerFeedbackSchema.parse({
    score: Math.min(10, Math.max(0, Number(score.toFixed(1)))),
    strengths,
    actionable_improvements: actionableImprovements,
  });
}

export async function analyzeBannerForGrowth(
  args: {
    imageDataUrl: string;
    visionModel?: string;
    reasoningModel?: string;
  },
  deps?: {
    fetchJson?: JsonFetcher;
  },
): Promise<BannerAnalysisResult> {
  const fetchJson = deps?.fetchJson || fetchJsonFromGroq;
  const visionModel = args.visionModel || BANNER_VISION_MODEL;
  const reasoningModel = args.reasoningModel || BANNER_REASONING_MODEL;

  let visionFailureReason: string | null = null;
  const rawVision = await fetchJson<unknown>({
    model: visionModel,
    temperature: 0,
    max_tokens: 800,
    jsonRepairInstruction:
      "Your previous banner extraction response was not valid JSON. Return ONLY a valid JSON object with keys readable_text, color_palette, objects_detected, is_bottom_left_clear, and overall_vibe.",
    onFailure: (reason) => {
      visionFailureReason = reason;
    },
    messages: [
      {
        role: "system",
        content: BANNER_VISION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this uploaded X profile banner and return JSON only.",
          },
          {
            type: "image_url",
            image_url: {
              url: args.imageDataUrl,
            },
          },
        ],
      },
    ],
  });

  const vision = normalizeBannerVisionExtraction(rawVision);
  if (!vision) {
    throw new BannerAnalysisError({
      code: "BANNER_VISION_FAILED",
      message:
        visionFailureReason === "request failed"
          ? "The vision model request failed while analyzing the banner."
          : "The vision model did not return usable banner-analysis JSON.",
      stage: "vision",
    });
  }

  let reasoningFailureReason: string | null = null;
  const rawFeedback = await fetchJson<unknown>({
    model: reasoningModel,
    reasoning_effort: "medium",
    temperature: 0.2,
    max_tokens: 900,
    jsonRepairInstruction:
      "Your previous strategist response was not valid JSON. Return ONLY a valid JSON object with keys score, strengths, and actionable_improvements.",
    onFailure: (reason) => {
      reasoningFailureReason = reason;
    },
    messages: [
      {
        role: "system",
        content: BANNER_REASONING_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(vision),
      },
    ],
  });

  const feedback = normalizeBannerFeedback(rawFeedback);
  if (feedback) {
    return {
      vision,
      feedback,
      meta: {
        visionModel,
        reasoningModel,
        reasoningFallbackUsed: false,
      },
    };
  }

  if (reasoningFailureReason === "request failed") {
    throw new BannerAnalysisError({
      code: "BANNER_REASONING_FAILED",
      message:
        "The reasoning model request failed while generating banner recommendations.",
      stage: "reasoning",
    });
  }

  return {
    vision,
    feedback: buildFallbackBannerFeedback(vision),
    meta: {
      visionModel,
      reasoningModel,
      reasoningFallbackUsed: true,
    },
  };
}

export async function analyzeBannerUrlForGrowth(
  args: {
    bannerUrl: string;
    visionModel?: string;
    reasoningModel?: string;
    timeoutMs?: number;
    maxBytes?: number;
  },
  deps?: {
    fetchJson?: JsonFetcher;
    fetchImpl?: typeof fetch;
  },
): Promise<BannerAnalysisResult> {
  const fetchImpl = deps?.fetchImpl || fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 8_000);
  const maxBytes = args.maxBytes ?? 10 * 1024 * 1024;

  try {
    const response = await fetchImpl(args.bannerUrl, {
      method: "GET",
      headers: {
        Accept: "image/*",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BannerAnalysisError({
        code: "BANNER_FETCH_FAILED",
        message: `Failed to fetch banner image (${response.status}).`,
        stage: "vision",
      });
    }

    const mimeType = (response.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!mimeType.startsWith("image/")) {
      throw new BannerAnalysisError({
        code: "BANNER_FETCH_INVALID_CONTENT",
        message: "Fetched banner URL did not return an image.",
        stage: "vision",
      });
    }

    const contentLength = Number.parseInt(
      response.headers.get("content-length") || "",
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new BannerAnalysisError({
        code: "BANNER_FETCH_TOO_LARGE",
        message: "Fetched banner image exceeded the maximum supported size.",
        stage: "vision",
        status: 413,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new BannerAnalysisError({
        code: "BANNER_FETCH_TOO_LARGE",
        message: "Fetched banner image exceeded the maximum supported size.",
        stage: "vision",
        status: 413,
      });
    }

    return analyzeBannerForGrowth(
      {
        imageDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        visionModel: args.visionModel,
        reasoningModel: args.reasoningModel,
      },
      {
        fetchJson: deps?.fetchJson,
      },
    );
  } catch (error) {
    if (error instanceof BannerAnalysisError) {
      throw error;
    }

    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw new BannerAnalysisError({
        code: "BANNER_FETCH_TIMEOUT",
        message: "Timed out while fetching the banner image.",
        stage: "vision",
      });
    }

    throw new BannerAnalysisError({
      code: "BANNER_FETCH_FAILED",
      message: "Failed to fetch the banner image for analysis.",
      stage: "vision",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
