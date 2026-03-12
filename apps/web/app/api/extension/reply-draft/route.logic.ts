import { z } from "zod";

import type {
  ExtensionReplyDraftRequest,
  ExtensionReplyDraftResponse,
  ExtensionReplyOption,
} from "../../../../lib/extension/types.ts";

const ExtensionReplyDraftRequestSchema = z.object({
  tweetId: z.string().trim().min(1),
  tweetText: z.string().trim().min(1),
  authorHandle: z.string().trim().min(1),
  tweetUrl: z.string().trim().url(),
  stage: z.enum(["0_to_1k", "1k_to_10k", "10k_to_50k", "50k_plus"]),
  tone: z.enum(["dry", "bold", "builder", "warm"]),
  goal: z.string().trim().min(1),
  heuristicScore: z.number().finite().min(0).max(100).optional(),
  heuristicTier: z.string().trim().min(1).max(32).optional(),
});

export function parseExtensionReplyDraftRequest(body: unknown):
  | { ok: true; data: ExtensionReplyDraftRequest }
  | { ok: false; message: string } {
  const parsed = ExtensionReplyDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension reply draft request.",
    };
  }

  return { ok: true, data: parsed.data };
}

function isValidOption(option: ExtensionReplyOption): boolean {
  if (!option?.id?.trim() || !option?.text?.trim()) {
    return false;
  }

  return option.label === "safe" || option.label === "bold";
}

export function assertExtensionReplyDraftResponseShape(
  response: ExtensionReplyDraftResponse,
): boolean {
  if (!Array.isArray(response.options) || response.options.length < 1 || response.options.length > 2) {
    return false;
  }

  return response.options.every(isValidOption);
}
