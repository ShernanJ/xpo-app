import type { ExtensionDraftPublishRequest, ExtensionDraftsResponse } from "../../../../lib/extension/types.ts";
import {
  ExtensionDraftPublishRequestSchema,
  ExtensionDraftsResponseSchema,
} from "../contracts.ts";

export function parseExtensionDraftPublishRequest(
  body: unknown,
): { ok: true; data: ExtensionDraftPublishRequest } | { ok: false; field: string; message: string } {
  const parsed = ExtensionDraftPublishRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: issue?.path?.length ? String(issue.path[0]) : "body",
      message: issue?.message || "Invalid extension draft publish request.",
    };
  }

  return { ok: true, data: parsed.data };
}

export function assertExtensionDraftsResponseShape(
  response: ExtensionDraftsResponse,
) {
  return ExtensionDraftsResponseSchema.safeParse(response).success;
}
