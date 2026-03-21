import type { DraftArtifactDetails } from "../onboarding/shared/draftArtifacts.ts";
import { prisma } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";

export const GLOBAL_CONTENT_OUTPUT_SHAPES = [
  "short_form_post",
  "long_form_post",
  "thread_seed",
] as const;
export const REPLY_CONTENT_OUTPUT_SHAPES = ["reply_candidate"] as const;
export const INDEXED_CONTENT_OUTPUT_SHAPES = [
  ...GLOBAL_CONTENT_OUTPUT_SHAPES,
  ...REPLY_CONTENT_OUTPUT_SHAPES,
] as const;

export type GlobalContentOutputShape = (typeof GLOBAL_CONTENT_OUTPUT_SHAPES)[number];
export type ReplyContentOutputShape = (typeof REPLY_CONTENT_OUTPUT_SHAPES)[number];
export type IndexedContentOutputShape = (typeof INDEXED_CONTENT_OUTPUT_SHAPES)[number];
export type ContentHubContentType = "posts_threads" | "replies" | "all";

type FolderRecord = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
  itemCount: number;
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

type DraftReviewCandidateRecord = Omit<DraftCandidateWithFolder, "folder">;

export interface SerializedFolder {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  itemCount: number;
}

export interface SerializedDeletedFolder {
  id: string;
  name: string;
  itemCount: number;
}

export interface SerializedContentPreview {
  primaryText: string;
  threadPostCount: number;
  isThread: boolean;
}

export interface SerializedContentItemSummary {
  id: string;
  title: string;
  threadId: string | null;
  messageId: string | null;
  status: string;
  folderId: string | null;
  folder: SerializedFolder | null;
  publishedTweetId: string | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
  preview: SerializedContentPreview;
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
  preview: SerializedContentPreview;
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

export function isIndexedContentOutputShape(
  value: string | null | undefined,
): value is IndexedContentOutputShape {
  return INDEXED_CONTENT_OUTPUT_SHAPES.includes(value as IndexedContentOutputShape);
}

function resolveContentOutputShapes(
  contentType?: ContentHubContentType | null,
): IndexedContentOutputShape[] {
  if (contentType === "all") {
    return [...INDEXED_CONTENT_OUTPUT_SHAPES];
  }

  return contentType === "replies"
    ? [...REPLY_CONTENT_OUTPUT_SHAPES]
    : [...GLOBAL_CONTENT_OUTPUT_SHAPES];
}

function buildIndexedMessageConstraint(
  contentType?: ContentHubContentType | null,
  requireIndexedMessage = true,
): Prisma.DraftCandidateWhereInput {
  if (requireIndexedMessage === false) {
    return {};
  }

  if (contentType === "replies") {
    return {};
  }

  if (contentType === "all") {
    return {
      OR: [
        {
          outputShape: {
            in: [...REPLY_CONTENT_OUTPUT_SHAPES],
          },
        },
        {
          messageId: { not: null },
        },
      ],
    };
  }

  return {
    messageId: { not: null },
  };
}

function toFolderRecord(folder: {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
  _count?: {
    drafts: number;
  };
}): FolderRecord {
  return {
    id: folder.id,
    userId: folder.userId,
    name: folder.name,
    color: folder.color,
    createdAt: folder.createdAt,
    itemCount: folder._count?.drafts ?? 0,
  };
}

export function serializeFolder(
  folder: Pick<FolderRecord, "id" | "name" | "color" | "createdAt"> &
    Partial<Pick<FolderRecord, "itemCount">>,
): SerializedFolder {
  return {
    id: folder.id,
    name: folder.name,
    color: folder.color,
    createdAt: folder.createdAt.toISOString(),
    itemCount: folder.itemCount ?? 0,
  };
}

function buildContentPreview(artifact: DraftArtifactDetails | null): SerializedContentPreview {
  const threadPostCount = artifact?.posts?.length ?? 0;
  const primaryText =
    artifact?.posts?.[0]?.content?.trim() ??
    artifact?.content?.trim() ??
    "";

  return {
    primaryText,
    threadPostCount,
    isThread: threadPostCount > 1,
  };
}

export function serializeContentItemSummary(
  candidate: Pick<
    DraftCandidateWithFolder,
    | "id"
    | "title"
    | "threadId"
    | "messageId"
    | "status"
    | "folderId"
    | "publishedTweetId"
    | "createdAt"
    | "updatedAt"
    | "postedAt"
    | "artifact"
    | "folder"
  >,
): SerializedContentItemSummary {
  return {
    id: candidate.id,
    title: candidate.title,
    threadId: candidate.threadId,
    messageId: candidate.messageId,
    status: candidate.status,
    folderId: candidate.folderId,
    folder: candidate.folder ? serializeFolder(candidate.folder) : null,
    publishedTweetId: candidate.publishedTweetId,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    postedAt: candidate.postedAt?.toISOString() ?? null,
    preview: buildContentPreview(asDraftArtifact(candidate.artifact)),
  };
}

export function serializeContentItem(
  candidate: DraftCandidateWithFolder,
): SerializedContentItem {
  const preview = buildContentPreview(asDraftArtifact(candidate.artifact));

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
    preview,
  };
}

export function serializeDraftReviewCandidate(
  candidate: DraftReviewCandidateRecord,
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
  contentType?: ContentHubContentType | null;
}) {
  const where: Prisma.DraftCandidateWhereInput = {
    userId: args.userId,
    outputShape: {
      in: resolveContentOutputShapes(args.contentType),
    },
    ...(args.xHandle ? { xHandle: args.xHandle } : {}),
    ...(args.status ? { status: args.status as never } : {}),
    ...(args.onlyLatest === false ? {} : { isLatestVersion: true }),
    ...(args.requireUnpublished ? { publishedTweetId: null } : {}),
    ...buildIndexedMessageConstraint(
      args.contentType,
      args.requireIndexedMessage !== false,
    ),
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
  outputShape: IndexedContentOutputShape;
  artifact: DraftArtifactDetails;
  voiceTarget: unknown | null;
  noveltyNotes: string[];
  retrievedAnchorIds: string[];
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
  if (!isIndexedContentOutputShape(outputShape)) {
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
    retrievedAnchorIds: artifact.retrievedAnchorIds ?? [],
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
  threadTitle?: string | null;
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
  const threadTitle = args.threadTitle?.trim() || existing?.title || resolvedDraft.title;
  const retrievedAnchorIds =
    resolvedDraft.retrievedAnchorIds.length > 0
      ? resolvedDraft.retrievedAnchorIds
      : existing?.retrievedAnchorIds ?? [];

  const payload = {
    ...(xHandle ? { xHandle } : {}),
    threadId: args.threadId,
    messageId: args.messageId,
    runId,
    title: threadTitle,
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
    retrievedAnchorIds,
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
  contentType?: ContentHubContentType | null;
}) {
  const items = await prisma.draftCandidate.findMany({
    where: buildContentWhere({
      userId: args.userId,
      xHandle: args.xHandle,
      status: args.status,
      requireIndexedMessage: true,
      contentType: args.contentType,
    }),
    include: {
      folder: true,
    },
    orderBy: [{ [args.sortBy ?? "updatedAt"]: "desc" }],
    take: args.take ?? 100,
  });

  return items as DraftCandidateWithFolder[];
}

export async function listContentItemSummariesForWorkspace(args: {
  userId: string;
  xHandle?: string | null;
  status?: string | null;
  take?: number;
  cursor?: string | null;
  sortBy?: "createdAt" | "updatedAt";
  contentType?: ContentHubContentType | null;
}) {
  const pageSize = Math.min(Math.max(args.take ?? 24, 1), 100);
  const items = await prisma.draftCandidate.findMany({
    where: buildContentWhere({
      userId: args.userId,
      xHandle: args.xHandle,
      status: args.status,
      requireIndexedMessage: true,
      contentType: args.contentType,
    }),
    orderBy: [{ [args.sortBy ?? "updatedAt"]: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(args.cursor
      ? {
          cursor: { id: args.cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      title: true,
      threadId: true,
      messageId: true,
      status: true,
      folderId: true,
      publishedTweetId: true,
      createdAt: true,
      updatedAt: true,
      postedAt: true,
      artifact: true,
      folder: {
        select: {
          id: true,
          name: true,
          color: true,
          createdAt: true,
        },
      },
    },
  });

  const hasMore = items.length > pageSize;
  const page = items.slice(0, pageSize) as Array<
    Pick<
      DraftCandidateWithFolder,
      | "id"
      | "title"
      | "threadId"
      | "messageId"
      | "status"
      | "folderId"
      | "publishedTweetId"
      | "createdAt"
      | "updatedAt"
      | "postedAt"
      | "artifact"
      | "folder"
    >
  >;

  return {
    items: page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function findContentItemForWorkspace(args: {
  id: string;
  userId: string;
  xHandle?: string | null;
  contentType?: ContentHubContentType | null;
}) {
  const item = await prisma.draftCandidate.findFirst({
    where: {
      id: args.id,
      ...buildContentWhere({
        userId: args.userId,
        xHandle: args.xHandle,
        requireIndexedMessage: true,
        contentType: args.contentType,
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

export async function updateContentItemForWorkspace(args: {
  id: string;
  userId: string;
  xHandle?: string | null;
  contentType?: ContentHubContentType | null;
  data: Prisma.DraftCandidateUncheckedUpdateInput;
  requireIndexedMessage?: boolean;
}) {
  const result = await prisma.draftCandidate.updateMany({
    where: {
      id: args.id,
      ...buildContentWhere({
        userId: args.userId,
        xHandle: args.xHandle,
        contentType: args.contentType,
        requireIndexedMessage: args.requireIndexedMessage,
      }),
    },
    data: args.data,
  });

  return result.count > 0;
}

export async function updateIndexedContentTitlesForThread(args: {
  threadId: string;
  userId: string;
  xHandle?: string | null;
  title: string;
}) {
  const title = args.title.trim();
  if (!title) {
    return;
  }

  await prisma.draftCandidate.updateMany({
    where: {
      userId: args.userId,
      threadId: args.threadId,
      messageId: {
        not: null,
      },
      outputShape: {
        in: [...GLOBAL_CONTENT_OUTPUT_SHAPES],
      },
      ...(args.xHandle ? { xHandle: args.xHandle } : {}),
    },
    data: {
      title,
    },
  });
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
  const folders = await prisma.folder.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          drafts: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  return folders.map(toFolderRecord);
}

export async function findFolderForUser(args: {
  userId: string;
  folderId: string;
}) {
  const folder = await prisma.folder.findFirst({
    where: {
      id: args.folderId,
      userId: args.userId,
    },
    include: {
      _count: {
        select: {
          drafts: true,
        },
      },
    },
  });

  return folder ? toFolderRecord(folder) : null;
}

export async function createFolderForUser(args: {
  userId: string;
  name: string;
  color?: string | null;
}) {
  const folder = await prisma.folder.create({
    data: {
      userId: args.userId,
      name: args.name,
      color: args.color?.trim() || null,
    },
  });

  return toFolderRecord(folder);
}

export async function renameFolderForUser(args: {
  folderId: string;
  name: string;
}) {
  const folder = await prisma.folder.update({
    where: { id: args.folderId },
    data: {
      name: args.name,
    },
    include: {
      _count: {
        select: {
          drafts: true,
        },
      },
    },
  });

  return toFolderRecord(folder);
}

export async function deleteFolderForUser(args: {
  userId: string;
  folderId: string;
}): Promise<SerializedDeletedFolder | null> {
  const folder = await prisma.folder.findFirst({
    where: {
      id: args.folderId,
      userId: args.userId,
    },
    include: {
      _count: {
        select: {
          drafts: true,
        },
      },
    },
  });

  if (!folder) {
    return null;
  }

  await prisma.folder.delete({
    where: {
      id: folder.id,
    },
  });

  return {
    id: folder.id,
    name: folder.name,
    itemCount: folder._count.drafts,
  };
}
