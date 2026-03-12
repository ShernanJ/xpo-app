import type {
  ExtensionOpportunityBatchRequest,
  ExtensionOpportunityBatchResponse,
} from "../../../../lib/extension/types.ts";
import {
  ExtensionOpportunityBatchRequestSchema,
  ExtensionOpportunityBatchResponseSchema,
} from "../contracts.ts";

export function parseExtensionOpportunityBatchRequest(body: unknown):
  | { ok: true; data: ExtensionOpportunityBatchRequest }
  | { ok: false; message: string } {
  const parsed = ExtensionOpportunityBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid extension opportunity batch request.",
    };
  }

  return { ok: true, data: parsed.data };
}

export function assertExtensionOpportunityBatchResponseShape(
  response: ExtensionOpportunityBatchResponse,
) {
  return ExtensionOpportunityBatchResponseSchema.safeParse(response).success;
}
