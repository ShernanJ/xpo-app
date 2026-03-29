import { z } from "zod";

import { prisma } from "../db.ts";
import type { DraftArtifactDetails } from "../onboarding/shared/draftArtifacts.ts";

export const DraftPublishRequestSchema = z
  .object({
    finalPublishedText: z
      .string()
      .refine((value) => value.trim().length > 0, "Final published text is required."),
    publishedTweetId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export type DraftPublishRequest = z.infer<typeof DraftPublishRequestSchema>;

export function parseDraftPublishRequest(
  body: unknown,
): { ok: true; data: DraftPublishRequest } | { ok: false; field: string; message: string } {
  const parsed = DraftPublishRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      field: issue?.path?.length ? String(issue.path[0]) : "body",
      message: issue?.message || "Invalid draft publish request.",
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

type OwnedDraftRecord = {
  id: string;
  status: string;
  artifact: unknown;
};

type DraftCandidatePublishClient = {
  draftCandidate: {
    findFirst(args: {
      where: {
        id: string;
        userId: string;
        xHandle: string;
      };
      select: {
        id: true;
        status: true;
        artifact: true;
      };
    }): Promise<OwnedDraftRecord | null>;
    updateMany(args: {
      where: {
        id: string;
        userId: string;
        xHandle: string;
        status: "DRAFT";
      };
      data: {
        publishedText: string;
        publishedAt: Date;
        status: "PUBLISHED";
        reviewStatus: "posted";
        postedAt: Date;
        deltaAnalyzed: boolean;
        publishedTweetId?: string;
      };
    }): Promise<{ count: number }>;
  };
};

function resolveDraftCandidatePublishClient(
  client?: DraftCandidatePublishClient,
): DraftCandidatePublishClient {
  if (client) {
    return client;
  }

  return {
    draftCandidate: {
      findFirst(args) {
        return prisma.draftCandidate.findFirst(args);
      },
      updateMany(args) {
        return prisma.draftCandidate.updateMany(args);
      },
    },
  };
}

export interface FinalizeDraftPublishInput {
  id: string;
  userId: string;
  xHandle: string;
  finalPublishedText: string;
  publishedTweetId?: string | null;
}

export type FinalizeDraftPublishResult =
  | {
      ok: true;
      draftId: string;
      isZeroDelta: boolean;
      publishedAt: Date;
    }
  | {
      ok: false;
      status: 404 | 409;
      field: "id" | "status";
      message: string;
    };

function asDraftArtifact(value: unknown): DraftArtifactDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DraftArtifactDetails;
}

function resolveOriginalDraftText(artifact: unknown): string | null {
  const parsed = asDraftArtifact(artifact);
  return typeof parsed?.content === "string" ? parsed.content : null;
}

export async function finalizeDraftPublishForWorkspace(
  args: FinalizeDraftPublishInput,
  options?: {
    client?: DraftCandidatePublishClient;
  },
): Promise<FinalizeDraftPublishResult> {
  const client = resolveDraftCandidatePublishClient(options?.client);
  const draft = await client.draftCandidate.findFirst({
    where: {
      id: args.id,
      userId: args.userId,
      xHandle: args.xHandle,
    },
    select: {
      id: true,
      status: true,
      artifact: true,
    },
  });

  if (!draft) {
    return {
      ok: false,
      status: 404,
      field: "id",
      message: "Draft not found.",
    };
  }

  if (draft.status !== "DRAFT") {
    return {
      ok: false,
      status: 409,
      field: "status",
      message: "Only draft items can be published.",
    };
  }

  const originalDraftText = resolveOriginalDraftText(draft.artifact);
  const isZeroDelta =
    typeof originalDraftText === "string" &&
    originalDraftText.trim() === args.finalPublishedText.trim();
  const publishedAt = new Date();
  const updateResult = await client.draftCandidate.updateMany({
    where: {
      id: draft.id,
      userId: args.userId,
      xHandle: args.xHandle,
      status: "DRAFT",
    },
    data: {
      publishedText: args.finalPublishedText,
      publishedAt,
      status: "PUBLISHED",
      reviewStatus: "posted",
      postedAt: publishedAt,
      deltaAnalyzed: isZeroDelta,
      ...(args.publishedTweetId ? { publishedTweetId: args.publishedTweetId } : {}),
    },
  });

  if (updateResult.count === 0) {
    return {
      ok: false,
      status: 404,
      field: "id",
      message: "Draft not found.",
    };
  }

  return {
    ok: true,
    draftId: draft.id,
    isZeroDelta,
    publishedAt,
  };
}
