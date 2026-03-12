import { prisma } from "./db.ts";
import { Prisma } from "./generated/prisma/client.ts";
import { isMissingProductEventTableError } from "./agent-v2/orchestrator/prismaGuards.ts";

export interface ProductEventInput {
  userId: string;
  eventType: string;
  xHandle?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  candidateId?: string | null;
  properties?: Record<string, unknown>;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function sanitizeValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry))
      .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    const next: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeValue(entry);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }

  return undefined;
}

export async function recordProductEvent(input: ProductEventInput): Promise<void> {
  const eventType = normalizeOptionalString(input.eventType);
  if (!input.userId || !eventType) {
    return;
  }

  const productEventDelegate = (prisma as typeof prisma & {
    productEvent: {
      create(args: {
        data: Prisma.ProductEventUncheckedCreateInput;
      }): Promise<unknown>;
    };
  }).productEvent;

  try {
    await productEventDelegate.create({
      data: {
        userId: input.userId,
        eventType,
        xHandle: normalizeOptionalString(input.xHandle),
        threadId: normalizeOptionalString(input.threadId),
        messageId: normalizeOptionalString(input.messageId),
        candidateId: normalizeOptionalString(input.candidateId),
        properties:
          (sanitizeValue(input.properties || {}) as Prisma.InputJsonValue | undefined) || {},
      },
    });
  } catch (error) {
    if (isMissingProductEventTableError(error)) {
      console.error("ProductEvent table missing while recording product event:", error);
      return;
    }
    throw error;
  }
}
