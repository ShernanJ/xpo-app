"use client";

import type { DraftArtifactDetails } from "@/lib/onboarding/shared/draftArtifacts";

export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ContentHubViewMode = "date" | "status" | "group";

export interface ContentHubAuthorIdentity {
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export interface FolderRecord {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  itemCount: number;
}

export interface DeletedFolderRecord {
  id: string;
  name: string;
  itemCount: number;
}

export interface ContentItemPreview {
  primaryText: string;
  threadPostCount: number;
  isThread: boolean;
}

export interface ContentItemSummaryRecord {
  id: string;
  title: string;
  threadId: string | null;
  messageId: string | null;
  status: ContentStatus;
  folderId: string | null;
  folder: FolderRecord | null;
  publishedTweetId: string | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
  preview: ContentItemPreview;
  artifact?: DraftArtifactDetails | null;
}

export interface ContentItemRecord extends ContentItemSummaryRecord {
  id: string;
  title: string;
  sourcePrompt: string;
  sourcePlaybook: string | null;
  outputShape: string;
  threadId: string | null;
  messageId: string | null;
  status: ContentStatus;
  reviewStatus: string;
  folderId: string | null;
  folder: FolderRecord | null;
  publishedTweetId: string | null;
  artifact: DraftArtifactDetails | null;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
}

export interface ContentItemsResponse {
  ok: true;
  data: {
    items: Array<ContentItemSummaryRecord | ContentItemRecord>;
    nextCursor?: string | null;
    hasMore?: boolean;
  };
}

export interface ContentItemDetailResponse {
  ok: true;
  data: {
    item: ContentItemRecord;
  };
}

export interface FoldersResponse {
  ok: true;
  data: {
    folders: FolderRecord[];
  };
}

export interface ContentHubMutationResponse {
  ok: true;
  data: {
    item: ContentItemRecord;
  };
}

export interface FolderCreateResponse {
  ok: true;
  data: {
    folder: FolderRecord;
  };
}

export interface FolderMutationResponse {
  ok: true;
  data: {
    folder: FolderRecord;
  };
}

export interface FolderDeleteResponse {
  ok: true;
  data: {
    folder: DeletedFolderRecord;
  };
}
