import type { DraftArtifactDetails } from "../onboarding/shared/draftArtifacts";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";

export const GLOBAL_CONTENT_OUTPUT_SHAPES = [
  "short_form_post",
  "long_form_post",
  "thread_seed",
] as const;

export type GlobalContentOutputShape = (typeof GLOBAL_CONTENT_OUTPUT_SHAPES)[number];

type FolderRecord = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
};

type DraftCandidateWithFolder = {
  id: string;
  userId: string;
  xHandle: string | null;
  threadId: string | null;
  messageId: string | null;
  runId: string | null;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  reviewStatus: string;
  status: string;
  folderId: string | null;
  publishedTweetId: string | null;
  draftVersionId: string | null;
  basedOnVersionId: string | null;
  revisionChainId: string | null;
  isLatestVersion: boolean;
  artifact: unknown;
  voiceTarget: unknown;
  noveltyNotes: unknown;
  rejectionReason: string | null;
  approvedAt: Date | null;
  editedAt: Date | null;
  postedAt: Date | null;
  observedAt: Date | null;
  observedMetrics: unknown;
  createdAt: Date;
  updatedAt: Date;
  folder: FolderRecord | null;
};

export interface SerializedFolder {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface SerializedContentItem {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  threadId: string | null;
  messageId: string | null;
  status: string;
  reviewStatus: string;
  folderId: string | null;
  folder: SerializedFolder | null;
  publishedTweetId: string | null;
  draftVersionId: string | null;
  basedOnVersionId: string | null;
  revisionChainId: string | null;
  isLatestVersion: boolean;
  artifact: DraftArtifactDetails | null;
  voiceTarget: unknown;
  noveltyNotes: string[] | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  editedAt: string | null;
  postedAt: string | null;
  observedAt: string | null;
  observedMetrics: Record<string, unknown> | null;
}

export interface SerializedDraftReviewCandidate {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  threadId: string | null;
  messageId: string | null;
  status: string;
  artifact: DraftArtifactDetails | null;
  voiceTarget: unknown;
  noveltyNotes: string[] | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  editedAt: string | null;
  postedAt: string | null;
  observedAt: string | null;
  observedMetrics: Record<string, unknown> | null;
}

function asDraftArtifact(value: unknown): DraftArtifactDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as DraftArtifactDetails;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((entry) => (typeof entry === "string" ? entry : null))
    .filter((entry): entry is string => Boolean(entry));

  return items.length > 0 ? items : [];
}

function asJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function isGlobalContentOutputShape(
  value: string | null | undefined,
): value is GlobalContentOutputShape {
  return GLOBAL_CONTENT_OUTPUT_SHAPES.includes(value as GlobalContentOutputShape);
}

export function serializeFolder(folder: FolderRecord): SerializedFolder {
  return {
    id: folder.id,
    name: folder.name,
    color: folder.color,
    createdAt: folder.createdAt.toISOString(),
  };
}

export function serializeContentItem(
  candidate: DraftCandidateWithFolder,
): SerializedContentItem {
  return {
    id: candidate.id,
    title: candidate.title,
    sourcePrompt: candidate.sourcePrompt,
    sourcePlaybook: candidate.sourcePlaybook,
    outputShape: candidate.outputShape,
    threadId: candidate.threadId,
    messageId: candidate.messageId,
    status: candidate.status,
    reviewStatus: candidate.reviewStatus,
    folderId: candidate.folderId,
    folder: candidate.folder ? serializeFolder(candidate.folder) : null,
    publishedTweetId: candidate.publishedTweetId,
    draftVersionId: candidate.draftVersionId,
    basedOnVersionId: candidate.basedOnVersionId,
    revisionChainId: candidate.revisionChainId,
    isLatestVersion: candidate.isLatestVersion,
    artifact: asDraftArtifact(candidate.artifact),
    voiceTarget: candidate.voiceTarget,
    noveltyNotes: asStringArray(candidate.noveltyNotes),
    rejectionReason: candidate.rejectionReason,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    approvedAt: candidate.approvedAt?.toISOString() ?? null,
    editedAt: candidate.editedAt?.toISOString() ?? null,
    postedAt: candidate.postedAt?.toISOString() ?? null,
    observedAt: candidate.observedAt?.toISOString() ?? null,
    observedMetrics: asJsonRecord(candidate.observedMetrics),
  };
}

export function serializeDraftReviewCandidate(
  candidate: DraftCandidateWithFolder,
): SerializedDraftReviewCandidate {
  return {
    id: candidate.id,
    title: candidate.title,
    sourcePrompt: candidate.sourcePrompt,
    sourcePlaybook: candidate.sourcePlaybook,
    outputShape: candidate.outputShape,
    threadId: candidate.threadId,
    messageId: candidate.messageId,
    status: candidate.reviewStatus,
    artifact: asDraftArtifact(candidate.artifact),
    voiceTarget: candidate.voiceTarget,
    noveltyNotes: asStringArray(candidate.noveltyNotes),
    rejectionReason: candidate.rejectionReason,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    approvedAt: candidate.approvedAt?.toISOString() ?? null,
    editedAt: candidate.editedAt?.toISOString() ?? null,
    postedAt: candidate.postedAt?.toISOString() ?? null,
    observedAt: candidate.observedAt?.toISOString() ?? null,
    observedMetrics: asJsonRecord(candidate.observedMetrics),
  };
}

function buildContentWhere(args: {
  userId: string;
  xHandle?: string | null;
  status?: string | null;
  onlyLatest?: boolean;
  requireUnpublished?: boolean;
  requireIndexedMessage?: boolean;
}) {
  const where: Prisma.DraftCandidateWhereInput = {
    userId: args.userId,
    outputShape: {
      in: [...GLOBAL_CONTENT_OUTPUT_SHAPES],
    },
    ...(args.xHandle ? { xHandle: args.xHandle } : {}),
    ...(args.status ? { status: args.status as never } : {}),
    ...(args.onlyLatest === false ? {} : { isLatestVersion: true }),
    ...(args.requireUnpublished ? { publishedTweetId: null } : {}),
    ...(args.requireIndexedMessage === false ? {} : { messageId: { not: null } }),
  };

  return where;
}

type PersistedDraftVersionRecord = {
  id: string;
  basedOnVersionId: string | null;
  artifact: DraftArtifactDetails | null;
};

type PersistedDraftBundleOptionRecord = {
  id: string;
  label: string;
  versionId: string;
  artifact: DraftArtifactDetails | null;
};

export interface ResolvedCurrentChatDraft {
  title: string;
  outputShape: GlobalContentOutputShape;
  artifact: DraftArtifactDetails;
  voiceTarget: unknown | null;
  noveltyNotes: string[];
  draftVersionId: string | null;
  basedOnVersionId: string | null;
  revisionChainId: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDraftVersionRecord(value: unknown): PersistedDraftVersionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = asString(record.id);
  if (!id) {
    return null;
  }

  return {
    id,
    basedOnVersionId: asString(record.basedOnVersionId),
    artifact: asDraftArtifact(record.artifact),
  };
}

function asDraftBundleOptionRecord(
  value: unknown,
): PersistedDraftBundleOptionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = asString(record.id);
  const label = asString(record.label);
  const versionId = asString(record.versionId);
  if (!id || !label || !versionId) {
    return null;
  }

  return {
    id,
    label,
    versionId,
    artifact: asDraftArtifact(record.artifact),
  };
}

function readPreviousVersionSnapshot(
  value: unknown,
): { versionId: string | null; revisionChainId: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      versionId: null,
      revisionChainId: null,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    versionId: asString(record.versionId),
    revisionChainId: asString(record.revisionChainId),
  };
}

export function resolveCurrentChatDraft(
  value: unknown,
): ResolvedCurrentChatDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const outputShape = asString(record.outputShape);
  if (!isGlobalContentOutputShape(outputShape)) {
    return null;
  }

  const draftVersions = Array.isArray(record.draftVersions)
    ? record.draftVersions
        .map(asDraftVersionRecord)
        .filter((entry): entry is PersistedDraftVersionRecord => Boolean(entry))
    : [];
  const activeDraftVersionId = asString(record.activeDraftVersionId);
  const activeDraftVersion =
    (activeDraftVersionId
      ? draftVersions.find((version) => version.id === activeDraftVersionId) ?? null
      : null) ?? draftVersions[draftVersions.length - 1] ?? null;

  const draftBundle =
    record.draftBundle && typeof record.draftBundle === "object" && !Array.isArray(record.draftBundle)
      ? (record.draftBundle as Record<string, unknown>)
      : null;
  const selectedBundleOptionId = draftBundle ? asString(draftBundle.selectedOptionId) : null;
  const bundleOptions = draftBundle && Array.isArray(draftBundle.options)
    ? draftBundle.options
        .map(asDraftBundleOptionRecord)
        .filter((entry): entry is PersistedDraftBundleOptionRecord => Boolean(entry))
    : [];
  const activeBundleOption =
    (activeDraftVersion?.id
      ? bundleOptions.find((option) => option.versionId === activeDraftVersion.id) ?? null
      : null) ??
    (selectedBundleOptionId
      ? bundleOptions.find((option) => option.id === selectedBundleOptionId) ?? null
      : null);

  const draftArtifacts = Array.isArray(record.draftArtifacts)
    ? record.draftArtifacts
        .map(asDraftArtifact)
        .filter((entry): entry is DraftArtifactDetails => Boolean(entry))
    : [];
  const previousVersionSnapshot = readPreviousVersionSnapshot(record.previousVersionSnapshot);
  const artifact =
    activeDraftVersion?.artifact ??
    activeBundleOption?.artifact ??
    draftArtifacts[0] ??
    null;
  if (!artifact) {
    return null;
  }

  return {
    title: activeBundleOption?.label || artifact.title || "Draft",
    outputShape,
    artifact,
    voiceTarget: artifact.voiceTarget ?? null,
    noveltyNotes: artifact.noveltyNotes ?? [],
    draftVersionId: activeDraftVersion?.id ?? activeBundleOption?.versionId ?? activeDraftVersionId,
    basedOnVersionId:
      activeDraftVersion?.basedOnVersionId ?? previousVersionSnapshot.versionId ?? null,
    revisionChainId:
      asString(record.revisionChainId) ?? previousVersionSnapshot.revisionChainId ?? null,
  };
}

type DraftCandidateClient = Pick<
  typeof prisma.draftCandidate,
  "findFirst" | "create" | "update"
>;

function resolveContentClient(client?: { draftCandidate: DraftCandidateClient }) {
  return client ?? prisma;
}

export async function syncIndexedContentFromChatMessage(args: {
  messageId: string;
  threadId: string;
  userId: string;
  xHandle?: string | null;
  runId?: string | null;
  data: unknown;
  sourcePrompt?: string | null;
  sourcePlaybook?: string | null;
  client?: { draftCandidate: DraftCandidateClient };
}) {
  const resolvedDraft = resolveCurrentChatDraft(args.data);
  if (!resolvedDraft) {
    return null;
  }

  const client = resolveContentClient(args.client);
  const existing = await client.draftCandidate.findFirst({
    where: {
      messageId: args.messageId,
    },
  });

  const sourcePrompt =
    existing?.sourcePrompt ??
    args.sourcePrompt?.trim() ??
    "";
  const sourcePlaybook =
    existing?.sourcePlaybook ??
    args.sourcePlaybook?.trim() ??
    "chat_thread";
  const runId = args.runId ?? existing?.runId ?? null;
  const xHandle = args.xHandle ?? existing?.xHandle ?? null;

  const payload = {
    ...(xHandle ? { xHandle } : {}),
    threadId: args.threadId,
    messageId: args.messageId,
    runId,
    title: resolvedDraft.title,
    sourcePrompt,
    sourcePlaybook,
    outputShape: resolvedDraft.outputShape,
    draftVersionId: resolvedDraft.draftVersionId,
    basedOnVersionId: resolvedDraft.basedOnVersionId,
    revisionChainId: resolvedDraft.revisionChainId,
    isLatestVersion: true,
    artifact: resolvedDraft.artifact as never,
    voiceTarget:
      resolvedDraft.voiceTarget === null
        ? Prisma.JsonNull
        : (resolvedDraft.voiceTarget as never),
    noveltyNotes: resolvedDraft.noveltyNotes as never,
  };

  if (existing) {
    return client.draftCandidate.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return client.draftCandidate.create({
    data: {
      userId: args.userId,
      status: "DRAFT",
      ...payload,
    },
  });
}

export async function listContentItemsForWorkspace(args: {
  userId: string;
  xHandle?: string | null;
  status?: string | null;
  take?: number;
  sortBy?: "createdAt" | "updatedAt";
}) {
  const items = await prisma.draftCandidate.findMany({
    where: buildContentWhere({
      userId: args.userId,
      xHandle: args.xHandle,
      status: args.status,
      requireIndexedMessage: true,
    }),
    include: {
      folder: true,
    },
    orderBy: [{ [args.sortBy ?? "updatedAt"]: "desc" }],
    take: args.take ?? 100,
  });

  return items as DraftCandidateWithFolder[];
}

export async function findContentItemForWorkspace(args: {
  id: string;
  userId: string;
  xHandle?: string | null;
}) {
  const item = await prisma.draftCandidate.findFirst({
    where: {
      id: args.id,
      ...buildContentWhere({
        userId: args.userId,
        xHandle: args.xHandle,
        requireIndexedMessage: true,
      }),
    },
    include: {
      folder: true,
    },
  });

  return item as DraftCandidateWithFolder | null;
}

export async function listPendingContentForMatching(args: {
  userId: string;
  xHandle: string;
}) {
  const items = await prisma.draftCandidate.findMany({
    where: buildContentWhere({
      userId: args.userId,
      xHandle: args.xHandle,
      status: "DRAFT",
      requireUnpublished: true,
      requireIndexedMessage: true,
    }),
    include: {
      folder: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });

  return items as DraftCandidateWithFolder[];
}

export async function updateContentItemById(args: {
  id: string;
  data: Prisma.DraftCandidateUncheckedUpdateInput;
}) {
  const item = await prisma.draftCandidate.update({
    where: { id: args.id },
    data: args.data,
    include: {
      folder: true,
    },
  });

  return item as DraftCandidateWithFolder;
}

export async function markSupersededDraftVersions(args: {
  userId: string;
  xHandle?: string | null;
  revisionChainId?: string | null;
  basedOnVersionId?: string | null;
  exceptDraftVersionIds?: string[];
}) {
  const revisionChainId = args.revisionChainId?.trim() || null;
  const basedOnVersionId = args.basedOnVersionId?.trim() || null;
  if (!revisionChainId && !basedOnVersionId) {
    return;
  }

  await prisma.draftCandidate.updateMany({
    where: {
      userId: args.userId,
      ...(args.xHandle ? { xHandle: args.xHandle } : {}),
      isLatestVersion: true,
      OR: [
        ...(revisionChainId ? [{ revisionChainId }] : []),
        ...(basedOnVersionId ? [{ draftVersionId: basedOnVersionId }] : []),
      ],
      ...(args.exceptDraftVersionIds && args.exceptDraftVersionIds.length > 0
        ? {
            NOT: {
              draftVersionId: {
                in: args.exceptDraftVersionIds,
              },
            },
          }
        : {}),
    },
    data: {
      isLatestVersion: false,
    },
  });
}

export async function listFoldersForUser(userId: string) {
  return prisma.folder.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function findFolderForUser(args: {
  userId: string;
  folderId: string;
}) {
  return prisma.folder.findFirst({
    where: {
      id: args.folderId,
      userId: args.userId,
    },
  });
}

export async function createFolderForUser(args: {
  userId: string;
  name: string;
  color?: string | null;
}) {
  return prisma.folder.create({
    data: {
      userId: args.userId,
      name: args.name,
      color: args.color?.trim() || null,
    },
  });
}
