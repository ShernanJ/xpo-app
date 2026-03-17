import type { ExtensionDraftPublishRequest, ExtensionDraftsResponse } from "../../../../lib/extension/types.ts";
import {
  ExtensionDraftPublishRequestSchema,
  ExtensionDraftsResponseSchema,
} from "../contracts.ts";

export function parseExtensionDraftPublishRequest(
  body: unknown,
): { ok: true; data: ExtensionDraftPublishRequest } | { ok: false; message: string } {
  const parsed = ExtensionDraftPublishRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension draft publish request.",
    };
  }

  return { ok: true, data: parsed.data };
}

export function assertExtensionDraftsResponseShape(
  response: ExtensionDraftsResponse,
) {
  return ExtensionDraftsResponseSchema.safeParse(response).success;
}
