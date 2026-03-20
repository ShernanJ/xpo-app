import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../db.ts";
import {
  buildDraftArtifact,
  type DraftArtifactDetails,
} from "../onboarding/shared/draftArtifacts.ts";
import type { ReplySourcePreview } from "../reply-engine/replySourcePreview.ts";

const REPLY_TITLE_SNIPPET_LIMIT = 20;
const DEFAULT_REPLY_ARTIFACT_ID_PREFIX = "extension-reply";

interface ReplyDraftRecord {
  id: string;
  title: string;
  sourcePrompt: string;
  artifact: unknown;
  voiceTarget: unknown;
}

export interface PersistGeneratedExtensionReplyDraftArgs {
  userId: string;
  xHandle: string;
  replySourcePostId: string;
  sourcePostText: string;
  sourceAuthorHandle: string;
  replyText: string;
  replySourcePreview: ReplySourcePreview;
  voiceTarget?: unknown | null;
}

export interface SyncPostedExtensionReplyDraftArgs {
  userId: string;
  xHandle: string;
  replySourcePostId: string;
  sourceAuthorHandle: string;
  finalReplyText?: string | null;
  postedAt?: Date;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function normalizeHandle(value: string | null | undefined): string {
  return normalizeWhitespace(value).replace(/^@+/, "").toLowerCase();
}

function asDraftArtifact(value: unknown): DraftArtifactDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DraftArtifactDetails;
}

function asReplySourcePreview(value: unknown): ReplySourcePreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as ReplySourcePreview;
}

function resolveArtifactId(args: {
  existingArtifact: DraftArtifactDetails | null;
  replySourcePostId: string;
}) {
  return (
    args.existingArtifact?.id ||
    `${DEFAULT_REPLY_ARTIFACT_ID_PREFIX}-${args.replySourcePostId}`
  );
}

export function buildExtensionReplyDraftSnippet(
  replyText: string,
  limit = REPLY_TITLE_SNIPPET_LIMIT,
) {
  const normalized = normalizeWhitespace(replyText);
  if (!normalized) {
    return "reply";
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit)}...`;
}

export function buildExtensionReplyDraftTitle(args: {
  sourceAuthorHandle: string;
  replyText: string;
}) {
  const normalizedHandle = normalizeHandle(args.sourceAuthorHandle) || "source";
  const snippet = buildExtensionReplyDraftSnippet(args.replyText);
  return `@${normalizedHandle} - ${snippet}`;
}

export function buildExtensionReplyDraftArtifact(args: {
  replySourcePostId: string;
  replyText: string;
  title: string;
  replySourcePreview: ReplySourcePreview;
  voiceTarget?: unknown | null;
  existingArtifact?: DraftArtifactDetails | null;
}) {
  return buildDraftArtifact({
    id: resolveArtifactId({
      existingArtifact: args.existingArtifact ?? null,
      replySourcePostId: args.replySourcePostId,
    }),
    title: args.title,
    kind: "reply_candidate",
    content: normalizeWhitespace(args.replyText),
    supportAsset: null,
    voiceTarget: (args.voiceTarget as DraftArtifactDetails["voiceTarget"]) ?? null,
    noveltyNotes: [],
    replySourcePreview: args.replySourcePreview,
  });
}

async function findLatestDraftReply(args: {
  userId: string;
  xHandle: string;
  replySourcePostId: string;
}) {
  return prisma.draftCandidate.findFirst({
    where: {
      userId: args.userId,
      xHandle: args.xHandle,
      replySourcePostId: args.replySourcePostId,
      outputShape: "reply_candidate",
      status: "DRAFT",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      sourcePrompt: true,
      artifact: true,
      voiceTarget: true,
    },
  }) as Promise<ReplyDraftRecord | null>;
}

export async function persistGeneratedExtensionReplyDraft(
  args: PersistGeneratedExtensionReplyDraftArgs,
) {
  const replySourcePostId = normalizeWhitespace(args.replySourcePostId);
  if (!replySourcePostId) {
    throw new Error("replySourcePostId is required to persist an extension reply draft.");
  }

  const title = buildExtensionReplyDraftTitle({
    sourceAuthorHandle: args.sourceAuthorHandle,
    replyText: args.replyText,
  });
  const existing = await findLatestDraftReply({
    userId: args.userId,
    xHandle: args.xHandle,
    replySourcePostId,
  });
  const existingArtifact = asDraftArtifact(existing?.artifact);
  const artifact = buildExtensionReplyDraftArtifact({
    replySourcePostId,
    replyText: args.replyText,
    title,
    replySourcePreview: args.replySourcePreview,
    voiceTarget: args.voiceTarget ?? null,
    existingArtifact,
  });

  const baseData = {
    xHandle: args.xHandle,
    replySourcePostId,
    threadId: null,
    messageId: null,
    runId: null,
    title,
    sourcePrompt: normalizeWhitespace(args.sourcePostText) || title,
    sourcePlaybook: "extension_reply",
    outputShape: "reply_candidate",
    reviewStatus: "pending",
    status: "DRAFT",
    draftVersionId: null,
    basedOnVersionId: null,
    revisionChainId: null,
    isLatestVersion: true,
    artifact: artifact as unknown as Prisma.InputJsonValue,
    voiceTarget:
      args.voiceTarget === null || args.voiceTarget === undefined
        ? Prisma.JsonNull
        : (args.voiceTarget as Prisma.InputJsonValue),
    noveltyNotes: [] as Prisma.InputJsonValue,
    rejectionReason: null,
    approvedAt: null,
    editedAt: null,
    postedAt: null,
    observedAt: null,
    observedMetrics: Prisma.JsonNull,
    publishedTweetId: null,
  } satisfies Prisma.DraftCandidateUncheckedUpdateInput;

  if (existing) {
    return prisma.draftCandidate.update({
      where: { id: existing.id },
      data: baseData,
    });
  }

  return prisma.draftCandidate.create({
    data: {
      userId: args.userId,
      folderId: null,
      ...baseData,
    } satisfies Prisma.DraftCandidateUncheckedCreateInput,
  });
}

export async function syncPostedExtensionReplyDraft(
  args: SyncPostedExtensionReplyDraftArgs,
) {
  const replySourcePostId = normalizeWhitespace(args.replySourcePostId);
  if (!replySourcePostId) {
    return null;
  }

  const existing = await findLatestDraftReply({
    userId: args.userId,
    xHandle: args.xHandle,
    replySourcePostId,
  });
  if (!existing) {
    return null;
  }

  const existingArtifact = asDraftArtifact(existing.artifact);
  const replySourcePreview =
    asReplySourcePreview(existingArtifact?.replySourcePreview) ?? null;
  const nextReplyText =
    normalizeWhitespace(args.finalReplyText) ||
    normalizeWhitespace(existingArtifact?.content) ||
    normalizeWhitespace(existing.title);
  const title = buildExtensionReplyDraftTitle({
    sourceAuthorHandle: args.sourceAuthorHandle,
    replyText: nextReplyText,
  });
  const artifact =
    replySourcePreview && nextReplyText
      ? buildExtensionReplyDraftArtifact({
          replySourcePostId,
          replyText: nextReplyText,
          title,
          replySourcePreview,
          voiceTarget: existing.voiceTarget,
          existingArtifact,
        })
      : existingArtifact;

  return prisma.draftCandidate.update({
    where: { id: existing.id },
    data: {
      title,
      status: "PUBLISHED",
      reviewStatus: "posted",
      postedAt: args.postedAt ?? new Date(),
      ...(artifact
        ? {
            artifact: artifact as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
}
