import type {
  ExtensionReplyOptionsRequest,
  ExtensionReplyOptionsResponse,
} from "../../../../lib/extension/types.ts";
import {
  ExtensionReplyOptionsRequestSchema,
  ExtensionReplyOptionsResponseSchema,
} from "../contracts.ts";

export function parseExtensionReplyOptionsRequest(body: unknown):
  | { ok: true; data: ExtensionReplyOptionsRequest }
  | { ok: false; message: string } {
  const parsed = ExtensionReplyOptionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension reply options request.",
    };
  }

  return { ok: true, data: parsed.data };
}

export function assertExtensionReplyOptionsResponseShape(
  response: ExtensionReplyOptionsResponse,
) {
  return ExtensionReplyOptionsResponseSchema.safeParse(response).success;
}
