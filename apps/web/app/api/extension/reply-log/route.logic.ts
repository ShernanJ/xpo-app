import type { ExtensionReplyLogRequest } from "../../../../lib/extension/types.ts";
import { ExtensionReplyLogRequestSchema } from "../contracts.ts";

export function parseExtensionReplyLogRequest(body: unknown):
  | { ok: true; data: ExtensionReplyLogRequest }
  | { ok: false; message: string } {
  const parsed = ExtensionReplyLogRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension reply log request.",
    };
  }

  return { ok: true, data: parsed.data };
}
