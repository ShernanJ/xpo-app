"use client";

import type { DraftArtifactDetails } from "@/lib/onboarding/shared/draftArtifacts";

export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ContentHubViewMode = "date" | "status";

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
}

export interface ContentItemRecord {
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
    items: ContentItemRecord[];
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
