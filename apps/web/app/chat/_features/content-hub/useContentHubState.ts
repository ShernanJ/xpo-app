"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type {
  ContentHubContentType,
  ContentHubMutationResponse,
  ContentHubViewMode,
  ContentItemDetailResponse,
  ContentItemRecord,
  ContentItemsResponse,
  ContentItemSummaryRecord,
  ContentStatus,
  DeletedFolderRecord,
  FolderCreateResponse,
  FolderDeleteResponse,
  FolderMutationResponse,
  FolderRecord,
  FoldersResponse,
} from "./contentHubTypes";
import { filterContentItems, sortFoldersByName } from "./contentHubViewState";

const INITIAL_CONTENT_PAGE_SIZE = 24;
const CONTENT_SUMMARY_PREFETCH_LIMIT = 100;

interface ValidationError {
  message?: string;
}

interface FailureResponse {
  ok: false;
  errors?: ValidationError[];
}

interface UseContentHubStateOptions {
  open: boolean;
  fetchWorkspace: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "errors" in payload &&
    Array.isArray((payload as { errors?: unknown[] }).errors)
  ) {
    const firstError = (payload as { errors?: Array<{ message?: string }> }).errors?.[0];
    if (firstError?.message) {
      return firstError.message;
    }
  }

  return fallback;
}

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function findFolderById(folders: FolderRecord[], folderId: string | null) {
  if (!folderId) {
    return null;
  }

  return folders.find((folder) => folder.id === folderId) ?? null;
}

function replaceFolderInSummaryItems(items: ContentItemSummaryRecord[], folder: FolderRecord) {
  return items.map((item) =>
    item.folderId === folder.id
      ? {
          ...item,
          folder,
        }
      : item,
  );
}

function replaceFolderInDetails(
  itemsById: Record<string, ContentItemRecord>,
  folder: FolderRecord,
) {
  const next: Record<string, ContentItemRecord> = {};

  for (const [itemId, item] of Object.entries(itemsById)) {
    next[itemId] =
      item.folderId === folder.id
        ? {
            ...item,
            folder,
          }
        : item;
  }

  return next;
}

function clearFolderFromSummaryItems(items: ContentItemSummaryRecord[], folderId: string) {
  return items.map((item) =>
    item.folderId === folderId
      ? {
          ...item,
          folderId: null,
          folder: null,
        }
      : item,
  );
}

function clearFolderFromDetails(
  itemsById: Record<string, ContentItemRecord>,
  folderId: string,
) {
  const next: Record<string, ContentItemRecord> = {};

  for (const [itemId, item] of Object.entries(itemsById)) {
    next[itemId] =
      item.folderId === folderId
        ? {
            ...item,
            folderId: null,
            folder: null,
          }
        : item;
  }

  return next;
}

function adjustFolderCount(
  folders: FolderRecord[],
  folderId: string | null,
  delta: number,
) {
  if (!folderId || delta === 0) {
    return folders;
  }

  return folders.map((folder) =>
    folder.id === folderId
      ? {
          ...folder,
          itemCount: Math.max(0, folder.itemCount + delta),
        }
      : folder,
  );
}

function reconcileFolderCounts(
  folders: FolderRecord[],
  previousFolderId: string | null,
  nextFolderId: string | null,
) {
  if (previousFolderId === nextFolderId) {
    return folders;
  }

  return adjustFolderCount(
    adjustFolderCount(folders, previousFolderId, -1),
    nextFolderId,
    1,
  );
}

function hasFullContentItemShape(
  item: ContentItemSummaryRecord | ContentItemRecord,
): item is ContentItemRecord {
  return "sourcePrompt" in item;
}

function resolveContentPreview(
  item: Partial<Pick<ContentItemSummaryRecord, "preview" | "artifact">>,
) {
  if (item.preview) {
    return item.preview;
  }

  const threadPostCount = item.artifact?.posts?.length ?? 0;
  const primaryText =
    item.artifact?.posts?.[0]?.content?.trim() ??
    item.artifact?.content?.trim() ??
    "";

  return {
    primaryText,
    threadPostCount,
    isThread: threadPostCount > 1,
  };
}

function normalizeContentItemDetail(item: ContentItemRecord): ContentItemRecord {
  return {
    ...item,
    preview: resolveContentPreview(item),
  };
}

function buildContentRequestPath(args: {
  itemId?: string;
  cursor?: string | null;
  take?: number;
  contentType: ContentHubContentType;
}) {
  const params = new URLSearchParams();
  if (args.contentType !== "posts_threads") {
    params.set("contentType", args.contentType);
  }
  if (args.cursor) {
    params.set("cursor", args.cursor);
  }
  if (args.take) {
    params.set("take", String(args.take));
  }

  const basePath = args.itemId
    ? `/api/creator/v2/content/${encodeURIComponent(args.itemId)}`
    : "/api/creator/v2/content";

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function toContentItemSummary(
  item: ContentItemSummaryRecord | ContentItemRecord,
): ContentItemSummaryRecord {
  return {
    id: item.id,
    title: item.title,
    threadId: item.threadId,
    messageId: item.messageId,
    status: item.status,
    folderId: item.folderId,
    folder: item.folder,
    publishedTweetId: item.publishedTweetId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    postedAt: item.postedAt,
    preview: resolveContentPreview(item),
    ...(item.artifact !== undefined ? { artifact: item.artifact } : {}),
  };
}

function applyOptimisticSummaryUpdate(
  item: ContentItemSummaryRecord,
  payload: {
    status?: ContentStatus;
    folderId?: string | null;
  },
  folders: FolderRecord[],
): ContentItemSummaryRecord {
  const nextStatus = payload.status ?? item.status;
  const nextFolderId = payload.folderId !== undefined ? payload.folderId : item.folderId;
  const nextFolder =
    payload.folderId !== undefined ? findFolderById(folders, nextFolderId ?? null) : item.folder;

  return {
    ...item,
    status: nextStatus,
    folderId: nextFolderId ?? null,
    folder: nextFolder,
    publishedTweetId: payload.status === "DRAFT" ? null : item.publishedTweetId,
    postedAt:
      payload.status === "DRAFT"
        ? null
        : payload.status === "PUBLISHED"
          ? item.postedAt ?? new Date().toISOString()
          : item.postedAt,
  };
}

function applyOptimisticDetailUpdate(
  item: ContentItemRecord,
  payload: {
    status?: ContentStatus;
    folderId?: string | null;
  },
  folders: FolderRecord[],
): ContentItemRecord {
  const nextStatus = payload.status ?? item.status;
  const nextFolderId = payload.folderId !== undefined ? payload.folderId : item.folderId;
  const nextFolder =
    payload.folderId !== undefined ? findFolderById(folders, nextFolderId ?? null) : item.folder;

  return {
    ...item,
    status: nextStatus,
    folderId: nextFolderId ?? null,
    folder: nextFolder,
    reviewStatus:
      payload.status === "PUBLISHED"
        ? item.reviewStatus === "posted" || item.reviewStatus === "observed"
          ? item.reviewStatus
          : "posted"
        : payload.status === "DRAFT"
          ? "pending"
          : item.reviewStatus,
    publishedTweetId: payload.status === "DRAFT" ? null : item.publishedTweetId,
    postedAt:
      payload.status === "DRAFT"
        ? null
        : payload.status === "PUBLISHED"
          ? item.postedAt ?? new Date().toISOString()
          : item.postedAt,
  };
}

export function useContentHubState(options: UseContentHubStateOptions) {
  const { open, fetchWorkspace } = options;
  const [items, setItems] = useState<ContentItemSummaryRecord[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, ContentItemRecord>>({});
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentHubContentType>("posts_threads");
  const [viewMode, setViewMode] = useState<ContentHubViewMode>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoadingById, setIsDetailLoadingById] = useState<Record<string, boolean>>({});
  const [actionById, setActionById] = useState<Record<string, string>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderActionById, setFolderActionById] = useState<Record<string, string>>({});
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"browse" | "preview">("browse");
  const [isPending, startTransition] = useTransition();
  const activeLoadRequestIdRef = useRef(0);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const loadItemDetail = useCallback(
    async (itemId: string) => {
      if (!itemId || detailsById[itemId] || isDetailLoadingById[itemId]) {
        return;
      }

      setIsDetailLoadingById((current) => ({ ...current, [itemId]: true }));

      try {
        const response = await fetchWorkspace(
          buildContentRequestPath({
            itemId,
            contentType,
          }),
          {
            method: "GET",
          },
        );
        const payload = await readJsonOrNull<ContentItemDetailResponse | FailureResponse>(
          response,
        );
        if (!response.ok || !payload?.ok) {
          throw new Error(readErrorMessage(payload, "Failed to load content item."));
        }

        setDetailsById((current) => ({
          ...current,
          [itemId]: normalizeContentItemDetail(payload.data.item),
        }));
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? toContentItemSummary(normalizeContentItemDetail(payload.data.item))
              : item,
          ),
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load content item.",
        );
      } finally {
        setIsDetailLoadingById((current) => {
          const next = { ...current };
          delete next[itemId];
          return next;
        });
      }
    },
    [contentType, detailsById, fetchWorkspace, isDetailLoadingById],
  );

  const prefetchRemainingSummaryPages = useCallback(
    async (args: { initialCursor: string | null; requestId: number; initialCount: number }) => {
      let cursor = args.initialCursor;
      let loadedCount = args.initialCount;

      while (
        cursor &&
        loadedCount < CONTENT_SUMMARY_PREFETCH_LIMIT &&
        activeLoadRequestIdRef.current === args.requestId
      ) {
        const remaining = CONTENT_SUMMARY_PREFETCH_LIMIT - loadedCount;
        const take = Math.min(INITIAL_CONTENT_PAGE_SIZE, remaining);
        const response = await fetchWorkspace(
          buildContentRequestPath({
            cursor,
            take,
            contentType,
          }),
          {
            method: "GET",
          },
        );
        const payload = await readJsonOrNull<ContentItemsResponse | FailureResponse>(response);
        if (!response.ok || !payload?.ok) {
          return;
        }

        const loadedDetails: Record<string, ContentItemRecord> = {};
        const nextSummaries = payload.data.items.map((item) => {
          if (hasFullContentItemShape(item)) {
            loadedDetails[item.id] = normalizeContentItemDetail(item);
          }

          return toContentItemSummary(item);
        });

        setItems((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          return [...current, ...nextSummaries.filter((item) => !existingIds.has(item.id))];
        });
        if (Object.keys(loadedDetails).length > 0) {
          setDetailsById((current) => ({
            ...current,
            ...loadedDetails,
          }));
        }

        loadedCount += nextSummaries.length;
        cursor = payload.data.hasMore ? payload.data.nextCursor ?? null : null;
      }
    },
    [contentType, fetchWorkspace],
  );

  const loadContentHub = useCallback(async () => {
    const requestId = activeLoadRequestIdRef.current + 1;
    activeLoadRequestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [itemsResponse, foldersResponse] = await Promise.all([
        fetchWorkspace(
          buildContentRequestPath({
            contentType,
          }),
          {
          method: "GET",
          },
        ),
        fetchWorkspace("/api/creator/v2/folders", {
          method: "GET",
        }),
      ]);
      const itemsPayload = await readJsonOrNull<ContentItemsResponse | FailureResponse>(
        itemsResponse,
      );
      const foldersPayload = await readJsonOrNull<FoldersResponse | FailureResponse>(
        foldersResponse,
      );

      if (!itemsResponse.ok || !itemsPayload?.ok) {
        throw new Error(readErrorMessage(itemsPayload, "Failed to load content items."));
      }
      if (!foldersResponse.ok || !foldersPayload?.ok) {
        throw new Error(readErrorMessage(foldersPayload, "Failed to load groups."));
      }

      if (activeLoadRequestIdRef.current !== requestId) {
        return;
      }

      const loadedDetails: Record<string, ContentItemRecord> = {};
      const summaries = itemsPayload.data.items.map((item) => {
        if (hasFullContentItemShape(item)) {
          loadedDetails[item.id] = normalizeContentItemDetail(item);
        }

        return toContentItemSummary(item);
      });

      setItems(summaries);
      setDetailsById(loadedDetails);
      setFolders(sortFoldersByName(foldersPayload.data.folders));

      const nextCursor = itemsPayload.data.hasMore ? itemsPayload.data.nextCursor ?? null : null;
      if (nextCursor) {
        void prefetchRemainingSummaryPages({
          initialCursor: nextCursor,
          requestId,
          initialCount: summaries.length,
        });
      }
    } catch (error) {
      if (activeLoadRequestIdRef.current !== requestId) {
        return;
      }

      setItems([]);
      setDetailsById({});
      setFolders([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : contentType === "replies"
              ? "Failed to load replies."
              : "Failed to load posts and threads.",
        );
    } finally {
      if (activeLoadRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [contentType, fetchWorkspace, prefetchRemainingSummaryPages]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedItemId(null);
      setMobilePane("browse");
      setErrorMessage(null);
      setDraggingItemId(null);
      setActionById({});
      setFolderActionById({});
      return;
    }

    void loadContentHub();
  }, [loadContentHub, open]);

  const filteredItems = useMemo(
    () => filterContentItems(items, searchQuery),
    [items, searchQuery],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (filteredItems.length === 0) {
      setSelectedItemId(null);
      setMobilePane("browse");
      return;
    }

    if (!selectedItemId || !filteredItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(filteredItems[0]?.id ?? null);
    }
  }, [filteredItems, open, selectedItemId]);

  useEffect(() => {
    if (!open || !selectedItemId) {
      return;
    }

    if (detailsById[selectedItemId]) {
      return;
    }

    void loadItemDetail(selectedItemId);
  }, [detailsById, loadItemDetail, open, selectedItemId]);

  const selectedItemSummary = useMemo(
    () => filteredItems.find((item) => item.id === selectedItemId) ?? null,
    [filteredItems, selectedItemId],
  );

  const selectedItem = useMemo(
    () => (selectedItemId ? detailsById[selectedItemId] ?? null : null),
    [detailsById, selectedItemId],
  );

  const updateItem = useCallback(
    async (
      itemId: string,
      payload: {
        status?: ContentStatus;
        folderId?: string | null;
      },
      actionLabel: string,
    ) => {
      const previousItems = items;
      const previousDetails = detailsById;
      const previousItem = items.find((item) => item.id === itemId) ?? null;

      setActionById((current) => ({ ...current, [itemId]: actionLabel }));
      clearMessages();
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? applyOptimisticSummaryUpdate(item, payload, folders) : item,
        ),
      );
      setDetailsById((current) => {
        if (!current[itemId]) {
          return current;
        }

        return {
          ...current,
          [itemId]: applyOptimisticDetailUpdate(current[itemId], payload, folders),
        };
      });

      try {
        const response = await fetchWorkspace(
          buildContentRequestPath({
            itemId,
            contentType,
          }),
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
        const result = await readJsonOrNull<ContentHubMutationResponse | FailureResponse>(
          response,
        );

        if (!response.ok || !result?.ok) {
          throw new Error(readErrorMessage(result, "Failed to update content item."));
        }

        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? toContentItemSummary(normalizeContentItemDetail(result.data.item))
              : item,
          ),
        );
        setDetailsById((current) => ({
          ...current,
          [itemId]: normalizeContentItemDetail(result.data.item),
        }));

        if (previousItem && payload.folderId !== undefined) {
          setFolders((current) =>
            reconcileFolderCounts(current, previousItem.folderId, result.data.item.folderId),
          );
        }

        return true;
      } catch (error) {
        setItems(previousItems);
        setDetailsById(previousDetails);
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to update content item.",
        );
        return false;
      } finally {
        setActionById((current) => {
          const next = { ...current };
          delete next[itemId];
          return next;
        });
      }
    },
    [clearMessages, contentType, detailsById, fetchWorkspace, folders, items],
  );

  const createFolder = useCallback(
    async (name: string) => {
      const nextName = name.trim();
      if (!nextName) {
        setErrorMessage("Group name is required.");
        return null;
      }

      setIsCreatingFolder(true);
      clearMessages();

      try {
        const response = await fetchWorkspace("/api/creator/v2/folders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: nextName,
          }),
        });
        const result = await readJsonOrNull<FolderCreateResponse | FailureResponse>(response);
        if (!response.ok || !result?.ok) {
          throw new Error(readErrorMessage(result, "Failed to create group."));
        }

        setFolders((current) => sortFoldersByName([...current, result.data.folder]));
        return result.data.folder;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create group.");
        return null;
      } finally {
        setIsCreatingFolder(false);
      }
    },
    [clearMessages, fetchWorkspace],
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      const nextName = name.trim();
      if (!nextName) {
        setErrorMessage("Group name is required.");
        return null;
      }

      setFolderActionById((current) => ({ ...current, [folderId]: "rename" }));
      clearMessages();

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/folders/${encodeURIComponent(folderId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: nextName,
            }),
          },
        );
        const result = await readJsonOrNull<FolderMutationResponse | FailureResponse>(
          response,
        );
        if (!response.ok || !result?.ok) {
          throw new Error(readErrorMessage(result, "Failed to rename group."));
        }

        setFolders((current) =>
          sortFoldersByName(
            current.map((folder) =>
              folder.id === folderId ? result.data.folder : folder,
            ),
          ),
        );
        setItems((current) => replaceFolderInSummaryItems(current, result.data.folder));
        setDetailsById((current) => replaceFolderInDetails(current, result.data.folder));
        return result.data.folder;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to rename group.");
        return null;
      } finally {
        setFolderActionById((current) => {
          const next = { ...current };
          delete next[folderId];
          return next;
        });
      }
    },
    [clearMessages, fetchWorkspace],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      setFolderActionById((current) => ({ ...current, [folderId]: "delete" }));
      clearMessages();

      try {
        const response = await fetchWorkspace(
          `/api/creator/v2/folders/${encodeURIComponent(folderId)}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
        const result = await readJsonOrNull<FolderDeleteResponse | FailureResponse>(response);
        if (!response.ok || !result?.ok) {
          throw new Error(readErrorMessage(result, "Failed to delete group."));
        }

        setFolders((current) => current.filter((folder) => folder.id !== folderId));
        setItems((current) => clearFolderFromSummaryItems(current, folderId));
        setDetailsById((current) => clearFolderFromDetails(current, folderId));

        return result.data.folder;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete group.");
        return null;
      } finally {
        setFolderActionById((current) => {
          const next = { ...current };
          delete next[folderId];
          return next;
        });
      }
    },
    [clearMessages, fetchWorkspace],
  );

  const selectItem = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    setMobilePane("preview");
  }, []);

  const showBrowsePane = useCallback(() => {
    setMobilePane("browse");
  }, []);

  return {
    items,
    folders,
    filteredItems,
    selectedItem,
    selectedItemSummary,
    selectedItemId,
    isSelectedItemLoading: Boolean(selectedItemId && !selectedItem && isDetailLoadingById[selectedItemId]),
    setSelectedItemId,
    selectItem,
    contentType,
    setContentType: (nextContentType: ContentHubContentType) => {
      startTransition(() => {
        setContentType(nextContentType);
      });
    },
    viewMode,
    setViewMode: (nextViewMode: ContentHubViewMode) => {
      startTransition(() => {
        setViewMode(nextViewMode);
      });
    },
    searchQuery,
    setSearchQuery: (value: string) => {
      startTransition(() => {
        setSearchQuery(value);
      });
    },
    errorMessage,
    clearMessages,
    isLoading,
    isPending,
    actionById,
    updateItem,
    isCreatingFolder,
    createFolder,
    folderActionById,
    renameFolder,
    deleteFolder,
    draggingItemId,
    setDraggingItemId,
    mobilePane,
    showBrowsePane,
    setMobilePane,
  };
}
